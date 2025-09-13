import fetch from "node-fetch";
const r = await fetch("http://localhost:8787/api/outreach/queue");
console.log(await r.json());
