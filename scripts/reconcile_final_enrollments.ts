import { readFile, writeFile } from "node:fs/promises";
import { getCrmLeads } from "../server/db";

type EnrolledRecord = {
  student_number: string;
  name: string;
  normalized_name: string;
  course: string;
  status: string;
  included_date: string | null;
  is_placeholder: boolean;
};

function normalize(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function courseTokens(course: string) {
  const text = normalize(course);
  if (text.includes("neuropsic")) return ["neuropsic", "avaliacao neuro", "an"];
  if (text.includes("modelos contemporaneos") || text.includes("tcc")) {
    return ["tcc", "modelos contemporaneos", "cognitivo comportamental"];
  }
  if (text.includes("baseada em processos"))
    return ["tbp", "baseada em processos", "terapia baseada em processos"];
  return text.split(" ").filter(token => token.length >= 4);
}

function sourceGroup(lead: any) {
  const text = normalize(
    [
      lead.sourceChannel,
      lead.utmSource,
      lead.utmMedium,
      lead.utmCampaign,
      lead.formName,
    ].join(" ")
  );
  if (/google|cpc|search|gads/.test(text)) return "Google";
  if (/facebook|instagram|meta|whatsapp|fb|ig/.test(text))
    return "Meta / WhatsApp";
  if (/organic|organico|direto|direct/.test(text)) return "Orgânico / Direto";
  return "Outros / não identificado";
}

function scoreCandidate(lead: any, student: EnrolledRecord) {
  const context = normalize(
    [
      lead.products,
      lead.opportunityName,
      lead.opportunityTag,
      lead.utmCampaign,
      lead.formName,
      lead.extraContext,
    ].join(" ")
  );
  const tokens = courseTokens(student.course);
  const courseScore = tokens.some(token => context.includes(token)) ? 100 : 0;
  const stageScore: Record<string, number> = {
    MATRICULADO: 50,
    FECHAMENTO: 40,
    QUALIFICADO: 30,
    EM_ATENDIMENTO: 20,
    NAO_LOCALIZADO: 10,
  };
  const stage = String(lead.opportunityStage ?? "")
    .trim()
    .toUpperCase();
  const validScore = stage && stage !== "FORA_DA_BASE" ? 5 : 0;
  return courseScore + (stageScore[stage] ?? 0) + validScore;
}

async function main() {
  const audit = JSON.parse(
    await readFile("/home/ubuntu/apsy_final_enrollment_audit.json", "utf8")
  );
  const students: EnrolledRecord[] = audit.enrolled_records.filter(
    (record: EnrolledRecord) => !record.is_placeholder
  );
  const crm = await getCrmLeads();
  const byName = new Map<string, any[]>();
  for (const lead of crm) {
    const key = normalize(lead.contactName);
    if (!key) continue;
    const list = byName.get(key) ?? [];
    list.push(lead);
    byName.set(key, list);
  }

  const reconciled = students.map(student => {
    const candidates = byName.get(normalize(student.name)) ?? [];
    const ranked = candidates
      .map(lead => ({ lead, score: scoreCandidate(lead, student) }))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return String(b.lead.updatedDate ?? "").localeCompare(
          String(a.lead.updatedDate ?? "")
        );
      });
    const chosen = ranked[0]?.lead;
    return {
      ...student,
      match_count: candidates.length,
      matched: Boolean(chosen),
      match_basis: chosen ? "nome completo normalizado" : null,
      selected_score: ranked[0]?.score ?? null,
      crm: chosen
        ? {
            external_id: chosen.externalId,
            source_channel: chosen.sourceChannel,
            form_name: chosen.formName,
            utm_source: chosen.utmSource,
            utm_medium: chosen.utmMedium,
            utm_campaign: chosen.utmCampaign,
            products: chosen.products,
            opportunity_name: chosen.opportunityName,
            opportunity_tag: chosen.opportunityTag,
            opportunity_stage: chosen.opportunityStage,
            created_date: chosen.createdDate,
            updated_date: chosen.updatedDate,
            source_group: sourceGroup(chosen),
          }
        : null,
    };
  });

  const matched = reconciled.filter(row => row.matched);
  const countBy = (items: any[], getter: (item: any) => string) =>
    Object.fromEntries(
      Array.from(
        items
          .reduce((map, item) => {
            const key = getter(item) || "Não informado";
            map.set(key, (map.get(key) ?? 0) + 1);
            return map;
          }, new Map<string, number>())
          .entries()
      ).sort((a, b) => b[1] - a[1])
    );

  const result = {
    generated_at: new Date().toISOString(),
    basis:
      "Correspondência exata por nome completo normalizado; não comprova atribuição de mídia.",
    official_enrolled: audit.official_enrolled,
    identified_enrolled: students.length,
    matched_in_crm: matched.length,
    unmatched_in_crm: reconciled.length - matched.length,
    multiple_name_matches: reconciled.filter(row => row.match_count > 1).length,
    by_course: countBy(reconciled, row => row.course),
    coverage_by_course: Object.fromEntries(
      Object.entries(countBy(reconciled, row => row.course)).map(
        ([course, total]) => {
          const matchedForCourse = matched.filter(
            row => row.course === course
          ).length;
          return [
            course,
            {
              identified: total,
              matched_in_crm: matchedForCourse,
              coverage_pct: Number(
                ((matchedForCourse / total) * 100).toFixed(1)
              ),
            },
          ];
        }
      )
    ),
    matched_by_source_group: countBy(matched, row => row.crm?.source_group),
    matched_by_source_channel: countBy(matched, row => row.crm?.source_channel),
    matched_by_stage: countBy(matched, row => row.crm?.opportunity_stage),
    matched_by_campaign: countBy(matched, row => row.crm?.utm_campaign),
    unmatched_students: reconciled
      .filter(row => !row.matched)
      .map(row => ({
        student_number: row.student_number,
        name: row.name,
        course: row.course,
      })),
    reconciled,
  };

  await writeFile(
    "/home/ubuntu/apsy_final_enrollment_reconciliation.json",
    `${JSON.stringify(result, null, 2)}\n`,
    "utf8"
  );
  console.log(
    JSON.stringify(
      {
        official_enrolled: result.official_enrolled,
        identified_enrolled: result.identified_enrolled,
        matched_in_crm: result.matched_in_crm,
        unmatched_in_crm: result.unmatched_in_crm,
        multiple_name_matches: result.multiple_name_matches,
        by_course: result.by_course,
        coverage_by_course: result.coverage_by_course,
        matched_by_source_group: result.matched_by_source_group,
        matched_by_source_channel: result.matched_by_source_channel,
        matched_by_stage: result.matched_by_stage,
        unmatched_students: result.unmatched_students,
      },
      null,
      2
    )
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
