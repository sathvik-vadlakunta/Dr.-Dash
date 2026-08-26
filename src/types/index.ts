import type { RecessionInterval } from "@/lib/dashboard/defaults";
import type { DashboardTarget } from "@/lib/lessons/schema";
import type { Point, TransformResult, ValueKind } from "@/lib/series/types";

/**
 * The shapes the client and the API agree on. Everything here mirrors a
 * response documented in Section 10, so a change to one is a change to both.
 */

export type { Point, RecessionInterval };

/** One entry of `POST /api/v1/plot`'s `series` array (Section 10.4). */
export interface PlottedResult extends TransformResult {
  slug: string;
  axis: "left" | "right";
  colorIndex: number;
}

export interface AxisMeta {
  unitsShort: string;
  valueKind: ValueKind;
}

export interface PlotResponse {
  series: PlottedResult[];
  recessions: RecessionInterval[];
  domain: { start: string | null; end: string | null };
  axes: { left: AxisMeta | null; right: AxisMeta | null };
  /** Slugs in the request that are not in the catalog (Section 12.4). */
  missing: string[];
}

/** One item of `GET /api/v1/series` (Section 10.4). */
export interface SeriesListItem {
  slug: string;
  shortLabel: string;
  title: string;
  units: string;
  unitsShort: string;
  frequency: "DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY" | "ANNUAL";
  kind: string;
  source: string;
  observationStart: string | null;
  observationEnd: string | null;
  capabilities: { real: boolean; perCapita: boolean; growth: boolean; denominator: boolean };
  inDatabase: boolean;
}

/** `GET /api/v1/series/:slug` adds everything the transform panel needs. */
export interface SeriesDetail extends SeriesListItem {
  id: string;
  description: string;
  sourceName: string;
  sourceUrl: string | null;
  notes: string | null;
  unitMultiplier: number;
  seasonalAdjustment: string;
  fredLastUpdated: string | null;
  lastSyncedAt: string | null;
  validBaseYears: number[];
  defaultDeflator: string | null;
  defaultPopulation: string | null;
  disabledReasons: Record<string, string>;
}

/** `GET /api/v1/categories?tree=1` (Section 9.1 step 4). */
export interface CategoryNodeDto {
  id: string;
  slug: string;
  name: string;
  isSystem: boolean;
  isOverride: boolean;
  sortOrder: number;
  seriesCount: number;
  children: CategoryNodeDto[];
}

export interface ApiEnvelope<T> {
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details: unknown[] };
}

/** Section 10.6. What `POST /api/v1/dashboards` hands back to the save dialog. */
export interface SavedDashboard {
  id: string;
  title: string;
}

/** Section 10.6. What `POST /api/v1/dashboards/:id/publish` hands back. */
export interface PublishResult {
  publicToken: string | null;
  url: string | null;
  embedUrl: string | null;
}

/** Section 17.1. The public read of a published dashboard, no session needed. */
export interface PublicDashboard {
  title: string;
  description: string | null;
  state: unknown;
  allowEmbed: boolean;
  owner: { name: string; orgName: string | null };
}

/** The six-colour Okabe-Ito palette of Section 20.1, addressed by colour index. */
export const SERIES_COLOR_VARS = [
  "var(--series-1)",
  "var(--series-2)",
  "var(--series-3)",
  "var(--series-4)",
  "var(--series-5)",
  "var(--series-6)",
] as const;

export function seriesColor(colorIndex: number): string {
  return SERIES_COLOR_VARS[colorIndex % SERIES_COLOR_VARS.length] ?? SERIES_COLOR_VARS[0];
}

// ---------------------------------------------------------------------------
// Lessons, as the browser sees them. Every answer key is stripped on the server
// by `toClientLesson`, so these types simply have nowhere to put one.
// ---------------------------------------------------------------------------

export type ClientStep =
  | { id: string; type: "READ"; body: string }
  | {
      id: string;
      type: "TASK";
      body: string;
      target: DashboardTarget;
      hint?: string;
      allowAutoSet: boolean;
    }
  | {
      id: string;
      type: "QUESTION_MC";
      prompt: string;
      options: Array<{ id: string; text: string }>;
      points: number;
      tries: number;
      hint?: string;
    }
  | {
      id: string;
      type: "QUESTION_NUMERIC";
      prompt: string;
      unit: string;
      points: number;
      tries: number;
      hint?: string;
    }
  | {
      id: string;
      type: "QUESTION_SHORT";
      prompt: string;
      minWords: number;
      points: number;
      tries: number;
    };

export interface ClientLesson {
  slug: string;
  title: string;
  summary: string;
  level: string;
  estimatedMinutes: number;
  version: number;
  maxScore: number;
  content: {
    objectives: string[];
    sources: string[];
    steps: ClientStep[];
  };
}

export interface LessonListItem {
  id: string;
  slug: string;
  title: string;
  summary: string;
  estimatedMinutes: number;
  level: string;
  maxScore: number;
  myBestScore: number | null;
  myAttemptCount: number;
}

export interface AttemptDto {
  id: string;
  lessonId: string;
  status: "IN_PROGRESS" | "SUBMITTED" | "EXPIRED";
  score: number;
  maxScore: number;
  currentStep: number;
}

export interface AnswerResponse {
  isCorrect: boolean;
  pointsEarned: number;
  pointsPossible: number;
  feedback: string;
  explanation: string | null;
  correctResponse?: string | number;
  triesRemaining: number;
}

export interface SubmitResponse {
  score: number;
  maxScore: number;
  perStep: Array<{
    stepId: string;
    prompt: string;
    response: unknown;
    isCorrect: boolean;
    pointsEarned: number;
    pointsPossible: number;
    triesUsed: number;
    explanation: string;
  }>;
}

export function isQuestionStep(step: ClientStep): boolean {
  return (
    step.type === "QUESTION_MC" ||
    step.type === "QUESTION_NUMERIC" ||
    step.type === "QUESTION_SHORT"
  );
}
