import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ upsert: vi.fn(), authenticated: vi.fn() }));
vi.mock("@/lib/admin-auth", () => ({ isAdminAuthenticated: mocks.authenticated }));
vi.mock("@/lib/db", () => ({
  db: { voter: { upsert: mocks.upsert } },
  withDatabaseRetry: <T>(operation: () => Promise<T>) => operation(),
}));
import { POST } from "./route";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.authenticated.mockResolvedValue(true);
  mocks.upsert.mockResolvedValue({});
});
function upload(csv: string) {
  const form = new FormData();
  form.set("file", new File([csv], "voters.csv", { type: "text/csv" }));
  return POST(new Request("https://example.com/api/admin/electorates/import", { method: "POST", body: form }));
}

it("imports username/password/fullname and stores the exact password", async () => {
  const response = await upload('username,password,fullname\nVoter001,"Secret,Password","Adebayo, Tunde"\n');
  expect(await response.json()).toEqual({ imported: 1, errors: [] });
  const { where, create, update } = mocks.upsert.mock.calls[0][0];
  expect(where).toEqual({ username: "voter001" });
  expect(create.displayName).toBe("Adebayo, Tunde");
  expect(create.password).toBe("Secret,Password");
  expect(create).not.toHaveProperty("passwordHash");
  expect(create).not.toHaveProperty("eligible");
  expect(update).toEqual(create);
});

it("imports multiple voters while keeping every password exact", async () => {
  const response = await upload('username,password,fullname\none, pass one ,First Voter\ntwo,"pass, two",Second Voter\n');
  expect(await response.json()).toEqual({ imported: 2, errors: [] });
  expect(mocks.upsert.mock.calls.map(call => call[0].create.password)).toEqual([" pass one ", "pass, two"]);
});

it("respects optional eligibility", async () => {
  const response = await upload("Username,Password,Full Name,Eligible\nvoter002,Secret,Bello Maryam,false\n");
  expect(await response.json()).toEqual({ imported: 1, errors: [] });
  expect(mocks.upsert.mock.calls[0][0].create).toMatchObject({ username: "voter002", displayName: "Bello Maryam", eligible: false });
});

it("rejects the old schema with a clear message", async () => {
  const response = await upload("Phone Number,Full Name,Surname\n08031234567,Adebayo Tunde,Adebayo\n");
  expect(response.status).toBe(400);
  expect((await response.json()).message).toContain("username, password and fullname");
  expect(mocks.upsert).not.toHaveBeenCalled();
});

it("rejects unauthorized imports", async () => {
  mocks.authenticated.mockResolvedValue(false);
  expect((await upload("username,password,fullname\nvoter,Secret,Full Name")).status).toBe(401);
  expect(mocks.upsert).not.toHaveBeenCalled();
});

it("redacts supplied passwords from import failure logs", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.upsert.mockRejectedValue(new Error("database rejected SecretPassword"));
  try {
    const response = await upload("username,password,fullname\nvoter,SecretPassword,Full Name\n");
    expect(response.status).toBe(503);
    expect(JSON.stringify(log.mock.calls)).not.toContain("SecretPassword");
  } finally {
    log.mockRestore();
  }
});
