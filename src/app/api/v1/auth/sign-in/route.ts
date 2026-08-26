import { z } from "zod";
import { burnPasswordTiming, normalizeEmail, verifyPassword } from "@/lib/auth/password";
import { createSession, toPublicUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { HttpError, ok, readJson, withRoute } from "@/lib/http/respond";
import {
  SIGN_IN_LIMIT,
  SIGN_IN_WINDOW_MS,
  clientIp,
  pruneRateLimits,
  rateLimit,
} from "@/lib/http/ratelimit";

export const runtime = "nodejs";

const bodySchema = z.object({
  email: z.string().min(1, "Enter your email address."),
  password: z.string().min(1, "Enter your password."),
});

/**
 * Section 10.3. Both a wrong email and a wrong password return the same
 * `401 INVALID_CREDENTIALS`, and the timing is equalized, so the endpoint never
 * reveals whether an account exists.
 */
const SAME_MESSAGE = "That email and password do not match an account.";

export const POST = withRoute("auth.signIn", async (request, { log }) => {
  const body = bodySchema.parse(await readJson(request));
  const emailNormalized = normalizeEmail(body.email);
  const ip = clientIp(request);

  pruneRateLimits();
  for (const key of [`signin:ip:${ip}`, `signin:email:${emailNormalized}`]) {
    const limited = rateLimit({ key, limit: SIGN_IN_LIMIT, windowMs: SIGN_IN_WINDOW_MS });
    if (!limited.allowed) {
      log.warn("auth.rate_limited", { key });
      throw HttpError.tooManyRequests(
        "Too many sign-in attempts. Try again shortly.",
        limited.retryAfterSeconds,
      );
    }
  }

  const user = await prisma.user.findUnique({
    where: { emailNormalized },
    select: { id: true, email: true, name: true, role: true, orgId: true, passwordHash: true },
  });

  if (!user) {
    // Burn the same work a real comparison would, so the timing matches.
    await burnPasswordTiming(body.password);
    throw new HttpError(401, "INVALID_CREDENTIALS", SAME_MESSAGE);
  }

  const okPassword = await verifyPassword(body.password, user.passwordHash);
  if (!okPassword) {
    throw new HttpError(401, "INVALID_CREDENTIALS", SAME_MESSAGE);
  }

  await createSession({
    userId: user.id,
    userAgent: request.headers.get("user-agent"),
    ip,
  });

  log.info("auth.signed_in", { userId: user.id });
  return ok({ user: toPublicUser(user) });
});
