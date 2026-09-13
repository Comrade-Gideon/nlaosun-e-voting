import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";

// Pages with `revalidate` (home, candidates, election, results, announcements)
// keep their regenerated copies in the NEXT_INC_CACHE_R2_BUCKET binding declared
// in wrangler.jsonc, so a refreshed page survives across Worker isolates.
export default defineCloudflareConfig({
  incrementalCache: r2IncrementalCache,
});
