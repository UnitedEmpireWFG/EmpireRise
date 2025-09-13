import express from "express";
import fetch from "node-fetch";
import { supabase } from "../lib/supabase.js";
import { getPageToken, fbPagePost, igCreateMedia, igPublish } from "../lib/meta.js";

const router = express.Router();

async function getUserToken() {
  const { data } = await supabase
    .from("credentials")
    .select("*")
    .eq("provider", "meta_user")
    .order("created_at", { ascending: false })
    .limit(1);
  return data && data[0] && data[0].access_token;
}

router.post("/page-post", async (req, res) => {
  try {
    const userToken = await getUserToken();
    if (!userToken) return res.status(400).json({ error: "No Meta user token. Connect first." });

    const pageId = req.body.pageId || process.env.META_PAGE_ID;
    if (!pageId) return res.status(400).json({ error: "Missing pageId" });

    const message = req.body.message || "Hello from EmpireRise";

    const pageToken = await getPageToken(userToken, pageId);
    const out = await fbPagePost(pageId, pageToken, message);
    res.json({ ok: true, out });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/ig-photo", async (req, res) => {
  try {
    const userToken = await getUserToken();
    if (!userToken) return res.status(400).json({ error: "No Meta user token. Connect first." });

    const igId = req.body.igId || process.env.META_IG_ID;
    if (!igId) return res.status(400).json({ error: "Missing igId" });

    const imageUrl = req.body.imageUrl;
    if (!imageUrl) return res.status(400).json({ error: "Missing imageUrl" });

    const caption = req.body.caption || "";

    // Use a Page token for IG Business publish
    const pageId = req.body.pageId || process.env.META_PAGE_ID;
    if (!pageId) return res.status(400).json({ error: "Missing pageId for IG publish" });

    const pageToken = await getPageToken(userToken, pageId);
    const created = await igCreateMedia(igId, pageToken, imageUrl, caption);
    const pub = await igPublish(igId, pageToken, created.id);
    res.json({ ok: true, created, pub });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
