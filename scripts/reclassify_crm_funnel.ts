import { getCrmLeads, replaceCrmLeads } from "../server/db";
import {
  crmStageFromTabulations,
  type CrmFunnelStage,
} from "../shared/crmFunnel";

const LEGACY_STAGE_FALLBACK: Record<string, CrmFunnelStage> = {
  MQL: "NAO_LOCALIZADO",
  SAL: "EM_ATENDIMENTO",
  SQL: "QUALIFICADO",
  MATRICULADO: "MATRICULADO",
  OUTROS: "FORA_DA_BASE",
};

async function main() {
  const current = await getCrmLeads();
  if (current.length < 100)
    throw new Error(
      `Reclassificação recusada: somente ${current.length} registros no snapshot`
    );

  const rows = current.map(({ id: _id, ...row }) => {
    const legacy = String(row.opportunityStage ?? "").toUpperCase();
    const opportunityStage =
      crmStageFromTabulations([
        row.opportunityTag,
        row.opportunityStage,
        row.formName,
      ]) ??
      LEGACY_STAGE_FALLBACK[legacy] ??
      "NAO_LOCALIZADO";
    return {
      ...row,
      opportunityStage,
      status:
        opportunityStage === "MATRICULADO"
          ? "ganho"
          : ["RECUSA", "DESQUALIFICADO", "FORA_DA_BASE"].includes(
                opportunityStage
              )
            ? "perdido"
            : opportunityStage === "ENCAMINHADO_GRADUACAO"
              ? "encaminhado"
              : "aberto",
    };
  });

  const persisted = await replaceCrmLeads(rows);
  const byStage = Object.fromEntries(
    rows.reduce((map, row) => {
      map.set(row.opportunityStage, (map.get(row.opportunityStage) ?? 0) + 1);
      return map;
    }, new Map<string, number>())
  );

  console.log(
    JSON.stringify({ sourceRows: current.length, persisted, byStage }, null, 2)
  );
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
