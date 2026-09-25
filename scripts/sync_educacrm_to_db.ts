import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fetchEducaCrmSnapshot, mapEducaCrmSnapshot } from "../server/educacrm";
import { replaceCrmLeads } from "../server/db";
import { isCountedCrmStage } from "../shared/crmFunnel";

const HISTORY_START = "2026-05-01";
const OUTPUT_DIR = path.resolve(process.env.AUDIT_OUTPUT_DIR ?? "artifacts");

function brtDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function asDate(value: string | Date) {
  return value instanceof Date
    ? value
    : new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
}

async function main() {
  const requestedCutoff = process.argv[2] ?? brtDate();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedCutoff)) {
    throw new Error(
      "Uso: pnpm exec tsx scripts/sync_educacrm_to_db.ts [YYYY-MM-DD]"
    );
  }

  const snapshot = await fetchEducaCrmSnapshot(true);
  const mapped = mapEducaCrmSnapshot(snapshot).filter(lead => {
    const date = String(lead.createdDate).slice(0, 10);
    return date >= HISTORY_START && date <= requestedCutoff;
  });

  if (snapshot.leads.length < 100 || mapped.length < 100) {
    throw new Error(
      `Carga recusada por segurança: ${snapshot.leads.length} leads brutos e ${mapped.length} normalizados`
    );
  }

  const rows = mapped.map(lead => ({
    externalId: lead.externalId,
    companyName: lead.companyName,
    contactName: lead.contactName,
    email: lead.email,
    phone: lead.phone,
    cpf: lead.cpf,
    sourceChannel: lead.sourceChannel,
    formName: lead.formName,
    utmSource: lead.utmSource,
    utmMedium: lead.utmMedium,
    utmCampaign: lead.utmCampaign,
    cep: lead.cep,
    street: lead.street,
    addrNumber: lead.addrNumber,
    neighborhood: lead.neighborhood,
    city: lead.city,
    state: lead.state,
    birthDate: lead.birthDate,
    products: lead.products,
    extraContext: lead.extraContext,
    status: lead.status,
    opportunityNumber: lead.opportunityNumber,
    opportunityName: lead.opportunityName,
    opportunityTag: lead.opportunityTag,
    opportunityStage: lead.opportunityStage,
    createdDate: asDate(lead.createdDate),
    updatedDate: lead.updatedDate ? asDate(lead.updatedDate) : null,
  }));

  const persisted = await replaceCrmLeads(rows);
  const byStage = Object.fromEntries(
    Array.from(
      mapped
        .reduce((counts, lead) => {
          const stage = lead.opportunityStage ?? "SEM_ETAPA";
          counts.set(stage, (counts.get(stage) ?? 0) + 1);
          return counts;
        }, new Map<string, number>())
        .entries()
    ).sort((a, b) => b[1] - a[1])
  );
  const valid = mapped.filter(lead => isCountedCrmStage(lead.opportunityStage));
  const dates = mapped
    .map(lead => String(lead.createdDate).slice(0, 10))
    .sort();

  const summary = {
    syncedAt: new Date().toISOString(),
    syncedAtBrt: new Date().toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
    }),
    source: "EducaCRM API",
    cutoffBrt: requestedCutoff,
    raw: {
      leads: snapshot.leads.length,
      contacts: snapshot.contacts.length,
      enrollments: snapshot.enrollments.length,
    },
    persisted,
    validOpportunities: valid.length,
    byStage,
    dateFrom: dates[0] ?? null,
    dateTo: dates.at(-1) ?? null,
    utmCoverage: mapped.filter(
      lead => lead.utmSource || lead.utmMedium || lead.utmCampaign
    ).length,
  };

  mkdirSync(OUTPUT_DIR, { recursive: true });
  const output = `${OUTPUT_DIR}/APSY_EducaCRM_Sync_${requestedCutoff.replaceAll("-", "")}.json`;
  writeFileSync(output, `${JSON.stringify(summary, null, 2)}\n`, {
    mode: 0o600,
  });
  console.log(JSON.stringify({ output, ...summary }, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
