import { config } from "@/lib/config";

/**
 * Single-line JSON logging to stdout (Section 23.9). Never log passwords,
 * session tokens, or the FRED API key: `redact()` is the enforcement point and
 * has a unit test proving it strips `api_key=` from any string.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/** Query-string / body keys whose values must never reach a log line. */
const REDACTED_KEYS = [
  "api_key",
  "apikey",
  "password",
  "passwordHash",
  "token",
  "tokenHash",
  "sessionToken",
  "dd_session",
  "session_secret",
  "cron_secret",
  "authorization",
  "instructorCode",
];

const REDACTED = "[redacted]";

const KEY_ALTERNATION = REDACTED_KEYS.join("|");

/** `api_key=abc123` / `api_key: "abc"` / `"token":"abc"` in any free-form string. */
const INLINE_SECRET = new RegExp(
  String.raw`\b(${KEY_ALTERNATION})\b(\s*[:=]\s*)("?)([^"&,\s}]*)("?)`,
  "gi",
);

export function redactString(input: string): string {
  return input.replace(INLINE_SECRET, (_m, key: string, sep: string, q1: string, _v, q2: string) => {
    const open = q1 || "";
    const close = q1 ? q1 : q2 || "";
    return `${key}${sep}${open}${REDACTED}${close}`;
  });
}

export function redact(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === "string") return redactString(value);
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message),
      stack: value.stack ? redactString(value.stack) : undefined,
    };
  }
  if (seen.has(value)) return "[circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((v) => redact(v, seen));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = REDACTED_KEYS.some((rk) => rk.toLowerCase() === k.toLowerCase())
      ? REDACTED
      : redact(v, seen);
  }
  return out;
}

export interface LogFields {
  requestId?: string;
  userId?: string;
  [key: string]: unknown;
}

function minLevel(): number {
  return config.isProduction ? LEVEL_RANK.info : LEVEL_RANK.debug;
}

function emit(level: LogLevel, msg: string, fields: LogFields = {}): void {
  if (LEVEL_RANK[level] < minLevel()) return;
  const payload = {
    level,
    msg: redactString(msg),
    time: new Date().toISOString(),
    ...(redact(fields) as Record<string, unknown>),
  };
  const line = JSON.stringify(payload);
  if (level === "error" || level === "warn") process.stderr.write(`${line}\n`);
  else process.stdout.write(`${line}\n`);
}

export const logger = {
  debug: (msg: string, fields?: LogFields) => emit("debug", msg, fields),
  info: (msg: string, fields?: LogFields) => emit("info", msg, fields),
  warn: (msg: string, fields?: LogFields) => emit("warn", msg, fields),
  error: (msg: string, fields?: LogFields) => emit("error", msg, fields),
  /** Returns a logger with `requestId` (and optionally `userId`) baked in. */
  child(base: LogFields) {
    return {
      debug: (msg: string, fields?: LogFields) => emit("debug", msg, { ...base, ...fields }),
      info: (msg: string, fields?: LogFields) => emit("info", msg, { ...base, ...fields }),
      warn: (msg: string, fields?: LogFields) => emit("warn", msg, { ...base, ...fields }),
      error: (msg: string, fields?: LogFields) => emit("error", msg, { ...base, ...fields }),
    };
  },
};

export type Logger = typeof logger;
