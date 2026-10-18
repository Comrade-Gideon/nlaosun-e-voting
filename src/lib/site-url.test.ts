import { afterEach, expect, it, vi } from "vitest";
import { getConfiguredSiteUrl, getPublicOrigin } from "./site-url";

afterEach(() => vi.unstubAllEnvs());

it.each([
  "https://vote.nlaosun.workers.dev/",
  '"https://vote.nlaosun.workers.dev"',
  "vote.nlaosun.workers.dev",
])("normalizes the configured origin: %s", value => {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", value);
  expect(getConfiguredSiteUrl()?.origin).toBe("https://vote.nlaosun.workers.dev");
});

it.each(['"https', 'https/guarantor/token', 'https://"https/guarantor/token', 'https://', 'ftp://example.com', 'https://user:password@example.com']) (
  "uses the request origin when the configured URL is malformed: %s", value => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", value);
    const request = new Request("https://vote.nlaosun.workers.dev/api/nominations/session");
    expect(getConfiguredSiteUrl()).toBeUndefined();
    expect(getPublicOrigin(request)).toBe("https://vote.nlaosun.workers.dev");
  },
);
