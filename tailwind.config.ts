import type { Config } from "tailwindcss";

/**
 * Every colour in the system is a CSS variable declared in src/app/globals.css.
 * Nothing here may contain a hex literal: Section 20.1 of the build spec makes
 * globals.css the single place a colour is written down.
 */
const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/lib/**/*.{ts,tsx}",
  ],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      // Section 16.3's two layout breakpoints. `md` is already 768 px; `wide`
      // is the point where all three panes fit side by side.
      screens: {
        wide: "1200px",
      },
      colors: {
        surface: "var(--surface)",
        "surface-sunken": "var(--surface-sunken)",
        "surface-raised": "var(--surface-raised)",
        ink: "var(--ink)",
        "ink-muted": "var(--ink-muted)",
        rule: "var(--rule)",
        "rule-strong": "var(--rule-strong)",
        band: "var(--band)",
        accent: "var(--accent)",
        "accent-hover": "var(--accent-hover)",
        "accent-ink": "var(--accent-ink)",
        focus: "var(--focus)",
        ok: "var(--ok)",
        warn: "var(--warn)",
        danger: "var(--danger)",
        "series-1": "var(--series-1)",
        "series-2": "var(--series-2)",
        "series-3": "var(--series-3)",
        "series-4": "var(--series-4)",
        "series-5": "var(--series-5)",
        "series-6": "var(--series-6)",
      },
      fontFamily: {
        display: ["var(--font-display)", "ui-sans-serif", "system-ui", "sans-serif"],
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      // Section 20.2 type scale: size / line-height / tracking.
      fontSize: {
        "display-l": ["40px", { lineHeight: "44px", letterSpacing: "-0.02em" }],
        "display-m": ["28px", { lineHeight: "34px", letterSpacing: "-0.015em" }],
        title: ["20px", { lineHeight: "28px", letterSpacing: "-0.01em" }],
        subtitle: ["16px", { lineHeight: "24px", letterSpacing: "0" }],
        body: ["15px", { lineHeight: "23px", letterSpacing: "0" }],
        small: ["13px", { lineHeight: "19px", letterSpacing: "0" }],
        eyebrow: ["11px", { lineHeight: "14px", letterSpacing: "0.08em" }],
        data: ["13px", { lineHeight: "18px", letterSpacing: "0" }],
        "data-lg": ["17px", { lineHeight: "22px", letterSpacing: "0" }],
      },
      // Section 20.3: 4px base, nothing off-scale.
      spacing: {
        1: "4px",
        2: "8px",
        3: "12px",
        4: "16px",
        6: "24px",
        8: "32px",
        12: "48px",
        16: "64px",
      },
      borderRadius: {
        none: "0",
        control: "3px",
        card: "6px",
      },
      boxShadow: {
        // Section 20.3: exactly one shadow exists in the system.
        popover: "0 8px 24px -8px rgb(11 27 43 / 0.18)",
      },
      transitionTimingFunction: {
        system: "cubic-bezier(0.2, 0, 0, 1)",
      },
      transitionDuration: {
        120: "120ms",
        180: "180ms",
        240: "240ms",
      },
    },
  },
  plugins: [],
};

export default config;
