import { writeFileSync } from "node:fs";

const API_KEY = process.env.WINDSOR_API_KEY;
const ACCOUNT = "539911695";
const BASE_URL = "https://connectors.windsor.ai/googleanalytics4";
const PERIOD = { from: "2026-06-03", to: "2026-09-15" };

if (!API_KEY) {
  throw new Error("WINDSOR_API_KEY não disponível");
}

type Row = Record<string, string | number | null>;

async function query(fields: string[], attempt = 1): Promise<Row[]> {
  const params = new URLSearchParams({
    api_key: API_KEY,
    fields: fields.join(","),
    select_accounts: ACCOUNT,
    date_from: PERIOD.from,
    date_to: PERIOD.to,
    _renderer: "json",
    _max_rows: "50000",
  });

  try {
    const response = await fetch(`${BASE_URL}?${params.toString()}`, {
      signal: AbortSignal.timeout(180_000),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 1000)}`);
    const payload = JSON.parse(text);
    return Array.isArray(payload) ? payload : payload.data ?? [];
  } catch (error) {
    if (attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 3000));
      return query(fields, attempt + 1);
    }
    throw error;
  }
}

function numberOf(row: Row, field: string): number {
  return Number(row[field] ?? 0);
}

function sum(rows: Row[], field: string): number {
  return rows.reduce((total, row) => total + numberOf(row, field), 0);
}

function normalizePath(value: string | number | null | undefined): string {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "";
  return raw.startsWith("/") ? raw.replace(/\/+$/, "") || "/" : `/${raw.replace(/\/+$/, "")}`;
}

function isGraduationPath(value: string | number | null | undefined): boolean {
  const path = normalizePath(value);
  return path === "/graduacao" || path.startsWith("/graduacao/") || path === "/en/graduacao" || path.startsWith("/en/graduacao/");
}

function byMetric(rows: Row[], field: string): Row[] {
  return [...rows].sort((a, b) => numberOf(b, field) - numberOf(a, field));
}

async function main() {
  const [pages, pageChannels, landingChannels, monthlyPages, monthlyLandings] = await Promise.all([
    query(["page_path", "pagetitle", "screen_page_views", "totalusers", "sessions", "engaged_sessions", "average_engagement_time"]),
    query(["page_path", "session_default_channel_group", "sessions", "screen_page_views", "engaged_sessions", "conversions"]),
    query(["landing_page", "session_default_channel_group", "sessions", "totalusers", "newusers", "engaged_sessions", "conversions"]),
    query(["year_month", "page_path", "screen_page_views", "totalusers", "sessions", "engaged_sessions"]),
    query(["year_month", "landing_page", "sessions", "totalusers", "newusers", "engaged_sessions", "conversions"]),
  ]);

  const graduationPages = pages.filter((row) => isGraduationPath(row.page_path));
  const graduationPageChannels = pageChannels.filter((row) => isGraduationPath(row.page_path));
  const graduationLandingChannels = landingChannels.filter((row) => isGraduationPath(row.landing_page));
  const graduationMonthlyPages = monthlyPages.filter((row) => isGraduationPath(row.page_path));
  const graduationMonthlyLandings = monthlyLandings.filter((row) => isGraduationPath(row.landing_page));

  const hub = graduationPages.find((row) => normalizePath(row.page_path) === "/graduacao") ?? null;
  const admissions = graduationPages.find((row) => normalizePath(row.page_path) === "/graduacao/admissions") ?? null;
  const hubLanding = graduationLandingChannels.filter((row) => normalizePath(row.landing_page) === "/graduacao");
  const admissionsLanding = graduationLandingChannels.filter((row) => normalizePath(row.landing_page) === "/graduacao/admissions");

  const result = {
    generatedAt: new Date().toISOString(),
    source: { provider: "Google Analytics 4 via Windsor.ai", propertyId: ACCOUNT, propertyName: "apsy" },
    period: PERIOD,
    definitions: {
      hub: "Página institucional de graduação: /graduacao/.",
      graduationJourney: "Páginas com caminho /graduacao/ e /en/graduacao/. Métricas de usuários não são somadas entre páginas para evitar dupla contagem.",
      engagementRate: "Sessões engajadas divididas por sessões, usando o mesmo recorte de landing page.",
    },
    hubPage: hub,
    admissionsPage: admissions,
    graduationJourneyPages: byMetric(graduationPages, "screen_page_views"),
    graduationJourneyTotals: {
      pageViews: sum(graduationPages, "screen_page_views"),
      sessionsAcrossPages: sum(graduationPages, "sessions"),
      engagedSessionsAcrossPages: sum(graduationPages, "engaged_sessions"),
      note: "Somas de visualizações e sessões por página; usuários não são somados por haver navegação entre páginas.",
    },
    landingPage: {
      hub: {
        sessions: sum(hubLanding, "sessions"),
        users: sum(hubLanding, "totalusers"),
        newUsers: sum(hubLanding, "newusers"),
        engagedSessions: sum(hubLanding, "engaged_sessions"),
        conversions: sum(hubLanding, "conversions"),
      },
      admissions: {
        sessions: sum(admissionsLanding, "sessions"),
        users: sum(admissionsLanding, "totalusers"),
        newUsers: sum(admissionsLanding, "newusers"),
        engagedSessions: sum(admissionsLanding, "engaged_sessions"),
        conversions: sum(admissionsLanding, "conversions"),
      },
    },
    acquisition: {
      hubLandingChannels: byMetric(hubLanding, "sessions"),
      admissionsLandingChannels: byMetric(admissionsLanding, "sessions"),
      graduationJourneyPageChannels: byMetric(graduationPageChannels, "sessions"),
    },
    monthly: {
      pageRows: graduationMonthlyPages,
      landingRows: graduationMonthlyLandings,
    },
  };

  writeFileSync("/home/ubuntu/apsy_ga4_graduacao_raw.json", JSON.stringify(result, null, 2));
  console.log(JSON.stringify({
    period: PERIOD,
    graduationPageRows: graduationPages.length,
    hubPage: hub,
    hubLanding: result.landingPage.hub,
    admissionsPage: admissions,
    graduationJourneyTotals: result.graduationJourneyTotals,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
