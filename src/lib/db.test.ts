import { afterEach, describe, expect, it, vi } from "vitest";
import { getDb, withDatabaseRetry } from "./db";

const contextSymbol = Symbol.for("__cloudflare-context__");
const scope = globalThis as Record<symbol, unknown>;

function inRequest<T>(store: object, run: () => T) {
  scope[contextSymbol] = store;
  try {
    return run();
  } finally {
    delete scope[contextSymbol];
  }
}

afterEach(() => {
  delete scope[contextSymbol];
  vi.useRealTimers();
});

describe("getDb", () => {
  it("gives each Cloudflare request its own client and reuses it within the request", () => {
    const a = {};
    const b = {};
    const first = inRequest(a, getDb);
    expect(inRequest(a, getDb)).toBe(first);
    expect(inRequest(b, getDb)).not.toBe(first);
  });

  it("never hands a request the process-wide client", () => {
    const shared = getDb();
    expect(inRequest({}, getDb)).not.toBe(shared);
  });
});

describe("withDatabaseRetry", () => {
  const transient = () => Object.assign(new Error("Connection terminated"), { code: "P1017" });

  it("rethrows permanent errors without retrying", async () => {
    const operation = vi.fn().mockRejectedValue(Object.assign(new Error("Unique"), { code: "P2002" }));
    await expect(withDatabaseRetry(operation)).rejects.toThrow("Unique");
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("retries transient errors until one succeeds", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const operation = vi.fn().mockRejectedValueOnce(transient()).mockResolvedValue("ok");
    const result = withDatabaseRetry(operation);
    await vi.runAllTimersAsync();
    await expect(result).resolves.toBe("ok");
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("does not multiply attempts when retries are nested", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const inner = vi.fn().mockRejectedValue(transient());
    const result = withDatabaseRetry(() => withDatabaseRetry(inner));
    const settled = expect(result).rejects.toThrow("Connection terminated");
    await vi.runAllTimersAsync();
    await settled;
    expect(inner).toHaveBeenCalledTimes(5);
  });

  it("fails an attempt that never settles instead of hanging the request", async () => {
    vi.useFakeTimers();
    const result = withDatabaseRetry(() => new Promise(() => {}));
    const settled = expect(result).rejects.toThrow("did not complete");
    await vi.runAllTimersAsync();
    await settled;
  });
});
