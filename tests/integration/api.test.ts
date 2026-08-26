import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { HTTP_BASE_URL } from "./globalSetup";

/**
 * Section 22.2, integration tests 1, 2, 3, and 5. These go over real HTTP
 * against a real server and a real Postgres, because the things being asserted
 * (cookies, status codes, what leaves the server in a payload) do not exist
 * when a route handler is called as a plain function.
 */

interface Client {
  cookie: string | null;
  fetch(path: string, init?: RequestInit): Promise<Response>;
}

function client(): Client {
  const c: Client = {
    cookie: null,
    async fetch(path, init = {}) {
      const headers = new Headers(init.headers);
      if (c.cookie) headers.set("cookie", c.cookie);
      const res = await fetch(`${HTTP_BASE_URL}${path}`, { ...init, headers, redirect: "manual" });
      const setCookie = res.headers.get("set-cookie");
      if (setCookie) c.cookie = setCookie.split(";")[0] ?? c.cookie;
      return res;
    },
  };
  return c;
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

function uniqueEmail(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}@drdash.test`;
}

/**
 * Section 11.4: a production build refuses an instructor account without an
 * organization's code, and `next start` is a production build, so the sign-up
 * goes through the seeded demo organization rather than around the rule.
 */
const INSTRUCTOR_CODE = "TEACH1";

async function signUp(
  c: Client,
  role: "STUDENT" | "INSTRUCTOR" = "STUDENT",
): Promise<{ email: string; password: string }> {
  const email = uniqueEmail(role.toLowerCase());
  const password = "IntegrationPass!2026";
  const res = await c.fetch("/api/v1/auth/sign-up", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email,
      name: "Test Person",
      password,
      role,
      ...(role === "INSTRUCTOR" ? { instructorCode: INSTRUCTOR_CODE } : {}),
    }),
  });
  expect(res.status).toBe(201);
  return { email, password };
}

// ---------------------------------------------------------------------------
// Integration test 2: authentication
// ---------------------------------------------------------------------------

describe("authentication", () => {
  it("signs up, sets a session cookie, reads it back, and signs out", async () => {
    const c = client();
    const { email, password } = await signUp(c);

    expect(c.cookie).toMatch(/^dd_session=/);

    const session = await json(await c.fetch("/api/v1/auth/session"));
    expect((session.data as { user: { email: string } }).user.email).toBe(email);

    const signOut = await c.fetch("/sign-out", { method: "POST" });
    expect(signOut.status).toBe(303);

    const afterOut = await json(await c.fetch("/api/v1/auth/session"));
    expect((afterOut.data as { user: unknown }).user).toBeNull();

    const back = await c.fetch("/api/v1/auth/sign-in", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    expect(back.status).toBe(200);
  });

  it("gives the same answer for a wrong email and a wrong password", async () => {
    const c = client();
    const { email } = await signUp(c);

    const wrongPassword = await c.fetch("/api/v1/auth/sign-in", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: "not-the-password" }),
    });
    const wrongEmail = await c.fetch("/api/v1/auth/sign-in", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: uniqueEmail("nobody"), password: "not-the-password" }),
    });

    expect(wrongPassword.status).toBe(401);
    expect(wrongEmail.status).toBe(401);
    expect((await json(wrongPassword)).error).toEqual((await json(wrongEmail)).error);
  });

  it("refuses a password shorter than ten characters", async () => {
    const c = client();
    const res = await c.fetch("/api/v1/auth/sign-up", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: uniqueEmail("short"), name: "Short", password: "abc123" }),
    });
    expect(res.status).toBe(422);
    expect(((await json(res)).error as { code: string }).code).toBe("WEAK_PASSWORD");
  });
});

// ---------------------------------------------------------------------------
// Integration test 1: the plot endpoint
// ---------------------------------------------------------------------------

describe("POST /api/v1/plot", () => {
  const SIX = [
    { slug: "GDPC1", growth: "YOY" },
    { slug: "UNRATE", growth: "NONE" },
    { slug: "CPIAUCSL", growth: "YOY" },
    { slug: "PAYEMS", growth: "YOY" },
    { slug: "FEDFUNDS", growth: "NONE" },
    { slug: "CIVPART", growth: "NONE" },
  ];

  const body = (entries: typeof SIX, extra: Record<string, unknown> = {}) => ({
    series: entries.map((e, i) => ({
      slug: e.slug,
      transform: {
        real: false,
        baseYear: null,
        deflatorSlug: null,
        perCapita: false,
        populationSlug: null,
        percentOfSlug: null,
        growth: e.growth,
      },
      axis: i === 1 ? "right" : "left",
    })),
    start: null,
    end: null,
    includeRecessions: true,
    ...extra,
  });

  it("returns six results, a domain, recession intervals, and axis metadata", async () => {
    const c = client();
    const res = await c.fetch("/api/v1/plot", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body(SIX)),
    });
    expect(res.status).toBe(200);

    const payload = await json(res);
    const data = payload.data as {
      series: Array<{ slug: string; points: unknown[]; colorIndex: number }>;
      recessions: Array<{ start: string; end: string }>;
      domain: { start: string; end: string };
      axes: { left: unknown; right: unknown };
    };

    expect(data.series).toHaveLength(6);
    expect(data.series.map((s) => s.colorIndex)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(data.recessions.length).toBeGreaterThan(0);
    expect(data.domain.start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(data.axes.left).not.toBeNull();
    expect(data.axes.right).not.toBeNull();

    // Section 21.2's budget for six series over the full history.
    const durationMs = (payload.meta as { durationMs?: number }).durationMs ?? 0;
    expect(durationMs).toBeLessThan(400);
  });

  it("refuses a seventh series", async () => {
    const c = client();
    const res = await c.fetch("/api/v1/plot", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body([...SIX, { slug: "EMRATIO", growth: "NONE" }])),
    });

    expect(res.status).toBe(422);
    expect(((await json(res)).error as { code: string }).code).toBe("TOO_MANY_SERIES");
  });

  it("refuses a denominator that is a rate", async () => {
    const c = client();
    const res = await c.fetch("/api/v1/plot", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        series: [
          {
            slug: "GDP",
            transform: {
              real: false,
              baseYear: null,
              deflatorSlug: null,
              perCapita: false,
              populationSlug: null,
              percentOfSlug: "UNRATE",
              growth: "NONE",
            },
            axis: "left",
          },
        ],
        start: null,
        end: null,
        includeRecessions: false,
      }),
    });

    expect(res.status).toBe(422);
    expect(((await json(res)).error as { code: string }).code).toBe("DENOMINATOR_NOT_COMPARABLE");
  });
});

// ---------------------------------------------------------------------------
// Integration test 3: permissions and answer keys
// ---------------------------------------------------------------------------

describe("permissions", () => {
  it("stops a student creating a course", async () => {
    const c = client();
    await signUp(c, "STUDENT");

    const res = await c.fetch("/api/v1/courses", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Not mine", term: "Fall 2026" }),
    });

    expect(res.status).toBe(403);
    expect(((await json(res)).error as { code: string }).code).toBe("INSTRUCTOR_REQUIRED");
  });

  it("returns 404, not 403, for another user's dashboard", async () => {
    const owner = client();
    await signUp(owner, "STUDENT");
    const created = await json(
      await owner.fetch("/api/v1/dashboards", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "Private",
          state: {
            series: [],
            start: null,
            end: null,
            showRecessions: true,
            logScale: false,
            title: null,
          },
        }),
      }),
    );
    const id = (created.data as { id: string }).id;

    const stranger = client();
    await signUp(stranger, "STUDENT");
    const res = await stranger.fetch(`/api/v1/dashboards/${id}`);

    // A private dashboard requested by a non-owner must not confirm it exists.
    expect(res.status).toBe(404);
  });

  it("never sends a lesson's answer key to the browser", async () => {
    const c = client();
    const res = await c.fetch("/api/v1/lessons/levels-vs-growth");
    expect(res.status).toBe(200);

    const text = await res.text();
    expect(text).not.toMatch(/"answer"/);
    expect(text).not.toMatch(/"tolerance"/);
    expect(text).not.toMatch(/"rubric"/);
    expect(text).not.toMatch(/"explanation"/);
    expect(text).not.toMatch(/"mustInclude"/);
  });
});

// ---------------------------------------------------------------------------
// Integration test 5: CSV import, commit, and plot
// ---------------------------------------------------------------------------

describe("CSV import", () => {
  it("parses, commits, and plots a user series with a per capita transform", async () => {
    const c = client();
    await signUp(c, "STUDENT");

    const rows = ["date,widgets"];
    for (let year = 2000; year <= 2020; year += 1) {
      for (const month of ["01", "04", "07", "10"]) {
        rows.push(`${year}-${month}-01,${1000 + (year - 2000) * 40}`);
      }
    }

    const form = new FormData();
    form.set("file", new File([rows.join("\n")], "widgets.csv", { type: "text/csv" }));

    const parsed = await json(await c.fetch("/api/v1/imports", { method: "POST", body: form }));
    const job = parsed.data as {
      id: string;
      rowCount: number;
      inferred: { frequency: string };
      issues: unknown[];
    };

    expect(job.issues).toEqual([]);
    expect(job.rowCount).toBe(84);
    expect(job.inferred.frequency).toBe("QUARTERLY");

    const categories = await json(await c.fetch("/api/v1/categories?tree=1"));
    const categoryId = (categories.data as Array<{ id: string }>)[0]?.id ?? "";

    const committed = await c.fetch(`/api/v1/imports/${job.id}/commit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        shortLabel: "Widgets",
        title: "Widgets produced",
        units: "Thousands of Units",
        unitsShort: "Thous. units",
        unitMultiplier: 1000,
        frequency: "QUARTERLY",
        kind: "LEVEL_COUNT",
        isNominal: false,
        deflatorSlug: null,
        populationSlug: "B230RC0Q173SBEA",
        aggregation: "AVG",
        categoryId,
      }),
    });
    expect(committed.status).toBe(201);

    const series = (await json(committed)).data as { series: { slug: string } };
    expect(series.series.slug).toMatch(/^usr_[a-z0-9]{10}$/);

    const plotted = await c.fetch("/api/v1/plot", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        series: [
          {
            slug: series.series.slug,
            transform: {
              real: false,
              baseYear: null,
              deflatorSlug: null,
              perCapita: true,
              populationSlug: "B230RC0Q173SBEA",
              percentOfSlug: null,
              growth: "NONE",
            },
            axis: "left",
          },
        ],
        start: null,
        end: null,
        includeRecessions: false,
      }),
    });
    expect(plotted.status).toBe(200);

    const result = (await json(plotted)).data as {
      series: Array<{ units: string; points: Array<{ value: number | null }> }>;
    };
    expect(result.series[0]?.units).toBe("Units per person");
    expect(result.series[0]?.points.some((p) => p.value !== null)).toBe(true);
  });

  it("commits a second time with a conflict", async () => {
    const c = client();
    await signUp(c, "STUDENT");

    const form = new FormData();
    form.set(
      "file",
      new File(
        [["date,value", "2020-01-01,1", "2020-02-01,2", "2020-03-01,3", "2020-04-01,4"].join("\n")],
        "small.csv",
        { type: "text/csv" },
      ),
    );
    const parsed = await json(await c.fetch("/api/v1/imports", { method: "POST", body: form }));
    const jobId = (parsed.data as { id: string }).id;

    const categories = await json(await c.fetch("/api/v1/categories?tree=1"));
    const categoryId = (categories.data as Array<{ id: string }>)[0]?.id ?? "";

    const payload = {
      shortLabel: "Small",
      title: "A small series",
      units: "Percent",
      unitsShort: "Percent",
      unitMultiplier: 1,
      frequency: "MONTHLY",
      kind: "RATE_PERCENT",
      isNominal: false,
      deflatorSlug: null,
      populationSlug: null,
      aggregation: "AVG",
      categoryId,
    };

    const first = await c.fetch(`/api/v1/imports/${jobId}/commit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    expect(first.status).toBe(201);

    const second = await c.fetch(`/api/v1/imports/${jobId}/commit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    expect(second.status).toBe(409);
  });
});

