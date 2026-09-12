import { NextResponse } from "next/server";
import { z } from "zod";
import { db, isTransientDatabaseError, withDatabaseRetry } from "@/lib/db";
import { isExpectedNominationBlob } from "@/lib/blob-storage";
import {
  RECOMMENDATION_MAX,
  RECOMMENDATION_MIN,
  guarantorByToken,
} from "@/lib/guarantors";

const draftSchema = z.object({
  institution: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(30).optional(),
  recommendation: z.string().trim().max(RECOMMENDATION_MAX).optional(),
  signatureData: z.string().max(6_000_000).nullable().optional(),
  signatureName: z.string().max(180).nullable().optional(),
});

const finalSchema = draftSchema.extend({
  institution: z.string().trim().min(2).max(200),
  phone: z.string().trim().min(7).max(30),
  recommendation: z.string().trim().min(RECOMMENDATION_MIN).max(RECOMMENDATION_MAX),
  signatureData: z.string().min(20).max(2_500_000),
  signatureName: z.string().min(1).max(180),
});

const unavailable = () =>
  NextResponse.json(
    { code: "DATABASE_UNAVAILABLE", message: "The nomination database is temporarily unavailable. Please try again in a moment." },
    { status: 503, headers: { "Retry-After": "3" } },
  );

/** Loads the guarantor's own section, with the candidate details prefilled for context. */
export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const guarantor = await guarantorByToken(token);
    if (!guarantor)
      return NextResponse.json({ code: "INVALID", message: "This guarantor link is not valid." }, { status: 410 });
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
        signatureData: guarantor.signatureData,
        signatureName: guarantor.signatureName,
      },
    });
  } catch (error) {
    if (isTransientDatabaseError(error)) return unavailable();
    throw error;
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
      return NextResponse.json({ message: "Some fields are invalid or the file is too large." }, { status: 400 });
    if (parsed.data.signatureData && !isExpectedNominationBlob(parsed.data.signatureData, guarantor.id, "signature"))
      return NextResponse.json({ message: "The uploaded signature reference is invalid." }, { status: 400 });

    await withDatabaseRetry(() => db.guarantor.update({ where: { id: guarantor.id }, data: parsed.data }));
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (isTransientDatabaseError(error)) return unavailable();
    throw error;
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
    if (!isExpectedNominationBlob(parsed.data.signatureData, guarantor.id, "signature"))
      return NextResponse.json({ message: "The uploaded signature reference is invalid." }, { status: 400 });

    await withDatabaseRetry(() => db.guarantor.update({
      where: { id: guarantor.id },
      data: { ...parsed.data, submittedAt: new Date() },
    }));
    return NextResponse.json({ ok: true, candidateName: guarantor.nomination.candidateName }, { status: 201 });
  } catch (error) {
    if (isTransientDatabaseError(error)) return unavailable();
    throw error;
  }
}
