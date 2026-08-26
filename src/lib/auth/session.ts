import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { cache } from "react";
import type { UserRole } from "@prisma/client";
import { config } from "@/lib/config";
import { prisma } from "@/lib/db";

/**
 * Section 11.2. The cookie carries an opaque random token; the database stores
 * only its SHA-256. A leaked database dump therefore does not hand anyone a
 * usable session.
 */

export const SESSION_COOKIE = "dd_session";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  orgId: string | null;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface CreateSessionInput {
  userId: string;
  userAgent?: string | null;
  ip?: string | null;
}

/** Mints a session and sets the cookie. Returns the plaintext token for tests. */
export async function createSession(input: CreateSessionInput): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + THIRTY_DAYS_MS);

  await prisma.session.create({
    data: {
      tokenHash: hashToken(token),
      userId: input.userId,
      expiresAt,
      userAgent: input.userAgent ?? null,
      ip: input.ip ?? null,
    },
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: THIRTY_DAYS_MS / 1000,
  });

  return token;
}

/**
 * Read the current session. Wrapped in React `cache()` so a server-rendered
 * page that checks the user in three components still makes one query.
 */
export const getSession = cache(async (): Promise<{ user: SessionUser } | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      expiresAt: true,
      createdAt: true,
      user: { select: { id: true, email: true, name: true, role: true, orgId: true } },
    },
  });

  if (!session || session.expiresAt.getTime() <= Date.now()) return null;

  // Sliding expiry: extend a session that is within a week of lapsing, at most
  // once an hour so an active tab does not write on every request.
  const remaining = session.expiresAt.getTime() - Date.now();
  const sinceRefresh = Date.now() - (THIRTY_DAYS_MS - remaining);
  if (remaining < SEVEN_DAYS_MS && sinceRefresh > ONE_HOUR_MS) {
    await prisma.session.update({
      where: { id: session.id },
      data: { expiresAt: new Date(Date.now() + THIRTY_DAYS_MS) },
    });
  }

  return { user: session.user };
});

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
  store.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

/** The public shape of a user, everywhere one is returned. */
export function toPublicUser(user: SessionUser) {
  return { id: user.id, email: user.email, name: user.name, role: user.role, orgId: user.orgId };
}
