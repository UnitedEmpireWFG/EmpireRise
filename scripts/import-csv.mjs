import fs from "fs";
import fetch from "node-fetch";

if (process.argv.length < 3) {
  console.error("Usage: node scripts/import-csv.mjs path/to/leads.csv");
  process.exit(1);
}
const csv = fs.readFileSync(process.argv[2], "utf8");
const r = await fetch("http://localhost:8787/api/leads/import/csv", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ csv })
});
const json = await r.json();
console.log(json);
