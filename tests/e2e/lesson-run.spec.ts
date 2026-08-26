import { expect, test } from "@playwright/test";
import { register, settle } from "./helpers";

/**
 * Section 22.4, lesson-run.spec.ts.
 */

test("running a lesson start to finish", async ({ page }) => {
  await register(page);

  await page.goto("/lessons");
  await expect(page.getByRole("heading", { name: "Levels versus growth rates" })).toBeVisible();

  await page.goto("/lessons/levels-vs-growth");
  await page.getByRole("link", { name: /Start lesson|Continue lesson/ }).click();
  await page.waitForURL(/\/lessons\/levels-vs-growth\/attempt\/[a-z0-9]+/);
  await settle(page);

  // 1. The dashboard renders beside the lesson panel.
  await expect(page.getByRole("region", { name: "Lesson" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Dashboard" })).toBeVisible();

  // Step s1 is a READ; advance to the task.
  await page.getByRole("region", { name: "Lesson" }).getByRole("button", { name: "Next" }).click();

  // 2. The question is locked until the task's state check passes.
  await expect(page.getByTestId("state-check")).toHaveAttribute("data-satisfied", "false");
  await page.getByRole("region", { name: "Lesson" }).getByRole("button", { name: "Set it for me" }).click();
  await expect(page.getByTestId("state-check")).toHaveAttribute("data-satisfied", "true");

  await page.getByRole("region", { name: "Lesson" }).getByRole("button", { name: "Next" }).click();

  // 3. A wrong answer costs a try and reveals nothing; the second earns 60%.
  const lessonPane = page.getByRole("region", { name: "Lesson" });
  await lessonPane.getByRole("radio").nth(1).check();
  await lessonPane.getByRole("button", { name: "Answer" }).click();

  const feedback = page.getByTestId("answer-feedback");
  await expect(feedback).toContainText("Not quite.");
  await expect(feedback).toContainText("1 tries left");
  await expect(feedback).not.toContainText("A level chart makes the long-run direction");

  await lessonPane.getByRole("radio").first().check();
  await lessonPane.getByRole("button", { name: "Answer" }).click();
  await expect(feedback).toContainText("Correct.");
  await expect(feedback).toContainText("6 of 10 points");

  // 5. No answer key ever reaches the browser, by either route it could take:
  // the API payload, and the server-rendered runner itself.
  const apiPayload = await page.evaluate(async () => {
    const res = await fetch("/api/v1/lessons/levels-vs-growth");
    return res.text();
  });
  for (const key of ['"answer"', '"tolerance"', '"rubric"', '"mustInclude"']) {
    expect(apiPayload).not.toContain(key);
  }

  // The runner is server-rendered, so its own markup is the other way a key
  // could leak. An explanation the student has already earned is expected in
  // the markup; an unearned one is not.
  const markup = await page.content();
  expect(markup).not.toContain("mustInclude");
  expect(markup).not.toContain("tolerance");
  // The last question's explanation has not been earned yet.
  expect(markup).not.toContain("The level answers how big.");
});

test("a submitted attempt shows every question and a score out of 80", async ({ page }) => {
  await register(page);

  await page.goto("/lessons/levels-vs-growth/attempt/new");
  await page.waitForURL(/attempt\/[a-z0-9]+/);
  await settle(page);

  // Walk every step: satisfy each task, answer each question until it settles,
  // then advance. The point is that the whole lesson completes and scores.
  //
  // Everything is scoped to the lesson pane: the dashboard beside it has radios
  // of its own (the growth control), and an unscoped locator picks those up.
  const lesson = page.getByRole("region", { name: "Lesson" });
  const answer = lesson.getByRole("button", { name: "Answer" });
  const next = lesson.getByRole("button", { name: "Next" });
  const submit = lesson.getByRole("button", { name: "Submit" });

  for (let step = 0; step < 12; step += 1) {
    const autoSet = lesson.getByRole("button", { name: "Set it for me" });
    if (await autoSet.isVisible().catch(() => false)) {
      await autoSet.click();
      await expect(page.getByTestId("state-check")).toHaveAttribute("data-satisfied", "true");
    }

    // A question settles when it is right or out of tries, at most three tries.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (!(await answer.isVisible().catch(() => false))) break;

      const radios = lesson.getByRole("radio");
      const textarea = lesson.locator("#short-answer");
      const numeric = lesson.getByLabel(/Your answer, in/);

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
      await expect(page.getByTestId("answer-feedback")).toBeVisible({ timeout: 15_000 });
    }

    if (await submit.isVisible().catch(() => false)) {
      await submit.click();
      break;
    }
    await next.click({ timeout: 15_000 });
  }

  // 4. The results screen lists every question and the score out of 80.
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByText(/of 80/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to lessons" })).toBeVisible();
});
