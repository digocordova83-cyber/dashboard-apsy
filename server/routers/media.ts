import { z } from "zod";
import { getDv360Rows, getProgMetaRows, getProgPushRows } from "../db";
import {
  listCampaigns,
  getCampaignDaily,
  type PublyaCampaign,
  type PublyaDailyMetric,
} from "../publya";
import { listGoals } from "../db";
import {
  classifyGoogleCampaign,
  classifyGoogleGroup,
  classifyMetaGroup,
  classifyMetaDestination,
  extractGoogleObjective,
  GOOGLE_ACCOUNT,
  GOOGLE_CAMPAIGN_FIELDS,
  GOOGLE_DAILY_FIELDS,
  GOOGLE_DEVICE_FIELDS,
  GOOGLE_KEYWORD_FIELDS,
  GOOGLE_SEARCH_TERM_FIELDS,
  googleTotals,
  META_ACCOUNT,
  META_AD_FIELDS,
  META_ADSET_FIELDS,
  META_CAMPAIGN_FIELDS,
  META_DAILY_FIELDS,
  META_DEMO_FIELDS,
  metaConversationTotals,
  isWhatsappCampaign,
  metaRowConversations,
  metaRowLeads,
  metaTotals,
  num,
  windsorFetch,
  type WindsorRow,
} from "../windsor";
import { localProtectedProcedure, router } from "../_core/trpc";
import { isCountedCrmStage } from "../../shared/crmFunnel";

const dateRangeInput = z.object({
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  forceRefresh: z.boolean().optional(),
});

const metaFilterInput = dateRangeInput.extend({
  campaign: z.string().optional(),
  adset: z.string().optional(),
});

const googleFilterInput = dateRangeInput.extend({
  campaign: z.string().optional(),
});

// ========================= PUBLYA CACHE =========================
let _publyaCache: { data: any; ts: number } | null = null;
const PUBLYA_CACHE_TTL = 10 * 60 * 1000; // 10 min

export async function getPublyaData() {
  if (_publyaCache && Date.now() - _publyaCache.ts < PUBLYA_CACHE_TTL) {
    return _publyaCache.data;
  }
  try {
    const campaigns = await listCampaigns();
    const dv360Campaigns = campaigns.filter(c => c.platform.name === "DV360");

    // Fetch daily data for all DV360 campaigns in PARALLEL
    const results = await Promise.allSettled(
      dv360Campaigns.map(camp =>
        getCampaignDaily(camp.id).then(d => ({
          campaign: camp,
          metrics: d.metrics,
        }))
      )
    );

    const rows: Array<{
      day: string;
      insertionOrder: string;
      format: string;
      spend: number;
      impressions: number;
      clicks: number;
      viewability: number;
      trueViews: number;
      videoCompletions: number;
      vcr: number;
      cpv: number;
    }> = [];

    for (const r of results) {
      if (r.status !== "fulfilled") continue;
      const { campaign, metrics } = r.value;
      for (const m of metrics) {
        rows.push({
          day: m.date,
          insertionOrder: campaign.name,
          format: (m.trueViews ?? 0) > 0 ? "YOUTUBE" : "DISPLAY",
          spend: m.budget ?? 0,
          impressions: m.impressions ?? 0,
          clicks: m.clicks ?? 0,
          viewability: (m.viewability ?? 0) / 100,
          trueViews: m.trueViews ?? 0,
          videoCompletions: m.videoCompletions ?? 0,
          vcr: m.vcr ?? 0,
          cpv: m.cpv ?? 0,
        });
      }
    }

    const push = await getProgPushRows();
    const data = {
      dv360: rows,
      metaSocial: [] as any[],
      push,
      campaigns: campaigns.map(c => ({
        id: c.id,
        name: c.name,
        platform: c.platform.name,
        startDate: c.startDate,
        endDate: c.endDate,
        status: c.status,
      })),
      source: "publya_api" as const,
    };
    _publyaCache = { data, ts: Date.now() };
    return data;
  } catch (err) {
    console.error("Publya API error, falling back to DB:", err);
    const [dv360, metaSocial, push] = await Promise.all([
      getDv360Rows(),
      getProgMetaRows(),
      getProgPushRows(),
    ]);
    return {
      dv360,
      metaSocial,
      push,
      campaigns: [] as any[],
      source: "database" as const,
    };
  }
}

/** Aplica filtro de campanha às linhas Google (se fornecido) */
function applyGoogleFilter(
  rows: WindsorRow[],
  f: { campaign?: string }
): WindsorRow[] {
  if (!f.campaign) return rows;
  return rows.filter(r => String(r.campaign ?? "") === f.campaign);
}

/** Datas auxiliares em YYYY-MM-DD no fuso de São Paulo */
function spDate(offsetDays = 0): string {
  const now = new Date(
    Date.now() - 3 * 3600 * 1000 + offsetDays * 86400 * 1000
  );
  return now.toISOString().slice(0, 10);
}

