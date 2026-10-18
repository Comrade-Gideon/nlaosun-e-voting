import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { usernameSchema, passwordSchema, verifyVoterPassword } from "@/lib/voter-credentials";
import { db } from "@/lib/db";
import { getPublishedElectionSummary, votingClosedNotice } from "@/lib/elections";
import {
  hashToken,
  issueToken,
  SESSION_TTL_MS,
  VOTING_COOKIE,
} from "@/lib/security";

const inputSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
});

export async function POST(request: Request) {
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Enter your username and password." }, { status: 400 });

  const election = await getPublishedElectionSummary();
  // Checked before the voter lookup, so outside the window nobody can use this
  // endpoint to test whether a username is on the register.
  const closed = votingClosedNotice(election);
  if (closed) return NextResponse.json({ code: "VOTING_NOT_OPEN", message: closed.message }, { status: 403 });
  const voter = await db.voter.findUnique({ where: { username: parsed.data.username } });
  const validIdentity = await verifyVoterPassword(parsed.data.password, voter?.passwordHash);
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
