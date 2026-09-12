import { NextResponse } from "next/server";
import { nominationFileConfig } from "@/lib/blob-storage";
import { guarantorByToken } from "@/lib/guarantors";
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
 * A guarantor uploads only their own signature, into a folder keyed on their own
 * id, so one guarantor can never overwrite another's file or a candidate's.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const body = (await request.json().catch(() => null)) as UploadRequest | null;
  if (!body?.key || !body.field || !body.contentType || !body.size)
    return NextResponse.json({ message: "Invalid upload request." }, { status: 400 });

  try {
    const guarantor = await guarantorByToken(token);
    if (!guarantor || guarantor.submittedAt || guarantor.nomination.expiresAt <= new Date())
      throw new Error("This guarantor link is no longer valid.");
    if (body.field !== "signature") throw new Error("This upload path is not allowed.");

    const config = nominationFileConfig.signature;
    if (!body.key.startsWith(`nominations/${guarantor.id}/signature/`) || body.key.includes(".."))
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
