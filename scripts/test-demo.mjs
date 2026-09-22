import "dotenv/config";
const key = process.env.WINDSOR_API_KEY;
const tests = [
  "age,gender,spend,impressions,clicks,link_clicks,actions_lead,actions_omni_purchase,action_values_omni_purchase",
  "age,gender,spend,impressions,clicks,link_clicks",
  "age,gender,spend,impressions,clicks,actions_lead,actions_omni_purchase,action_values_omni_purchase",
];
for (const fields of tests) {
  const u = new URL("https://connectors.windsor.ai/facebook");
  u.searchParams.set("api_key", key);
  u.searchParams.set("date_from", "2026-06-25");
  u.searchParams.set("date_to", "2026-07-24");
  u.searchParams.set("fields", fields);
  u.searchParams.set("select_accounts", "act_1977935416423618");
  const r = await fetch(u);
  const t = await r.text();
  console.log(fields.slice(0,60), "->", r.status, r.status !== 200 ? t.slice(0,150) : JSON.parse(t).data.length + " rows");
}
