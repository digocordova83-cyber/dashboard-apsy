import { writeFile } from "node:fs/promises";
import { getCampaignDaily, listCampaigns } from "../server/publya";

const FROM = "2026-06-03";
const TO = "2026-09-13";

const num = (value: unknown) => Number(value ?? 0) || 0;

async function main() {
  const campaigns = await listCampaigns();
  const byCampaign = [];
  const byDate = new Map<string, { budget: number; impressions: number; clicks: number; trueViews: number; videoCompletions: number; conversions: number }>();

  for (const campaign of campaigns) {
    const data = await getCampaignDaily(campaign.id, FROM, TO);
    const rows = data.metrics.filter((row) => String(row.date) >= FROM && String(row.date) <= TO);
    const totals = rows.reduce(
      (acc, row) => {
        acc.budget += num(row.budget);
        acc.impressions += num(row.impressions);
        acc.clicks += num(row.clicks);
        acc.trueViews += num(row.trueViews);
        acc.videoCompletions += num(row.videoCompletions);
        acc.conversions += num(row.conversions);
        const date = String(row.date).slice(0, 10);
        const daily = byDate.get(date) ?? { budget: 0, impressions: 0, clicks: 0, trueViews: 0, videoCompletions: 0, conversions: 0 };
        daily.budget += num(row.budget);
        daily.impressions += num(row.impressions);
        daily.clicks += num(row.clicks);
        daily.trueViews += num(row.trueViews);
        daily.videoCompletions += num(row.videoCompletions);
        daily.conversions += num(row.conversions);
        byDate.set(date, daily);
        return acc;
      },
      { budget: 0, impressions: 0, clicks: 0, trueViews: 0, videoCompletions: 0, conversions: 0 },
    );
    if (totals.budget || totals.impressions || totals.clicks || totals.trueViews || totals.videoCompletions) {
      byCampaign.push({
        id: campaign.id,
        name: campaign.name,
        platform: campaign.platform?.name,
        startDate: campaign.startDate,
        endDate: campaign.endDate,
        status: campaign.status,
        ...totals,
      });
    }
  }

  const totals = byCampaign.reduce(
    (acc, row) => {
      acc.budget += row.budget;
      acc.impressions += row.impressions;
      acc.clicks += row.clicks;
      acc.trueViews += row.trueViews;
      acc.videoCompletions += row.videoCompletions;
      acc.conversions += row.conversions;
      return acc;
    },
    { budget: 0, impressions: 0, clicks: 0, trueViews: 0, videoCompletions: 0, conversions: 0 },
  );

  const result = {
    generatedAt: new Date().toISOString(),
    period: { from: FROM, to: TO },
    campaignsListed: campaigns.length,
    campaignsWithDelivery: byCampaign.length,
    totals,
    byCampaign: byCampaign.sort((a, b) => b.budget - a.budget),
    byDate: Object.fromEntries(Array.from(byDate.entries()).sort(([a], [b]) => a.localeCompare(b))),
  };

  await writeFile("/home/ubuntu/apsy_publya_final.json", `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    campaignsListed: result.campaignsListed,
    campaignsWithDelivery: result.campaignsWithDelivery,
    totals: result.totals,
    byCampaign: result.byCampaign,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
