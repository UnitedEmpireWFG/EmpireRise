import { Router } from "express";
const r = Router();

r.get("/link", (req, res) => {
  const kind = req.query.kind || "1on1"; // 1on1 | west | east
  const name = encodeURIComponent(req.query.name || "");
  const email = encodeURIComponent(req.query.email || "");
  const base =
    kind === "west" ? process.env.CALENDLY_EVENT_LINK_WEB_WEST :
    kind === "east" ? process.env.CALENDLY_EVENT_LINK_WEB_EAST :
    process.env.CALENDLY_EVENT_LINK_1ON1;
  res.json({ ok: true, url: `${base}?name=${name}&email=${email}` });
});
export default r;
