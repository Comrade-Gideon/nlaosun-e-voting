/**
 * Two-step browser upload to R2: ask our own route to authorize the exact object,
 * then PUT the file straight to the bucket. Nothing large passes through the
 * server, and the signature pins the content type and length that were declared.
 */
export async function uploadViaPresignedUrl(options: {
  endpoint: string;
  key: string;
  file: File;
  field?: string;
}): Promise<{ key: string; url?: string }> {
  const authorization = await fetch(options.endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      key: options.key,
      field: options.field,
      contentType: options.file.type,
      size: options.file.size,
    }),
  });
  const granted = await authorization.json().catch(() => null);
  if (!authorization.ok || !granted?.presignedUrl)
    throw new Error(granted?.message || "Upload authorization failed.");

  const stored = await fetch(granted.presignedUrl, {
    method: "PUT",
    headers: { "Content-Type": options.file.type },
    body: options.file,
  });
  if (!stored.ok) {
    // R2 replies with an XML <Code> (AccessDenied, SignatureDoesNotMatch, ...).
    // Surfacing it makes a permissions problem distinguishable from a signing one.
    const detail = await stored.text().catch(() => "");
    const code = detail.match(/<Code>([^<]+)<\/Code>/)?.[1];
    throw new Error(
      code
        ? `Upload rejected by storage (${stored.status} ${code}).`
        : `Upload rejected by storage (${stored.status}).`,
    );
  }

  return { key: granted.key ?? options.key, url: granted.url };
}

export function safeUploadKey(name: string, fallback: string) {
  const cleaned = name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 120);
  return `${Date.now()}-${cleaned || fallback}`;
}
