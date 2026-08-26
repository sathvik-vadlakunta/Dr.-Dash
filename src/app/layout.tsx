import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import localFont from "next/font/local";
import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import "./globals.css";

/**
 * Section 20.2. Self-hosted woff2, `display: "swap"`, exposed as CSS variables
 * that tailwind.config.ts maps onto `font-display`, `font-sans`, `font-mono`.
 */
const displayFont = localFont({
  src: [
    { path: "../../public/fonts/SpaceGrotesk-Medium.woff2", weight: "500", style: "normal" },
    { path: "../../public/fonts/SpaceGrotesk-Bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-display",
  display: "swap",
  fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
});

const sansFont = localFont({
  src: [
    { path: "../../public/fonts/Inter-Regular.woff2", weight: "400", style: "normal" },
    { path: "../../public/fonts/Inter-Medium.woff2", weight: "500", style: "normal" },
    { path: "../../public/fonts/Inter-SemiBold.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-sans",
  display: "swap",
  fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
});

const monoFont = localFont({
  src: [
    { path: "../../public/fonts/IBMPlexMono-Regular.woff2", weight: "400", style: "normal" },
    { path: "../../public/fonts/IBMPlexMono-Medium.woff2", weight: "500", style: "normal" },
  ],
  variable: "--font-mono",
  display: "swap",
  fallback: ["ui-monospace", "SFMono-Regular", "monospace"],
});

export const metadata: Metadata = {
  title: {
    default: "Dr. Dash",
    template: "%s - Dr. Dash",
  },
  description:
    "Macroeconomic time series, one click to plot, one click to transform, and graded lessons that teach students to read data.",
  icons: { icon: "/favicon.ico" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FFFFFF" },
    { media: "(prefers-color-scheme: dark)", color: "#0C1219" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Section 20.1: the theme is read on the server from `dd_theme` so the first
  // paint is already correct and there is no flash.
  const theme = (await cookies()).get("dd_theme")?.value;
  const resolved = theme === "dark" || theme === "light" ? theme : undefined;

  return (
    <html
      lang="en"
      {...(resolved ? { "data-theme": resolved } : {})}
      className={`${displayFont.variable} ${sansFont.variable} ${monoFont.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* With no stored preference the OS choice wins, applied before paint. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{if(document.documentElement.hasAttribute('data-theme'))return;var m=window.matchMedia('(prefers-color-scheme: dark)');document.documentElement.setAttribute('data-theme',m.matches?'dark':'light');}catch(e){}})();`,
          }}
        />
      </head>
      <body className="bg-surface text-ink antialiased">
        <TopBar />
        {children}
        <ShortcutSheet />
      </body>
    </html>
  );
}

/**
 * Section 16.1's global shortcuts: `g d` goes to Dashboard, `g l` goes to
 * Lessons, `?` opens this sheet, `Escape` closes any dialog. (`/` focuses the
 * series search, which owns that key because it owns the input.)
 *
 * The handler is an inline script rather than a client component because the
 * shortcuts belong to every page, and the root layout is a server component:
 * making it a client component to add four key bindings would move the session
 * read to the browser on every page in the product. The sheet itself is a real
 * `<dialog>`, so focus trapping and Escape come from the platform.
 */
function ShortcutSheet() {
  const SHORTCUTS: Array<[string, string]> = [
    ["/", "Focus the series search"],
    ["g then d", "Go to Dashboard"],
    ["g then l", "Go to Lessons"],
    ["?", "Open this list"],
    ["Escape", "Close a dialog"],
    ["Arrow keys", "Read the chart one period at a time"],
    ["Home / End", "Jump to the first or last period"],
    ["Page Up / Page Down", "Move one year"],
  ];

  return (
    <>
      <dialog
        id="dd-shortcuts"
        aria-label="Keyboard shortcuts"
        className="w-[min(480px,92vw)] rounded-card border border-rule bg-surface-raised p-0 text-ink shadow-popover backdrop:bg-ink/40"
      >
        <div className="panel-header">
          <h2 className="text-subtitle font-semibold">Keyboard shortcuts</h2>
        </div>
        <dl className="flex flex-col gap-2 p-4">
          {SHORTCUTS.map(([keys, what]) => (
            <div key={keys} className="flex items-baseline justify-between gap-4">
              <dt className="font-mono text-data text-ink">{keys}</dt>
              <dd className="text-small text-ink-muted">{what}</dd>
            </div>
          ))}
        </dl>
        <form method="dialog" className="flex justify-end border-t border-rule p-4">
          <button className="h-[36px] rounded-control border border-rule-strong px-4 text-small text-ink">
            Close
          </button>
        </form>
      </dialog>
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){var pending=null,timer=null;function typing(e){var t=e.target;if(!t)return false;var n=t.tagName;return n==='INPUT'||n==='TEXTAREA'||n==='SELECT'||t.isContentEditable;}document.addEventListener('keydown',function(e){if(e.metaKey||e.ctrlKey||e.altKey||typing(e))return;var d=document.getElementById('dd-shortcuts');if(e.key==='?'){e.preventDefault();if(d&&!d.open)d.showModal();return;}if(pending==='g'){pending=null;clearTimeout(timer);if(e.key==='d'){e.preventDefault();window.location.assign('/dashboard');return;}if(e.key==='l'){e.preventDefault();window.location.assign('/lessons');return;}}if(e.key==='g'){pending='g';clearTimeout(timer);timer=setTimeout(function(){pending=null;},1200);}});})();`,
        }}
      />
    </>
  );
}

/**
 * Section 16.1. A 56 px fixed bar: the wordmark, the four nav links, and the
 * account menu. Courses appears for instructors and enrolled students; Admin
 * only for admins.
 */
async function TopBar() {
  const session = await getSession();
  const user = session?.user ?? null;

  return (
    <header
      data-app-chrome
      className="sticky top-0 z-30 flex h-[56px] items-center gap-6 border-b border-rule bg-surface px-4"
    >
      <Link href={user ? "/dashboard" : "/"} className="font-display text-subtitle font-bold text-ink">
        Dr. Dash
      </Link>

      {user ? (
        <nav aria-label="Main" className="flex items-center gap-4 text-small">
          <Link href="/dashboard" className="text-ink hover:text-accent">
            Dashboard
          </Link>
          <Link href="/data" className="text-ink hover:text-accent">
            Data
          </Link>
          <Link href="/lessons" className="text-ink hover:text-accent">
            Lessons
          </Link>
          <Link href="/courses" className="text-ink hover:text-accent">
            Courses
          </Link>
          {user.role === "ADMIN" ? (
            <Link href="/admin" className="text-ink hover:text-accent">
              Admin
            </Link>
          ) : null}
        </nav>
      ) : null}

      <div className="ml-auto flex items-center gap-3 text-small">
        {user ? (
          <>
            <span className="hidden font-mono text-data text-ink-muted sm:inline">
              Press / to search
            </span>
            <span className="text-ink">{user.name}</span>
            <form action="/sign-out" method="post">
              <button type="submit" className="text-accent underline">
                Sign out
              </button>
            </form>
          </>
        ) : (
          <>
            <Link href="/sign-in" className="text-ink hover:text-accent">
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className="rounded-control bg-accent px-3 py-1 text-accent-ink"
            >
              Create an account
            </Link>
          </>
        )}
      </div>
    </header>
  );
}
