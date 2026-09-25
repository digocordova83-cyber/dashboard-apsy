import { describe, expect, it } from "vitest";
import {
  CRM_PIPELINE_STAGES,
  CRM_STAGE_ORDER,
  crmStageFromTabulation,
  crmStageFromTabulations,
  isCountedCrmStage,
} from "./crmFunnel";

describe("CRM funnel taxonomy", () => {
  it("mantém a ordem oficial do funil", () => {
    expect(CRM_PIPELINE_STAGES).toEqual([
      "NAO_LOCALIZADO",
      "EM_ATENDIMENTO",
      "QUALIFICADO",
      "FECHAMENTO",
      "MATRICULADO",
    ]);
    expect(CRM_STAGE_ORDER).toContain("RECUSA");
    expect(CRM_STAGE_ORDER).toContain("FORA_DA_BASE");
  });

  it("normaliza acentos, espaços, hífens e underscores", () => {
    expect(crmStageFromTabulation("sem_interação-qualificação")).toBe(
      "EM_ATENDIMENTO"
    );
    expect(crmStageFromTabulation("recusa-localização")).toBe("RECUSA");
    expect(crmStageFromTabulation("recusa_formação_incompleta")).toBe(
      "DESQUALIFICADO"
    );
  });

  it("preserva aliases históricos e prioriza a etapa mais avançada", () => {
    expect(crmStageFromTabulation("contato-omni")).toBe("EM_ATENDIMENTO");
    expect(crmStageFromTabulations(["contato-omni", "aprovado"])).toBe(
      "QUALIFICADO"
    );
    expect(crmStageFromTabulations(["hubspot-2026-05-11", "matriculado"])).toBe(
      "MATRICULADO"
    );
  });

  it("exclui Fora da Base dos indicadores", () => {
    expect(isCountedCrmStage("FORA_DA_BASE")).toBe(false);
    expect(isCountedCrmStage("ENCAMINHADO_GRADUACAO")).toBe(true);
    expect(isCountedCrmStage("QUALIFICADO")).toBe(true);
  });
});
