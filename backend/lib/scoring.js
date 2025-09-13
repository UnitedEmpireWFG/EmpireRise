export function scoreLead(lead) {
  const txt = [
    lead.title || "",
    lead.bio || "",
    (lead.tags || "").toString(),
    lead.source || ""
  ].join(" ").toLowerCase()

  const mustBeCanada =
    (lead.country || "").toLowerCase().includes("canada") ||
    (lead.location || "").toLowerCase().includes("canada") ||
    /,?\s*(ab|bc|mb|nb|nl|ns|nt|nu|on|pe|qc|sk|yt)\b/i.test(lead.location || "")

  if (!mustBeCanada) return { track: "skip", score: 0, notes: "not_canada" }

  const exclude = [
    "financial advisor", "insurance advisor", "investment advisor", "wealth advisor",
    "ifa", "broker", "licensed insurance", "licensed investment",
    "global financial", "gfi", "experior", "xperior", "sun life", "manulife securities",
    "ig wealth", "edward jones", "primerica", "world financial group", "wfg"
  ]
  if (exclude.some(k => txt.includes(k))) {
    return { track: "skip", score: 0, notes: "established_advisor" }
  }

  const recruitHints = [
    "open to work", "seeking opportunities", "career change", "looking for opportunities",
    "personal trainer", "fitness coach", "bank teller", "customer service", "retail",
    "server", "barista", "uber", "doorDash", "gig", "student", "recent grad"
  ]
  const clientHints = [
    "new home", "mortgage", "first home", "rrsp", "tfsa", "resp", "rdsp",
    "debt", "credit card", "interest rate", "life insurance", "term insurance",
    "critical illness", "disability insurance", "retirement", "estate", "funeral"
  ]

  let recruitScore = 0
  for (const k of recruitHints) if (txt.includes(k)) recruitScore += 10
  let clientScore = 0
  for (const k of clientHints) if (txt.includes(k)) clientScore += 10

  let track = "client"
  let score = clientScore
  if (recruitScore > clientScore) { track = "recruit"; score = recruitScore }

  // soft bonus for non senior roles
  if (/assistant|coordinator|associate|teller|cashier|intern|student/.test(txt)) score += 5

  // cap score
  if (score > 100) score = 100

  return { track, score, notes: "ok" }
}

