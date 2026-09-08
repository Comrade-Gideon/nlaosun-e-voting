import { get, put } from "@vercel/blob";

export type NominationFileField =
  | "passport"
  | "studentId"
  | "transcript"
  | "signature";

const dataUrlPattern = /^data:([^;,]+);base64,([\s\S]+)$/;

export const nominationFileConfig: Record<
  NominationFileField,
  { dataKey: string; nameKey: string; types: string[]; maximumSizeInBytes: number }
> = {
  passport: {
    dataKey: "passportData",
    nameKey: "passportName",
    types: ["image/png", "image/jpeg"],
    maximumSizeInBytes: 1_500_000,
  },
  studentId: {
    dataKey: "studentIdData",
    nameKey: "studentIdName",
    types: ["application/pdf", "image/png", "image/jpeg"],
    maximumSizeInBytes: 4_000_000,
  },
  transcript: {
    dataKey: "transcriptData",
    nameKey: "transcriptName",
    types: ["application/pdf", "image/png", "image/jpeg"],
    maximumSizeInBytes: 4_000_000,
  },
  signature: {
    dataKey: "signatureData",
    nameKey: "signatureName",
    types: ["application/pdf", "image/png", "image/jpeg"],
    maximumSizeInBytes: 4_000_000,
  },
};

export function privateBlobToken() {
  const token =
    process.env.PRIVATE_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN;
  if (!token || token === "[SENSITIVE]")
    throw new Error(
      "PRIVATE_READ_WRITE_TOKEN is not configured in this environment.",
    );
  return token;
}

export function publicBlobToken() {
  const token = process.env.PUBLIC_READ_WRITE_TOKEN;
  if (!token) throw new Error("PUBLIC_READ_WRITE_TOKEN is not configured.");
  return token;
}

export function isDataUrl(value: string | null | undefined) {
  return Boolean(value && dataUrlPattern.test(value));
}

export function decodeDataUrl(value: string) {
  const match = value.match(dataUrlPattern);
  if (!match) throw new Error("Invalid Base64 data URL.");
  return { contentType: match[1], body: Buffer.from(match[2], "base64") };
}

export function safeFilename(value: string | null | undefined, fallback: string) {
  const cleaned = (value || fallback)
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return cleaned || fallback;
}

function privateStoreHost() {
  const storeId = (process.env.PRIVATE_STORE_ID || process.env.BLOB_STORE_ID)
    ?.replace(/^store_/, "")
    .toLowerCase();
  return storeId ? `${storeId}.private.blob.vercel-storage.com` : null;
}

export function isExpectedNominationBlob(
  value: string,
  inviteId: string,
  field: NominationFileField,
) {
  if (isDataUrl(value)) {
    try {
      const decoded = decodeDataUrl(value);
      const config = nominationFileConfig[field];
      return (
        config.types.includes(decoded.contentType) &&
        decoded.body.byteLength <= config.maximumSizeInBytes
      );
    } catch {
      return false;
    }
  }
  try {
    const url = new URL(value);
    const expectedHost = privateStoreHost();
    return (
      url.protocol === "https:" &&
      url.hostname.endsWith(".private.blob.vercel-storage.com") &&
      (!expectedHost || url.hostname === expectedHost) &&
      url.pathname.startsWith(`/nominations/${inviteId}/${field}/`)
    );
  } catch {
    return false;
  }
}

export async function storedFileResponse(
  storedValue: string,
  filename: string,
  disposition: "inline" | "attachment" = "inline",
) {
  const safeName = safeFilename(filename, "document");
  if (isDataUrl(storedValue)) {
    const decoded = decodeDataUrl(storedValue);
    return new Response(decoded.body, {
      headers: {
        "Content-Type": decoded.contentType,
        "Content-Disposition": `${disposition}; filename="${safeName}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  let result: Awaited<ReturnType<typeof get>>;
  try {
    result = await get(storedValue, {
      access: "private",
      token: privateBlobToken(),
    });
  } catch (error) {
    console.error(`Private blob read failed for ${storedValue}.`, error);
    return new Response(
      "The stored file could not be read from private storage.",
      { status: 502 },
    );
  }
  if (!result || result.statusCode !== 200) {
    console.error(
      `Private blob read returned ${result?.statusCode ?? "no response"} for ${storedValue}.`,
    );
    return new Response("File not found.", { status: 404 });
  }
  return new Response(result.stream, {
    headers: {
      "Content-Type": result.blob.contentType || "application/octet-stream",
      "Content-Length": String(result.blob.size),
      "Content-Disposition": `${disposition}; filename="${safeName}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function storedImageDataUrl(storedValue: string) {
  if (isDataUrl(storedValue)) return storedValue;
  const result = await get(storedValue, {
    access: "private",
    token: privateBlobToken(),
  });
  if (!result || result.statusCode !== 200)
    throw new Error("Image not found in private storage.");
  const bytes = Buffer.from(await new Response(result.stream).arrayBuffer());
  return `data:${result.blob.contentType || "image/jpeg"};base64,${bytes.toString("base64")}`;
}

function extensionFor(contentType: string) {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "jpg";
}

export async function publishCandidatePhoto(
  storedValue: string,
  nominationId: string,
) {
  let body: Parameters<typeof put>[1];
  let contentType: string;
  if (isDataUrl(storedValue)) {
    const decoded = decodeDataUrl(storedValue);
    body = decoded.body;
    contentType = decoded.contentType;
  } else if (storedValue.includes(".public.blob.vercel-storage.com")) {
    return storedValue;
  } else {
    const result = await get(storedValue, {
      access: "private",
      token: privateBlobToken(),
    });
    if (!result || result.statusCode !== 200)
      throw new Error("The candidate passport could not be read from private storage.");
    body = result.stream;
    contentType = result.blob.contentType || "image/jpeg";
  }

  const result = await put(
    `candidates/${nominationId}/passport.${extensionFor(contentType)}`,
    body,
    {
      access: "public",
      token: publicBlobToken(),
      contentType,
      allowOverwrite: true,
      cacheControlMaxAge: 60 * 60 * 24 * 30,
    },
  );
  return result.url;
}
