import { expect, test } from "@playwright/test";
import { register, settle } from "./helpers";

/**
 * Section 22.4, plot-and-transform.spec.ts. Ten steps, in order, against the
 * seeded offline fixtures so the results are deterministic.
 */

test.describe.configure({ mode: "serial" });

test("plot and transform, end to end", async ({ page }) => {
  await register(page);

  // 1. Click a category, click a series.
  await page.getByRole("button", { name: /National Income and Output/ }).click();
  await page.getByRole("button", { name: /^Nominal GDP/ }).click();

  await page.waitForURL(/s=GDP/);
  await expect(page.locator("svg .recharts-line").first()).toBeVisible();
  await expect(page.getByTestId("transform-chip")).toHaveCount(1);

  // 2. Adjust for inflation, base year 2017.
  await page.getByLabel(/Adjust for inflation/).click();
  await page.getByLabel("Base year").selectOption("2017");

  await page.waitForURL(/r2017/);
  await expect(page.getByTestId("transform-chip")).toHaveCount(2);
  await expect(page.locator("text=Bil. 2017 $").first()).toBeVisible();

  // 3. Per capita.
  await page.getByLabel(/Per capita/).click();

  await page.waitForURL(/\.pc/);
  await expect(page.getByTestId("transform-chip")).toHaveCount(3);
  await expect(page.locator("text=2017 $/person").first()).toBeVisible();

  // 4. Growth, year over year.
  await page.getByLabel("Growth, year over year").click();

  await page.waitForURL(/g%3Ayoy/);
  await expect(page.getByTestId("transform-chip")).toHaveCount(4);
  await expect(page.locator("text=% YoY").first()).toBeVisible();

  // 5. Remove the per capita chip from the transform bar.
  await page.getByRole("button", { name: /Remove \/ / }).click();

  await page.waitForURL((url) => !url.search.includes(".pc"));
  await expect(page.getByTestId("transform-chip")).toHaveCount(3);

  // 6. Add the unemployment rate and move it to the right axis.
  await page.getByLabel("Search series").fill("UNRATE");
  await page.getByRole("button", { name: /Unemployment Rate/ }).first().click();
  await page.waitForURL(/s=UNRATE/);

  await page.getByRole("button", { name: /Move .* to the right axis/ }).click();
  await page.waitForURL(/ax%3Ar/);
  await expect(page.locator("svg .recharts-yAxis")).toHaveCount(2);

  // 8. Recession shading off and on changes the number of bands drawn.
  const bandsBefore = await page.locator("svg .recharts-reference-area").count();
  await page.getByLabel(/Recessions/).click();
  await expect.poll(() => page.locator("svg .recharts-reference-area").count()).toBeLessThan(
    bandsBefore,
  );
  await page.getByLabel(/Recessions/).click();
  await expect.poll(() => page.locator("svg .recharts-reference-area").count()).toBe(bandsBefore);

  // 9. The CSV download's header row carries the legend labels.
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download CSV" }).click(),
  ]);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const header = Buffer.concat(chunks).toString("utf8").split("\n")[0] ?? "";
  expect(header).toContain("Nominal GDP");
  expect(header).toContain("Unemployment Rate");

  // 10. Reloading the same URL reproduces the identical state.
  const url = page.url();
  await page.reload();
  expect(page.url()).toBe(url);
  await expect(page.getByTestId("transform-chip")).toHaveCount(3);
});

test("a ratio switches per capita off and says so", async ({ page }) => {
  await register(page);

  await page.goto("/dashboard?s=PCEC~pc");
  await settle(page);
  await expect(page.getByLabel(/Per capita/)).toBeChecked();

  const denominator = page.getByLabel("Show as percent of...");
  await denominator.fill("GDP");
  // The search is debounced, so give it a beat to offer the candidate before
  // Enter picks it.
  await expect.poll(async () => (await denominator.inputValue()).length).toBeGreaterThan(0);
  await page.waitForTimeout(600);
  await denominator.press("Enter");

  await expect(
    page.getByText("Per capita turned off. Population cancels in a ratio."),
  ).toBeVisible();
});

test("the chart can be read from the keyboard and as a table", async ({ page }) => {
  await register(page);
  await page.goto("/dashboard?s=UNRATE");
  await settle(page);

  await expect(page.locator("svg .recharts-line").first()).toBeVisible();

  // Section 21.1.2: focus the plot and walk the readout cursor.
  await page.getByRole("img", { name: /Chart of/ }).focus();
  await page.keyboard.press("End");
  await page.keyboard.press("ArrowLeft");

  // The toast region is also aria-live, so target the chart's own readout.
  await expect(page.getByTestId("chart-readout")).not.toBeEmpty();

  // Section 21.1.3: the table is the non-visual equivalent, not a lesser one.
  await page.getByRole("button", { name: "View as table" }).click();
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByRole("columnheader", { name: /Period/ })).toBeVisible();
});

/**
 * Section 6.8. The scope switch decides how many plotted series a control
 * writes to: everything at once, or only what is selected in the legend.
 */
test("a transform can be applied to all series or to just one", async ({ page }) => {
  await register(page);
  await page.goto("/dashboard?s=GDP&s=PCEC");
  await settle(page);
  await expect(page.locator("svg .recharts-line")).toHaveCount(2);

  // All series: one click puts year-over-year growth on both.
  await page.getByLabel("Growth, year over year").click();
  await page.waitForURL(/g%3Ayoy.*g%3Ayoy/);

  // Back to levels, then narrow the scope to one series in the legend.
  await page.getByLabel("Level").click();
  await page.waitForURL((url) => !url.search.includes("g%3Ayoy"));

  await page.getByRole("button", { name: "Selected" }).click();
  await expect(page.getByText("Select a series in the legend.")).toBeVisible();

  await page.getByRole("button", { name: /^Nominal GDP/ }).first().click();
  await page.getByLabel("Growth, year over year").click();

  // Exactly one of the two series carries the token now.
  await page.waitForURL(/g%3Ayoy/);
  const withGrowth = new URL(page.url()).searchParams.getAll("s").filter((s) => s.includes("g:yoy"));
  expect(withGrowth).toHaveLength(1);
  expect(withGrowth[0]).toContain("GDP~");
});
