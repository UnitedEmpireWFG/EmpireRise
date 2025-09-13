  import express from "express";
  import supabase from "../lib/supabase.js";
  import OpenAI from "openai";

  const router = express.Router();

  router.get("/", async (_req, res) => {
    const out = { openai: "unknown", supabase: "unknown", calendly: "unknown" };

    // OpenAI
    try {
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      // lightweight check: list models (will 200 if key is valid)
      await client.models.list();
      out.openai = "ok";
    } catch (e) {
      out.openai = `err: ${e?.status || ""}`;
    }

    // Supabase
    try {
      const { error } = await supabase.rpc("now"); // or a cheap query
      out.supabase = error ? `err: ${error.code}` : "ok";
    } catch (e) {
      out.supabase = "err";
    }

    // Calendly (ok if key set)
    out.calendly = process.env.CALENDLY_API_KEY ? "ok" : "unset";

    res.json({ ok: true, health: out });
  });

export default router;
