import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  nominationFileConfig,
  storedFileResponse,
  type NominationFileField,
} from "@/lib/blob-storage";
import { hashToken } from "@/lib/security";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const field = new URL(request.url).searchParams.get("field") as NominationFileField;
  const config = nominationFileConfig[field];
  if (!config)
    return NextResponse.json({ message: "Unknown file." }, { status: 400 });

  const invite = await db.nominationInvite.findUnique({
    where: { tokenHash: hashToken(token) },
  });
  if (
    !invite ||
    !["DRAFT", "REJECTED"].includes(invite.status) ||
    invite.expiresAt <= new Date()
  )
    return NextResponse.json({ message: "This link is no longer valid." }, { status: 410 });

  const value = invite[config.dataKey as keyof typeof invite];
  const name = invite[config.nameKey as keyof typeof invite];
  if (typeof value !== "string") return new Response("File not found.", { status: 404 });
  return storedFileResponse(value, typeof name === "string" ? name : field);
}
