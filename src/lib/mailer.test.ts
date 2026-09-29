import { afterEach, expect, it, vi } from "vitest";
import { nominationSubmittedMessage, sendMail } from "./mailer";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it("reports rejected Google credentials without attempting delivery", async () => {
  vi.stubEnv("GOOGLE_CLIENT_ID", "client");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "secret");
  vi.stubEnv("GOOGLE_REFRESH_TOKEN", "invalid");
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }));
  vi.stubGlobal("fetch", fetchMock);
  expect(await sendMail({ to: "candidate@example.com", subject: "Receipt", text: "Saved", html: "Saved" }))
    .toEqual({ sent: false, error: expect.stringContaining("Run npm run gmail:token") });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("acknowledges submission with a receipt and escapes candidate content", () => {
  const message = nominationSubmittedMessage({ candidateName: "<Candidate>", position: "Chair", receipt: "NLA-123", origin: "https://example.com" });
  expect(message.text).toContain("NLA-123");
  expect(message.text).toContain("pending review");
  expect(message.html).toContain("&lt;Candidate&gt;");
  expect(message.html).not.toContain("<Candidate>");
});
