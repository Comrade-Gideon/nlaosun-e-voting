import { db } from "@/lib/db";
import { electionState } from "@/lib/elections";
import { hashToken, receiptCode } from "@/lib/security";

export type BallotSelection = { positionId: string; candidateId: string };

export class VotingError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

export async function submitBallot(rawToken: string, selections: BallotSelection[]) {
  const tokenHash = hashToken(rawToken);
  const session = await db.votingSession.findUnique({
    where: { tokenHash },
    include: {
      voter: { select: { eligible: true } },
      election: { include: { positions: { include: { candidates: true } } } },
    },
  });

  if (!session || session.usedAt || session.expiresAt <= new Date()) {
    throw new VotingError("SESSION_INVALID", "Your voting session has expired. Verify your identity again.", 401);
  }
  if (!session.voter.eligible) {
    throw new VotingError("VOTER_INELIGIBLE", "This voter is no longer eligible to vote.", 403);
  }
  if (session.election.status !== "PUBLISHED" || electionState(session.election.opensAt, session.election.closesAt) !== "open") {
    throw new VotingError("ELECTION_NOT_OPEN", "Voting is not currently open.", 409);
  }
  const uniquePositions = new Set(selections.map((item) => item.positionId));
  if (uniquePositions.size !== selections.length) {
    throw new VotingError("DUPLICATE_POSITION", "Only one candidate may be selected per position.");
  }

  const positions = new Map(session.election.positions.map((position) => [position.id, position]));
  for (const selection of selections) {
    const position = positions.get(selection.positionId);
    if (!position || !position.candidates.some((candidate) => candidate.id === selection.candidateId)) {
      throw new VotingError("INVALID_SELECTION", "One or more ballot selections are invalid.");
    }
  }

  const ballot = await db.ballot.create({
    data: {
      receipt: receiptCode(),
      electionId: session.electionId,
      voterId: session.voterId,
      votes: { create: selections },
    },
    select: { receipt: true, submittedAt: true },
  });
  try {
    await db.votingSession.updateMany({
      where: { id: session.id, usedAt: null },
      data: { usedAt: new Date() },
    });
  } catch {
    // The unique election/voter ballot constraint still prevents a second vote
    // if Neon temporarily fails while marking this short-lived session as used.
  }
  return ballot;
}
