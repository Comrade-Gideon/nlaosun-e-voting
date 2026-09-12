/**
 * Applies the CORS policy both R2 buckets need for direct browser uploads.
 *
 * The browser sends a preflight before every presigned PUT (an image/* content
 * type is not CORS-safelisted), and R2 rejects preflights with 403 unless the
 * bucket allows the exact origin. Origins are matched literally, so every origin
 * the app is served from has to be listed.
 *
 *   npm run r2:cors                                  # localhost only
 *   R2_CORS_ORIGINS="https://vote.nlaosun.org.ng" npm run r2:cors
 */
import { PutBucketCorsCommand, GetBucketCorsCommand } from "@aws-sdk/client-s3";
import { r2, privateBucket, publicBucket } from "../src/lib/r2";

const origins = [
  "http://localhost:3000",
  ...(process.env.R2_CORS_ORIGINS ?? "").split(",").map((value) => value.trim()).filter(Boolean),
  ...(process.env.NEXT_PUBLIC_SITE_URL ? [new URL(process.env.NEXT_PUBLIC_SITE_URL).origin] : []),
];

const rules = [
  {
    AllowedOrigins: [...new Set(origins)],
    AllowedMethods: ["PUT"],
    AllowedHeaders: ["content-type"],
    ExposeHeaders: ["ETag"],
    MaxAgeSeconds: 3600,
  },
];

async function apply(bucket: string) {
  await r2().send(new PutBucketCorsCommand({ Bucket: bucket, CORSConfiguration: { CORSRules: rules } }));
  const check = await r2().send(new GetBucketCorsCommand({ Bucket: bucket }));
  console.log(`${bucket}: allowed origins ->`, check.CORSRules?.[0]?.AllowedOrigins?.join(", "));
}

async function main() {
  console.log("applying origins:", [...new Set(origins)].join(", "));
  await apply(privateBucket());
  await apply(publicBucket());
}
main().catch((error) => { console.error("FAILED:", error); process.exit(1); });
