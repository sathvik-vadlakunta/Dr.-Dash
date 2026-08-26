import { z } from "zod";
import type { GrowthMode, TransformSpec } from "@/lib/series/types";

/**
 * Section 12. The URL is the state. Any dashboard view is fully reproducible
 * from its URL, saving a dashboard stores the same object, and sharing a link
 * shares the analysis. It is also what lets a lesson check whether a student is
 * looking at the right thing without asking the server (Section 19.4).
 */

export interface PlottedSeries {
  slug: string;
  transform: TransformSpec;
  axis: "left" | "right";
}

export interface DashboardState {
  series: PlottedSeries[]; // max 6, order determines colour index
  start: string | null; // ISO date, null = earliest available
  end: string | null; // ISO date, null = latest available
  showRecessions: boolean; // default true
  logScale: boolean; // default false
  title: string | null;
}

export const MAX_SERIES = 6;

const SLUG = /^[A-Za-z0-9_]+$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function emptyState(): DashboardState {
  return { series: [], start: null, end: null, showRecessions: true, logScale: false, title: null };
}

function emptySpec(): TransformSpec {
  return {
    real: false,
    baseYear: null,
    deflatorSlug: null,
    perCapita: false,
    populationSlug: null,
    percentOfSlug: null,
    growth: "NONE",
  };
}

const GROWTH_TOKEN: Record<Exclude<GrowthMode, "NONE">, string> = {
  YOY: "g:yoy",
  POP: "g:pop",
  POP_ANNUALIZED: "g:popa",
};

const TOKEN_GROWTH: Record<string, GrowthMode> = {
  "g:yoy": "YOY",
  "g:pop": "POP",
  "g:popa": "POP_ANNUALIZED",
};

/**
 * Section 12.4. Tokens are emitted in a fixed order so `encodeState` is stable,
 * which is what makes the round trip idempotent and the E2E URL assertions
 * meaningful.
 */
export function encodeSeries(entry: PlottedSeries): string {
  const t = entry.transform;
  const tokens: string[] = [];

  if (t.real && t.baseYear !== null) tokens.push(`r${t.baseYear}`);
  if (t.deflatorSlug) tokens.push(`d${t.deflatorSlug}`);
  if (t.perCapita) tokens.push("pc");
  if (t.populationSlug) tokens.push(`p${t.populationSlug}`);
  if (t.percentOfSlug) tokens.push(`of${t.percentOfSlug}`);
  if (t.growth !== "NONE") tokens.push(GROWTH_TOKEN[t.growth]);
  if (entry.axis === "right") tokens.push("ax:r");

  return tokens.length === 0 ? entry.slug : `${entry.slug}~${tokens.join(".")}`;
}

export function encodeState(state: DashboardState): URLSearchParams {
  const params = new URLSearchParams();

  for (const entry of state.series.slice(0, MAX_SERIES)) {
    params.append("s", encodeSeries(entry));
  }
  if (state.start) params.set("start", state.start);
  if (state.end) params.set("end", state.end);
  // `rec` defaults to 1 and `log` to 0, so only the non-default is written.
  if (!state.showRecessions) params.set("rec", "0");
  if (state.logScale) params.set("log", "1");
  if (state.title) params.set("t", state.title);

  return params;
}

/** Never throws. An unreadable token is dropped, not an error (Section 12.4). */
export function decodeSeries(raw: string): PlottedSeries | null {
  const [slug, tokenPart] = raw.split("~", 2);
  if (!slug || !SLUG.test(slug)) return null;

  const entry: PlottedSeries = { slug, transform: emptySpec(), axis: "left" };
  if (!tokenPart) return entry;

  // Tokens are order-insensitive on parse.
  for (const token of tokenPart.split(".")) {
    if (token === "pc") {
      entry.transform.perCapita = true;
      continue;
    }
    if (token === "ax:r") {
      entry.axis = "right";
      continue;
    }
    const growth = TOKEN_GROWTH[token];
    if (growth) {
      entry.transform.growth = growth;
      continue;
    }
    if (token.startsWith("of")) {
      const target = token.slice(2);
      if (SLUG.test(target)) entry.transform.percentOfSlug = target;
      continue;
    }
    if (token.startsWith("r")) {
      const year = token.slice(1);
      // An `r` token without four digits is dropped.
      if (/^\d{4}$/.test(year)) {
        entry.transform.real = true;
        entry.transform.baseYear = Number(year);
      }
      continue;
    }
    if (token.startsWith("d")) {
      const target = token.slice(1);
      if (SLUG.test(target)) entry.transform.deflatorSlug = target;
      continue;
    }
    if (token.startsWith("p")) {
      const target = token.slice(1);
      if (SLUG.test(target)) entry.transform.populationSlug = target;
      continue;
    }
    // Unknown tokens are ignored.
  }

  return entry;
}

export function decodeState(params: URLSearchParams): DashboardState {
  const state = emptyState();

  for (const raw of params.getAll("s")) {
    if (state.series.length >= MAX_SERIES) break; // keep the first 6
    const entry = decodeSeries(raw);
    if (entry) state.series.push(entry);
  }

  const start = params.get("start");
  if (start && ISO_DATE.test(start)) state.start = start;

  const end = params.get("end");
  if (end && ISO_DATE.test(end)) state.end = end;

  state.showRecessions = params.get("rec") !== "0";
  state.logScale = params.get("log") === "1";

  const title = params.get("t");
  state.title = title && title.trim().length > 0 ? title : null;

  return state;
}

export function stateToQuery(state: DashboardState): string {
  const params = encodeState(state);
  const query = params.toString();
  return query.length > 0 ? `?${query}` : "";
}

/**
 * The wire form of `DashboardState`, for the save and publish routes. It is the
 * same object the URL encodes, so a saved dashboard and a shared link cannot
 * drift apart.
 */
export const transformSpecSchema = z.object({
  real: z.boolean(),
  baseYear: z.number().int().nullable(),
  deflatorSlug: z.string().nullable(),
  perCapita: z.boolean(),
  populationSlug: z.string().nullable(),
  percentOfSlug: z.string().nullable(),
  growth: z.enum(["NONE", "YOY", "POP", "POP_ANNUALIZED"]),
});

export const dashboardStateSchema = z.object({
  series: z
    .array(
      z.object({
        slug: z.string().min(1),
        transform: transformSpecSchema,
        axis: z.enum(["left", "right"]),
      }),
    )
    .max(MAX_SERIES),
  start: z.string().nullable(),
  end: z.string().nullable(),
  showRecessions: z.boolean(),
  logScale: z.boolean(),
  title: z.string().nullable(),
});

/**
 * A stored dashboard holds the same object the URL encodes (Section 12.1). A
 * row written by an older build, or edited by hand, is read as an empty state
 * rather than crashing the page that renders it.
 */
export function parseState(raw: unknown): DashboardState {
  const parsed = dashboardStateSchema.safeParse(raw);
  return parsed.success ? parsed.data : emptyState();
}
