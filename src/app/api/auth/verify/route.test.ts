import { beforeEach, expect, it, vi } from "vitest";
import { hashVoterPassword } from "@/lib/voter-credentials";

const mocks = vi.hoisted(() => ({
  voter: vi.fn(), ballot: vi.fn(), create: vi.fn(), set: vi.fn(), election: vi.fn(), closed: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: mocks.set }) }));
vi.mock("@/lib/db", () => ({ db: {
  voter: { findUnique: mocks.voter }, ballot: { findUnique: mocks.ballot }, votingSession: { create: mocks.create },
} }));
vi.mock("@/lib/elections", () => ({ getPublishedElectionSummary: mocks.election, votingClosedNotice: mocks.closed }));
import { POST } from "./route";

beforeEach(async () => {
  vi.resetAllMocks();
  vi.stubEnv("SESSION_SECRET", "s".repeat(32));
  mocks.election.mockResolvedValue({ id: "election" });
  mocks.closed.mockReturnValue(null);
  mocks.voter.mockResolvedValue({ id: "voter", username: "voter001", displayName: "Full Voter Name", passwordHash: await hashVoterPassword("CorrectPassword"), eligible: true });
  mocks.ballot.mockResolvedValue(null);
});
const login = (password = "CorrectPassword") => POST(new Request("https://example.com/api/auth/verify", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: " VOTER001 ", password }),
}));

it("authenticates by normalized username and password and creates a protected session", async () => {
  const response = await login();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true, redirectTo: "/vote" });
  expect(mocks.voter).toHaveBeenCalledWith({ where: { username: "voter001" } });
  expect(mocks.create.mock.calls[0][0].data).toMatchObject({ voterId: "voter", electionId: "election" });
  expect(mocks.set.mock.calls[0][2]).toMatchObject({ httpOnly: true, sameSite: "strict" });
});

it("returns the same error for wrong passwords and unknown usernames", async () => {
  const wrong = await login("wrong");
  mocks.voter.mockResolvedValue(null);
  const unknown = await login();
  expect(wrong.status).toBe(401);
  expect(unknown.status).toBe(401);
  expect(await wrong.json()).toEqual(await unknown.json());
  expect(mocks.create).not.toHaveBeenCalled();
});

it("rejects disabled voters", async () => {
  const voter = await mocks.voter();
  mocks.voter.mockResolvedValue({ ...voter, eligible: false });
  expect((await login()).status).toBe(401);
  expect(mocks.create).not.toHaveBeenCalled();
});

it("preserves duplicate-vote protection", async () => {
  mocks.ballot.mockResolvedValue({ id: "ballot" });
  const response = await login();
  expect(response.status).toBe(409);
  expect((await response.json()).code).toBe("ALREADY_VOTED");
  expect(mocks.create).not.toHaveBeenCalled();
});

it("rejects login outside the voting window before looking up a voter", async () => {
  mocks.closed.mockReturnValue({ message: "Voting is closed" });
  expect((await login()).status).toBe(403);
  expect(mocks.voter).not.toHaveBeenCalled();
  expect(mocks.create).not.toHaveBeenCalled();
});
