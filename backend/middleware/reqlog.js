import { supa } from "../lib/supabase.js";

export async function reqlog(req, res, next) {
  const startedAt = Date.now();

  // Continue request, then log on finish
  res.on("finish", async () => {
    try {
      const duration_ms = Date.now() - startedAt;

      // Build a safe, small log payload
      const log = {
        method: req.method,
        path: req.originalUrl || req.url,
        status: res.statusCode,
        duration_ms,
        ip: req.headers["x-forwarded-for"] || req.socket?.remoteAddress || null,
        ua: req.headers["user-agent"] || null,
        created_at: new Date().toISOString()
      };

      // Insert into a table if you created one, else skip
      // Uncomment after you create table `request_logs`
      // await supa.from("request_logs").insert(log);

      // Or keep an in-memory console trace
      console.log(`[REQ] ${log.method} ${log.path} -> ${log.status} in ${log.duration_ms}ms`);
    } catch (e) {
      console.error("reqlog error:", e?.message || String(e));
    }
  });

  next();
}

export default reqlog;

