import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Cloudflare R2 over its S3-compatible API.
 *
 * Two buckets mirror the old private/public split:
 *   - private: nomination documents (passport, membership evidence, means of
 *     identification, signatures). Never publicly readable; served only through
 *     our own authenticated routes.
 *   - public: published candidate photos and announcement images, fronted by a
 *     public bucket URL or a custom domain.
 *
 *   R2_ACCOUNT_ID=...                       (Cloudflare account id)
 *   R2_ACCESS_KEY_ID=...                    (R2 API token, "Object Read & Write")
 *   R2_SECRET_ACCESS_KEY=...
 *   R2_PRIVATE_BUCKET=nlaosun-private
 *   R2_PUBLIC_BUCKET=nlaosun-public
 *   R2_PUBLIC_BASE_URL=https://media.nlaosun.org.ng
 */

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured in this environment.`);
  return value;
}

export function r2Configured() {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY,
  );
}

export const privateBucket = () => required("R2_PRIVATE_BUCKET");
export const publicBucket = () => required("R2_PUBLIC_BUCKET");

/** Base URL that serves the public bucket (r2.dev subdomain or a custom domain). */
export function publicBaseUrl() {
  return required("R2_PUBLIC_BASE_URL").replace(/\/+$/, "");
}

let client: S3Client | undefined;
export function r2() {
  if (!client)
    client = new S3Client({
      // R2 ignores the region but the SDK requires one.
      region: "auto",
      // From v3.729 the SDK adds a CRC32 checksum to every PutObject. When the
      // request is presigned rather than sent, that checksum is computed over an
      // empty body and frozen into the URL as x-amz-checksum-crc32=AAAAAA==, so
      // R2 rejects the real upload. Only compute checksums where the API demands
      // one; presigned PUTs then carry no checksum at all.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
      endpoint: `https://${required("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: required("R2_ACCESS_KEY_ID"),
        secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
      },
    });
  return client;
}

/**
 * A short-lived PUT URL the browser uploads straight to, so large documents never
 * pass through the server.
 *
 * Only `content-type` is signed alongside `host`. Signing `content-length` as well
 * makes the upload fail with 403 SignatureDoesNotMatch from a browser: fetch sets
 * Content-Length itself (scripts may not — it is a forbidden header name), and any
 * difference from the signed value, including a switch to chunked encoding,
 * invalidates the signature. Size is therefore enforced by the authorizing route
 * before the URL is ever issued, not by the signature.
 */
export function presignPut(options: {
  bucket: string;
  key: string;
  contentType: string;
  expiresInSeconds?: number;
}) {
  return getSignedUrl(
    r2(),
    new PutObjectCommand({
      Bucket: options.bucket,
      Key: options.key,
      ContentType: options.contentType,
    }),
    { expiresIn: options.expiresInSeconds ?? 600, signableHeaders: new Set(["content-type"]) },
  );
}

export async function getObject(bucket: string, key: string) {
  return r2().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
}

export async function putObject(options: {
  bucket: string;
  key: string;
  body: Uint8Array | Buffer;
  contentType: string;
  cacheControl?: string;
}) {
  await r2().send(new PutObjectCommand({
    Bucket: options.bucket,
    Key: options.key,
    Body: options.body,
    ContentType: options.contentType,
    CacheControl: options.cacheControl,
  }));
}

/** Object key for a value stored as a full public URL, or null if it is not ours. */
export function publicKeyFromUrl(value: string) {
  try {
    const base = publicBaseUrl();
    if (!value.startsWith(`${base}/`)) return null;
    return decodeURIComponent(value.slice(base.length + 1));
  } catch {
    return null;
  }
}

export const publicUrlFor = (key: string) => `${publicBaseUrl()}/${key}`;
