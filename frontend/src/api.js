import axios from "axios";

const api = axios.create({
  baseURL: "http://localhost:8787",
  timeout: 15000
});

export async function fetchDrafts(limit = 200) {
  // simple view via leads next and messages
  const { data } = await api.get("/api/leads/next");
  return data.leads || [];
}

export async function approveBatch(platform) {
  const { data } = await api.post("/api/approvals/approve", { platform });
  return data;
}

export async function getNextForSend() {
  const { data } = await api.get("/api/outreach/queue");
  return data;
}

export async function markSent(payload) {
  const { data } = await api.post("/api/outreach/mark-sent", payload);
  return data;
}

export default api;
