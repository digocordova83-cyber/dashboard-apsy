import { getCampaignDaily, listCampaigns } from "../server/publya";

function brtDate(): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

const dateTo = brtDate();
const dateFrom = `${dateTo.slice(0, 7)}-01`;
const campaigns = await listCampaigns();
const checks: Array<Record<string, unknown>> = [];

for (const campaign of campaigns) {
  try {
    const response = await getCampaignDaily(campaign.id, dateFrom, dateTo);
    const dates = response.metrics
      .map((metric) => metric.date)
      .filter((date): date is string => /^\d{4}-\d{2}-\d{2}$/.test(String(date)))
      .sort();
    const delivered = response.metrics.filter((metric) =>
      [metric.budget, metric.impressions, metric.clicks, metric.trueViews, metric.videoStarts, metric.videoCompletions]
        .some((value) => Number(value ?? 0) > 0),
    );
    const deliveredDates = delivered
      .map((metric) => metric.date)
      .filter((date): date is string => /^\d{4}-\d{2}-\d{2}$/.test(String(date)))
      .sort();
    const totalBudget = response.metrics.reduce((sum, metric) => sum + Number(metric.budget ?? 0), 0);
    const totalImpressions = response.metrics.reduce((sum, metric) => sum + Number(metric.impressions ?? 0), 0);
    const totalClicks = response.metrics.reduce((sum, metric) => sum + Number(metric.clicks ?? 0), 0);
    const totalTrueViews = response.metrics.reduce((sum, metric) => sum + Number(metric.trueViews ?? 0), 0);
    const totalVideoStarts = response.metrics.reduce((sum, metric) => sum + Number(metric.videoStarts ?? 0), 0);
    const totalVideoCompletions = response.metrics.reduce((sum, metric) => sum + Number(metric.videoCompletions ?? 0), 0);
    checks.push({
      status: "ok",
      id: campaign.id,
      name: campaign.name,
      platform: campaign.platform?.name ?? null,
      campaignStartDate: campaign.startDate,
      campaignEndDate: campaign.endDate,
      rows: response.metrics.length,
      deliveredRows: delivered.length,
      firstDataDate: dates.at(0) ?? null,
      lastDataDate: dates.at(-1) ?? null,
      firstDeliveredDate: deliveredDates.at(0) ?? null,
      lastDeliveredDate: deliveredDates.at(-1) ?? null,
      budget: totalBudget,
      impressions: totalImpressions,
      clicks: totalClicks,
      trueViews: totalTrueViews,
      videoStarts: totalVideoStarts,
      videoCompletions: totalVideoCompletions,
    });
  } catch (error) {
    checks.push({
      status: "error",
      id: campaign.id,
      name: campaign.name,
      platform: campaign.platform?.name ?? null,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

const available = checks.filter((check) => check.status === "ok");
const coverageDates = available
  .map((check) => String(check.lastDeliveredDate ?? ""))
  .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
  .sort();
const deliveredCampaigns = available.filter((check) => Number(check.deliveredRows ?? 0) > 0);
const totals = deliveredCampaigns.reduce(
  (sum, check) => ({
    budget: sum.budget + Number(check.budget ?? 0),
    impressions: sum.impressions + Number(check.impressions ?? 0),
    clicks: sum.clicks + Number(check.clicks ?? 0),
    trueViews: sum.trueViews + Number(check.trueViews ?? 0),
    videoStarts: sum.videoStarts + Number(check.videoStarts ?? 0),
    videoCompletions: sum.videoCompletions + Number(check.videoCompletions ?? 0),
  }),
  { budget: 0, impressions: 0, clicks: 0, trueViews: 0, videoStarts: 0, videoCompletions: 0 },
);

console.log(JSON.stringify({
  checkedAtBRT: new Date().toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" }),
  dateFrom,
  dateTo,
  campaignCount: campaigns.length,
  availableCampaigns: available.length,
  failedCampaigns: checks.length - available.length,
  deliveredCampaignCount: deliveredCampaigns.length,
  latestProgrammaticDeliveryDate: coverageDates.at(-1) ?? null,
  totals,
  campaignsWithDelivery: deliveredCampaigns.map((check) => ({
    id: check.id,
    name: check.name,
    platform: check.platform,
    lastDeliveredDate: check.lastDeliveredDate,
    budget: check.budget,
    impressions: check.impressions,
    clicks: check.clicks,
  })),
  unavailableCampaigns: checks.filter((check) => check.status === "error").map((check) => ({
    id: check.id,
    name: check.name,
    error: check.error,
  })),
}, null, 2));
