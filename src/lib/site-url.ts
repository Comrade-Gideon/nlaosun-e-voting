function parseOrigin(value: string) {
  let configured = value.trim();
  // Dashboard variables sometimes include the quotes used in .env files.
  if ((configured.startsWith('"') && configured.endsWith('"')) ||
      (configured.startsWith("'") && configured.endsWith("'"))) {
    configured = configured.slice(1, -1).trim();
  }
  if (!configured || /[\s"'\\]/.test(configured)) return undefined;
  if (/^https?(?::|\/)/i.test(configured) && !/^https?:\/\//i.test(configured)) return undefined;
  if (configured.includes("://") && !/^https?:\/\//i.test(configured)) return undefined;
  try {
    const url = new URL(/^https?:\/\//i.test(configured) ? configured : `https://${configured}`);
    if (!url.hostname || ["http", "https"].includes(url.hostname) || url.username || url.password) return undefined;
    return new URL(url.origin);
  } catch { return undefined; }
}

export function getConfiguredSiteUrl() {
  const configured =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VERCEL_URL;
  return configured ? parseOrigin(configured) : undefined;
}

export function getPublicOrigin(request: Request) {
  const configured = getConfiguredSiteUrl();
  if (configured) return configured.origin;

  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost || request.headers.get("host");
  if (host) {
    const forwardedProtocol = request.headers.get("x-forwarded-proto");
    const requestProtocol = new URL(request.url).protocol.replace(":", "");
    const protocol = forwardedProtocol || requestProtocol;
    return `${protocol}://${host}`;
  }

  return new URL(request.url).origin;
}
