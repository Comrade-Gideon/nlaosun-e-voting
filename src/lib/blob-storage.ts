import {
  getObject,
  privateBucket,
  publicBucket,
  publicUrlFor,
  putObject,
} from "@/lib/r2";

export type NominationFileField =
  | "passport"
  | "studentId"
  | "identification"
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
  identification: {
    dataKey: "identificationData",
    nameKey: "identificationName",
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

export function isDataUrl(value: string | null | undefined) {
  return Boolean(value && dataUrlPattern.test(value));
}

export function decodeDataUrl(value: string) {
  const match = value.match(dataUrlPattern);
  if (!match) throw new Error("Value is not a base64 data URL.");
  return { contentType: match[1], body: Buffer.from(match[2], "base64") };
}

export function safeFilename(value: string | null | undefined, fallback: string) {
  const cleaned = (value ?? "")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return cleaned || fallback;
}

/**
 * Private nomination and guarantor files are stored in R2 by object key rather
 * than URL — the private bucket is never publicly readable, so a URL would be
 * meaningless. Each key is namespaced by the owning record's id, which is what
 * stops one candidate referencing another's document.
 */
export function isExpectedNominationBlob(
  value: string,
  ownerId: string,
  field: NominationFileField,
) {
  // Legacy rows stored the file inline as base64; validate those by content.
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
  return (
    !value.includes("..") &&
    !value.startsWith("/") &&
    value.startsWith(`nominations/${ownerId}/${field}/`)
  );
}

export async function storedFileResponse(
  storedValue: string,
  filename: string,
  disposition: "inline" | "attachment" = "inline",
) {
  const safeName = safeFilename(filename, "document");
  const headers = (contentType: string, length?: number) => ({
    "Content-Type": contentType,
    ...(length === undefined ? {} : { "Content-Length": String(length) }),
    "Content-Disposition": `${disposition}; filename="${safeName}"`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  });

  if (isDataUrl(storedValue)) {
    const decoded = decodeDataUrl(storedValue);
    return new Response(decoded.body, { headers: headers(decoded.contentType) });
  }

  try {
    const result = await getObject(privateBucket(), storedValue);
    if (!result.Body) return new Response("File not found.", { status: 404 });
    return new Response(result.Body.transformToWebStream(), {
      headers: headers(result.ContentType || "application/octet-stream", result.ContentLength),
    });
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
    if (status === 404) return new Response("File not found.", { status: 404 });
    console.error(`Private R2 read failed for ${storedValue}.`, error);
    return new Response("The stored file could not be read from private storage.", { status: 502 });
  }
}

export async function storedImageDataUrl(storedValue: string) {
  if (isDataUrl(storedValue)) return storedValue;
  const result = await getObject(privateBucket(), storedValue);
  if (!result.Body) throw new Error("Image not found in private storage.");
  const bytes = Buffer.from(await result.Body.transformToByteArray());
  return `data:${result.ContentType || "image/jpeg"};base64,${bytes.toString("base64")}`;
}

function extensionFor(contentType: string) {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "jpg";
}

/**
 * Publishes an approved candidate's passport out of the private bucket into the
 * public one. Called on approval, which is the point the photo becomes public.
 */
export async function publishCandidatePhoto(
  storedValue: string,
  nominationId: string,
) {
  let body: Buffer;
  let contentType: string;

  if (isDataUrl(storedValue)) {
    const decoded = decodeDataUrl(storedValue);
    body = decoded.body;
    contentType = decoded.contentType;
  } else if (/^https?:\/\//.test(storedValue)) {
    // Already a published URL; nothing to copy.
    return storedValue;
  } else {
    const result = await getObject(privateBucket(), storedValue);
    if (!result.Body)
      throw new Error("The candidate passport could not be read from private storage.");
    body = Buffer.from(await result.Body.transformToByteArray());
    contentType = result.ContentType || "image/jpeg";
  }

  const key = `candidates/${nominationId}/passport.${extensionFor(contentType)}`;
  await putObject({
    bucket: publicBucket(),
    key,
    body,
    contentType,
    cacheControl: `public, max-age=${60 * 60 * 24 * 30}`,
  });
  return publicUrlFor(key);
}
