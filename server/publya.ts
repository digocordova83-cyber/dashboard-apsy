/**
 * Publya API client for DV360/Programmatic data
 * Docs: https://docs.publya.com/docs/api/introducao/
 */
import { ENV } from "./_core/env";

const BASE_URL = "https://api.publya.com/kermit/leap/reports/external";

function getHeaders(): Record<string, string> {
  const userDataRaw = `${ENV.publyaClientId}:${ENV.publyaClientEmail}`;
  const userDataB64 = Buffer.from(userDataRaw).toString("base64");
  return {
    Authorization: `Bearer ${ENV.publyaApiToken}`,
    "User-Data": userDataB64,
    "Content-Type": "application/json",
  };
}

export interface PublyaCampaign {
  id: number;
  name: string;
  platform: { id: number; name: string };
  startDate: string;
  endDate: string;
  status?: string;
}

export interface PublyaDailyMetric {
  date: string;
  impressions?: number;
  clicks?: number;
  budget?: number;
  cpm?: number;
  ctr?: number;
  cpc?: number;
  videoStarts?: number;
  videoCompletions?: number;
  trueViews?: number;
  vcr?: number;
  cpv?: number;
  viewability?: number;
  conversions?: number;
  [key: string]: unknown;
}

export interface PublyaDailyResponse {
  metrics: PublyaDailyMetric[];
  devices: Array<{ name: string; metrics: PublyaDailyMetric[] }>;
  groups: Record<string, Array<{ name: string; metrics: PublyaDailyMetric[] }>>;
}

export async function listCampaigns(): Promise<PublyaCampaign[]> {
  const res = await fetch(`${BASE_URL}/campaigns?page=1&itemsPerPage=100`, {
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error(`Publya campaigns: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.items ?? [];
}

export async function getCampaignDaily(
  campaignId: number,
  startDate?: string,
  endDate?: string
): Promise<PublyaDailyResponse> {
  let url = `${BASE_URL}/campaigns/${campaignId}/daily`;
  const params: string[] = [];
  if (startDate) params.push(`startDate=${startDate}`);
  if (endDate) params.push(`endDate=${endDate}`);
  if (params.length) url += `?${params.join("&")}`;

  const res = await fetch(url, { headers: getHeaders() });
  if (!res.ok) throw new Error(`Publya daily ${campaignId}: ${res.status} ${await res.text()}`);
  return res.json();
}

/**
 * Aggregate daily data across multiple campaigns for a date range.
 * Returns consolidated daily metrics + per-campaign breakdown.
 */
export async function getConsolidatedDaily(
  campaignIds: number[],
  startDate: string,
  endDate: string
): Promise<{
  daily: Record<string, PublyaDailyMetric>;
  totals: { budget: number; impressions: number; clicks: number; trueViews: number; videoCompletions: number };
  byCampaign: Array<{ id: number; name: string; budget: number; impressions: number; clicks: number }>;
}> {
  const campaigns = await listCampaigns();
  const campaignMap = new Map(campaigns.map((c) => [c.id, c]));

  const daily: Record<string, PublyaDailyMetric> = {};
  const totals = { budget: 0, impressions: 0, clicks: 0, trueViews: 0, videoCompletions: 0 };
  const byCampaign: Array<{ id: number; name: string; budget: number; impressions: number; clicks: number }> = [];

  for (const cid of campaignIds) {
    const data = await getCampaignDaily(cid, startDate, endDate);
    let cBudget = 0, cImpr = 0, cClicks = 0;
    for (const m of data.metrics) {
      const d = m.date;
      if (!daily[d]) daily[d] = { date: d, budget: 0, impressions: 0, clicks: 0, trueViews: 0, videoCompletions: 0 };
      (daily[d].budget as number) += m.budget ?? 0;
      (daily[d].impressions as number) += m.impressions ?? 0;
      (daily[d].clicks as number) += m.clicks ?? 0;
      (daily[d].trueViews as number) += m.trueViews ?? 0;
      (daily[d].videoCompletions as number) += m.videoCompletions ?? 0;
      totals.budget += m.budget ?? 0;
      totals.impressions += m.impressions ?? 0;
      totals.clicks += m.clicks ?? 0;
      totals.trueViews += m.trueViews ?? 0;
      totals.videoCompletions += m.videoCompletions ?? 0;
      cBudget += m.budget ?? 0;
      cImpr += m.impressions ?? 0;
      cClicks += m.clicks ?? 0;
    }
    const camp = campaignMap.get(cid);
    byCampaign.push({ id: cid, name: camp?.name ?? `Campaign ${cid}`, budget: cBudget, impressions: cImpr, clicks: cClicks });
  }

  return { daily, totals, byCampaign };
}

