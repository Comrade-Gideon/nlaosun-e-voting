import { issueSignedToken, presignUrl } from "@vercel/blob";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  nominationFileConfig,
  privateBlobToken,
  type NominationFileField,
} from "@/lib/blob-storage";
import { hashToken } from "@/lib/security";

type UploadRequest = {
  pathname?: string;
  field?: string;
  contentType?: string;
  size?: number;
};

const privateStoreId =
  process.env.PRIVATE_STORE_ID || "store_ezXg1QOovbL9mwXi";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const body = (await request.json().catch(() => null)) as UploadRequest | null;
  if (!body?.pathname || !body.field || !body.contentType || !body.size)
    return NextResponse.json(
      { message: "Invalid upload request." },
      { status: 400 },
    );

  try {
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

    const field = body.field as NominationFileField;
    const config = nominationFileConfig[field];
    if (
      !config ||
      !body.pathname.startsWith(`nominations/${invite.id}/${field}/`)
    )
      throw new Error("This upload path is not allowed.");
    if (!config.types.includes(body.contentType))
      throw new Error("Unsupported file format.");
    if (body.size > config.maximumSizeInBytes)
      throw new Error(
        `File must be ${Math.round(config.maximumSizeInBytes / 1_000_000)}MB or smaller.`,
      );

    const validUntil = Math.min(
      invite.expiresAt.getTime(),
      Date.now() + 10 * 60_000,
    );
    const auth = process.env.PRIVATE_READ_WRITE_TOKEN
      ? { token: privateBlobToken() }
      : { storeId: privateStoreId };
    const signedToken = await issueSignedToken({
      ...auth,
      pathname: body.pathname,
      operations: ["put"],
      validUntil,
      allowedContentTypes: config.types,
      maximumSizeInBytes: config.maximumSizeInBytes,
    });
    const { presignedUrl } = await presignUrl(signedToken, {
      operation: "put",
      pathname: body.pathname,
      access: "private",
      validUntil,
      allowedContentTypes: config.types,
      maximumSizeInBytes: config.maximumSizeInBytes,
      addRandomSuffix: true,
      cacheControlMaxAge: 60 * 60 * 24 * 30,
    });

    return NextResponse.json({ presignedUrl });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "File upload failed." },
      { status: 400 },
    );
  }
}
