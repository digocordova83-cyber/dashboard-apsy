import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { getDb } from "../server/db";
import {
  auditLogs,
  crmLeads,
  goals,
  optimizations,
  progDv360,
  progMetaSocial,
  progPush,
  windsorCache,
} from "../drizzle/schema";
import {
  GOOGLE_ACCOUNT,
  GOOGLE_CAMPAIGN_FIELDS,
  GOOGLE_DAILY_FIELDS,
  GOOGLE_DEVICE_FIELDS,
  GOOGLE_KEYWORD_FIELDS,
  GOOGLE_SEARCH_TERM_FIELDS,
  META_ACCOUNT,
  META_AD_FIELDS,
  META_ADSET_FIELDS,
  META_CAMPAIGN_FIELDS,
  META_DAILY_FIELDS,
  META_DEMO_FIELDS,
  windsorFetch,
} from "../server/windsor";
import { listCampaigns } from "../server/publya";

const DATE_FROM = "2026-06-03";
const DATE_TO = "2026-09-13";
const OUTPUT_DIR = "/home/ubuntu/entregas";
const OUTPUT_FILE = join(OUTPUT_DIR, "Dashboard_APSY_Exportacao_Completa_Dados.json");

type SourceStatus = {
  sheet: string;
  source: string;
  rows: number;
  dateFrom?: string;
  dateTo?: string;
  status: "ok" | "erro";
  note?: string;
};

function jsonSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_key, item) => {
    if (item instanceof Date) return item.toISOString();
    return item;
  })) as T;
}

