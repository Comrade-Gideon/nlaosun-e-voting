/**
 * Copies every row from one Neon project into another.
 *
 * Neon cannot relocate a project between regions in place, so moving the
 * database closer to voters is a three-step job: create a new project in the
 * target region, run `prisma migrate deploy` against it to build the schema,
 * then run this script to carry the data across.
 *
 * Safe to re-run. Every insert uses skipDuplicates, so a copy interrupted by a
 * dropped connection resumes where it stopped instead of double-inserting —
 * which matters because the link this runs over is the slow, lossy one that
 * motivated the move in the first place.
 *
 *   SOURCE_DATABASE_URL=postgres://...old... \
 *   TARGET_DATABASE_URL=postgres://...new... \
 *   npm run db:migrate-region
 *
 *   ... npm run db:migrate-region -- --verify   # compare row counts, copy nothing
 */
import { PrismaClient } from "@prisma/client";
import { isTransientDatabaseError } from "../src/lib/db";

/**
 * Parents before children, so a foreign key never points at a row that has not
 * been copied yet. Batch sizes shrink for the models carrying large text
 * columns: nomination invites can still hold base64 passports and transcripts,
 * and a 200-row page of those is tens of megabytes on one round trip.
 */
const COPY_ORDER = [
  { model: "election", batch: 200 },
  { model: "voter", batch: 500 },
  { model: "position", batch: 200 },
  { model: "candidate", batch: 50 },
  { model: "nominationInvite", batch: 10 },
  { model: "votingSession", batch: 500 },
  { model: "ballot", batch: 500 },
  { model: "vote", batch: 1000 },
  { model: "announcement", batch: 25 },
  { model: "adminSession", batch: 500 },
] as const;

type ModelName = (typeof COPY_ORDER)[number]["model"];

// Deliberately more patient than the app's retry budget in src/lib/db.ts. A
// page request should fail fast and let the visitor retry; a migration should
// outlast a cold start and a few retransmits rather than abandon a half-copied
// table.
const RETRY_DELAYS_MS = [1_000, 3_000, 6_000, 12_000, 24_000];

async function withRetry<T>(label: string, operation: () => Promise<T>) {
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isTransientDatabaseError(error) || attempt === RETRY_DELAYS_MS.length)
        throw error;
      const delay = RETRY_DELAYS_MS[attempt];
      console.warn(
        `\n  ${label} failed on a connection error; retrying in ${delay}ms (attempt ${attempt + 1}/${RETRY_DELAYS_MS.length}).`,
      );
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

type Delegate = {
  count: () => Promise<number>;
  findMany: (args: unknown) => Promise<{ id: string }[]>;
  createMany: (args: unknown) => Promise<{ count: number }>;
};

const delegate = (client: PrismaClient, model: ModelName) =>
  (client as unknown as Record<ModelName, Delegate>)[model];

async function copyModel(
  source: PrismaClient,
  target: PrismaClient,
  model: ModelName,
  batch: number,
) {
  const read = delegate(source, model);
  const write = delegate(target, model);

  const total = await withRetry(`count ${model}`, () => read.count());
  if (total === 0) {
    console.log(`  ${model}: empty, nothing to copy`);
    return { model, total, inserted: 0 };
  }

  let cursor: string | undefined;
  let seen = 0;
  let inserted = 0;

  for (;;) {
    const rows = await withRetry(`read ${model}`, () =>
      read.findMany({
        take: batch,
        orderBy: { id: "asc" },
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      }),
    );
    if (rows.length === 0) break;

    const result = await withRetry(`write ${model}`, () =>
      write.createMany({ data: rows, skipDuplicates: true }),
    );

    seen += rows.length;
    inserted += result.count;
    cursor = rows[rows.length - 1].id;
    process.stdout.write(`\r  ${model}: ${seen}/${total} read, ${inserted} inserted`);
  }

  process.stdout.write("\n");
  return { model, total, inserted };
}

async function main() {
  const verifyOnly = process.argv.includes("--verify");
  const sourceUrl = process.env.SOURCE_DATABASE_URL;
  const targetUrl = process.env.TARGET_DATABASE_URL;

  if (!sourceUrl || !targetUrl)
    throw new Error("Set both SOURCE_DATABASE_URL and TARGET_DATABASE_URL.");
  if (sourceUrl === targetUrl)
    throw new Error("SOURCE_DATABASE_URL and TARGET_DATABASE_URL are the same database.");

  const source = new PrismaClient({ datasourceUrl: sourceUrl });
  const target = new PrismaClient({ datasourceUrl: targetUrl });

  try {
    // Fails early with a clear message if `prisma migrate deploy` has not been
    // run against the target yet, rather than part-way through the copy.
    await withRetry("preflight source", () => delegate(source, "election").count());
    await withRetry("preflight target", () => delegate(target, "election").count());

    if (!verifyOnly) {
      console.log("Copying data\n");
      for (const { model, batch } of COPY_ORDER)
        await copyModel(source, target, model, batch);
      console.log("");
    }

    console.log("Row counts\n");
    let mismatched = 0;
    for (const { model } of COPY_ORDER) {
      const [from, to] = await Promise.all([
        withRetry(`count ${model} (source)`, () => delegate(source, model).count()),
        withRetry(`count ${model} (target)`, () => delegate(target, model).count()),
      ]);
      const ok = from === to;
      if (!ok) mismatched += 1;
      console.log(`  ${ok ? "ok  " : "DIFF"} ${model.padEnd(18)} source=${from} target=${to}`);
    }

    if (mismatched > 0)
      throw new Error(
        `${mismatched} table(s) differ between source and target. Re-run to resume; the copy skips rows that already exist.`,
      );
    console.log("\nEvery table matches. Point DATABASE_URL at the new project when ready.");
  } finally {
    await Promise.allSettled([source.$disconnect(), target.$disconnect()]);
  }
}

main().catch(error => {
  console.error("\nMigration failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