/**
 * Section 9.5. Anyone signed in can ask for a public FRED series; only an
 * administrator decides. The approval itself reads live metadata from FRED, so
 * the leg this environment can exercise is everything up to the decision, plus
 * the rejection path, which touches no network.
 */
describe("series requests", () => {
  it("takes a request, refuses a duplicate, and lets only an admin decide it", async () => {
    const student = client();
    await signUp(student);

    const fredId = `TESTREQ${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const created = await student.fetch("/api/v1/series-requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fredId, note: "For a lecture on inventories." }),
    });
    expect(created.status).toBe(201);
    const requestId = ((await json(created)).data as { id: string }).id;

    // The same person asking twice is a duplicate, not a second queue entry.
    const again = await student.fetch("/api/v1/series-requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fredId }),
    });
    expect(again.status).toBe(409);
    expect(((await json(again)).error as { code: string }).code).toBe("DUPLICATE_REQUEST");

    // Asking for something already catalogued says so rather than queueing it.
    const known = await student.fetch("/api/v1/series-requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fredId: "UNRATE" }),
    });
    expect(known.status).toBe(409);
    expect(((await json(known)).error as { code: string }).code).toBe("ALREADY_IN_CATALOG");

    // The requester sees their own; the whole queue is the admin's.
    const mine = await student.fetch("/api/v1/series-requests");
    expect(mine.status).toBe(200);
    expect(((await json(mine)).data as unknown[]).length).toBeGreaterThan(0);
    expect((await student.fetch("/api/v1/series-requests?all=1")).status).toBe(403);

    // Deciding is an admin action, and a rejection has to say why.
    const decide = await student.fetch(`/api/v1/series-requests/${requestId}/approve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ categoryId: "any", reject: true, rejectionReason: "Not teaching it." }),
    });
    expect(decide.status).toBe(403);
  });
});

