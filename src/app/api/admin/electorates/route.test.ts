import { beforeEach, expect, it, vi } from "vitest";
import { verifyVoterPassword } from "@/lib/voter-credentials";

const mocks = vi.hoisted(() => ({ authenticated: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/admin-auth", () => ({ isAdminAuthenticated: mocks.authenticated }));
vi.mock("@/lib/db", () => ({ db: { voter: mocks }, withDatabaseRetry: <T>(operation: () => Promise<T>) => operation() }));
import { POST, PATCH } from "./route";
const safeVoter = { id: "voter", username: "voter001", displayName: "Full Voter Name", eligible: true };
const request = (method: string, body: object) => new Request("https://example.com/api/admin/electorates", {
  method, headers: { "content-type": "application/json" }, body: JSON.stringify(body),
});
beforeEach(() => {
  vi.resetAllMocks();
  mocks.authenticated.mockResolvedValue(true);
  mocks.create.mockResolvedValue(safeVoter);
  mocks.update.mockResolvedValue(safeVoter);
});

it("creates username credentials and only returns public voter fields", async () => {
  mocks.findUnique.mockResolvedValue(null);
  const response = await POST(request("POST", { username: "VOTER001", password: "ExactPassword", displayName: safeVoter.displayName }));
  expect(response.status).toBe(201);
  expect(await response.json()).toEqual(safeVoter);
  const { data, select } = mocks.create.mock.calls[0][0];
  expect(data.username).toBe("voter001");
  expect(await verifyVoterPassword("ExactPassword", data.passwordHash)).toBe(true);
  expect(select).toEqual({ id: true, displayName: true, username: true, eligible: true });
});

it("keeps an existing password when only the full name changes", async () => {
  mocks.findUnique.mockResolvedValue(safeVoter);
  const response = await PATCH(request("PATCH", { id: "voter", displayName: "Corrected Full Name" }));
  expect(response.status).toBe(200);
  expect(mocks.update.mock.calls[0][0].data).toMatchObject({ displayName: "Corrected Full Name", passwordHash: undefined });
  expect(mocks.update.mock.calls[0][0].select).not.toHaveProperty("passwordHash");
});

it("rejects unauthorized account creation", async () => {
  mocks.authenticated.mockResolvedValue(false);
  expect((await POST(request("POST", {}))).status).toBe(401);
  expect(mocks.create).not.toHaveBeenCalled();
});
