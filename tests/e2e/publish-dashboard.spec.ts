import { expect, test, type Page } from "@playwright/test";
import { register, settle } from "./helpers";

/**
 * Section 22.4, publish-dashboard.spec.ts. The secondary-market-2 path end to
 * end: an owner publishes, a stranger with no account reads and transforms, and
 * another origin frames it.
 */

test.setTimeout(180_000);

/** The publish response builds its URL from NEXT_PUBLIC_APP_URL, which is not
 *  the port the test server listens on, so only the token travels. */
function tokenOf(url: string): string {
  return url.trim().split("/p/")[1] ?? "";
}

/** Plot two series, save under `title`, publish, and hand back the token. */
async function publish(page: Page, title: string, allowEmbed: boolean): Promise<string> {
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByLabel("Title").fill(title);
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();

  await expect(page.getByRole("dialog").getByText(`${title} is saved`)).toBeVisible();
  if (allowEmbed) await page.getByLabel("Allow embedding in other sites").check();
  await page.getByRole("button", { name: "Publish" }).click();

  const field = page.getByTestId("public-url");
  await expect(field).toBeVisible();
  const token = tokenOf(await field.inputValue());
  expect(token).toMatch(/^[A-Za-z0-9_-]{22}$/);

  return token;
}

test("publishing, reading signed out, and framing on another origin", async ({ page, browser }) => {
  // 1. Build a two-series view and publish it with embedding allowed.
  await register(page);

  await page.getByRole("button", { name: /National Income and Output/ }).click();
  await page.getByRole("button", { name: /^Nominal GDP/ }).click();
  await page.waitForURL(/s=GDP/);

  await page.getByLabel("Search series").fill("UNRATE");
  await page.getByRole("button", { name: /Unemployment Rate/ }).first().click();
  await page.waitForURL(/s=UNRATE/);
  await expect(page.locator("svg .recharts-line")).toHaveCount(2);

  const embeddable = await publish(page, "Output and unemployment", true);

  // The snippet is Section 17.2's, verbatim apart from the host and token.
  const snippet = await page.getByTestId("embed-snippet").inputValue();
  expect(snippet).toContain(`/embed/${embeddable}`);
  expect(snippet).toContain('width="100%" height="520" style="border:0"');
  expect(snippet).toContain('title="Output and unemployment" loading="lazy"');

  await page.getByRole("button", { name: "Done" }).click();

  // A second dashboard, published without embedding, for the 404 below.
  const notEmbeddable = await publish(page, "Output and unemployment, private frame", false);
  expect(await page.getByTestId("embed-snippet").count()).toBe(0);
  await page.getByRole("button", { name: "Done" }).click();

  // 2. A visitor with no account reads it and transforms it.
  const visitorContext = await browser.newContext();
  const visitor = await visitorContext.newPage();
  try {
    await visitor.goto(`/p/${embeddable}`);
    await settle(visitor);

    await expect(visitor.getByRole("heading", { name: "Output and unemployment" })).toBeVisible();
    await expect(visitor.getByText(/^Published by /)).toBeVisible();
    await expect(visitor.locator("svg .recharts-line")).toHaveCount(2);
    // Section 17.1: no catalog, and nothing a visitor could save over.
    await expect(visitor.getByRole("button", { name: "Save" })).toHaveCount(0);
    // The footer carries the sources, their dates, and the download.
    const footer = visitor.locator("footer");
    await expect(footer.getByText("UNRATE")).toBeVisible();
    await expect(footer.getByText(/updated \d{4}-\d{2}-\d{2}/).first()).toBeVisible();
    await expect(footer.getByRole("button", { name: "Download CSV" })).toBeVisible();

    // One chip per plotted transform, plus the series itself.
    await expect(visitor.getByTestId("transform-chip")).toHaveCount(1);
    await visitor.getByLabel("Growth, year over year").click();
    await visitor.waitForURL(/g%3Ayoy/);
    await expect(visitor.getByTestId("transform-chip")).toHaveCount(2);
    await expect(visitor.locator("svg .recharts-line").first()).toBeVisible();

    // The visitor's own view is shareable, and the stored one is unchanged.
    expect(visitor.url()).toContain(`/p/${embeddable}?`);
    const reread = await visitor.request.get(`/api/v1/public/dashboards/${embeddable}`);
    expect(JSON.stringify(await reread.json())).not.toContain("YOY");

    // 3. The embed route: 200 and frame-ancestors *, and 404 without embedding.
    const embedded = await visitor.request.get(`/embed/${embeddable}`);
    expect(embedded.status()).toBe(200);
    expect(embedded.headers()["content-security-policy"]).toBe("frame-ancestors *");

    const refused = await visitor.request.get(`/embed/${notEmbeddable}`);
    expect(refused.status()).toBe(404);

    // Phase 9's acceptance: it renders in a frame on a *different* origin.
    // 127.0.0.1 and localhost are separate origins on the same server.
    const origin = new URL(visitor.url()).origin;
    await visitor.goto(`${origin.replace("127.0.0.1", "localhost")}/`);
    await visitor.evaluate((src) => {
      const frame = document.createElement("iframe");
      frame.src = src;
      frame.width = "1200";
      frame.height = "520";
      frame.title = "Output and unemployment";
      document.body.appendChild(frame);
    }, `${origin}/embed/${embeddable}`);

    const frame = visitor.frameLocator("iframe");
    await expect(frame.locator('[data-ready="true"]')).toBeVisible({ timeout: 30_000 });
    await expect(frame.locator("svg .recharts-line").first()).toBeVisible();
    // No app chrome, no copy link.
    await expect(frame.getByRole("link", { name: "Dr. Dash" })).toBeHidden();
    await expect(frame.getByRole("button", { name: "Copy link" })).toHaveCount(0);

    // Transforms work inside the frame, with no session behind them.
    await frame.getByLabel("Growth, year over year").click();
    await expect(frame.getByTestId("transform-chip")).toHaveCount(2);
    await expect(frame.locator("svg .recharts-line").first()).toBeVisible();
  } finally {
    await visitorContext.close();
  }
});

test("an unpublished dashboard is not readable", async ({ page }) => {
  await register(page);

  await page.getByRole("button", { name: /National Income and Output/ }).click();
  await page.getByRole("button", { name: /^Nominal GDP/ }).click();
  await page.waitForURL(/s=GDP/);

  const token = await publish(page, "Briefly public", false);
  await page.getByRole("button", { name: "Unpublish" }).click();
  await expect(page.getByText("Unpublished. The old link no longer opens.")).toBeVisible();

  const gone = await page.request.get(`/api/v1/public/dashboards/${token}`);
  expect(gone.status()).toBe(404);

  const page404 = await page.request.get(`/p/${token}`);
  expect(page404.status()).toBe(404);
});
