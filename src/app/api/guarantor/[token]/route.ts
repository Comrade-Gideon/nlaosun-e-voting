import { NextResponse } from "next/server";
import { z } from "zod";
import { db, isTransientDatabaseError, withDatabaseRetry } from "@/lib/db";
import {
  RECOMMENDATION_MAX,
  RECOMMENDATION_MIN,
  guarantorByToken,
} from "@/lib/guarantors";

const draftSchema = z.object({
  institution: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(30).optional(),
  recommendation: z.string().trim().max(RECOMMENDATION_MAX).optional(),
});

const finalSchema = draftSchema.extend({
  institution: z.string().trim().min(2).max(200),
  phone: z.string().trim().min(7).max(30),
  recommendation: z.string().trim().min(RECOMMENDATION_MIN).max(RECOMMENDATION_MAX),
});

const unavailable = () =>
  NextResponse.json(
    { code: "DATABASE_UNAVAILABLE", message: "The nomination database is temporarily unavailable. Please try again in a moment." },
    { status: 503, headers: { "Retry-After": "3" } },
  );

/** Loads the guarantor's own section, with the candidate details prefilled for context. */
// JSON rather than a rethrow, which Next.js turns into an empty 500 the portal
// can only report as "no response".
function failed(error: unknown) {
  console.error("[guarantor] request failed", error instanceof Error ? `${error.name}: ${error.message.slice(0, 200)}` : "unknown error");
  return NextResponse.json(
    { code: "SERVER_ERROR", message: "We could not complete that just now. Please try again in a moment." },
    { status: 500 },
  );
}

export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const guarantor = await guarantorByToken(token);
    if (!guarantor)
      return NextResponse.json({ code: "INVALID", message: "This guarantor link is no longer valid. A newer link may have been sent to you; please open the most recent invitation email, or ask the candidate or Election Committee to resend it." }, { status: 410 });
    if (guarantor.submittedAt)
      return NextResponse.json(
        { code: "SUBMITTED", message: "You have already completed this guarantor form. Thank you." },
        { status: 410 },
      );
    if (guarantor.nomination.expiresAt <= new Date())
      return NextResponse.json({ code: "EXPIRED", message: "Nominations have closed." }, { status: 410 });

    return NextResponse.json({
      uploadId: guarantor.id,
      name: guarantor.name,
      email: guarantor.email,
      candidateName: guarantor.nomination.candidateName,
      candidateEmail: guarantor.nomination.email,
      position: guarantor.nomination.position.title,
      closesAt: guarantor.nomination.expiresAt,
      recommendationRange: { min: RECOMMENDATION_MIN, max: RECOMMENDATION_MAX },
      draft: {
        institution: guarantor.institution,
        phone: guarantor.phone,
        recommendation: guarantor.recommendation,
      },
    });
  } catch (error) {
    if (isTransientDatabaseError(error)) return unavailable();
    return failed(error);
  }
}

/** Autosaves the guarantor's progress. */
export async function PUT(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const guarantor = await guarantorByToken(token);
    if (!guarantor || guarantor.submittedAt || guarantor.nomination.expiresAt <= new Date())
      return NextResponse.json({ message: "This guarantor link is no longer valid." }, { status: 410 });

    const parsed = draftSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success)
      return NextResponse.json({ message: "Some fields are invalid." }, { status: 400 });

    await withDatabaseRetry(() => db.guarantor.update({ where: { id: guarantor.id }, data: parsed.data }));
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (isTransientDatabaseError(error)) return unavailable();
    return failed(error);
  }
}

/** Final submission of the guarantor's section. */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const guarantor = await guarantorByToken(token);
    if (!guarantor || guarantor.submittedAt || guarantor.nomination.expiresAt <= new Date())
      return NextResponse.json({ message: "This guarantor link is no longer valid." }, { status: 410 });

    const parsed = finalSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success)
      return NextResponse.json(
        {
          message: `Complete every field. The letter of recommendation must contain ${RECOMMENDATION_MIN}–${RECOMMENDATION_MAX} characters.`,
          issues: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );

    await withDatabaseRetry(() => db.guarantor.update({
      where: { id: guarantor.id },
      data: { ...parsed.data, submittedAt: new Date() },
    }));
    return NextResponse.json({ ok: true, candidateName: guarantor.nomination.candidateName }, { status: 201 });
  } catch (error) {
    if (isTransientDatabaseError(error)) return unavailable();
    return failed(error);
  }
}
