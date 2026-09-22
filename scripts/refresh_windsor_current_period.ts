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
  googleTotals,
  metaConversationTotals,
  metaTotals,
  windsorFetch,
} from "../server/windsor";

function brtDate(): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function latestDate(rows: Record<string, unknown>[]): string | null {
  const dates = rows
    .map((row) => String(row.date ?? ""))
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
    .sort();
  return dates.at(-1) ?? null;
}

const requestedDateTo = process.argv[2];
if (requestedDateTo && !/^\d{4}-\d{2}-\d{2}$/.test(requestedDateTo)) {
  throw new Error("Use a data de corte no formato YYYY-MM-DD.");
}
const dateTo = requestedDateTo ?? brtDate();
const dateFrom = `${dateTo.slice(0, 7)}-01`;

const jobs = [
  { source: "meta", report: "daily", connector: "facebook" as const, accounts: [META_ACCOUNT], fields: META_DAILY_FIELDS },
  { source: "meta", report: "campaigns", connector: "facebook" as const, accounts: [META_ACCOUNT], fields: META_CAMPAIGN_FIELDS },
  { source: "meta", report: "adsets", connector: "facebook" as const, accounts: [META_ACCOUNT], fields: META_ADSET_FIELDS },
  { source: "meta", report: "ads", connector: "facebook" as const, accounts: [META_ACCOUNT], fields: META_AD_FIELDS },
  { source: "meta", report: "demographics", connector: "facebook" as const, accounts: [META_ACCOUNT], fields: META_DEMO_FIELDS },
  { source: "google", report: "daily", connector: "google_ads" as const, accounts: [GOOGLE_ACCOUNT], fields: GOOGLE_DAILY_FIELDS },
  { source: "google", report: "campaigns", connector: "google_ads" as const, accounts: [GOOGLE_ACCOUNT], fields: GOOGLE_CAMPAIGN_FIELDS },
  { source: "google", report: "keywords", connector: "google_ads" as const, accounts: [GOOGLE_ACCOUNT], fields: GOOGLE_KEYWORD_FIELDS },
  { source: "google", report: "search_terms", connector: "google_ads" as const, accounts: [GOOGLE_ACCOUNT], fields: GOOGLE_SEARCH_TERM_FIELDS },
  { source: "google", report: "devices", connector: "google_ads" as const, accounts: [GOOGLE_ACCOUNT], fields: GOOGLE_DEVICE_FIELDS },
];

const settled = await Promise.allSettled(
  jobs.map(async (job) => {
    const result = await windsorFetch({ ...job, dateFrom, dateTo, forceRefresh: true });
    return {
      source: job.source,
      report: job.report,
      account: job.accounts[0],
      rows: result.rows.length,
      latestDate: latestDate(result.rows),
      fromCache: result.fromCache,
      fetchedAt: result.fetchedAt?.toISOString() ?? null,
      totals: job.report === "daily"
        ? job.source === "meta"
          ? { ...metaTotals(result.rows), conversations: metaConversationTotals(result.rows) }
          : googleTotals(result.rows)
        : undefined,
    };
  }),
);

const output = settled.map((result, index) =>
  result.status === "fulfilled"
    ? { status: "ok", ...result.value }
    : {
        status: "error",
        source: jobs[index].source,
        report: jobs[index].report,
        account: jobs[index].accounts[0],
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      },
);

console.log(JSON.stringify({ dateFrom, dateTo, refreshedAtBRT: new Date().toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" }), output }, null, 2));
