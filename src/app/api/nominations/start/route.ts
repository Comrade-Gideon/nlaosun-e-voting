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

const startSchema = z
  .object({
    candidateName: z.string().trim().min(3).max(120),
    email: z.string().trim().email().max(160),
    positionId: z.string().min(1),
    lrcnCertified: z.boolean(),
    lrcnNumber: z.string().trim().max(60).optional(),
  })
  // Certification is optional, but a member who says they are certified must say
  // which registration number they hold.
  .refine((data) => !data.lrcnCertified || Boolean(data.lrcnNumber && data.lrcnNumber.length >= 3), {
    message: "Enter your LRCN registration number.",
    path: ["lrcnNumber"],
  });

const closedMessage = (state: string, opensAt: Date | null) =>
  state === "upcoming"
    ? `Nominations are not open yet. They open on ${opensAt?.toISOString() ?? "a date to be announced"}.`
    : "Nominations are closed. Contact the Election Committee if you believe this is an error.";

export async function POST(request: Request) {
  const parsed = startSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { message: "Enter your full name, email address and the position you are contesting. If you are LRCN certified, include your registration number." },
      { status: 400 },
    );

  try {
    const election = await getNominationElection();
    if (!election)
      return NextResponse.json({ code: "NO_ELECTION", message: "There is no published election accepting nominations." }, { status: 409 });

    const state = nominationWindowState(election.nominationsOpenAt, election.nominationsCloseAt);
    if (state !== "open")
      return NextResponse.json(
        { code: state === "upcoming" ? "NOT_OPEN" : "CLOSED", message: closedMessage(state, election.nominationsOpenAt) },
        { status: 409 },
      );

    const position = election.positions.find((item) => item.id === parsed.data.positionId);
    if (!position)
      return NextResponse.json({ message: "Choose one of the positions being contested." }, { status: 400 });

    const email = parsed.data.email.toLowerCase();
    const [candidate, existing] = await Promise.all([
      withDatabaseRetry(() => db.candidate.findFirst({ where: { email } })),
      withDatabaseRetry(() => db.nominationInvite.findUnique({
        where: { electionId_email: { electionId: election.id, email } },
      })),
    ]);
    if (candidate)
      return NextResponse.json(
        { code: "ALREADY_CANDIDATE", message: "A candidate is already published for this email address." },
        { status: 409 },
      );

    const store = await cookies();
    if (existing) {
      if (existing.status === "SUBMITTED")
        return NextResponse.json(
          { code: "SUBMITTED", message: "A nomination for this email address has already been submitted and is awaiting review." },
          { status: 409 },
        );
      if (existing.status === "APPROVED")
        return NextResponse.json(
          { code: "APPROVED", message: "This nomination has already been approved and published." },
          { status: 409 },
        );
      // Starting again with the same email reopens the saved draft on this
      // device, updating the details supplied on the way back in.
      const token = issueToken();
      await withDatabaseRetry(() => db.nominationInvite.update({
        where: { id: existing.id },
        data: {
          tokenHash: hashToken(token),
          candidateName: parsed.data.candidateName,
          positionId: position.id,
          lrcnCertified: parsed.data.lrcnCertified,
          lrcnNumber: parsed.data.lrcnCertified ? parsed.data.lrcnNumber : null,
          expiresAt: election.nominationsCloseAt!,
        },
      }));
      store.set(NOMINATION_COOKIE, token, {
        httpOnly: true,
        sameSite: "strict",
        secure: process.env.NODE_ENV === "production",
        expires: election.nominationsCloseAt!,
        path: "/",
      });
      return NextResponse.json({ ok: true, resumed: true });
    }

    const token = issueToken();
    await withDatabaseRetry(() => db.nominationInvite.create({
      data: {
        tokenHash: hashToken(token),
        candidateName: parsed.data.candidateName,
        email,
        electionId: election.id,
        lrcnCertified: parsed.data.lrcnCertified,
        lrcnNumber: parsed.data.lrcnCertified ? parsed.data.lrcnNumber : null,
        positionId: position.id,
        expiresAt: election.nominationsCloseAt!,
        showCountdown: true,
      },
    }));
    store.set(NOMINATION_COOKIE, token, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      expires: election.nominationsCloseAt!,
      path: "/",
    });
    return NextResponse.json({ ok: true, resumed: false }, { status: 201 });
  } catch (error) {
    if (isTransientDatabaseError(error))
      return NextResponse.json(
        { code: "DATABASE_UNAVAILABLE", message: "The nomination database is temporarily unavailable. Please try again in a moment." },
        { status: 503, headers: { "Retry-After": "3" } },
      );
    throw error;
  }
}
