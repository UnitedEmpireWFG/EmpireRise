import express from "express";
const router = express.Router();

router.post("/classify", async (req, res) => {
  const { profileText, signals } = req.body || {};
  const text = (profileText || "").toLowerCase();
  let type = "unclear";
  if (text.includes("open to work") || text.includes("career change")) type = "recruit";
  if (text.match(/mortgage|tfsa|rrsp|resp|rdsp|insurance|retirement|debt/)) type = "client";
  if (signals?.role && ["bank teller","insurance adjuster"].includes((signals.role||"").toLowerCase())) type = "recruit";
  res.json({ type, confidence: 0.6 });
});

router.post("/brief", async (req, res) => {
  const { lead } = req.body || {};
  const out = {
    name: lead?.full_name || "Lead",
    likely_path: lead?.type || "unclear",
    province: lead?.province || "",
    topics: lead?.type === "client"
      ? ["mortgage options","RRSP and TFSA blend","insurance needs","debt cleanup"]
      : ["licensing path","income model","time blocks","webinar invite"],
    opener: lead?.type === "client"
      ? "Thanks for booking. I will map your mortgage and protection options, then a simple plan."
      : "Thanks for booking. I will explain the licensing path and how we ramp you to income fast."
  };
  res.json(out);
});

export default router;
