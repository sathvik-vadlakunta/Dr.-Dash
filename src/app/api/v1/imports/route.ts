import { requireUser } from "@/lib/auth/guards";
import { MAX_BYTES, parseImportCsv } from "@/lib/csv/parseImport";
import { prisma } from "@/lib/db";
import { HttpError, ok, withRoute } from "@/lib/http/respond";
import type { Prisma } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Section 10.5 step 1. Parse and stash; nothing reaches the catalog until the
 * user has seen the preview and the issues and confirmed at
 * `POST /api/v1/imports/:id/commit`.
 */
export const POST = withRoute("imports.create", async (request) => {
  const user = await requireUser();

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    throw HttpError.unprocessable("FILE_REQUIRED", "Attach a .csv file.");
  }
  if (file.size > MAX_BYTES) {
    throw HttpError.unprocessable(
      "FILE_TOO_LARGE",
      `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB; the limit is 2 MB.`,
    );
  }
  if (!/\.csv$/i.test(file.name)) {
    throw HttpError.unprocessable("NOT_CSV", "Only .csv files can be imported.");
  }

  const parsed = parseImportCsv(await file.text());
  const first = parsed.columns[0];

  const job = await prisma.importJob.create({
    data: {
      userId: user.id,
      filename: file.name,
      status: parsed.columns.length === 0 ? "FAILED" : "PARSED",
      rowCount: parsed.rowCount,
      issuesJson: parsed.issues as unknown as Prisma.InputJsonValue,
      previewJson: parsed.preview as unknown as Prisma.InputJsonValue,
      payloadJson: parsed.columns as unknown as Prisma.InputJsonValue,
    },
  });

  return ok(
    {
      id: job.id,
      filename: job.filename,
      rowCount: job.rowCount,
      columns: parsed.columns.map((c) => ({ header: c.header, looksLikeRate: c.looksLikeRate })),
      inferred: {
        frequency: parsed.frequency,
        kind: first?.looksLikeRate ? "RATE_PERCENT" : "LEVEL_CURRENCY",
        isNominal: !first?.looksLikeRate,
        unitsGuess: first?.looksLikeRate ? "Percent" : "Dollars",
      },
      preview: parsed.preview,
      issues: parsed.issues,
    },
    {},
    201,
  );
});
