import { getSession, toPublicUser } from "@/lib/auth/session";
import { ok, withRoute } from "@/lib/http/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Section 10.3. Always `200`: "nobody is signed in" is an answer, not an error.
 */
export const GET = withRoute("auth.session", async () => {
  const session = await getSession();
  return ok({ user: session ? toPublicUser(session.user) : null }, {}, 200, {
    "cache-control": "no-store",
  });
});
