import { PrismaClient } from "@prisma/client";

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
];

export function isTransientDatabaseError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const value = error as { code?: string; message?: string };
  if (value.code && transientDatabaseCodes.has(value.code)) return true;
  return transientMessages.some(text => value.message?.includes(text));
}

const RETRY_DELAYS_MS = [400, 1_200, 2_500];

/**
 * Neon suspends idle compute, so the first query after a pause can fail while the
 * branch wakes up. Retrying those connection-level failures keeps the admin panel
 * from reporting a configuration problem for what is really a cold start.
 */
export async function withDatabaseRetry<T>(operation: () => Promise<T>) {
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isTransientDatabaseError(error) || attempt === RETRY_DELAYS_MS.length)
        throw error;
      console.warn(
        `Database connection is waking up; retrying (attempt ${attempt + 1}).`,
        error instanceof Error ? error.message : error,
      );
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
    }
  }
  throw lastError;
}

function createPrismaClient() {
  return new PrismaClient().$extends({
    query: {
      $allOperations: ({ args, query }) => withDatabaseRetry(() => query(args)),
    },
  });
}

type ExtendedPrismaClient = ReturnType<typeof createPrismaClient>;

const globalForPrisma = globalThis as unknown as {
  prisma?: ExtendedPrismaClient;
};

export const db: ExtendedPrismaClient =
  globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
