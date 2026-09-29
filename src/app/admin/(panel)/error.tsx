"use client";

import { useEffect } from "react";

// Without a boundary, a failed database read in any admin page (for example
// while Neon is resuming) fell through to Next's generic "This page couldn't
// load" screen. This keeps the admin shell and offers a retry instead.
export default function AdminPanelError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error("[admin] page failed to render", error.digest ?? error.name);
  }, [error]);

  return <div className="admin-content">
    <h1>This page is temporarily unavailable</h1>
    <p>The election database could not be reached. Please wait a moment and try again.</p>
    <button type="button" className="button" onClick={() => retry()}>Try again</button>
  </div>;
}
