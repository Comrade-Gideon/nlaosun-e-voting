"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

export function VoterLogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function logout() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) {
        setError("Could not log you out. Please try again.");
        return;
      }
      router.replace("/login");
      router.refresh();
    } catch {
      setError("Could not log you out. Please check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="voter-logout">
    <button type="button" className="button ghost" disabled={busy} onClick={logout}>
      <LogOut size={17} aria-hidden="true" />{busy ? "Logging out…" : "Log out"}
    </button>
    {error && <p className="error" role="alert">{error}</p>}
  </div>;
}
