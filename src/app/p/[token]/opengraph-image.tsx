import { ImageResponse } from "next/og";
import { fetchPublishedDashboard } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Section 17.1. A dynamic OG image carrying the dashboard title and a static
 * thumbnail, so a shared link arrives in Slack or a course page as something
 * recognisable rather than a bare URL.
 *
 * The thumbnail is drawn here rather than screenshotted: rendering the real
 * chart would mean running Recharts and the whole transform pipeline on every
 * social-card fetch, which is a plotting request an unauthenticated caller
 * could repeat at will.
 */

export const alt = "A published Dr. Dash dashboard";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const INK = "#101820";
const MUTED = "#5A6472";
const RULE = "#D9DEE5";
const ACCENT = "#1B6AC9";
const SURFACE = "#FFFFFF";

/** The Okabe-Ito heights of the thumbnail bars, as a share of its height. */
const BARS = [0.35, 0.5, 0.42, 0.68, 0.58, 0.8, 0.72, 0.95];

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const dashboard = await fetchPublishedDashboard(token);

  const title = dashboard?.title ?? "Dr. Dash";
  const byline = dashboard
    ? `Published by ${dashboard.owner.orgName ?? dashboard.owner.name}`
    : "Macroeconomic data, plotted and transformed";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: SURFACE,
          padding: 64,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div
            style={{
              display: "flex",
              fontSize: 26,
              letterSpacing: 3,
              textTransform: "uppercase",
              color: MUTED,
            }}
          >
            Dr. Dash
          </div>
          <div style={{ display: "flex", fontSize: 68, lineHeight: 1.1, color: INK }}>
            {title.length > 90 ? `${title.slice(0, 89)}…` : title}
          </div>
          <div style={{ display: "flex", fontSize: 30, color: MUTED }}>{byline}</div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: 18,
            height: 220,
            borderBottom: `4px solid ${RULE}`,
            paddingBottom: 4,
          }}
        >
          {BARS.map((share, index) => (
            <div
              key={index}
              style={{
                display: "flex",
                width: 108,
                height: Math.round(share * 210),
                background: index === BARS.length - 1 ? ACCENT : RULE,
              }}
            />
          ))}
        </div>
      </div>
    ),
    size,
  );
}
