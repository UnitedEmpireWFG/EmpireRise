export function normLead(lead) {
  return {
    id: lead?.id,
    name: lead?.full_name || lead?.username || "",
    bio: lead?.bio || "",
    tags: Array.isArray(lead?.tags) ? lead.tags.join(" ") : (lead?.tags || "")
  }
}

export function guardText(s, max = 300) {
  if (!s) return ""
  const noLinks = s.replace(/https?:\/\/\S+/gi, "")
  return noLinks.length > max ? noLinks.slice(0, max) : noLinks
}
