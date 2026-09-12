import { NextResponse } from "next/server";
import {
  nominationFileConfig,
  type NominationFileField,
} from "@/lib/blob-storage";
import { currentNomination, isEditable } from "@/lib/nominations";
import { presignPut, privateBucket } from "@/lib/r2";

type UploadRequest = {
  key?: string;
  field?: string;
  contentType?: string;
  size?: number;
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Hands the browser a short-lived presigned PUT so documents go straight to the
 * private R2 bucket instead of through this server. The key is pinned to the
 * caller's own nomination, so one candidate cannot write into another's folder.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as UploadRequest | null;
  if (!body?.key || !body.field || !body.contentType || !body.size)
    return NextResponse.json({ message: "Invalid upload request." }, { status: 400 });

  try {
    const invite = await currentNomination();
    if (!isEditable(invite)) throw new Error("This nomination can no longer be edited.");

    const field = body.field as NominationFileField;
    const config = nominationFileConfig[field];
    if (!config || !body.key.startsWith(`nominations/${invite!.id}/${field}/`) || body.key.includes(".."))
      throw new Error("This upload path is not allowed.");
    if (!config.types.includes(body.contentType))
      throw new Error("Unsupported file format.");
    if (body.size > config.maximumSizeInBytes)
      throw new Error(`File must be ${Math.round(config.maximumSizeInBytes / 1_000_000)}MB or smaller.`);

    const presignedUrl = await presignPut({
      bucket: privateBucket(),
      key: body.key,
      contentType: body.contentType,
      expiresInSeconds: 600,
    });
    return NextResponse.json({ presignedUrl, key: body.key });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "File upload failed." },
      { status: 400 },
    );
  }
}
