import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(), sendMail: vi.fn() }));
vi.mock("@/lib/admin-auth", () => ({ isAdminAuthenticated: async () => true }));
vi.mock("@/lib/db", () => ({
  db: { guarantor: { findUnique: mocks.findUnique, update: mocks.update, updateMany: mocks.updateMany } },
  withDatabaseRetry: <T>(operation: () => Promise<T>) => operation(),
}));
vi.mock("@/lib/mailer", async (original) => ({
  ...(await original<typeof import("@/lib/mailer")>()),
  mailerConfigured: () => true,
  sendMail: mocks.sendMail,
}));
import { POST } from "./route";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.findUnique.mockResolvedValue({
    id: "g1", name: "Ada Obi", email: "ada@example.com", submittedAt: null,
    nomination: { candidateName: "Tunde Bello", expiresAt: new Date("2026-09-30T14:59:00Z"), position: { title: "Chairman" } },
  });
  mocks.sendMail.mockResolvedValue({ sent: true });
});

const resend = () => POST(new Request("https://vote.example/api/admin/nominations/guarantors", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ guarantorId: "g1" }),
}));

it("issues a different link on every resend and stores its hash", async () => {
  const first = await (await resend()).json();
  const second = await (await resend()).json();
  expect(first.link).not.toBe(second.link);
  const [a, b] = mocks.update.mock.calls.map(([call]) => call.data.tokenHash);
  expect(a).not.toBe(b);
});

it("marks a resent email as replacing earlier links, with its own subject", async () => {
  const { link } = await (await resend()).json();
  const message = mocks.sendMail.mock.calls[0][0];
  expect(message.subject).toMatch(/^New guarantor link \(/);
  expect(message.text).toContain("replaces any guarantor link sent to you earlier");
  expect(message.text).toContain(link);
  expect(message.html).toContain(link);
});
