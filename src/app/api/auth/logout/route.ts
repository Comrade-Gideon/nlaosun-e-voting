import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashToken, VOTING_COOKIE } from "@/lib/security";

export async function POST() {
  const store = await cookies();
  const token = store.get(VOTING_COOKIE)?.value;
  try {
    if (token) {
      // Expire the session while retaining its history and the submitted ballot.
      await db.votingSession.updateMany({
        where: { tokenHash: hashToken(token) },
        data: { expiresAt: new Date(0) },
      });
    }
    store.delete(VOTING_COOKIE);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ message: "Could not log you out. Please try again." }, { status: 503 });
  }
}
