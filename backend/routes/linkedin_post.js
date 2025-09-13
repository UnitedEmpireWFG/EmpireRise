import express from "express";
import fetch from "node-fetch";
import { getLinkedInToken } from "../lib/tokens.js";

const router = express.Router();

// Get current user to build the author URN
async function getMe(token) {
  const r = await fetch("https://api.linkedin.com/v2/userinfo", {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

// Simple text post to your profile feed
router.post("/share", async (req, res) => {
  try {
    const token = await getLinkedInToken(null);
    if (!token) return res.status(400).json({ error: "No LinkedIn token. Connect first." });

    const me = await getMe(token);
    const authorUrn = `urn:li:person:${me.sub}`;

    const text = req.body?.text || "Hello from EmpireRise";
    const body = {
      author: authorUrn,
      commentary: text,
      visibility: "PUBLIC",
      distribution: { feedDistribution: "MAIN_FEED" },
      lifecycleState: "PUBLISHED"
    };

    const r = await fetch("https://api.linkedin.com/rest/posts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "LinkedIn-Version": "202406",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    const out = await r.json();
    if (!r.ok) return res.status(400).json({ error: out });
    res.json({ ok: true, post: out });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
