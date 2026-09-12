"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function AdminLoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const form = new FormData(event.currentTarget);
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: form.get("password") }),
      });
      const body = await response
        .json()
        .catch(() => ({
          message: "Administrator login is temporarily unavailable.",
        }));
      if (response.ok) {
        router.push("/admin");
        router.refresh();
      } else setError(body.message || "Invalid administrator credentials.");
    } catch {
      setError(
        "Administrator login is temporarily unavailable. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="login-form" onSubmit={submit}>
      <h1>Administrator Login</h1>
      <p>Sign in to manage the NLA Osun State Chapter election workspace.</p>
      <label>
        Password
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
        />
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button className="button" disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
