import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getPublishedElectionSummary } from "@/lib/elections";
import {
  hashSurname,
  hashesEqual,
  hashToken,
  issueToken,
  normalizeMatric,
  SESSION_TTL_MS,
  VOTING_COOKIE,
} from "@/lib/security";

const inputSchema = z.object({
  matriculationNumber: z.string().trim().min(4).max(40),
  surname: z.string().trim().min(2).max(80),
});

export async function POST(request: Request) {
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Enter a valid matriculation number and surname." }, { status: 400 });

  const election = await getPublishedElectionSummary();
  const voter = await db.voter.findUnique({ where: { matriculationNumber: normalizeMatric(parsed.data.matriculationNumber) } });
  const validIdentity = voter && hashesEqual(voter.surnameNormalizedHash, hashSurname(parsed.data.surname));
  const existingBallot = voter && election
    ? await db.ballot.findUnique({ where: { electionId_voterId: { electionId: election.id, voterId: voter.id } } })
    : null;

  if (election && voter && voter.eligible && validIdentity && existingBallot) {
    return NextResponse.json({ code: "ALREADY_VOTED", message: "You have already cast your vote in this election. A second vote is not permitted." }, { status: 409 });
  }

  if (!election || !voter || !voter.eligible || !validIdentity) {
    return NextResponse.json({ message: "We could not authorize this voter for the current election." }, { status: 401 });
  }

  const token = issueToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.votingSession.create({
    data: { tokenHash: hashToken(token), voterId: voter.id, electionId: election.id, expiresAt },
  });

  const cookieStore = await cookies();
  cookieStore.set(VOTING_COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/",
  });
  return NextResponse.json({ ok: true, redirectTo: "/vote" });
}
