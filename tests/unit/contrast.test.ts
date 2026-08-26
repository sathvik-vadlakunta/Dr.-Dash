import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Section 21.1.1 and Phase 10's "dark mode verification of all contrast pairs".
 *
 * The tokens in `globals.css` are the only place a colour is written down, so
 * the check reads them rather than hard-coding a copy that could drift. Every
 * pair the product actually renders is measured in both themes; a token edit
 * that dips below WCAG AA fails here instead of in front of a student.
 */

const CSS = readFileSync(new URL("../../src/app/globals.css", import.meta.url), "utf8");

type Palette = Record<string, string>;

function tokensIn(selector: string): Palette {
  const start = CSS.indexOf(selector);
  expect(start, `${selector} is missing from globals.css`).toBeGreaterThan(-1);

  const open = CSS.indexOf("{", start);
  const close = CSS.indexOf("\n}", open);
  const palette: Palette = {};
  for (const line of CSS.slice(open, close).split("\n")) {
    const match = /(--[a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})/.exec(line);
    if (match?.[1] && match[2]) palette[match[1]] = match[2];
  }
  return palette;
}

const LIGHT = tokensIn(":root {");
const DARK = { ...LIGHT, ...tokensIn('[data-theme="dark"]') };

/** WCAG 2.1 relative luminance. */
function luminance(hex: string): number {
  const channel = (offset: number): number => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(a: string, b: string): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (lighter + 0.05) / (darker + 0.05);
}

/** 4.5:1 for body text, 3:1 for UI borders and graphical objects. */
const TEXT_PAIRS: Array<[string, string]> = [
  ["--ink", "--surface"],
  ["--ink", "--surface-sunken"],
  ["--ink", "--surface-raised"],
  ["--ink-muted", "--surface"],
  // Section 21.1.1 calls this one out by name.
  ["--ink-muted", "--surface-sunken"],
  ["--ink-muted", "--surface-raised"],
  ["--accent", "--surface"],
  ["--accent", "--surface-sunken"],
  ["--accent-ink", "--accent"],
  ["--ok", "--surface"],
  ["--warn", "--surface"],
  ["--warn", "--surface-sunken"],
  ["--danger", "--surface"],
  ["--danger", "--surface-sunken"],
];

const BORDER_PAIRS: Array<[string, string]> = [
  ["--rule-strong", "--surface"],
  ["--rule-strong", "--surface-sunken"],
  ["--focus", "--surface"],
  ["--focus", "--surface-sunken"],
];

/**
 * Section 20.1 fixes the series palette to Okabe-Ito and says not to substitute
 * it, because staying separable under deuteranopia, protanopia, and tritanopia
 * matters more on a chart than luminance against the page. Two of the six are
 * light enough to fall under 3:1 on a white background, so they are pinned here
 * rather than silently accepted: the mitigation is Section 21.1.4, where the
 * legend, the tooltip, and `View as table` all carry the series name.
 */
const LIGHT_SERIES_EXCEPTIONS = new Set(["--series-5", "--series-6"]);

describe.each([
  ["light", LIGHT],
  ["dark", DARK],
])("%s theme", (theme, palette) => {
  it.each(TEXT_PAIRS)("reads %s on %s at 4.5:1 or better", (fg, bg) => {
    expect(palette[fg], `${fg} is undefined`).toBeDefined();
    expect(palette[bg], `${bg} is undefined`).toBeDefined();
    expect(contrast(palette[fg] as string, palette[bg] as string)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(BORDER_PAIRS)("draws %s on %s at 3:1 or better", (fg, bg) => {
    expect(contrast(palette[fg] as string, palette[bg] as string)).toBeGreaterThanOrEqual(3);
  });

  it("keeps every series line separable from the page it is drawn on", () => {
    const weak: string[] = [];
    for (let n = 1; n <= 6; n += 1) {
      const token = `--series-${n}`;
      const ratio = contrast(palette[token] as string, palette["--surface"] as string);
      if (ratio < 3) weak.push(token);
    }
    expect(weak).toEqual(theme === "light" ? [...LIGHT_SERIES_EXCEPTIONS] : []);
  });

  it("shades recessions distinguishably without hiding the lines under them", () => {
    const band = contrast(palette["--band"] as string, palette["--surface"] as string);
    expect(band).toBeGreaterThan(1.05);
    expect(band).toBeLessThan(1.5);
  });
});

it("gives dark mode its own status colours rather than inheriting light ones", () => {
  for (const token of ["--ok", "--warn", "--danger", "--rule-strong"]) {
    expect(DARK[token], `${token} has no dark-mode value`).not.toBe(LIGHT[token]);
  }
});
