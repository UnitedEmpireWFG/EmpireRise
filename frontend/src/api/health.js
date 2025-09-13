  const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:8787";

  export async function getHealthFull() {
    const r = await fetch(`${API}/api/health/full`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }