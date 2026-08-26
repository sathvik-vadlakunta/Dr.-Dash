import bcrypt from "bcryptjs";

/**
 * Section 11.1. bcrypt at cost 12.
 */
const COST = 12;

/**
 * A real hash of a value nobody knows, used to keep the failure path's timing
 * indistinguishable from the success path's when no user matches the email.
 * Generated once per process rather than per request.
 */
const DUMMY_HASH = bcrypt.hashSync("dr-dash-timing-equalizer", COST);

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * Burn the same work as a real verification so response timing does not reveal
 * whether an account exists (Section 11.1).
 */
export async function burnPasswordTiming(plain: string): Promise<void> {
  await bcrypt.compare(plain, DUMMY_HASH);
}

export interface PasswordProblem {
  message: string;
}

/**
 * Section 10.3: minimum 10 characters, and it must not equal the email's local
 * part. Returns every problem so the form can show them all at once.
 */
export function validatePassword(plain: string, email: string): PasswordProblem[] {
  const problems: PasswordProblem[] = [];
  if (plain.length < 10) {
    problems.push({ message: "Use at least 10 characters." });
  }
  const localPart = email.split("@")[0]?.trim().toLowerCase() ?? "";
  if (localPart !== "" && plain.trim().toLowerCase() === localPart) {
    problems.push({ message: "Your password cannot be the first part of your email address." });
  }
  return problems;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
