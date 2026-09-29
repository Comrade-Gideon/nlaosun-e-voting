import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const transientDatabaseCodes = new Set([
  "P1001", // Can't reach database server
  "P1002", // Database server timed out
  "P1017", // Server has closed the connection
  "P2024", // Timed out fetching a new connection from the pool
  "P2028", // Transaction API error
]);

const transientMessages = [
  "Can't reach database server",
  "Timed out fetching a new connection",
  "Server has closed the connection",
  "Connection terminated",
  "ECONNRESET",
  "ETIMEDOUT",
  // Neon's serverless driver reports a dropped WebSocket this way. Next.js
  // stringifies the event into the message, which is why builds failed with a
  // bare "Error: [object ErrorEvent]".
  "ErrorEvent",
  "WebSocket",
  "fetch failed",
];

export function isTransientDatabaseError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const value = error as { code?: string; message?: string; type?: string; name?: string };
  if (value.code && transientDatabaseCodes.has(value.code)) return true;
  // A raw ErrorEvent carries no Prisma code and an empty message, so it reached
  // neither check above and a single dropped connection aborted the whole build
  // even though the next attempt a second later succeeds.
  if (value.type === "error" || value.name === "ErrorEvent") return true;
  return transientMessages.some(text => value.message?.includes(text));
}

// Budgeted for a Neon scale-to-zero resume, which usually lands within a few
// seconds but can run longer on a fully cold branch. The previous 4.1s ceiling
// expired mid-wake-up, so `next build` prerendered pages with no election data
// instead of waiting for the compute to come back.
const RETRY_DELAYS_MS = [500, 1_500, 3_000, 6_000];

// Upper bound for one attempt. A query that never settles would otherwise keep
// the request open until Cloudflare cancels it as hung; this turns it into an
// ordinary error the page or route handler can report.
const ATTEMPT_TIMEOUT_MS = 20_000;

// Set on an error once a retry loop has used up its attempts, so an outer
// withDatabaseRetry wrapped around queries that the client extension already
// retries rethrows it instead of multiplying the attempts (5 x 5 before).
const retriesExhausted = Symbol.for("nla.db.retriesExhausted");

export class DatabaseTimeoutError extends Error {
  constructor() {
    super(`Database operation did not complete within ${ATTEMPT_TIMEOUT_MS / 1000}s.`);
    this.name = "DatabaseTimeoutError";
  }
}

function markExhausted(error: unknown) {
  if (error && typeof error === "object") {
    try {
      (error as Record<symbol, boolean>)[retriesExhausted] = true;
    } catch {
      // Frozen error objects cannot be tagged; the outer loop then retries once more.
    }
  }
  return error;
}

function isExhausted(error: unknown) {
  return !!error && typeof error === "object" && (error as Record<symbol, boolean>)[retriesExhausted] === true;
}

function withAttemptTimeout<T>(operation: () => Promise<T>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new DatabaseTimeoutError()), ATTEMPT_TIMEOUT_MS);
  });
  return Promise.race([operation(), timeout]).finally(() => clearTimeout(timer));
}

function logAttempt(attempt: number, error: unknown) {
  // Temporary diagnostics for the Cloudflare cross-request investigation. Only
  // the error class/code and a truncated message: never the connection string,
  // query arguments, or anything from the request.
  const value = (error ?? {}) as { name?: string; code?: string; message?: string };
  console.warn(`Database connection is waking up; retrying (attempt ${attempt}).`, {
    scope: currentRequestContext() ? "request" : "process",
    attempt,
    error: value.code ?? value.name,
    message: value.message?.slice(0, 160),
    timestamp: Date.now(),
  });
}

/**
 * Neon suspends idle compute, so the first query after a pause can fail while the
 * branch wakes up. Retrying those connection-level failures keeps the admin panel
 * from reporting a configuration problem for what is really a cold start.
 *
 * Everything here lives in the caller's stack frame: each attempt calls
 * `operation` afresh (so it runs against the current request's client), and no
 * promise or timer is stored anywhere another request could reach it.
 */
export async function withDatabaseRetry<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await withAttemptTimeout(operation);
    } catch (error) {
      lastError = error;
      if (isExhausted(error) || !isTransientDatabaseError(error)) throw error;
      if (attempt === RETRY_DELAYS_MS.length) throw markExhausted(error);
      logAttempt(attempt + 1, error);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
    }
  }
  throw lastError;
}

function createPrismaClient() {
  // Neon's serverless driver over WebSockets rather than Prisma's native engine,
  // which Cloudflare Workers cannot run. WebSockets (not Neon's HTTP mode) because
  // nomination submission and approval use interactive transactions, which the
  // HTTP driver does not support. Works unchanged under Node for local dev.
  //
  // PrismaNeon only holds the config; the Pool and its WebSockets are opened on
  // the first query, inside whichever request makes it. That is why the client
  // must never outlive the request on Workers (see `db` below).
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  return new PrismaClient({ adapter }).$extends({
    query: {
      $allOperations: ({ args, query }) => withDatabaseRetry(() => query(args)),
    },
  });
}

type ExtendedPrismaClient = ReturnType<typeof createPrismaClient>;

/**
 * OpenNext runs every Worker request inside
 * `AsyncLocalStorage.run({ env, ctx, cf }, …)` and exposes the store through this
 * global symbol. The store is a new object per request, which makes it a safe
 * key for per-request resources. It is undefined under `next dev`, `next build`
 * and scripts, which run in Node where sharing a pool is fine.
 */
const cloudflareContextSymbol = Symbol.for("__cloudflare-context__");

function currentRequestContext(): object | undefined {
  const store = (globalThis as Record<symbol, unknown>)[cloudflareContextSymbol];
  return store && typeof store === "object" ? store : undefined;
}

// Workers: one client per request. The WeakMap holds nothing that a later
// request can reach, and entries go away with the request's context object.
const requestClients = new WeakMap<object, ExtendedPrismaClient>();

// Node only (dev server, build, seed scripts): one client per process, kept on
// globalThis so hot reloads do not open a new pool every edit.
const globalForPrisma = globalThis as unknown as { prisma?: ExtendedPrismaClient };

function isWorkersRuntime() {
  return typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";
}

export function getDb(): ExtendedPrismaClient {
  const context = currentRequestContext();
  if (context) {
    let client = requestClients.get(context);
    if (!client) {
      client = createPrismaClient();
      requestClients.set(context, client);
    }
    return client;
  }
  if (isWorkersRuntime()) {
    // Sharing a client here is exactly what caused "Cannot perform I/O on behalf
    // of a different request", so fail loudly instead of falling back.
    throw new Error("Database accessed outside a Cloudflare request context.");
  }
  return (globalForPrisma.prisma ??= createPrismaClient());
}

/**
 * Kept as a stable import for the existing call sites. Every property access
 * resolves the current request's client, so `db.voter.findMany()` in request A
 * and request B run on separate pools even though both import the same `db`.
 * Do not destructure or cache `db.<model>` in module scope.
 */
export const db = new Proxy({} as ExtendedPrismaClient, {
  get(_target, property) {
    const client = getDb();
    const value = Reflect.get(client, property, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
