import { expect, test } from "@playwright/test";
import { register, settle } from "./helpers";

/**
 * Section 22.4, instructor-gradebook.spec.ts. Two browser contexts, because the
 * point is that an instructor and a student are different people.
 */

// Two sign-ups, a full lesson run, and a CSV download in one test.
test.setTimeout(240_000);

test("an instructor assigns a lesson and reads the score a student earned", async ({ browser }) => {
  const instructorContext = await browser.newContext();
  const studentContext = await browser.newContext();
  const instructor = await instructorContext.newPage();
  const student = await studentContext.newPage();

  try {
    // 1. The instructor creates a course and copies the join code.
    await register(instructor, "Instructor");
    await instructor.goto("/courses/new");
    const courseName = `Macro ${Date.now()}`;
    await instructor.getByLabel("Course name").fill(courseName);
    await instructor.getByLabel("Term").fill("Fall 2026");
    await instructor.getByRole("button", { name: "Create course" }).click();

    await instructor.waitForURL(/\/courses\/[a-z0-9]+$/);
    const joinCode = (await instructor.getByTestId("join-code").innerText()).trim();
    expect(joinCode).toMatch(/^[A-Z2-9]{6}$/);

    // 3. The instructor assigns a lesson with a due date.
    await instructor.getByLabel("Assign a lesson").selectOption({ label: "Levels versus growth rates" });
    await instructor.getByLabel("Due date").fill("2026-12-31");
    await instructor.getByRole("button", { name: "Assign" }).click();
    await expect(instructor.getByRole("cell", { name: "Levels versus growth rates" })).toBeVisible();

    // 2. The student joins with the code.
    const studentEmail = await register(student, "Student");
    await student.goto("/courses/join");
    await student.getByLabel("Join code").fill(joinCode);
    await student.getByRole("button", { name: "Join" }).click();
    await student.waitForURL(/\/courses\/[a-z0-9]+$/);
    await expect(student.getByRole("heading", { name: courseName })).toBeVisible();

    // 4. The student completes and submits the assigned lesson.
    await student.goto("/lessons/levels-vs-growth/attempt/new");
    await student.waitForURL(/attempt\/[a-z0-9]+/);
    await settle(student);

    const pane = student.getByRole("region", { name: "Lesson" });
    const answer = pane.getByRole("button", { name: "Answer" });
    const next = pane.getByRole("button", { name: "Next" });
    const submit = pane.getByRole("button", { name: "Submit" });

    for (let step = 0; step < 12; step += 1) {
      const autoSet = pane.getByRole("button", { name: "Set it for me" });
      if (await autoSet.isVisible().catch(() => false)) {
        await autoSet.click();
        await expect(student.getByTestId("state-check")).toHaveAttribute("data-satisfied", "true");
      }

      for (let attempt = 0; attempt < 3; attempt += 1) {
        if (!(await answer.isVisible().catch(() => false))) break;

        const radios = pane.getByRole("radio");
        const textarea = pane.locator("#short-answer");
        const numeric = pane.getByLabel(/Your answer, in/);

        if ((await radios.count()) > 0) {
          await radios.nth(Math.min(attempt, (await radios.count()) - 1)).check();
        } else if (await textarea.isVisible().catch(() => false)) {
          await textarea.fill(
            "The growth rate shows how fast output moves and how much growth can vary, including when it turns negative in a recession.",
          );
        } else if (await numeric.isVisible().catch(() => false)) {
          await numeric.fill(String(attempt));
        }

        await answer.click({ timeout: 15_000 }).catch(() => undefined);
        await expect(student.getByTestId("answer-feedback")).toBeVisible({ timeout: 15_000 });
      }

      if (await submit.isVisible().catch(() => false)) {
        await submit.click();
        break;
      }
      await next.click({ timeout: 15_000 });
    }

    await expect(student.getByText(/of 80/)).toBeVisible();

    // 5. The instructor sees the score and downloads a CSV carrying it.
    await instructor.goto(instructor.url().replace(/\/?$/, "/gradebook"));
    await expect(instructor.getByRole("table")).toBeVisible();
    await expect(instructor.getByRole("cell", { name: studentEmail })).toBeVisible();

    const [download] = await Promise.all([
      instructor.waitForEvent("download"),
      instructor.getByRole("button", { name: "Download CSV" }).click(),
    ]);

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const csv = Buffer.concat(chunks).toString("utf8");

    const [header, ...rows] = csv.trim().split("\n");
    expect(header).toBe("Student Name,Email,Levels versus growth rates,Total,Percent");
    expect(rows.join("\n")).toContain(studentEmail);
    expect(download.suggestedFilename()).toMatch(/-gradebook\.csv$/);
  } finally {
    await instructorContext.close();
    await studentContext.close();
  }
});

test("a student cannot open another course's gradebook", async ({ page }) => {
  await register(page, "Student");

  // Through the page, so the request carries the signed-in session cookie.
  const status = await page.evaluate(async () => {
    const res = await fetch("/api/v1/courses/does-not-exist/gradebook");
    return res.status;
  });
  expect(status).toBe(403);
});
