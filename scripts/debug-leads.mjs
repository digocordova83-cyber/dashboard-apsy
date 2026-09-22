// Investiga divergência de leads Meta: compara actions_lead vs fb_pixel_lead vs conversions por campanha (ontem)
const KEY = process.env.WINDSOR_API_KEY;
const ACCOUNT = "1977935416423618";
const BASE = "https://connectors.windsor.ai/facebook";

async function q(fields, extra = {}) {
  const params = new URLSearchParams({
    api_key: KEY,
    select_accounts: ACCOUNT,
    date_from: "2026-07-24",
    date_to: "2026-07-24",
    fields: fields.join(","),
    ...extra,
  });
  const r = await fetch(`${BASE}?${params}`);
  if (!r.ok) {
    console.log("HTTP", r.status, (await r.text()).slice(0, 300));
    return [];
  }
  const j = await r.json();
  return j.data || [];
}

const fields = [
  "campaign",
  "spend",
  "actions_lead",
  "actions_offsite_conversion_fb_pixel_lead",
  "actions_onsite_conversion_lead_grouped",
  "actions_leadgen_grouped",
  "actions_onsite_conversion_messaging_conversation_started_7d",
  "results",
  "conversions",
];

// tenta com todos os campos; se der 400, tenta um a um
let rows = await q(fields);
if (!rows.length) {
  console.log("Query completa falhou; testando campos individualmente...");
  const okFields = ["campaign", "spend"];
  for (const f of fields.slice(2)) {
    const r = await q(["campaign", f]);
    if (r.length) okFields.push(f);
    console.log(f, r.length ? "OK" : "FALHOU");
  }
  rows = await q(okFields);
}
console.log(JSON.stringify(rows, null, 1));
