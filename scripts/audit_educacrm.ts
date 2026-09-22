import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fetchEducaCrmSnapshot, mapEducaCrmSnapshot } from "../server/educacrm";

const OUTPUT_DIR = path.resolve(process.env.AUDIT_OUTPUT_DIR ?? "artifacts");
const JSON_PATH = `${OUTPUT_DIR}/APSY_EducaCRM_Auditoria_20260921.json`;
const MD_PATH = `${OUTPUT_DIR}/APSY_EducaCRM_Auditoria_20260921.md`;

function countBy<T>(rows: T[], key: (row: T) => string | null | undefined) {
  return Object.fromEntries(
    Array.from(rows.reduce((map, row) => {
      const value = key(row)?.trim() || "(vazio)";
      map.set(value, (map.get(value) ?? 0) + 1);
      return map;
    }, new Map<string, number>()).entries()).sort((a, b) => b[1] - a[1]),
  );
}

function pct(value: number, total: number) {
  return total ? Number((value * 100 / total).toFixed(1)) : 0;
}

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const snapshot = await fetchEducaCrmSnapshot(true);
  const normalised = mapEducaCrmSnapshot(snapshot);
  const valid = normalised.filter((row) => row.opportunityStage && row.opportunityStage !== "OUTROS");
  const withUtm = normalised.filter((row) => row.utmSource || row.utmMedium || row.utmCampaign);
  const dates = normalised.map((row) => String(row.createdDate).slice(0, 10)).filter(Boolean).sort();
  const unmatchedEnrollments = normalised.filter((row) => row.externalId?.startsWith("educacrm-inscrito:"));

  const report = {
    generatedAt: new Date().toISOString(),
    source: "EducaCRM API",
    authentication: "Authorization: Token [secret]",
    raw: {
      leads: snapshot.leads.length,
      contacts: snapshot.contacts.length,
      enrollments: snapshot.enrollments.length,
      courses: snapshot.courses.length,
      situations: snapshot.situations.length,
    },
    normalized: {
      rows: normalised.length,
      validOpportunities: valid.length,
      excludedAsOutros: normalised.length - valid.length,
      dateFrom: dates[0] ?? null,
      dateTo: dates.at(-1) ?? null,
      withAnyUtm: withUtm.length,
      utmCoveragePct: pct(withUtm.length, normalised.length),
      unmatchedEnrollmentsAddedAsRows: unmatchedEnrollments.length,
    },
    funnel: countBy(normalised, (row) => row.opportunityStage),
    channels: countBy(valid, (row) => row.sourceChannel),
    channelFamilies: countBy(valid, (row) => {
      const source = row.sourceChannel.toLowerCase();
      if (source.includes("whatsapp")) return "WhatsApp";
      if (source === "meta" || source.includes("facebook") || source.includes("instagram")) return "Meta";
      if (source === "google" || source.includes("adwords")) return "Google";
      if (source.includes("form")) return "Formulários";
      if (source.includes("importacao")) return "Importação histórica";
      return "Outros";
    }),
    courses: countBy(valid, (row) => row.products),
    enrollmentSignals: {
      stageMatriculado: snapshot.enrollments.filter((row) => row.etapa === "matriculado").length,
      withEnrollmentPaymentDate: snapshot.enrollments.filter((row) => !!row.data_pgto_matricula).length,
      withEnrollmentEffectiveDate: snapshot.enrollments.filter((row) => !!row.data_efetiv_matricula).length,
      withAcademicEnrollmentId: snapshot.enrollments.filter((row) => !!row.matricula_academica).length,
      withCancellationDate: snapshot.enrollments.filter((row) => !!row.data_cancel_matricula).length,
    },
    rawLeadActions: countBy(snapshot.leads, (row) => row.acao),
    rawLeadTags: countBy(snapshot.leads.flatMap((row) => row.tags), (value) => typeof value === "string" ? value : null),
    rawEnrollmentStages: countBy(snapshot.enrollments, (row) => row.etapa),
    methodology: {
      MQL: "Lead captado no EducaCRM sem atividade comercial nem inscrição localizada.",
      SAL: "Lead associado a contato com atividade/HSM no Omni ou originado em contato-omni.",
      SQL: "Lead reconciliado com registro em ingresso/inscritos, ainda sem matrícula ativa.",
      MATRICULADO: "Inscrito sem cancelamento e com etapa matriculado, data de efetivação ou matrícula acadêmica.",
      OUTROS: "Registro marcado como teste.",
    },
  };

  writeFileSync(JSON_PATH, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });

  const stage = report.funnel;
  const markdown = `# Auditoria da migração para o EducaCRM\n\n` +
    `**Fonte:** EducaCRM API, consultada em ${new Date(report.generatedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} BRT.\n\n` +
    `| Indicador | Total |\n|---|---:|\n` +
    `| Leads brutos | ${report.raw.leads.toLocaleString("pt-BR")} |\n` +
    `| Contatos | ${report.raw.contacts.toLocaleString("pt-BR")} |\n` +
    `| Inscritos | ${report.raw.enrollments.toLocaleString("pt-BR")} |\n` +
    `| Registros normalizados | ${report.normalized.rows.toLocaleString("pt-BR")} |\n` +
    `| Oportunidades válidas | ${report.normalized.validOpportunities.toLocaleString("pt-BR")} |\n` +
    `| Cobertura de alguma UTM | ${report.normalized.withAnyUtm.toLocaleString("pt-BR")} (${report.normalized.utmCoveragePct.toLocaleString("pt-BR")}%) |\n\n` +
    `## Funil normalizado\n\n| Etapa | Total |\n|---|---:|\n` +
    ["MQL", "SAL", "SQL", "MATRICULADO", "OUTROS"].map((name) => `| ${name} | ${(stage[name] ?? 0).toLocaleString("pt-BR")} |`).join("\n") +
    `\n\n## Critério aplicado\n\n` +
    `O novo CRM não expõe MQL, SAL e SQL como campos prontos. O dashboard usa uma regra auditável baseada nas entidades disponíveis: lead captado como MQL; atividade comercial no Omni como SAL; registro em inscritos como SQL; matrícula efetivada como MATRICULADO; testes como OUTROS. O histórico do Cirqua não é combinado com a nova fonte.\n`;
  writeFileSync(MD_PATH, markdown, { mode: 0o600 });

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
