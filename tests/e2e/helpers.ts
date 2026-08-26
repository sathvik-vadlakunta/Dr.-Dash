import type { Page } from "@playwright/test";

/**
 * Shared setup for the Section 22.4 scenarios. It lives outside a `.spec.ts`
 * file on purpose: importing one spec from another would register its tests a
 * second time in the importing file's run.
 */

export const PASSWORD = "PlaywrightPass!2026";

/**
 * Section 11.4. A production build refuses to mint an instructor account
 * without a code from an organization, and the E2E suite runs a production
 * build, so it uses the demo organization's code rather than a weakened rule.
 */
export const INSTRUCTOR_CODE = "TEACH1";

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}@drdash.test`;
}

export async function register(
  page: Page,
  role: "Student" | "Instructor" = "Student",
): Promise<string> {
  const email = uniqueEmail(role.toLowerCase());
  await page.goto("/sign-up");
  await page.getByLabel("Name").fill("Playwright Person");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  if (role === "Instructor") {
    await page.getByLabel("Instructor").check();
    await page.getByLabel("Instructor code").fill(INSTRUCTOR_CODE);
  }
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.waitForURL("**/dashboard**");
  await settle(page);
  return email;
}

/**
 * Landing on a URL is not the same as the page being interactive: a click that
 * arrives before React hydrates hits a button with no handler on it and does
 * nothing. The workspace sets `data-ready` from an effect, so this waits for
 * the moment the controls actually respond.
 */
export async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForSelector('[data-ready="true"]', { timeout: 30_000 });
}

export async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/dashboard**");
  await settle(page);
}
