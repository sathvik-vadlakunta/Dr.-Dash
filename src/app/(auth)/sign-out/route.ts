import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth/session";
import { config } from "@/lib/config";

export const runtime = "nodejs";

/**
 * Section 10.3. A `303` so the browser follows with a GET, and the cookie is
 * cleared on the way out.
 */
export async function POST(): Promise<Response> {
  await destroySession();
  return NextResponse.redirect(new URL("/", config.NEXT_PUBLIC_APP_URL), 303);
}

/** Signing out from a plain link has to work too, for the no-JS path. */
export async function GET(): Promise<Response> {
  return POST();
}
