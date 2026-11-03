import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Ballot } from "@/components/ballot";
import { db } from "@/lib/db";
import { hashToken, VOTING_COOKIE } from "@/lib/security";

export default async function VotePage() {
  const token = (await cookies()).get(VOTING_COOKIE)?.value;
  if (!token) redirect("/login");
  const session = await db.votingSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      voter: { select: { displayName: true, eligible: true } },
      election: {
        include: {
          positions: {
            orderBy: { sortOrder: "asc" },
            include: {
              candidates: {
                select: { id: true, name: true, pka: true, photoUrl: true },
              },
            },
          },
        },
      },
    },
  });
  if (!session || !session.voter.eligible || session.usedAt || session.expiresAt <= new Date())
    redirect("/login");
  return (
    <Ballot
      positions={session.election.positions}
      voterName={session.voter.displayName}
    />
  );
}
