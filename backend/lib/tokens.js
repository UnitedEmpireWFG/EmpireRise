import fetch from "node-fetch";
import { supabase } from "./supabase.js";

export async function getLinkedInToken(workspace_id = null) {
  const { data, error } = await supabase
    .from("credentials")
    .select("*")
    .eq("provider", "linkedin")
    .eq("workspace_id", workspace_id)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) throw new Error(error.message);
  const tok = data && data[0];
  if (!tok) return null;

  const soon = Date.now() + 60_000;
  const exp = tok.expires_at ? new Date(tok.expires_at).getTime() : null;
  if (exp && exp < soon && tok.refresh_token) {
    const n = await refreshLinkedIn(tok.refresh_token);
    if (n?.access_token) {
      const expiresAt = n.expires_in
        ? new Date(Date.now() + n.expires_in * 1000).toISOString()
        : null;
      await supabase.from("credentials").insert({
        workspace_id: tok.workspace_id,
        provider: "linkedin",
        access_token: n.access_token,
        refresh_token: n.refresh_token || tok.refresh_token,
        expires_at: expiresAt
      });
      return n.access_token;
    }
  }
  return tok.access_token;
}

export async function refreshLinkedIn(refresh_token) {
  const url = "https://www.linkedin.com/oauth/v2/accessToken";
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token,
    client_id: process.env.LINKEDIN_CLIENT_ID,
    client_secret: process.env.LINKEDIN_CLIENT_SECRET
  });
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`LinkedIn refresh failed: ${t}`);
  }
  return r.json();
}

