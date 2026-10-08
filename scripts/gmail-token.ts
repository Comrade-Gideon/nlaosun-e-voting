/**
 * One-off helper: exchanges a Google OAuth consent for a refresh token.
 *
 *   GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... npm run gmail:token
 *
 * Google removed the copy-paste ("out of band") flow, so consent must come back
 * to a redirect URI. This starts a throwaway server on 127.0.0.1, prints the
 * consent URL, catches the redirect and prints the refresh token.
 *
 * Add http://localhost:53682/callback as an authorised redirect URI on the OAuth
 * client first, or Google rejects the request with redirect_uri_mismatch.
 *
 * Only gmail.send is requested — permission to send, not to read the mailbox.
 */
import { createServer } from "node:http";
import { readFileSync, writeFileSync } from "node:fs";

const PORT = 53682;
const REDIRECT_URI = "https://vote.nlaosun.workers.dev/callback";
const SCOPE = "https://www.googleapis.com/auth/gmail.send";

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error("Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET before running this.");
  process.exit(1);
}

const consentUrl =
  "https://accounts.google.com/o/oauth2/v2/auth?" +
  new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: SCOPE,
    // offline + consent together are what make Google return a refresh token;
    // without them you get only a one-hour access token.
    access_type: "offline",
    prompt: "consent",
  });

console.log(`Register ${REDIRECT_URI} under Authorized redirect URIs for this OAuth client.`);
console.log("If the OAuth app is in Testing, add the sender Gmail address under Google Auth Platform > Audience > Test users.");
console.log("\n1. Open this URL in a browser and approve access:\n");
console.log(consentUrl);
console.log(`\n2. Waiting for the redirect on ${REDIRECT_URI} …\n`);

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://localhost:${PORT}`);
  if (url.pathname !== "/callback") {
    response.writeHead(404).end("Not found");
    return;
  }

  const error = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  if (error || !code) {
    response.writeHead(400, { "content-type": "text/plain" }).end(`Authorisation failed: ${error ?? "no code"}`);
    console.error(`\nAuthorisation failed: ${error ?? "no code returned"}`);
    server.close();
    process.exit(1);
  }

  const exchange = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });
  const body = (await exchange.json().catch(() => null)) as
    | { refresh_token?: string; error_description?: string; error?: string }
    | null;

  if (!exchange.ok || !body?.refresh_token) {
    const reason = body?.error_description || body?.error || `HTTP ${exchange.status}`;
    response.writeHead(500, { "content-type": "text/plain" }).end(`Token exchange failed: ${reason}`);
    console.error(`\nToken exchange failed: ${reason}`);
    if (exchange.ok) console.error("No refresh_token came back — revoke prior access and retry so Google re-prompts.");
    server.close();
    process.exit(1);
  }

  response
    .writeHead(200, { "content-type": "text/html" })
    .end("<p style='font:16px system-ui;padding:40px'>Done. Return to your terminal — you can close this tab.</p>");

  const envPath = ".env.local";
  const existing = readFileSync(envPath, "utf8");
  const entry = `GOOGLE_REFRESH_TOKEN=${JSON.stringify(body.refresh_token)}`;
  const updated = /^GOOGLE_REFRESH_TOKEN=.*$/m.test(existing)
    ? existing.replace(/^GOOGLE_REFRESH_TOKEN=.*$/m, () => entry)
    : `${existing.trimEnd()}\n${entry}\n`;
  writeFileSync(envPath, updated, { mode: 0o600 });
  console.log("Saved GOOGLE_REFRESH_TOKEN in .env.local. Restart the local app.");
  console.log("Update the live Worker's GOOGLE_REFRESH_TOKEN secret with the new value from .env.local.");
  console.log("The token can expire or be revoked; reauthorize if Google returns invalid_grant.");
  server.close();
  process.exit(0);
});

server.listen(PORT, "127.0.0.1");
