import { z } from "zod";
import { normalizeEmail, hashPassword, validatePassword } from "@/lib/auth/password";
import { createSession, toPublicUser } from "@/lib/auth/session";
import { config } from "@/lib/config";
import { prisma } from "@/lib/db";
import { HttpError, ok, readJson, withRoute } from "@/lib/http/respond";
import { clientIp } from "@/lib/http/ratelimit";

export const runtime = "nodejs";

const bodySchema = z.object({
  email: z.string().email("Enter an email address."),
  name: z.string().trim().min(1, "Enter your name.").max(120),
  password: z.string().min(1, "Enter a password."),
  role: z.enum(["STUDENT", "INSTRUCTOR"]).optional(),
  /**
   * Section 11.4. In production an instructor account needs a code issued by an
   * organization; a student cannot promote themselves by editing a request.
   */
  instructorCode: z.string().trim().min(1).optional(),
});

export const POST = withRoute("auth.signUp", async (request, { log }) => {
  const body = bodySchema.parse(await readJson(request));
  const emailNormalized = normalizeEmail(body.email);

  const problems = validatePassword(body.password, emailNormalized);
  if (problems.length > 0) {
    throw HttpError.unprocessable(
      "WEAK_PASSWORD",
      problems.map((p) => p.message).join(" "),
      problems,
    );
  }

  let role: "STUDENT" | "INSTRUCTOR" = "STUDENT";
  let orgId: string | null = null;

  if (body.role === "INSTRUCTOR") {
    if (body.instructorCode) {
      const org = await prisma.organization.findFirst({
        where: { instructorCode: body.instructorCode },
        select: { id: true },
      });
      if (!org) {
        throw HttpError.unprocessable(
          "INVALID_INSTRUCTOR_CODE",
          "That instructor code does not match an organization.",
        );
      }
      role = "INSTRUCTOR";
      orgId = org.id;
    } else if (!config.isProduction) {
      // Development only, so the demo flow does not need an organization.
      role = "INSTRUCTOR";
    } else {
      throw HttpError.unprocessable(
        "INSTRUCTOR_CODE_REQUIRED",
        "An instructor account needs a code from your organization.",
      );
    }
  }

  const existing = await prisma.user.findUnique({
    where: { emailNormalized },
    select: { id: true },
  });
  if (existing) {
    throw HttpError.conflict("EMAIL_TAKEN", "An account with that email already exists.");
  }

  const user = await prisma.user.create({
    data: {
      email: body.email.trim(),
      emailNormalized,
      name: body.name.trim(),
      passwordHash: await hashPassword(body.password),
      role,
      orgId,
    },
    select: { id: true, email: true, name: true, role: true, orgId: true },
  });

  await createSession({
    userId: user.id,
    userAgent: request.headers.get("user-agent"),
    ip: clientIp(request),
  });

  log.info("auth.signed_up", { userId: user.id, role: user.role });
  return ok({ user: toPublicUser(user) }, {}, 201);
});