async function fetchWindsor(
  sheet: string,
  connector: "facebook" | "google_ads",
  fields: string[],
  status: SourceStatus[],
) {
  try {
    const result = await windsorFetch({
      connector,
      accounts: [connector === "facebook" ? META_ACCOUNT : GOOGLE_ACCOUNT],
      fields,
      dateFrom: DATE_FROM,
      dateTo: DATE_TO,
    });
    status.push({
      sheet,
      source: `Windsor.ai / ${connector}`,
      rows: result.rows.length,
      dateFrom: DATE_FROM,
      dateTo: DATE_TO,
      status: "ok",
      note: result.fromCache ? "cache do dashboard" : "consulta Windsor atualizada",
    });
    return result.rows;
  } catch (error) {
    status.push({
      sheet,
      source: `Windsor.ai / ${connector}`,
      rows: 0,
      dateFrom: DATE_FROM,
      dateTo: DATE_TO,
      status: "erro",
      note: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

async function fetchWindsorWithoutCache(
  sheet: string,
  connector: "facebook" | "google_ads",
  fields: string[],
  status: SourceStatus[],
) {
  try {
    const key = process.env.WINDSOR_API_KEY;
    if (!key) throw new Error("WINDSOR_API_KEY não configurada");
    const params = new URLSearchParams({
      api_key: key,
      date_from: DATE_FROM,
      date_to: DATE_TO,
      fields: fields.join(","),
      select_accounts: connector === "facebook" ? META_ACCOUNT : GOOGLE_ACCOUNT,
      _renderer: "json",
    });
    const response = await fetch(`https://connectors.windsor.ai/${connector}?${params.toString()}`, {
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) throw new Error(`Windsor HTTP ${response.status}`);
    const responseJson = (await response.json()) as { data?: unknown[] } | unknown[];
    const rows = Array.isArray(responseJson) ? responseJson : (responseJson.data ?? []);
    status.push({
      sheet,
      source: `Windsor.ai / ${connector}`,
      rows: rows.length,
      dateFrom: DATE_FROM,
      dateTo: DATE_TO,
      status: "ok",
      note: "consulta direta sem cache; payload acima do limite de cache",
    });
    return rows;
  } catch (error) {
    status.push({
      sheet,
      source: `Windsor.ai / ${connector}`,
      rows: 0,
      dateFrom: DATE_FROM,
      dateTo: DATE_TO,
      status: "erro",
      note: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível para a exportação.");

  const sourceStatus: SourceStatus[] = [];
  const [
    metaDaily,
    metaCampaigns,
    metaAdsets,
    metaAds,
    metaDemographics,
    googleDaily,
    googleCampaigns,
    googleKeywords,
    googleSearchTerms,
    googleDevices,
  ] = await Promise.all([
    fetchWindsor("Meta_Diario", "facebook", META_DAILY_FIELDS, sourceStatus),
    fetchWindsor("Meta_Campanhas", "facebook", META_CAMPAIGN_FIELDS, sourceStatus),
    fetchWindsor("Meta_Conjuntos", "facebook", META_ADSET_FIELDS, sourceStatus),
    fetchWindsor("Meta_Anuncios", "facebook", META_AD_FIELDS, sourceStatus),
    fetchWindsor("Meta_Demografia", "facebook", META_DEMO_FIELDS, sourceStatus),
    fetchWindsor("Google_Diario", "google_ads", GOOGLE_DAILY_FIELDS, sourceStatus),
    fetchWindsor("Google_Campanhas", "google_ads", GOOGLE_CAMPAIGN_FIELDS, sourceStatus),
    fetchWindsor("Google_Palavras", "google_ads", GOOGLE_KEYWORD_FIELDS, sourceStatus),
    fetchWindsorWithoutCache("Google_Termos", "google_ads", GOOGLE_SEARCH_TERM_FIELDS, sourceStatus),
    fetchWindsor("Google_Dispositivos", "google_ads", GOOGLE_DEVICE_FIELDS, sourceStatus),
  ]);

  const [
    crm,
    dv360,
    metaSocial,
    push,
    allGoals,
    allOptimizations,
    allAuditLogs,
    cacheManifest,
  ] = await Promise.all([
    db.select().from(crmLeads),
    db.select().from(progDv360),
    db.select().from(progMetaSocial),
    db.select().from(progPush),
    db.select().from(goals),
    db.select().from(optimizations),
    db.select().from(auditLogs),
    db.select({ cacheKey: windsorCache.cacheKey, fetchedAt: windsorCache.fetchedAt, payload: windsorCache.payload }).from(windsorCache),
  ]);

  const crmDates = crm
    .map((row) => row.createdDate instanceof Date ? row.createdDate.toISOString().slice(0, 10) : String(row.createdDate).slice(0, 10))
    .filter(Boolean)
    .sort();

  sourceStatus.push(
    { sheet: "CRM_Leads", source: "EducaCRM API — snapshot persistido", rows: crm.length, dateFrom: crmDates[0], dateTo: crmDates.at(-1), status: "ok" },
    { sheet: "Prog_DV360", source: "Snapshot programática persistido", rows: dv360.length, status: "ok" },
    { sheet: "Prog_Meta_Social", source: "Snapshot programática persistido", rows: metaSocial.length, status: "ok" },
    { sheet: "Prog_Push", source: "Snapshot programática persistido", rows: push.length, status: "ok" },
    { sheet: "Metas", source: "Configuração Dashboard APSY", rows: allGoals.length, status: "ok" },
    { sheet: "Otimizacoes", source: "Dashboard APSY", rows: allOptimizations.length, status: "ok" },
    { sheet: "Auditoria", source: "Dashboard APSY", rows: allAuditLogs.length, status: "ok" },
    { sheet: "Cache_Manifest", source: "Cache Windsor do dashboard", rows: cacheManifest.length, status: "ok" },
  );

  let publyaCampaigns: unknown[] = [];
  try {
    publyaCampaigns = await listCampaigns();
    sourceStatus.push({ sheet: "Publya_Campanhas", source: "Publya API", rows: publyaCampaigns.length, status: "ok" });
  } catch (error) {
    sourceStatus.push({
      sheet: "Publya_Campanhas",
      source: "Publya API",
      rows: 0,
      status: "erro",
      note: error instanceof Error ? error.message : String(error),
    });
  }

  const cacheMetadata = cacheManifest.map((row) => ({
    cacheKey: row.cacheKey,
    fetchedAt: row.fetchedAt,
    payloadType: Array.isArray(row.payload) ? "array" : typeof row.payload,
    payloadRows: Array.isArray(row.payload) ? row.payload.length : null,
  }));

  const data = {
    metadata: {
      workbookTitle: "Dashboard APSY — Exportação completa",
      generatedAtBrt: new Intl.DateTimeFormat("sv-SE", {
        timeZone: "America/Sao_Paulo",
        dateStyle: "short",
        timeStyle: "medium",
      }).format(new Date()).replace(" ", "T"),
      mediaDateFrom: DATE_FROM,
      mediaDateTo: DATE_TO,
      crmDateFrom: "2026-07-03",
      crmDateTo: "2026-09-13",
      exclusions: [
        "Credenciais, chaves de API e hashes de senha não são exportados.",
        "A tabela legada de leads fictícios não é usada pelo Dashboard APSY e não integra esta exportação.",
        "O manifesto de cache contém metadados; os dados de mídia são exportados nas abas próprias.",
      ],
    },
    sourceStatus,
    tables: {
      CRM_Leads: crm,
      Meta_Diario: metaDaily,
      Meta_Campanhas: metaCampaigns,
      Meta_Conjuntos: metaAdsets,
      Meta_Anuncios: metaAds,
      Meta_Demografia: metaDemographics,
      Google_Diario: googleDaily,
      Google_Campanhas: googleCampaigns,
      Google_Palavras: googleKeywords,
      Google_Termos: googleSearchTerms,
      Google_Dispositivos: googleDevices,
      Prog_DV360: dv360,
      Prog_Meta_Social: metaSocial,
      Prog_Push: push,
      Publya_Campanhas: publyaCampaigns,
      Metas: allGoals,
      Otimizacoes: allOptimizations,
      Auditoria: allAuditLogs,
      Cache_Manifest: cacheMetadata,
    },
  };

  writeFileSync(OUTPUT_FILE, JSON.stringify(jsonSafe(data), null, 2));
  console.log(JSON.stringify({ output: OUTPUT_FILE, sources: sourceStatus, crmRows: crm.length }, null, 2));
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
