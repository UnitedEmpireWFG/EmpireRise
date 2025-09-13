import express from "express";
import fetch from "node-fetch";
import { supabase } from "../lib/supabase.js";

const router = express.Router();

// Use OpenID Connect scopes plus posting
const scopes = [
  "openid",
  "profile",
  "w_member_social"
].join(" ");

router.get("/start", (req, res) => {
  const redirect = process.env.LINKEDIN_REDIRECT_URI;

  const u = new URL("https://www.linkedin.com/oauth/v2/authorization");
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", process.env.LINKEDIN_CLIENT_ID);
  u.searchParams.set("redirect_uri", redirect);
  u.searchParams.set("scope", scopes);
  u.searchParams.set("state", "empirerise_" + Math.random().toString(36).slice(2));
  res.redirect(u.toString());
});

router.get("/callback", async (req, res) => {
  try {
    if (req.query.error) {
      return res
        .status(400)
        .send(`<h3>LinkedIn error</h3><pre>${JSON.stringify(req.query, null, 2)}</pre>`);
    }
    if (!req.query.code) {
      return res
        .status(400)
        .send(`<h3>Missing code</h3><pre>${JSON.stringify(req.query, null, 2)}</pre>`);
    }

    const code = req.query.code;

    const tokenUrl = "https://www.linkedin.com/oauth/v2/accessToken";
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: process.env.LINKEDIN_REDIRECT_URI,
      client_id: process.env.LINKEDIN_CLIENT_ID,
      client_secret: process.env.LINKEDIN_CLIENT_SECRET
    });

    const r = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });
    const json = await r.json();
    if (!r.ok) {
      return res
        .status(400)
        .send(`<h3>Token exchange failed</h3><pre>${JSON.stringify(json, null, 2)}</pre>`);
    }

    const expiresAt = json.expires_in
      ? new Date(Date.now() + json.expires_in * 1000).toISOString()
      : null;

    const { error } = await supabase.from("credentials").insert({
      workspace_id: null,
      provider: "linkedin",
      access_token: json.access_token,
      refresh_token: json.refresh_token || null,
      expires_at: expiresAt
    });
    if (error) return res.status(500).send(error.message);

    res.send(`<h3>LinkedIn connected</h3><pre>${JSON.stringify(json, null, 2)}</pre>`);
  } catch (e) {
    res.status(500).send(e.message);
  }
});

export default router;
