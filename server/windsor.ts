import { getWindsorCache, setWindsorCache } from "./db";

const WINDSOR_BASE = "https://connectors.windsor.ai";
export const META_ACCOUNT = "1977935416423618";
export const GOOGLE_ACCOUNT = "933-247-0027";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hora

function apiKey(): string {
  return process.env.WINDSOR_API_KEY || "";
}

export type WindsorRow = Record<string, string | number | null>;

/**
 * Busca dados no Windsor.ai com cache em banco (TTL 1h).
 * Fallback: se a API falhar, devolve o cache mesmo expirado.
 */
export async function windsorFetch(opts: {
  connector: "facebook" | "google_ads";
  accounts: string[];
  fields: string[];
  dateFrom: string; // YYYY-MM-DD
  dateTo: string;   // YYYY-MM-DD
  forceRefresh?: boolean;
}): Promise<{ rows: WindsorRow[]; fromCache: boolean; fetchedAt: Date | null }> {
  const { connector, accounts, fields, dateFrom, dateTo, forceRefresh } = opts;
  const cacheKey = `${connector}:${accounts.join(",")}:${dateFrom}:${dateTo}:${hashFields(fields)}`;

  if (!forceRefresh) {
    const cached = await getWindsorCache(cacheKey, CACHE_TTL_MS);
    if (cached?.fresh) {
      return { rows: cached.payload as WindsorRow[], fromCache: true, fetchedAt: null };
    }
  }

  const key = apiKey();
  if (!key) {
    const stale = await getWindsorCache(cacheKey, Number.MAX_SAFE_INTEGER);
    if (stale) return { rows: stale.payload as WindsorRow[], fromCache: true, fetchedAt: null };
    throw new Error("WINDSOR_API_KEY não configurada");
  }

  const params = new URLSearchParams({
    api_key: key,
    date_from: dateFrom,
    date_to: dateTo,
    fields: fields.join(","),
    select_accounts: accounts.join(","),
    _renderer: "json",
  });

  try {
    const resp = await fetch(`${WINDSOR_BASE}/${connector}?${params.toString()}`, {
      signal: AbortSignal.timeout(60_000),
    });
    if (!resp.ok) throw new Error(`Windsor HTTP ${resp.status}`);
    const json = (await resp.json()) as { data?: WindsorRow[] } | WindsorRow[];
    const rows = Array.isArray(json) ? json : (json.data ?? []);
    await setWindsorCache(cacheKey, rows);
    return { rows, fromCache: false, fetchedAt: new Date() };
  } catch (err) {
    const stale = await getWindsorCache(cacheKey, Number.MAX_SAFE_INTEGER);
    if (stale) return { rows: stale.payload as WindsorRow[], fromCache: true, fetchedAt: null };
    throw err;
  }
}

