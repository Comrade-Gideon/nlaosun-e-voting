import { db, withDatabaseRetry } from "@/lib/db";

const officeHierarchy = [
  ["president"],
  ["vice-president"],
  ["general-secretary"],
  ["assistant-general-secretary", "assistant-secretary"],
  ["financial-secretary"],
  ["social-director", "director-of-social", "director-of-socials"],
  ["welfare-director", "director-of-welfare"],
  ["public-relations-officer", "public-relation-officer", "pro"],
  ["sports-director", "sport-director", "director-of-sport", "director-of-sports"],
] as const;

const officeRank = new Map<string, number>(
  officeHierarchy.flatMap((aliases, index) => aliases.map((alias) => [alias, index] as const)),
);

const normalizeOffice = (value: string) => value
  .trim()
  .toLowerCase()
  .replace(/&/g, "and")
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/(^-|-$)/g, "");

type OrderedPosition = { slug?: string; title: string; sortOrder?: number };

export function compareNalissOffices(left: OrderedPosition, right: OrderedPosition) {
  const leftRank = officeRank.get(normalizeOffice(left.slug || left.title)) ?? 1000 + (left.sortOrder ?? 0);
  const rightRank = officeRank.get(normalizeOffice(right.slug || right.title)) ?? 1000 + (right.sortOrder ?? 0);
  return leftRank - rightRank || left.title.localeCompare(right.title);
}

export function sortNalissOffices<T extends OrderedPosition>(positions: readonly T[]) {
  return [...positions].sort(compareNalissOffices);
}

export function electionState(opensAt: Date, closesAt: Date, now = new Date()) {
  if (now < opensAt) return "upcoming" as const;
  if (now > closesAt) return "closed" as const;
  return "open" as const;
}

export function formatWat(value: Date) {
  return new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Africa/Lagos", timeZoneName: "short" }).format(value);
}

/**
 * Election scalars only, with no positions or candidates attached. The full loader
 * below pulls every candidate biography, manifesto, vision and mission (~3 KB a row)
 * even for callers that never read them; on Neon's metered egress that turns a
 * sub-kilobyte request into a 20 KB one.
 */
export async function getPublishedElectionSummary() {
  return withDatabaseRetry(() => db.election.findFirst({
    where: { status: "PUBLISHED" },
    orderBy: { opensAt: "desc" },
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      opensAt: true,
      closesAt: true,
      status: true,
      showCountdown: true,
      resultsPublishedAt: true,
    },
  }));
}

/**
 * Positions with a candidate id list, for callers that show position cards and a
 * candidate tally but render no candidate detail. Keeps the full text out of a
 * page that only reads `position.candidates.length`.
 */
export async function getPublishedElectionOverview() {
  const election = await withDatabaseRetry(() => db.election.findFirst({
    where: { status: "PUBLISHED" },
    orderBy: { opensAt: "desc" },
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      opensAt: true,
      closesAt: true,
      status: true,
      showCountdown: true,
      resultsPublishedAt: true,
      positions: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          slug: true,
          title: true,
          description: true,
          sortOrder: true,
          candidates: { select: { id: true } },
        },
      },
    },
  }));
  return election ? { ...election, positions: sortNalissOffices(election.positions) } : null;
}

export async function getPublishedElection() {
  const election = await withDatabaseRetry(() => db.election.findFirst({
    where: { status: "PUBLISHED" },
    orderBy: { opensAt: "desc" },
    include: {
      positions: {
        orderBy: { sortOrder: "asc" },
        include: { candidates: { orderBy: { name: "asc" } } },
      },
    },
  }));
  return election ? { ...election, positions: sortNalissOffices(election.positions) } : null;
}
