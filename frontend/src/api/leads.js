import api from "./client.js"

export async function fetchLeads({ q = "", limit = 50 } = {}) {
  const r = await api.get(`/api/leads/list?q=${encodeURIComponent(q)}&limit=${limit}`);
  return r.data.items || [];
}

export async function setDnc(leadId, dnc) {
  const r = await api.post("/api/leads/dnc", { lead_id: leadId, dnc: !!dnc });
  return r.data;
}