function hashFields(fields: string[]): string {
  let h = 0;
  const s = fields.join(",");
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

// ============ Conjuntos de campos padrão ============
export const META_DAILY_FIELDS = [
  "date", "campaign", "spend", "impressions", "clicks", "link_clicks", "reach",
  "actions_lead", "actions_offsite_conversion_fb_pixel_lead", "actions_onsite_conversion_messaging_conversation_started_7d",
  "actions_omni_purchase", "action_values_omni_purchase",
];
export const META_CAMPAIGN_FIELDS = [
  "campaign", "campaign_status", "campaign_objective", "spend", "impressions", "clicks", "link_clicks", "reach", "frequency",
  "actions_lead", "actions_offsite_conversion_fb_pixel_lead", "actions_onsite_conversion_messaging_conversation_started_7d",
  "actions_omni_purchase", "action_values_omni_purchase",
];
export const META_ADSET_FIELDS = [
  "campaign", "adset_name", "spend", "impressions", "clicks", "link_clicks", "reach", "frequency",
  "actions_lead", "actions_offsite_conversion_fb_pixel_lead", "actions_onsite_conversion_messaging_conversation_started_7d",
  "actions_omni_purchase", "action_values_omni_purchase",
];
export const META_AD_FIELDS = [
  "campaign", "adset_name", "ad_name", "thumbnail_url", "image_url", "spend", "impressions", "clicks", "link_clicks",
  "actions_lead", "actions_offsite_conversion_fb_pixel_lead", "actions_onsite_conversion_messaging_conversation_started_7d",
  "actions_omni_purchase", "action_values_omni_purchase", "video_play_actions_video_view",
];
export const META_DEMO_FIELDS = [
  "age", "gender", "spend", "impressions", "clicks", "link_clicks",
  "actions_lead",
];

export const GOOGLE_DAILY_FIELDS = [
  "date", "campaign", "spend", "impressions", "clicks", "conversions", "conversion_value",
];
export const GOOGLE_CAMPAIGN_FIELDS = [
  "campaign", "campaign_status", "advertising_channel_type", "spend", "impressions", "clicks", "conversions", "conversion_value",
  "search_impression_share", "search_budget_lost_impression_share", "search_rank_lost_impression_share",
];
export const GOOGLE_KEYWORD_FIELDS = [
  "campaign", "ad_group_name", "keyword_text", "spend", "impressions", "clicks", "conversions", "quality_score",
];
export const GOOGLE_SEARCH_TERM_FIELDS = [
  "campaign", "search_term", "spend", "impressions", "clicks", "conversions",
];
export const GOOGLE_DEVICE_FIELDS = [
  "campaign", "device", "spend", "impressions", "clicks", "conversions", "conversion_value",
];

// ============ Utilitários de agregação ============
export function num(v: string | number | null | undefined): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

export type ChannelTotals = {
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
  leads: number;
  purchases: number;
  revenue: number;
};

/**
 * Leads de uma linha Meta SEM dupla contagem, replicando a coluna "Leads"
 * do Ads Manager: actions_lead já é o total oficial de leads (inclui pixel
 * e formulários). O fb_pixel_lead é um SUBCONJUNTO de actions_lead — nunca
 * somar os dois. Conversas de WhatsApp NÃO são leads: ficam em métrica própria.
 * Campanhas cujo resultado é conversa (nome contém "whatsapp" ou que só têm
 * conversas como conversão) não contam leads — o Ads Manager também não
 * exibe leads como resultado dessas campanhas.
 */
export function metaRowLeads(r: WindsorRow): number {
  const name = String(r.campaign ?? "").toLowerCase();
  if (name.includes("whatsapp")) return 0;
  const lead = num(r.actions_lead);
  const pixelLead = num(r.actions_offsite_conversion_fb_pixel_lead);
  return Math.max(lead, pixelLead);
}

/** Conversas de WhatsApp/Messenger iniciadas (métrica separada de leads) */
export function metaRowConversations(r: WindsorRow): number {
  return num(r.actions_onsite_conversion_messaging_conversation_started_7d);
}

/**
 * Campanha Meta com objetivo WhatsApp/conversas: nome contém whatsapp/wpp
 * ou objective de mensagens. Somente essas entram na seção WhatsApp.
 */
export function isWhatsappCampaign(name: string, objective?: string): boolean {
  const n = (name || "").toLowerCase();
  const o = (objective || "").toUpperCase();
  return n.includes("whatsapp") || n.includes("wpp") || o.includes("MESSAGES");
}

export function metaTotals(rows: WindsorRow[]): ChannelTotals {
  const t: ChannelTotals = { spend: 0, impressions: 0, clicks: 0, reach: 0, leads: 0, purchases: 0, revenue: 0 };
  for (const r of rows) {
    t.spend += num(r.spend);
    t.impressions += num(r.impressions);
    t.clicks += num(r.link_clicks ?? r.clicks);
    t.reach += num(r.reach);
    t.leads += metaRowLeads(r);
    t.purchases += num(r.actions_omni_purchase);
    t.revenue += num(r.action_values_omni_purchase);
  }
  return t;
}

/** Totais de conversas WhatsApp de um conjunto de linhas Meta */
export function metaConversationTotals(rows: WindsorRow[]): number {
  return rows.reduce((s, r) => s + metaRowConversations(r), 0);
}

export function googleTotals(rows: WindsorRow[]): ChannelTotals {
  const t: ChannelTotals = { spend: 0, impressions: 0, clicks: 0, reach: 0, leads: 0, purchases: 0, revenue: 0 };
  for (const r of rows) {
    t.spend += num(r.spend);
    t.impressions += num(r.impressions);
    t.clicks += num(r.clicks);
    t.leads += num(r.conversions);
    t.revenue += num(r.conversion_value);
  }
  return t;
}

/** Classifica tipo de campanha Google pelo nome/tipo do canal */
export function classifyGoogleCampaign(name: string, channelType?: string): "Search" | "YouTube" | "Display" | "Demand Gen" | "Performance Max" | "Outros" {
  const n = (name || "").toLowerCase();
  const ct = (channelType || "").toUpperCase();
  if (ct === "SEARCH" || n.includes("search")) return "Search";
  if (ct === "VIDEO" || n.includes("youtube") || n.includes("yt ")) return "YouTube";
  if (ct === "PERFORMANCE_MAX" || n.includes("pmax") || n.includes("performance max")) return "Performance Max";
  if (ct === "DISCOVERY" || ct === "DEMAND_GEN" || n.includes("demand") || n.includes("demanda") || n.includes("geracao demanda")) return "Demand Gen";
  if (ct === "DISPLAY" || n.includes("display")) return "Display";
  return "Outros";
}

// ============ Classificação por objetivo (conversão vs reconhecimento) ============
export type CampaignGroup = "conversao" | "reconhecimento";

/**
 * Classifica campanha Meta em Conversão (leads/vendas/conversas/tráfego qualificado)
 * ou Reconhecimento (alcance, engajamento, seguidores, branding).
 * Usa campaign_objective quando disponível; fallback no nome.
 */
export function classifyMetaGroup(name: string, objective?: string): CampaignGroup {
  const o = (objective || "").toUpperCase();
  if (["OUTCOME_LEADS", "OUTCOME_SALES", "LEAD_GENERATION", "CONVERSIONS", "MESSAGES", "OUTCOME_ENGAGEMENT_MESSAGES"].some(k => o.includes(k))) return "conversao";
  if (["OUTCOME_AWARENESS", "OUTCOME_ENGAGEMENT", "REACH", "BRAND_AWARENESS", "POST_ENGAGEMENT", "VIDEO_VIEWS", "PAGE_LIKES"].some(k => o.includes(k))) return "reconhecimento";
  const n = (name || "").toLowerCase();
  if (n.includes("lead") || n.includes("whatsapp") || n.includes("conversao") || n.includes("conversão") || n.includes("venda") || n.includes("form")) return "conversao";
  if (n.includes("alcance") || n.includes("engajamento") || n.includes("reconhecimento") || n.includes("awareness") || n.includes("seguidores") || n.includes("branding") || n.includes("video") || n.includes("institucional")) return "reconhecimento";
  return "conversao";
}

/**
 * Classifica campanha Google em Conversão (Search/Demand Gen/PMax com conversões,
 * campanhas de leads) ou Reconhecimento (YouTube branding, Display awareness).
 */
export function classifyGoogleGroup(name: string, channelType?: string): CampaignGroup {
  const n = (name || "").toLowerCase();
  if (n.includes("lead") || n.includes("conversao") || n.includes("conversão") || n.includes("trafego") || n.includes("tráfego") || n.includes("aon") || n.includes("pós") || n.includes("pos")) return "conversao";
  if (n.includes("institucional") || n.includes("branding") || n.includes("awareness") || n.includes("alcance") || n.includes("reconhecimento")) return "reconhecimento";
  const tipo = classifyGoogleCampaign(name, channelType);
  if (tipo === "Search" || tipo === "Demand Gen" || tipo === "Performance Max") return "conversao";
  return "reconhecimento";
}

/**
 * Objetivo da campanha Google extraído do NOME da campanha (pedido do cliente):
 * ex. "bbro | apsy | search | trafego" → Tráfego; "youtube - awareness" → Awareness;
 * "geracao demanda - leads" → Leads / Conversão.
 */
export type GoogleObjective = "Leads / Conversão" | "Tráfego" | "Awareness" | "Outros";
export function extractGoogleObjective(name: string, channelType?: string): GoogleObjective {
  const n = (name || "").toLowerCase();
  if (n.includes("lead") || n.includes("conversao") || n.includes("conversão") || n.includes("venda") || n.includes("compra")) return "Leads / Conversão";
  if (n.includes("trafego") || n.includes("tráfego") || n.includes("traffic") || n.includes("clique")) return "Tráfego";
  if (n.includes("awareness") || n.includes("awarness") || n.includes("alcance") || n.includes("branding") || n.includes("institucional") || n.includes("reconhecimento") || n.includes("video view") || n.includes("visualiza")) return "Awareness";
  // Fallback pelo tipo de canal: YouTube/Display sem indicação de leads/tráfego → Awareness
  const tipo = classifyGoogleCampaign(name, channelType);
  if (tipo === "YouTube" || tipo === "Display") return "Awareness";
  if (tipo === "Search" || tipo === "Demand Gen" || tipo === "Performance Max") return "Leads / Conversão";
  return "Outros";
}
/**
 * Classifica o destino/tipo de campanha Meta:
 * - "form_nativo" = Lead Ads (formulário nativo do Meta)
 * - "whatsapp" = Campanhas de conversas WhatsApp
 * - "site" = Campanhas que direcionam ao site (tráfego, conversão site, landing page)
 */
export type MetaDestination = "form_nativo" | "whatsapp" | "site";
export function classifyMetaDestination(name: string, objective?: string): MetaDestination {
  const n = (name || "").toLowerCase();
  const o = (objective || "").toUpperCase();
  // WhatsApp campaigns
  if (n.includes("whatsapp") || n.includes("wpp") || o.includes("MESSAGES")) return "whatsapp";
  // Lead Ads (form nativo)
  if (o.includes("LEAD_GENERATION") || o.includes("OUTCOME_LEADS") || n.includes("lead") || n.includes("form nativo") || n.includes("formulario")) return "form_nativo";
  // Everything else → site
  return "site";
}
