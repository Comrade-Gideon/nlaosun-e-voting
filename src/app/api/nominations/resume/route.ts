import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db, isTransientDatabaseError, withDatabaseRetry } from "@/lib/db";
import {
  NOMINATION_COOKIE,
  getNominationElection,
  nominationWindowState,
} from "@/lib/nominations";
import { hashToken, issueToken } from "@/lib/security";

const resumeSchema = z.object({ email: z.string().trim().email().max(160) });

/**
 * Reopens a saved nomination from its email address alone, on any device.
 *
 * Deliberate trade-off, chosen by the chapter: no proof of inbox ownership is
 * required, so anyone who knows a candidate's email can open their in-progress
 * form and see the documents attached to it. Swapping this for a one-time
 * emailed link or a resume code is a change to this route only — the rest of the
 * flow already works off the session cookie this hands out.
 */
export async function POST(request: Request) {
  const parsed = resumeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ message: "Enter the email address you started with." }, { status: 400 });

  try {
    const election = await getNominationElection();
    if (!election)
      return NextResponse.json({ code: "NO_ELECTION", message: "There is no published election accepting nominations." }, { status: 409 });

    const state = nominationWindowState(election.nominationsOpenAt, election.nominationsCloseAt);
    if (state === "closed")
      return NextResponse.json({ code: "CLOSED", message: "Nominations are closed." }, { status: 409 });

    const email = parsed.data.email.toLowerCase();
    const existing = await withDatabaseRetry(() => db.nominationInvite.findUnique({
      where: { electionId_email: { electionId: election.id, email } },
    }));

    if (!existing)
      return NextResponse.json(
        { code: "NOT_FOUND", message: "No saved nomination was found for that email address. Start a new one below." },
        { status: 404 },
      );
    if (existing.status === "SUBMITTED")
      return NextResponse.json(
        { code: "SUBMITTED", message: "Your nomination has already been submitted and is awaiting review." },
        { status: 409 },
      );
    if (existing.status === "APPROVED")
      return NextResponse.json(
        { code: "APPROVED", message: "Your nomination has been approved and published." },
        { status: 409 },
      );
    if (existing.status === "REVOKED")
      return NextResponse.json(
        { code: "REVOKED", message: "This nomination was withdrawn by the Election Committee." },
        { status: 409 },
      );

    // Rebinding the session mints a fresh token, so the link this device holds
    // replaces any other device that was previously editing the same draft.
    const token = issueToken();
    await withDatabaseRetry(() => db.nominationInvite.update({
      where: { id: existing.id },
      data: { tokenHash: hashToken(token), expiresAt: election.nominationsCloseAt! },
    }));

    (await cookies()).set(NOMINATION_COOKIE, token, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      expires: election.nominationsCloseAt!,
      path: "/",
    });
    return NextResponse.json({ ok: true, candidateName: existing.candidateName });
  } catch (error) {
    if (isTransientDatabaseError(error))
      return NextResponse.json(
        { code: "DATABASE_UNAVAILABLE", message: "The nomination database is temporarily unavailable. Please try again in a moment." },
        { status: 503, headers: { "Retry-After": "3" } },
      );
    throw error;
  }
}
