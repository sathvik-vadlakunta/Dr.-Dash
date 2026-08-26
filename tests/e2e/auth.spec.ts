import { expect, test } from "@playwright/test";
import { PASSWORD, register } from "./helpers";

/**
 * Section 22.4, auth.spec.ts.
 */

test("visiting the dashboard signed out lands on sign in", async ({ page }) => {
  await page.goto("/dashboard");
  await page.waitForURL("**/sign-in**");
  expect(page.url()).toContain("next=/dashboard");
});

test("registering lands on the dashboard's empty state", async ({ page }) => {
  await register(page);

  await expect(page.getByText("Pick a category, then a series.")).toBeVisible();
  for (const starter of ["Real GDP", "Unemployment rate", "CPI inflation", "Fed funds rate"]) {
    await expect(page.getByRole("button", { name: starter })).toBeVisible();
  }
});

test("signing out and back in returns to the dashboard", async ({ page }) => {
  const email = await register(page);

  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/dashboard"));

  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();

  await page.waitForURL("**/dashboard**");
  await expect(page.getByText("Pick a category, then a series.")).toBeVisible();
});
