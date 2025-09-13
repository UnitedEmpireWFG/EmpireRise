import fetch from "node-fetch";
const r = await fetch("http://localhost:8787/api/approvals/approve", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({})
});
console.log(await r.json());
