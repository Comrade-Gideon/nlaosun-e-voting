import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { presignPut, publicBucket, publicUrlFor } from "@/lib/r2";

type UploadRequest = { key?: string; contentType?: string; size?: number };

const PREFIX = "candidates/";
const TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_BYTES = 1_500_000;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Presigned PUT into the public R2 bucket. Replaces Vercel Blob's handleUpload,
 * which has no R2 equivalent: the browser uploads straight to the bucket and the
 * caller stores the returned public URL.
 */
export async function POST(request: Request) {
  if (!(await isAdminAuthenticated()))
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as UploadRequest | null;
  if (!body?.key || !body.contentType || !body.size)
    return NextResponse.json({ message: "Invalid upload request." }, { status: 400 });

  try {
    if (!body.key.startsWith(PREFIX) || body.key.includes(".."))
      throw new Error("This upload path is not allowed.");
    if (!TYPES.includes(body.contentType))
      throw new Error("Upload a PNG, JPG or WEBP image.");
    if (body.size > MAX_BYTES)
      throw new Error(`Image must be ${Math.round(MAX_BYTES / 1_000_000)}MB or smaller.`);

    const presignedUrl = await presignPut({
      bucket: publicBucket(),
      key: body.key,
      contentType: body.contentType,
      expiresInSeconds: 900,
    });
    return NextResponse.json({ presignedUrl, url: publicUrlFor(body.key) });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Upload failed." },
      { status: 400 },
    );
  }
}
