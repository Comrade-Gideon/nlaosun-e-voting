import { issueSignedToken, presignUrl } from "@vercel/blob";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  nominationFileConfig,
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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function createUploadToken(
  pathname: string,
  validUntil: number,
  allowedContentTypes: string[],
  maximumSizeInBytes: number,
) {
  const options = {
    pathname,
    operations: ["put"] as Array<"put">,
    validUntil,
    allowedContentTypes,
    maximumSizeInBytes,
  };
  let oidcError = "unavailable";
  try {
    return await issueSignedToken({ storeId: privateStoreId, ...options });
  } catch (error) {
    oidcError = error instanceof Error ? error.message : "rejected";
  }

  const readWriteToken = process.env.PRIVATE_READ_WRITE_TOKEN;
  if (readWriteToken && readWriteToken !== "[SENSITIVE]") {
    try {
      return await issueSignedToken({ token: readWriteToken, ...options });
    } catch (error) {
      const tokenError = error instanceof Error ? error.message : "rejected";
      throw new Error(
        `Blob authorization failed. OIDC: ${oidcError} Token: ${tokenError}`,
      );
    }
  }

  throw new Error(
    `Blob authorization failed. OIDC: ${oidcError} Token: unavailable`,
  );
}

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
    const signedToken = await createUploadToken(
      body.pathname,
      validUntil,
      config.types,
      config.maximumSizeInBytes,
    );
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
