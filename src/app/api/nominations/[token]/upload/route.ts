import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  nominationFileConfig,
  privateBlobToken,
  type NominationFileField,
} from "@/lib/blob-storage";
import { hashToken } from "@/lib/security";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const body = (await request.json().catch(() => null)) as HandleUploadBody | null;
  if (!body)
    return NextResponse.json({ message: "Invalid upload request." }, { status: 400 });

  try {
    const result = await handleUpload({
      request,
      body,
      token: privateBlobToken(),
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const invite = await db.nominationInvite.findUnique({
          where: { tokenHash: hashToken(token) },
          select: { id: true, status: true, expiresAt: true },
        });
        if (
          !invite ||
          !["DRAFT", "REJECTED"].includes(invite.status) ||
          invite.expiresAt <= new Date()
        )
          throw new Error("This nomination link is no longer valid.");

        const payload = JSON.parse(clientPayload || "{}") as { field?: string };
        const field = payload.field as NominationFileField;
        const config = nominationFileConfig[field];
        if (!config || !pathname.startsWith(`nominations/${invite.id}/${field}/`))
          throw new Error("This upload path is not allowed.");

        return {
          allowedContentTypes: config.types,
          maximumSizeInBytes: config.maximumSizeInBytes,
          validUntil: Math.min(invite.expiresAt.getTime(), Date.now() + 15 * 60_000),
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ nominationId: invite.id, field }),
        };
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "File upload failed." },
      { status: 400 },
    );
  }
}
