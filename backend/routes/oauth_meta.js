import express from "express";
import fetch from "node-fetch";
import { supabase } from "../lib/supabase.js";

const router = express.Router();

// Required scopes for FB Page and IG Business
const scopes = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "pages_manage_metadata",
  "instagram_basic",
  "instagram_manage_insights",
  "instagram_content_publish"
].join(",");

// Step 1. Send user to Meta consent
router.get("/start", (req, res) => {
  const u = new URL("https://www.facebook.com/v19.0/dialog/oauth");
  u.searchParams.set("client_id", process.env.FB_APP_ID);
  u.searchParams.set("redirect_uri", process.env.FB_REDIRECT_URI);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", scopes);
  u.searchParams.set("state", "empirerise_" + Math.random().toString(36).slice(2));
  return res.redirect(u.toString());
});

// Step 2. Callback, exchange code for short token, then long lived token, save to Supabase
router.get("/callback", async (req, res) => {
  try {
    if (req.query.error) {
      return res
        .status(400)
        .send(`<h3>Meta error</h3><pre>${JSON.stringify(req.query, null, 2)}</pre>`);
    }
    const code = req.query.code;
    if (!code) return res.status(400).send("Missing code");

    // Short lived user token
    const shortUrl = new URL("https://graph.facebook.com/v19.0/oauth/access_token");
    shortUrl.searchParams.set("client_id", process.env.FB_APP_ID);
    shortUrl.searchParams.set("client_secret", process.env.FB_APP_SECRET);
    shortUrl.searchParams.set("redirect_uri", process.env.FB_REDIRECT_URI);
    shortUrl.searchParams.set("code", code);

    const sRes = await fetch(shortUrl.toString());
    const sJson = await sRes.json();
    if (!sRes.ok) {
      return res
        .status(400)
        .send(`<h3>Short token failed</h3><pre>${JSON.stringify(sJson, null, 2)}</pre>`);
    }

    // Exchange to long lived user token
    const exch = new URL("https://graph.facebook.com/v19.0/oauth/access_token");
    exch.searchParams.set("grant_type", "fb_exchange_token");
    exch.searchParams.set("client_id", process.env.FB_APP_ID);
    exch.searchParams.set("client_secret", process.env.FB_APP_SECRET);
    exch.searchParams.set("fb_exchange_token", sJson.access_token);

    const llRes = await fetch(exch.toString());
    const llJson = await llRes.json();
    if (!llRes.ok) {
      return res
        .status(400)
        .send(`<h3>Long token failed</h3><pre>${JSON.stringify(llJson, null, 2)}</pre>`);
    }

    const expiresAt = llJson.expires_in
      ? new Date(Date.now() + llJson.expires_in * 1000).toISOString()
      : null;

    const { error } = await supabase.from("credentials").insert({
      workspace_id: null,
      provider: "meta_user",
      access_token: llJson.access_token,
      refresh_token: null,
      expires_at: expiresAt
    });
    if (error) return res.status(500).send(error.message);

    return res.send(
      `<h3>Meta connected</h3><pre>${JSON.stringify(llJson, null, 2)}</pre>`
    );
  } catch (e) {
    return res.status(500).send(e.message);
  }
});

export default router;
