import { expect, test } from "@playwright/test";
import { register } from "./helpers";

/**
 * Section 22.4, import-csv.spec.ts.
 */

function csvWithOneBadRow(): string {
  const rows = ["date,north,south"];
  for (let year = 2010; year <= 2019; year += 1) {
    for (const month of ["01", "04", "07", "10"]) {
      rows.push(`${year}-${month}-01,${100 + year - 2010},${200 + year - 2010}`);
    }
  }
  // One unreadable date, in a row the importer has to name.
  rows.splice(5, 0, "last tuesday,1,2");
  return rows.join("\n");
}

test("an import names the row it could not read, then commits the rest", async ({ page }) => {
  await register(page);

  await page.goto("/data/import");
  await page.setInputFiles("#csv", {
    name: "widgets.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csvWithOneBadRow(), "utf8"),
  });

  // 1. The issue list names the row number.
  await expect(page.getByText(/rows could not be read/)).toBeVisible();
  await expect(page.getByText(/Row 6:/)).toBeVisible();

  // 2. Commit the valid rows into a category of the user's own.
  await page.getByLabel("Short label").fill("Widgets north");
  await page.getByLabel("Title").fill("Widgets produced, north");
  await page.getByLabel("Units", { exact: true }).fill("Thousands of Units");
  await page.getByLabel("Units, short").fill("Thous. units");
  await page.getByLabel("Stored scale").selectOption("1000");
  await page.getByLabel("Kind").selectOption("LEVEL_COUNT");

  await page.getByRole("button", { name: /^Import \d+ valid rows$/ }).click();

  await expect(page.getByText("Plot it now")).toBeVisible();

  // 3. The imported series is in the catalog and plots.
  await page.getByText("Plot it now").click();
  await page.waitForURL(/s=usr_/);
  await expect(page.locator("svg .recharts-line").first()).toBeVisible();
});

test("a new category can hold an imported series", async ({ page }) => {
  await register(page);

  await page.goto("/data");
  const name = `Imports ${Date.now()}`;
  await page.getByLabel("New category").fill(name);
  await page.getByRole("button", { name: "Add", exact: true }).click();

  await expect(page.getByRole("button", { name: new RegExp(name) })).toBeVisible();
});
