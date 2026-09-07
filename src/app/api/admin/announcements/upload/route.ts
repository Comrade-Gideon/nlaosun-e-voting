import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { publicBlobToken } from "@/lib/blob-storage";

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated()))
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as HandleUploadBody | null;
  if (!body)
    return NextResponse.json({ message: "Invalid upload request." }, { status: 400 });
  try {
    const result = await handleUpload({
      request,
      body,
      token: publicBlobToken(),
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith("announcements/"))
          throw new Error("This upload path is not allowed.");
        return {
          allowedContentTypes: ["image/png", "image/jpeg", "image/webp"],
          maximumSizeInBytes: 5_000_000,
          validUntil: Date.now() + 15 * 60_000,
          addRandomSuffix: true,
        };
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Upload failed." },
      { status: 400 },
    );
  }
}
