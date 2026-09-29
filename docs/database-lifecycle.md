# Database lifecycle

`src/lib/db.ts` exports `db`, a proxy that resolves the right Prisma client on
every property access. Call sites use it like an ordinary `PrismaClient`.

## On Cloudflare Workers: one client per request

Workers forbid one request from using a socket or promise created by another
("Cannot perform I/O on behalf of a different request"). The original Node-style
module singleton broke that rule: the Neon adapter opens its WebSocket pool on
the first query, and every later request in the isolate reused it.

OpenNext runs each request inside `AsyncLocalStorage.run({ env, ctx, cf }, …)`
and exposes the store at `globalThis[Symbol.for("__cloudflare-context__")]`. The
store is a new object per request, so `db.ts` keys a `WeakMap` on it: the first
query of a request creates that request's client and pool, and later queries in
the same request share it. Nothing reaches another request, and the entry goes
away with the request. If the Workers runtime is detected with no request
context, `getDb()` throws instead of silently sharing a client.

## In Node (`next dev`, `next build`, `next start`, scripts): one client per process

Node has no cross-request I/O rule, so a single pooled client is kept on
`globalThis` (which also survives dev hot reloads).

## Do not open a client per query

A per-operation design (new client, pool and WebSocket for every query, closed
afterwards) was tried on 2026-09-29 and reverted the same day. An admin page
issues dozens of queries at once; opening that many WebSockets simultaneously
failed 14–16 of 40 in testing, surfacing as `ErrorEvent` / "Database connection
is waking up" and "Administrator session lookup failed". A per-request pool
opens at most 10 connections and reuses them.

## Retries and timeouts

`withDatabaseRetry` retries connection-level failures (Neon resuming from
scale-to-zero, dropped WebSockets) after 0.5s, 1.5s, 3s and 6s, then gives up.
Permanent errors (unique violations, validation) are rethrown at once. Each
attempt is bounded at 20s so a stuck query becomes an error instead of a hung
request. The client extension retries every query; an error that exhausted
those retries is tagged so an outer `withDatabaseRetry` rethrows it rather than
multiplying the attempts.

## Local networks without IPv6

The Neon hostname resolves to IPv6 and IPv4 addresses. Node tries each with a
250ms timeout by default; on a machine without an IPv6 route (e.g. WSL) and a
slow link, many simultaneous connections miss that window and fail with
`AggregateError` (`ENETUNREACH` on IPv6, `ETIMEDOUT` on IPv4). The `dev`,
`build` and `start` scripts therefore set
`NODE_OPTIONS=--network-family-autoselection-attempt-timeout=2000`, which took
the failure rate from 14–16 of 40 concurrent queries to 0. Workers are
unaffected; they do not use Node's socket stack.
