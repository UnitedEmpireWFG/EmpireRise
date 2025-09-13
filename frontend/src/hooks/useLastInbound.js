import { useEffect, useState } from "react";

export function useLastInbound(contactId) {
  const [text, setText] = useState("");
  useEffect(() => {
    let alive = true;
    async function run() {
      try {
        if (!contactId) { setText(""); return; }
        const r = await fetch(`/api/context/last-inbound/${contactId}`);
        const j = await r.json();
        if (!alive) return;
        setText(j?.last?.body || "");
      } catch { /* ignore */ }
    }
    run();
    return () => { alive = false; };
  }, [contactId]);
  return text;
}