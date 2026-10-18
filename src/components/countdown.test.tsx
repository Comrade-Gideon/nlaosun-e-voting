import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { Countdown } from "./countdown";

afterEach(() => vi.restoreAllMocks());

it("renders identical initial markup even when hydration crosses a second boundary", () => {
  const now = vi.spyOn(Date, "now");
  now.mockReturnValue(new Date("2026-10-18T10:00:00Z").getTime());
  const server = renderToString(createElement(Countdown, { target: "2026-11-12T10:00:00Z" }));
  now.mockReturnValue(new Date("2026-10-18T10:00:02Z").getTime());
  const client = renderToString(createElement(Countdown, { target: "2026-11-12T10:00:00Z" }));
  expect(client).toBe(server);
  expect(server.match(/<b>--<\/b>/g)).toHaveLength(4);
});
