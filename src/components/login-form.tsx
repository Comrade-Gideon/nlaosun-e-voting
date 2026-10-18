"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/verify", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: data.get("username"), password: data.get("password") }),
      });
      const body = await response.json().catch(() => ({}));
      if (response.ok) router.push(body.redirectTo);
      else setError(body.message || "We could not sign you in. Please try again.");
    } catch {
      setError("Could not reach the login service. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return <form className="login-form" onSubmit={submit}>
    <h1>Voter Login</h1>
    <div className="badges"><span>Verified Voting</span><span>Identity Protected</span></div>
    <label>Username<input required name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={100} placeholder="Enter your username" /></label>
    <label>Password<input required name="password" type="password" autoComplete="current-password" maxLength={256} placeholder="Enter your password" /></label>
    {error && <p className="error" role="alert">{error}</p>}
    <button className="button" disabled={busy}>{busy ? "Signing in…" : "Log In →"}</button>
    <p className="notice">Use the username and password issued to you by the Election Committee.</p>
  </form>;
}
