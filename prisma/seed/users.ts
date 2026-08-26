import { hashPassword } from "../../src/lib/auth/password";

/**
 * Section 23.3. Demo accounts exist only when `NODE_ENV !== "production"` and
 * `SEED_DEMO_DATA === "true"`. The seed entry point enforces both and logs why
 * when it refuses.
 */

export const DEMO_PASSWORD = "DrDashDemo!2026";

export interface SeedUser {
  email: string;
  name: string;
  role: "STUDENT" | "INSTRUCTOR" | "ADMIN";
}

export const DEMO_USERS: SeedUser[] = [
  { email: "instructor@drdash.test", name: "Dana Reyes", role: "INSTRUCTOR" },
  { email: "student1@drdash.test", name: "Alex Okafor", role: "STUDENT" },
  { email: "student2@drdash.test", name: "Priya Raman", role: "STUDENT" },
  { email: "student3@drdash.test", name: "Sam Whitaker", role: "STUDENT" },
  { email: "admin@drdash.test", name: "Robin Vance", role: "ADMIN" },
];

/**
 * Section 11.4. In production an instructor account needs a code issued by an
 * organization. The demo organization carries one so that path can be walked
 * without an administrator creating accounts by hand.
 */
export const DEMO_ORG = {
  name: "Dr. Dash Demo University",
  slug: "demo-university",
  instructorCode: "TEACH1",
};

/** The demo course an instructor lands in, so the gradebook is not empty on day one. */
export const DEMO_COURSE = {
  name: "Principles of Macroeconomics",
  term: "Fall 2026",
  joinCode: "MACRO7",
};

export async function demoPasswordHash(): Promise<string> {
  return hashPassword(DEMO_PASSWORD);
}

/**
 * Section 16.2. The landing page's `See a sample dashboard` links to a seeded
 * published token, so the token is fixed rather than random: reseeding must not
 * break a link an instructor has already put in a syllabus. Twenty-two
 * base64url characters, the same shape `POST /publish` mints.
 */
export const DEMO_DASHBOARD = {
  token: "DrDashSampleDashb0ard1",
  title: "Growth and unemployment",
  description:
    "Real GDP per capita growth against the unemployment rate. Turn the transforms on and off to see the same data answer different questions.",
  state: {
    series: [
      {
        slug: "GDPC1",
        axis: "left" as const,
        transform: {
          real: false,
          baseYear: null,
          deflatorSlug: null,
          perCapita: true,
          populationSlug: null,
          percentOfSlug: null,
          growth: "YOY" as const,
        },
      },
      {
        slug: "UNRATE",
        axis: "right" as const,
        transform: {
          real: false,
          baseYear: null,
          deflatorSlug: null,
          perCapita: false,
          populationSlug: null,
          percentOfSlug: null,
          growth: "NONE" as const,
        },
      },
    ],
    start: null,
    end: null,
    showRecessions: true,
    logScale: false,
    title: "Growth and unemployment",
  },
};