/** Aplica filtro de campanha/conjunto às linhas Meta (se fornecido) */
function applyMetaFilter(
  rows: WindsorRow[],
  f: { campaign?: string; adset?: string }
): WindsorRow[] {
  let out = rows;
  if (f.campaign)
    out = out.filter(r => String(r.campaign ?? "") === f.campaign);
  if (f.adset) out = out.filter(r => String(r.adset_name ?? "") === f.adset);
  return out;
}

function safeDiv(a: number, b: number): number {
  return b > 0 ? a / b : 0;
}

function kpisFrom(t: {
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  purchases: number;
  revenue: number;
}) {
  return {
    ...t,
    ctr: safeDiv(t.clicks, t.impressions),
    cpc: safeDiv(t.spend, t.clicks),
    cpm: safeDiv(t.spend, t.impressions) * 1000,
    cpl: safeDiv(t.spend, t.leads),
    cpa: safeDiv(t.spend, t.purchases > 0 ? t.purchases : t.leads),
    cac: safeDiv(t.spend, t.purchases),
    roas: safeDiv(t.revenue, t.spend),
  };
}

export const mediaRouter = router({
  // ========================= META ADS =========================
  metaOverview: localProtectedProcedure
    .input(metaFilterInput)
    .query(async ({ input }) => {
      const { rows, fromCache } = await windsorFetch({
        connector: "facebook",
        accounts: [META_ACCOUNT],
        fields: META_DAILY_FIELDS,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        forceRefresh: input.forceRefresh,
      });
      const filtered = applyMetaFilter(rows, input);
      const byDay = new Map<string, WindsorRow[]>();
      for (const r of filtered) {
        const d = String(r.date ?? "");
        if (!byDay.has(d)) byDay.set(d, []);
        byDay.get(d)!.push(r);
      }
      const daily = Array.from(byDay.entries())
        .filter(([d]) => /^\d{4}-\d{2}-\d{2}$/.test(d))
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, rs]) => ({
          date,
          ...kpisFrom(metaTotals(rs)),
          conversations: metaConversationTotals(rs),
        }));
      return {
        totals: {
          ...kpisFrom(metaTotals(filtered)),
          conversations: metaConversationTotals(filtered),
        },
        daily,
        fromCache,
      };
    }),

  metaCampaigns: localProtectedProcedure
    .input(dateRangeInput)
    .query(async ({ input }) => {
      const { rows } = await windsorFetch({
        connector: "facebook",
        accounts: [META_ACCOUNT],
        fields: META_CAMPAIGN_FIELDS,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        forceRefresh: input.forceRefresh,
      });
      return rows
        .map(r => ({
          campaign: String(r.campaign ?? ""),
          status: String(r.campaign_status ?? ""),
          objective: String(r.campaign_objective ?? ""),
          group: classifyMetaGroup(
            String(r.campaign ?? ""),
            String(r.campaign_objective ?? "")
          ),
          destination: classifyMetaDestination(
            String(r.campaign ?? ""),
            String(r.campaign_objective ?? "")
          ),
          conversations: metaRowConversations(r),
          ...kpisFrom({
            spend: num(r.spend),
            impressions: num(r.impressions),
            clicks: num(r.link_clicks ?? r.clicks),
            leads: metaRowLeads(r),
            purchases: num(r.actions_omni_purchase),
            revenue: num(r.action_values_omni_purchase),
          }),
          reach: num(r.reach),
          frequency: num(r.frequency),
        }))
        .sort((a, b) => b.spend - a.spend);
    }),

  metaAdsets: localProtectedProcedure
    .input(metaFilterInput)
    .query(async ({ input }) => {
      const [{ rows }, campRes] = await Promise.all([
        windsorFetch({
          connector: "facebook",
          accounts: [META_ACCOUNT],
          fields: META_ADSET_FIELDS,
          dateFrom: input.dateFrom,
          dateTo: input.dateTo,
          forceRefresh: input.forceRefresh,
        }),
        windsorFetch({
          connector: "facebook",
          accounts: [META_ACCOUNT],
          fields: META_CAMPAIGN_FIELDS,
          dateFrom: input.dateFrom,
          dateTo: input.dateTo,
          forceRefresh: input.forceRefresh,
        }),
      ]);
      const groupByCampaign = new Map<
        string,
        ReturnType<typeof classifyMetaGroup>
      >();
      for (const c of campRes.rows) {
        groupByCampaign.set(
          String(c.campaign ?? ""),
          classifyMetaGroup(
            String(c.campaign ?? ""),
            String(c.campaign_objective ?? "")
          )
        );
      }
      return applyMetaFilter(rows, { campaign: input.campaign })
        .map(r => ({
          campaign: String(r.campaign ?? ""),
          adset: String(r.adset_name ?? ""),
          group:
            groupByCampaign.get(String(r.campaign ?? "")) ??
            classifyMetaGroup(String(r.campaign ?? "")),
          conversations: metaRowConversations(r),
          ...kpisFrom({
            spend: num(r.spend),
            impressions: num(r.impressions),
            clicks: num(r.link_clicks ?? r.clicks),
            leads: metaRowLeads(r),
            purchases: num(r.actions_omni_purchase),
            revenue: num(r.action_values_omni_purchase),
          }),
          reach: num(r.reach),
          frequency: num(r.frequency),
        }))
        .sort((a, b) => b.spend - a.spend);
    }),

  metaAds: localProtectedProcedure
    .input(metaFilterInput)
    .query(async ({ input }) => {
      const [{ rows }, campRes] = await Promise.all([
        windsorFetch({
          connector: "facebook",
          accounts: [META_ACCOUNT],
          fields: META_AD_FIELDS,
          dateFrom: input.dateFrom,
          dateTo: input.dateTo,
          forceRefresh: input.forceRefresh,
        }),
        windsorFetch({
          connector: "facebook",
          accounts: [META_ACCOUNT],
          fields: META_CAMPAIGN_FIELDS,
          dateFrom: input.dateFrom,
          dateTo: input.dateTo,
          forceRefresh: input.forceRefresh,
        }),
      ]);
      const groupByCampaign = new Map<
        string,
        ReturnType<typeof classifyMetaGroup>
      >();
      for (const c of campRes.rows) {
        groupByCampaign.set(
          String(c.campaign ?? ""),
          classifyMetaGroup(
            String(c.campaign ?? ""),
            String(c.campaign_objective ?? "")
          )
        );
      }
      return applyMetaFilter(rows, input)
        .map(r => ({
          campaign: String(r.campaign ?? ""),
          adset: String(r.adset_name ?? ""),
          ad: String(r.ad_name ?? ""),
          group:
            groupByCampaign.get(String(r.campaign ?? "")) ??
            classifyMetaGroup(String(r.campaign ?? "")),
          thumbnail: String(r.thumbnail_url ?? r.image_url ?? ""),
          videoViews: num(r.video_play_actions_video_view),
          conversations: metaRowConversations(r),
          ...kpisFrom({
            spend: num(r.spend),
            impressions: num(r.impressions),
            clicks: num(r.link_clicks ?? r.clicks),
            leads: metaRowLeads(r),
            purchases: num(r.actions_omni_purchase),
            revenue: num(r.action_values_omni_purchase),
          }),
        }))
        .sort((a, b) => b.spend - a.spend);
    }),

  // WhatsApp: conversas iniciadas por campanha e por dia (métrica separada de leads)
  metaWhatsapp: localProtectedProcedure
    .input(metaFilterInput)
    .query(async ({ input }) => {
      const [dailyRes, campRes] = await Promise.all([
        windsorFetch({
          connector: "facebook",
          accounts: [META_ACCOUNT],
          fields: META_DAILY_FIELDS,
          dateFrom: input.dateFrom,
          dateTo: input.dateTo,
          forceRefresh: input.forceRefresh,
        }),
        windsorFetch({
          connector: "facebook",
          accounts: [META_ACCOUNT],
          fields: META_CAMPAIGN_FIELDS,
          dateFrom: input.dateFrom,
          dateTo: input.dateTo,
          forceRefresh: input.forceRefresh,
        }),
      ]);
      // SOMENTE campanhas com objetivo WhatsApp/conversas (nome whatsapp/wpp ou objective MESSAGES)
      const campaigns = campRes.rows
        .filter(r =>
          isWhatsappCampaign(
            String(r.campaign ?? ""),
            String(r.campaign_objective ?? "")
          )
        )
        .filter(
          r => !input.campaign || String(r.campaign ?? "") === input.campaign
        )
        .map(r => {
          const conversations = metaRowConversations(r);
          const spend = num(r.spend);
          return {
            campaign: String(r.campaign ?? ""),
            status: String(r.campaign_status ?? ""),
            spend,
            impressions: num(r.impressions),
            clicks: num(r.link_clicks ?? r.clicks),
            reach: num(r.reach),
            conversations,
            costPerConversation: conversations > 0 ? spend / conversations : 0,
          };
        })
        .sort((a, b) => b.conversations - a.conversations);

      const waCampaignNames = new Set(campaigns.map(c => c.campaign));
      const byDay = new Map<string, { spend: number; conversations: number }>();
      for (const r of dailyRes.rows) {
        const d = String(r.date ?? "");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
        if (input.campaign && String(r.campaign ?? "") !== input.campaign)
          continue;
        const conv = metaRowConversations(r);
        const isWa = waCampaignNames.has(String(r.campaign ?? ""));
        if (!isWa && conv === 0) continue;
        const e = byDay.get(d) ?? { spend: 0, conversations: 0 };
        if (isWa) e.spend += num(r.spend);
        e.conversations += conv;
        byDay.set(d, e);
      }
      const daily = Array.from(byDay.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, v]) => ({
          date,
          ...v,
          costPerConversation:
            v.conversations > 0 ? v.spend / v.conversations : 0,
        }));

      const totals = {
        spend: campaigns.reduce((s, c) => s + c.spend, 0),
        conversations: campaigns.reduce((s, c) => s + c.conversations, 0),
      };
      return {
        campaigns,
        daily,
        totals: {
          ...totals,
          costPerConversation:
            totals.conversations > 0 ? totals.spend / totals.conversations : 0,
        },
      };
    }),

  metaDemographics: localProtectedProcedure
    .input(dateRangeInput)
    .query(async ({ input }) => {
      const { rows } = await windsorFetch({
        connector: "facebook",
        accounts: [META_ACCOUNT],
        fields: META_DEMO_FIELDS,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        forceRefresh: input.forceRefresh,
      });
      return rows.map(r => ({
        age: String(r.age ?? ""),
        gender: String(r.gender ?? ""),
        ...kpisFrom({
          spend: num(r.spend),
          impressions: num(r.impressions),
          clicks: num(r.link_clicks ?? r.clicks),
          leads: num(r.actions_lead),
          purchases: 0,
          revenue: 0,
        }),
      }));
    }),

  // ========================= GOOGLE ADS =========================
  googleOverview: localProtectedProcedure
    .input(googleFilterInput)
    .query(async ({ input }) => {
      const { rows, fromCache } = await windsorFetch({
        connector: "google_ads",
        accounts: [GOOGLE_ACCOUNT],
        fields: GOOGLE_DAILY_FIELDS,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        forceRefresh: input.forceRefresh,
      });
      const filtered = applyGoogleFilter(rows, input);
      const byDay = new Map<string, WindsorRow[]>();
      for (const r of filtered) {
        const d = String(r.date ?? "");
        if (!byDay.has(d)) byDay.set(d, []);
        byDay.get(d)!.push(r);
      }
      const daily = Array.from(byDay.entries())
        .filter(([d]) => /^\d{4}-\d{2}-\d{2}$/.test(d))
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, rs]) => ({ date, ...kpisFrom(googleTotals(rs)) }));
      return { totals: kpisFrom(googleTotals(filtered)), daily, fromCache };
    }),

  googleCampaigns: localProtectedProcedure
    .input(dateRangeInput)
    .query(async ({ input }) => {
      const { rows } = await windsorFetch({
        connector: "google_ads",
        accounts: [GOOGLE_ACCOUNT],
        fields: GOOGLE_CAMPAIGN_FIELDS,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        forceRefresh: input.forceRefresh,
      });
      return rows
        .map(r => ({
          campaign: String(r.campaign ?? ""),
          status: String(r.campaign_status ?? ""),
          type: classifyGoogleCampaign(
            String(r.campaign ?? ""),
            String(r.advertising_channel_type ?? "")
          ),
          group: classifyGoogleGroup(
            String(r.campaign ?? ""),
            String(r.advertising_channel_type ?? "")
          ),
          objective: extractGoogleObjective(
            String(r.campaign ?? ""),
            String(r.advertising_channel_type ?? "")
          ),
          impressionShare: num(r.search_impression_share),
          budgetLostIS: num(r.search_budget_lost_impression_share),
          rankLostIS: num(r.search_rank_lost_impression_share),
          ...kpisFrom({
            spend: num(r.spend),
            impressions: num(r.impressions),
            clicks: num(r.clicks),
            leads: num(r.conversions),
            purchases: num(r.conversions),
            revenue: num(r.conversion_value),
          }),
        }))
        .sort((a, b) => b.spend - a.spend);
    }),

  googleKeywords: localProtectedProcedure
    .input(googleFilterInput)
    .query(async ({ input }) => {
      const { rows } = await windsorFetch({
        connector: "google_ads",
        accounts: [GOOGLE_ACCOUNT],
        fields: GOOGLE_KEYWORD_FIELDS,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        forceRefresh: input.forceRefresh,
      });
      const kwRows = applyGoogleFilter(rows, input);
      // O Windsor pode retornar múltiplas linhas por keyword; agregamos e usamos
      // média do quality_score (QS é nota de 1-10, nunca deve ser somado).
      const kwMap = new Map<
        string,
        {
          campaign: string;
          adGroup: string;
          keyword: string;
          spend: number;
          impressions: number;
          clicks: number;
          conversions: number;
          qsSum: number;
          qsCount: number;
        }
      >();
      for (const r of kwRows) {
        if (!r.keyword_text) continue;
        const campaign = String(r.campaign ?? "");
        const adGroup = String(r.ad_group_name ?? "");
        const keyword = String(r.keyword_text ?? "");
        const k = `${campaign}|${adGroup}|${keyword}`;
        const e = kwMap.get(k) ?? {
          campaign,
          adGroup,
          keyword,
          spend: 0,
          impressions: 0,
          clicks: 0,
          conversions: 0,
          qsSum: 0,
          qsCount: 0,
        };
        e.spend += num(r.spend);
        e.impressions += num(r.impressions);
        e.clicks += num(r.clicks);
        e.conversions += num(r.conversions);
        const qs = num(r.quality_score);
        if (qs > 0) {
          e.qsSum += Math.min(qs, 10);
          e.qsCount += 1;
        }
        kwMap.set(k, e);
      }
      return Array.from(kwMap.values())
        .map(e => ({
          campaign: e.campaign,
          adGroup: e.adGroup,
          keyword: e.keyword,
          qualityScore:
            e.qsCount > 0 ? Math.round((e.qsSum / e.qsCount) * 10) / 10 : 0,
          ...kpisFrom({
            spend: e.spend,
            impressions: e.impressions,
            clicks: e.clicks,
            leads: e.conversions,
            purchases: e.conversions,
            revenue: 0,
          }),
        }))
        .sort((a, b) => b.spend - a.spend)
        .slice(0, 200);
    }),

  googleSearchTerms: localProtectedProcedure
    .input(googleFilterInput)
    .query(async ({ input }) => {
      const { rows } = await windsorFetch({
        connector: "google_ads",
        accounts: [GOOGLE_ACCOUNT],
        fields: GOOGLE_SEARCH_TERM_FIELDS,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        forceRefresh: input.forceRefresh,
      });
      return applyGoogleFilter(rows, input)
        .filter(r => r.search_term)
        .map(r => ({
          campaign: String(r.campaign ?? ""),
          term: String(r.search_term ?? ""),
          ...kpisFrom({
            spend: num(r.spend),
            impressions: num(r.impressions),
            clicks: num(r.clicks),
            leads: num(r.conversions),
            purchases: num(r.conversions),
            revenue: 0,
          }),
        }))
        .sort((a, b) => b.clicks - a.clicks)
        .slice(0, 200);
    }),

  googleDevices: localProtectedProcedure
    .input(googleFilterInput)
    .query(async ({ input }) => {
      const { rows } = await windsorFetch({
        connector: "google_ads",
        accounts: [GOOGLE_ACCOUNT],
        fields: GOOGLE_DEVICE_FIELDS,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        forceRefresh: input.forceRefresh,
      });
      return applyGoogleFilter(rows, input).map(r => ({
        device: String(r.device ?? ""),
        ...kpisFrom({
          spend: num(r.spend),
          impressions: num(r.impressions),
          clicks: num(r.clicks),
          leads: num(r.conversions),
          purchases: num(r.conversions),
          revenue: num(r.conversion_value),
        }),
      }));
    }),

  // ========================= PROGRAMÁTICA =========================
  programatica: localProtectedProcedure.query(async () => {
    return getPublyaData();
  }),

  // ========================= VISÃO GERAL =========================
  overview: localProtectedProcedure
    .input(dateRangeInput)
    .query(async ({ input }) => {
      const [metaRes, googleRes, dv360, metaSocial, push] = await Promise.all([
        windsorFetch({
          connector: "facebook",
          accounts: [META_ACCOUNT],
          fields: META_DAILY_FIELDS,
          dateFrom: input.dateFrom,
          dateTo: input.dateTo,
          forceRefresh: input.forceRefresh,
        }).catch(() => ({
          rows: [] as WindsorRow[],
          fromCache: false,
          fetchedAt: null,
        })),
        windsorFetch({
          connector: "google_ads",
          accounts: [GOOGLE_ACCOUNT],
          fields: GOOGLE_DAILY_FIELDS,
          dateFrom: input.dateFrom,
          dateTo: input.dateTo,
          forceRefresh: input.forceRefresh,
        }).catch(() => ({
          rows: [] as WindsorRow[],
          fromCache: false,
          fetchedAt: null,
        })),
        getDv360Rows(),
        getProgMetaRows(),
        getProgPushRows(),
      ]);

      // Programática dentro do range solicitado
      const inRange = (d: string | Date) => {
        const s = typeof d === "string" ? d : d.toISOString().slice(0, 10);
        return s >= input.dateFrom && s <= input.dateTo;
      };
      const dvRows = dv360.filter(r => inRange(r.day as unknown as string));
      const msRows = metaSocial.filter(r =>
        inRange(r.day as unknown as string)
      );
      const pushRows = push.filter(r => inRange(r.day as unknown as string));

      const progTotals = {
        spend:
          dvRows.reduce((s, r) => s + r.spend, 0) +
          msRows.reduce((s, r) => s + r.spend, 0) +
          pushRows.reduce((s, r) => s + r.spend, 0),
        impressions:
          dvRows.reduce((s, r) => s + r.impressions, 0) +
          msRows.reduce((s, r) => s + r.impressions, 0) +
          pushRows.reduce((s, r) => s + r.dispatches, 0),
        clicks:
          dvRows.reduce((s, r) => s + r.clicks, 0) +
          msRows.reduce((s, r) => s + r.linkClicks, 0) +
          pushRows.reduce((s, r) => s + r.clicks, 0),
        leads: 0,
        purchases: 0,
        revenue: 0,
      };

      const meta = kpisFrom(metaTotals(metaRes.rows));
      const google = kpisFrom(googleTotals(googleRes.rows));
      const prog = kpisFrom(progTotals);

      const consolidated = kpisFrom({
        spend: meta.spend + google.spend + prog.spend,
        impressions: meta.impressions + google.impressions + prog.impressions,
        clicks: meta.clicks + google.clicks + prog.clicks,
        leads: meta.leads + google.leads,
        purchases: meta.purchases + google.purchases,
        revenue: meta.revenue + google.revenue,
      });

      // Série diária consolidada por canal
      const dayMap = new Map<
        string,
        {
          meta: number;
          google: number;
          prog: number;
          leadsMeta: number;
          leadsGoogle: number;
        }
      >();
      const ensure = (d: string) => {
        if (!dayMap.has(d))
          dayMap.set(d, {
            meta: 0,
            google: 0,
            prog: 0,
            leadsMeta: 0,
            leadsGoogle: 0,
          });
        return dayMap.get(d)!;
      };
      for (const r of metaRes.rows) {
        const e = ensure(String(r.date ?? ""));
        e.meta += num(r.spend);
        e.leadsMeta += metaRowLeads(r);
      }
      for (const r of googleRes.rows) {
        const e = ensure(String(r.date ?? ""));
        e.google += num(r.spend);
        e.leadsGoogle += num(r.conversions);
      }
      for (const r of dvRows)
        ensure(String(r.day).slice(0, 10)).prog += r.spend;
      for (const r of msRows)
        ensure(String(r.day).slice(0, 10)).prog += r.spend;
      for (const r of pushRows)
        ensure(String(r.day).slice(0, 10)).prog += r.spend;

      const daily = Array.from(dayMap.entries())
        .filter(([d]) => d)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, v]) => ({ date, ...v }));

      return {
        consolidated,
        byChannel: { meta, google, programatica: prog },
        daily,
      };
    }),

  // ========================= PROGRESSO DE METAS =========================
  goalProgress: localProtectedProcedure
    .input(dateRangeInput)
    .query(async ({ input }) => {
      const goals = await listGoals();
      if (goals.length === 0) return [];

      const needMeta = goals.some(
        g => g.channel === "meta" || g.channel === "geral"
      );
      const needGoogle = goals.some(
        g => g.channel === "google" || g.channel === "geral"
      );
      const needProg = goals.some(
        g => g.channel === "programatica" || g.channel === "geral"
      );

      const [metaRes, googleRes, dv360, metaSocial, push] = await Promise.all([
        needMeta
          ? windsorFetch({
              connector: "facebook",
              accounts: [META_ACCOUNT],
              fields: META_DAILY_FIELDS,
              dateFrom: input.dateFrom,
              dateTo: input.dateTo,
            }).catch(() => ({ rows: [] as WindsorRow[] }))
          : Promise.resolve({ rows: [] as WindsorRow[] }),
        needGoogle
          ? windsorFetch({
              connector: "google_ads",
              accounts: [GOOGLE_ACCOUNT],
              fields: GOOGLE_DAILY_FIELDS,
              dateFrom: input.dateFrom,
              dateTo: input.dateTo,
            }).catch(() => ({ rows: [] as WindsorRow[] }))
          : Promise.resolve({ rows: [] as WindsorRow[] }),
        needProg ? getDv360Rows() : Promise.resolve([]),
        needProg ? getProgMetaRows() : Promise.resolve([]),
        needProg ? getProgPushRows() : Promise.resolve([]),
      ]);

      const inRange = (d: string | Date) => {
        const s =
          typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10);
        return s >= input.dateFrom && s <= input.dateTo;
      };
      const dvRows = dv360.filter(r => inRange(r.day as unknown as string));
      const msRows = metaSocial.filter(r =>
        inRange(r.day as unknown as string)
      );
      const pushRows = push.filter(r => inRange(r.day as unknown as string));

      const metaK = kpisFrom(metaTotals(metaRes.rows));
      const googleK = kpisFrom(googleTotals(googleRes.rows));
      const progK = kpisFrom({
        spend:
          dvRows.reduce((s, r) => s + r.spend, 0) +
          msRows.reduce((s, r) => s + r.spend, 0) +
          pushRows.reduce((s, r) => s + r.spend, 0),
        impressions:
          dvRows.reduce((s, r) => s + r.impressions, 0) +
          msRows.reduce((s, r) => s + r.impressions, 0) +
          pushRows.reduce((s, r) => s + r.dispatches, 0),
        clicks:
          dvRows.reduce((s, r) => s + r.clicks, 0) +
          msRows.reduce((s, r) => s + r.linkClicks, 0) +
          pushRows.reduce((s, r) => s + r.clicks, 0),
        leads: 0,
        purchases: 0,
        revenue: 0,
      });
      const geralK = kpisFrom({
        spend: metaK.spend + googleK.spend + progK.spend,
        impressions:
          metaK.impressions + googleK.impressions + progK.impressions,
        clicks: metaK.clicks + googleK.clicks + progK.clicks,
        leads: metaK.leads + googleK.leads,
        purchases: metaK.purchases + googleK.purchases,
        revenue: metaK.revenue + googleK.revenue,
      });

      const byChannel: Record<string, ReturnType<typeof kpisFrom>> = {
        meta: metaK,
        google: googleK,
        programatica: progK,
        geral: geralK,
      };

      const metricValue = (
        k: ReturnType<typeof kpisFrom>,
        metric: string
      ): number => {
        switch (metric) {
          case "leads":
            return k.leads;
          case "compras":
            return k.purchases;
          case "receita":
            return k.revenue;
          case "cpa":
            return k.cpa;
          case "cac":
            return k.cac;
          case "roas":
            return k.roas;
          case "ctr":
            return k.ctr * 100; // metas de CTR em %
          case "cpc":
            return k.cpc;
          case "investimento":
            return k.spend;
          default:
            return 0;
        }
      };

      return goals.map(g => ({
        goalId: g.id,
        channel: g.channel,
        metric: g.metric,
        targetValue: g.targetValue,
        direction: g.direction,
        currentValue: metricValue(byChannel[g.channel] ?? geralK, g.metric),
      }));
    }),

  // ========================= COMPARATIVOS TEMPORAIS =========================
  /**
   * Compara métricas de: hoje, ontem, 7 dias atrás (mesmo dia da semana passada)
   * e média diária dos últimos 30 dias (encerrados ontem), por canal.
   */
  compare: localProtectedProcedure
    .input(
      z.object({
        channel: z.enum(["meta", "google", "leads"]),
      })
    )
    .query(async ({ input }) => {
      const today = spDate(0);
      const yesterday = spDate(-1);
      const d7 = spDate(-7);
      const d30start = spDate(-30);

      type Metrics = Record<string, number>;
      const empty: Metrics = {};

      if (input.channel === "leads") {
        const { getCrmLeads } = await import("../db");
        const allLeads = await getCrmLeads();
        const byDay = new Map<
          string,
          { leads: number; opps: number; enrolled: number }
        >();
        for (const l of allLeads) {
          const dt = l.createdDate ? new Date(l.createdDate) : null;
          const d =
            dt && !isNaN(dt.getTime()) ? dt.toISOString().slice(0, 10) : "";
          if (!d || d < d30start || d > today) continue;
          // Lead = oportunidade (nova definição): contatos sem oportunidade ficam fora
          if (!isCountedCrmStage(l.opportunityStage)) continue;
          const e = byDay.get(d) ?? { leads: 0, opps: 0, enrolled: 0 };
          e.leads += 1;
          e.opps += 1;
          if (l.opportunityStage === "MATRICULADO") e.enrolled += 1;
          byDay.set(d, e);
        }
        const dayM = (d: string): Metrics => {
          const e = byDay.get(d);
          return e
            ? {
                leads: e.leads,
                oportunidades: e.opps,
                matriculados: e.enrolled,
              }
            : { leads: 0, oportunidades: 0, matriculados: 0 };
        };
        // média 30d (até ontem)
        const avg: Metrics = { leads: 0, oportunidades: 0, matriculados: 0 };
        for (const [d, e] of Array.from(byDay.entries())) {
          if (d >= d30start && d <= yesterday) {
            avg.leads += e.leads;
            avg.oportunidades += e.opps;
            avg.matriculados += e.enrolled;
          }
        }
        const days = 30;
        for (const k of Object.keys(avg)) avg[k] = avg[k] / days;
        return {
          today: dayM(today),
          yesterday: dayM(yesterday),
          d7: dayM(d7),
          avg30: avg,
          dates: { today, yesterday, d7, d30start },
        };
      }

      const isMeta = input.channel === "meta";
      const { rows } = await windsorFetch({
        connector: isMeta ? "facebook" : "google_ads",
        accounts: [isMeta ? META_ACCOUNT : GOOGLE_ACCOUNT],
        fields: isMeta ? META_DAILY_FIELDS : GOOGLE_DAILY_FIELDS,
        dateFrom: d30start,
        dateTo: today,
      }).catch(() => ({ rows: [] as WindsorRow[] }));

      const byDay = new Map<string, WindsorRow[]>();
      for (const r of rows) {
        const d = String(r.date ?? "");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
        if (!byDay.has(d)) byDay.set(d, []);
        byDay.get(d)!.push(r);
      }
      const dayMetrics = (d: string): Metrics => {
        const rs = byDay.get(d) ?? [];
        if (isMeta) {
          const t = metaTotals(rs);
          const conv = metaConversationTotals(rs);
          return {
            investimento: t.spend,
            impressoes: t.impressions,
            cliques: t.clicks,
            leads: t.leads,
            conversas: conv,
            cpl: t.leads > 0 ? t.spend / t.leads : 0,
            ctr: t.impressions > 0 ? t.clicks / t.impressions : 0,
          };
        }
        const t = googleTotals(rs);
        return {
          investimento: t.spend,
          impressoes: t.impressions,
          cliques: t.clicks,
          conversoes: t.leads,
          cpa: t.leads > 0 ? t.spend / t.leads : 0,
          ctr: t.impressions > 0 ? t.clicks / t.impressions : 0,
        };
      };
      // média diária dos últimos 30 dias encerrados ontem
      const sum: Metrics = {};
      let count = 0;
      for (const [d] of Array.from(byDay.entries())) {
        if (d < d30start || d > yesterday) continue;
        const m = dayMetrics(d);
        for (const k of Object.keys(m)) sum[k] = (sum[k] ?? 0) + m[k];
        count += 1;
      }
      const avg30: Metrics = {};
      for (const k of Object.keys(sum))
        avg30[k] = count > 0 ? sum[k] / count : 0;
      // Ratios (cpl/cpa/ctr) na média devem ser recalculados dos agregados
      if (count > 0) {
        if (isMeta) {
          avg30.cpl =
            (sum.leads ?? 0) > 0
              ? (sum.investimento ?? 0) / (sum.leads ?? 1)
              : 0;
        } else {
          avg30.cpa =
            (sum.conversoes ?? 0) > 0
              ? (sum.investimento ?? 0) / (sum.conversoes ?? 1)
              : 0;
        }
        avg30.ctr =
          (sum.impressoes ?? 0) > 0
            ? (sum.cliques ?? 0) / (sum.impressoes ?? 1)
            : 0;
      }
      return {
        today: dayMetrics(today) ?? empty,
        yesterday: dayMetrics(yesterday),
        d7: dayMetrics(d7),
        avg30,
        dates: { today, yesterday, d7, d30start },
      };
    }),

  // ========================= PACING DE INVESTIMENTO =========================
  /**
   * Pacing do mês atual por canal: gasto acumulado até ontem, meta de investimento
   * do canal (goals metric="investimento"), projeção de fechamento e ritmo ideal.
   */
  pacing: localProtectedProcedure.query(async () => {
    const today = spDate(0);
    const yesterday = spDate(-1);
    const monthStart = today.slice(0, 8) + "01";
    const [y, m] = today.split("-").map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const dayOfMonth = Number(today.slice(8, 10));
    const elapsedDays = Math.max(dayOfMonth - 1, 1); // dias completos (até ontem)

    const goals = await listGoals();
    const investGoals = goals.filter(g => g.metric === "investimento");

    const [metaRes, googleRes, dv360, metaSocial, push] = await Promise.all([
      windsorFetch({
        connector: "facebook",
        accounts: [META_ACCOUNT],
        fields: META_DAILY_FIELDS,
        dateFrom: monthStart,
        dateTo: yesterday,
      }).catch(() => ({ rows: [] as WindsorRow[] })),
      windsorFetch({
        connector: "google_ads",
        accounts: [GOOGLE_ACCOUNT],
        fields: GOOGLE_DAILY_FIELDS,
        dateFrom: monthStart,
        dateTo: yesterday,
      }).catch(() => ({ rows: [] as WindsorRow[] })),
      getDv360Rows(),
      getProgMetaRows(),
      getProgPushRows(),
    ]);

    const inMonth = (d: string | Date) => {
      const s =
        typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10);
      return s >= monthStart && s <= yesterday;
    };
    const progSpend =
      dv360
        .filter(r => inMonth(r.day as unknown as string))
        .reduce((s, r) => s + r.spend, 0) +
      metaSocial
        .filter(r => inMonth(r.day as unknown as string))
        .reduce((s, r) => s + r.spend, 0) +
      push
        .filter(r => inMonth(r.day as unknown as string))
        .reduce((s, r) => s + r.spend, 0);

    const spendByChannel: Record<string, number> = {
      meta: metaRes.rows.reduce((s, r) => s + num(r.spend), 0),
      google: googleRes.rows.reduce((s, r) => s + num(r.spend), 0),
      programatica: progSpend,
    };
    spendByChannel.geral =
      spendByChannel.meta + spendByChannel.google + spendByChannel.programatica;

    const channels = ["meta", "google", "programatica", "geral"] as const;
    return {
      monthStart,
      daysInMonth,
      elapsedDays,
      today,
      channels: channels.map(ch => {
        const goal = investGoals.find(g => g.channel === ch);
        const budget = goal?.targetValue ?? 0;
        const spent = spendByChannel[ch] ?? 0;
        const dailyAvg = spent / elapsedDays;
        const projected = dailyAvg * daysInMonth;
        const idealSpent =
          budget > 0 ? (budget / daysInMonth) * elapsedDays : 0;
        const remainingDays = daysInMonth - elapsedDays;
        const dailyNeeded =
          budget > 0 && remainingDays > 0
            ? Math.max(budget - spent, 0) / remainingDays
            : 0;
        return {
          channel: ch,
          budget,
          spent,
          dailyAvg,
          projected,
          idealSpent,
          pacingPct: idealSpent > 0 ? spent / idealSpent : 0,
          budgetUsedPct: budget > 0 ? spent / budget : 0,
          projectedVsBudgetPct: budget > 0 ? projected / budget : 0,
          dailyNeeded,
          hasGoal: !!goal,
          goalId: goal?.id ?? null,
        };
      }),
    };
  }),
});
