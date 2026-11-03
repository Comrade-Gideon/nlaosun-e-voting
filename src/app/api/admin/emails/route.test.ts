import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticated: vi.fn(),
  candidates: vi.fn(),
  nominations: vi.fn(),
  configured: vi.fn(),
  brandedEmail: vi.fn(),
  paragraphsToHtml: vi.fn(),
  sendMail: vi.fn(),
  origin: vi.fn(),
}));
vi.mock("@/lib/admin-auth", () => ({ isAdminAuthenticated: mocks.authenticated }));
vi.mock("@/lib/db", () => ({
  db: { candidate: { findMany: mocks.candidates }, nominationInvite: { findMany: mocks.nominations } },
  withDatabaseRetry: <T>(operation: () => Promise<T>) => operation(),
}));
vi.mock("@/lib/mailer", () => ({
  mailerConfigured: mocks.configured,
  brandedEmail: mocks.brandedEmail,
  paragraphsToHtml: mocks.paragraphsToHtml,
  sendMail: mocks.sendMail,
}));
vi.mock("@/lib/site-url", () => ({ getPublicOrigin: mocks.origin }));

import { POST } from "./route";

const post = (body: object) => POST(new Request("https://example.com/api/admin/emails", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
}));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.authenticated.mockResolvedValue(true);
  mocks.candidates.mockResolvedValue([{ email: "candidate@example.com" }]);
  mocks.nominations.mockResolvedValue([]);
  mocks.configured.mockReturnValue(true);
  mocks.brandedEmail.mockReturnValue("<html />");
  mocks.paragraphsToHtml.mockReturnValue("<p>Message text long enough</p>");
  mocks.sendMail.mockResolvedValue({ sent: true });
  mocks.origin.mockReturnValue("https://example.com");
});

it("explains which fields fail validation", async () => {
  const response = await post({ subject: "Hi", body: "short", recipients: [] });
  expect(response.status).toBe(400);
  const payload = await response.json();
  expect(payload.message).toContain("Subject must be between 3 and 200 characters.");
  expect(payload.message).toContain("Message must be between 10 and 10,000 characters after trimming.");
  expect(payload.message).toContain("Choose at least one recipient.");
  expect(mocks.sendMail).not.toHaveBeenCalled();
});

it("reports when the recipient selection exceeds the API limit", async () => {
  const response = await post({
    subject: "Election update",
    body: "Here is an update for candidates.",
    recipients: Array.from({ length: 501 }, (_, index) => `voter${index}@example.com`),
  });
  expect(response.status).toBe(400);
  expect((await response.json()).message).toContain("Select no more than 500 recipients.");
});

it("sends a valid message only to an allowed address", async () => {
  const response = await post({
    subject: "Election update",
    body: "Here is an update for candidates.",
    recipients: ["candidate@example.com"],
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ ok: true, sent: 1, failed: [], skipped: [] });
  expect(mocks.sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: "candidate@example.com" }));
});

it("reports a temporary recipient database outage without sending", async () => {
  mocks.candidates.mockRejectedValue(new Error("database offline"));
  const response = await post({
    subject: "Election update",
    body: "Here is an update for candidates.",
    recipients: ["candidate@example.com"],
  });
  expect(response.status).toBe(503);
  expect((await response.json()).code).toBe("RECIPIENTS_UNAVAILABLE");
  expect(mocks.sendMail).not.toHaveBeenCalled();
});