/**
 * Section 19.8 and Section 10.7. An assignment caps how many attempts a student
 * gets, and an attempt remembers where the student stopped.
 */
describe("assignments", () => {
  it("caps attempts and remembers where a student left off", async () => {
    const instructor = client();
    await signUp(instructor, "INSTRUCTOR");

    const courseRes = await instructor.fetch("/api/v1/courses", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: `Macro ${Math.random()}`, term: "Fall 2026" }),
    });
    expect(courseRes.status).toBe(201);
    const course = (await json(courseRes)).data as { id: string; joinCode: string };

    const lessons = (await json(await instructor.fetch("/api/v1/lessons"))).data as Array<{
      id: string;
      slug: string;
    }>;
    const lesson = lessons.find((l) => l.slug === "levels-vs-growth");
    expect(lesson).toBeDefined();

    const assignRes = await instructor.fetch(`/api/v1/courses/${course.id}/assignments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ lessonId: (lesson as { id: string }).id, maxAttempts: 1 }),
    });
    expect(assignRes.status).toBe(201);
    const assignmentId = ((await json(assignRes)).data as { id: string }).id;

    const student = client();
    await signUp(student);
    const joined = await student.fetch("/api/v1/courses/join", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ joinCode: course.joinCode }),
    });
    expect(joined.status).toBe(201);

    const start = async (): Promise<Response> =>
      student.fetch("/api/v1/lessons/levels-vs-growth/attempts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ assignmentId }),
      });

    const first = await start();
    expect(first.status).toBe(201);
    const attemptId = ((await json(first)).data as { id: string }).id;

    // Section 19.8: a refreshed tab resumes rather than opening a second attempt.
    const patched = await student.fetch(`/api/v1/attempts/${attemptId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ currentStep: 4 }),
    });
    expect(patched.status).toBe(200);
    expect(((await json(patched)).data as { currentStep: number }).currentStep).toBe(4);

    const resumed = await start();
    expect(resumed.status).toBe(200);
    const resumedAttempt = (await json(resumed)).data as { id: string; currentStep: number };
    expect(resumedAttempt.id).toBe(attemptId);
    expect(resumedAttempt.currentStep).toBe(4);

    // Submitting frees the in-progress slot, and then the cap is what is left.
    const submitted = await student.fetch(`/api/v1/attempts/${attemptId}/submit`, {
      method: "POST",
    });
    expect(submitted.status).toBe(200);

    const second = await start();
    expect(second.status).toBe(409);
    expect(((await json(second)).error as { code: string }).code).toBe("MAX_ATTEMPTS_REACHED");

    // Another student's attempt is not this one's to steer.
    const stranger = client();
    await signUp(stranger);
    const poke = await stranger.fetch(`/api/v1/attempts/${attemptId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ currentStep: 1 }),
    });
    expect(poke.status).toBe(404);
  });
});

/**
 * Section 21.2's first-load budget. The build that `globalSetup` produced is on
 * disk, so the number is measured from the shipped chunks rather than read off
 * the build log: 250 KB gzipped for everything `/dashboard` pulls before it is
 * interactive.
 */
describe("first-load JavaScript", () => {
  const BUDGET_KB = 250;

  it.each(["/dashboard/page", "/p/[token]/page", "/embed/[token]/page"])(
    "keeps %s under the budget",
    (route) => {
      const manifest = JSON.parse(
        readFileSync(".next/app-build-manifest.json", "utf8"),
      ) as { pages: Record<string, string[]> };

      const files = manifest.pages[route];
      expect(files, `${route} is not in the build manifest`).toBeDefined();

      const gzippedKb =
        (files as string[]).reduce(
          (total, file) => total + gzipSync(readFileSync(`.next/${file}`)).length,
          0,
        ) / 1024;

      expect(gzippedKb, `${route} ships ${gzippedKb.toFixed(1)} KB gzipped`).toBeLessThan(
        BUDGET_KB,
      );
    },
  );
});
