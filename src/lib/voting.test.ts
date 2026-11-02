import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), create: vi.fn(), updateMany: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: {
  votingSession: { findUnique: mocks.findUnique, updateMany: mocks.updateMany },
  ballot: { create: mocks.create },
} }));

import { submitBallot } from "./voting";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("SESSION_SECRET", "s".repeat(32));
  mocks.findUnique.mockResolvedValue({
    id: "session",
    electionId: "election",
    voterId: "voter",
    usedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    election: {
      status: "PUBLISHED",
      opensAt: new Date(Date.now() - 60_000),
      closesAt: new Date(Date.now() + 60_000),
      positions: [{ id: "position", candidates: [{ id: "candidate" }] }],
    },
  });
  mocks.create.mockResolvedValue({ receipt: "receipt", submittedAt: new Date() });
});

it("submits a valid ballot for the authenticated voter and consumes their session", async () => {
  const selections = [{ positionId: "position", candidateId: "candidate" }];
  const ballot = await submitBallot("session-token", selections);

  expect(ballot.receipt).toBe("receipt");
  expect(mocks.create.mock.calls[0][0].data).toMatchObject({
    electionId: "election",
    voterId: "voter",
    votes: { create: selections },
  });
  expect(mocks.updateMany.mock.calls[0][0]).toMatchObject({
    where: { id: "session", usedAt: null },
  });
});

it("preserves one-vote-per-position validation", async () => {
  const selections = [
    { positionId: "position", candidateId: "candidate" },
    { positionId: "position", candidateId: "candidate" },
  ];
  await expect(submitBallot("session-token", selections)).rejects.toMatchObject({ code: "DUPLICATE_POSITION" });
  expect(mocks.create).not.toHaveBeenCalled();
});
