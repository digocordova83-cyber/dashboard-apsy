export const CRM_PIPELINE_STAGES = [
  "NAO_LOCALIZADO",
  "EM_ATENDIMENTO",
  "QUALIFICADO",
  "FECHAMENTO",
  "MATRICULADO",
] as const;

export const CRM_OUTCOME_STAGES = [
  "RECUSA",
  "DESQUALIFICADO",
  "ENCAMINHADO_GRADUACAO",
] as const;

export const CRM_EXCLUDED_STAGES = ["FORA_DA_BASE"] as const;

export const CRM_STAGE_ORDER = [
  ...CRM_PIPELINE_STAGES,
  ...CRM_OUTCOME_STAGES,
  ...CRM_EXCLUDED_STAGES,
] as const;

export type CrmFunnelStage = (typeof CRM_STAGE_ORDER)[number];

export type CrmStageDefinition = {
  key: CrmFunnelStage;
  label: string;
  shortLabel: string;
  definition: string;
  tabulations: readonly string[];
  nextAction: string;
  group: "pipeline" | "outcome" | "excluded";
  color: string;
};

export const CRM_STAGE_DEFINITIONS: readonly CrmStageDefinition[] = [
  {
    key: "NAO_LOCALIZADO",
    label: "1 — Não Localizado",
    shortLabel: "Não Localizado",
    definition: "O comercial tentou contato e ainda não teve resposta.",
    tabulations: ["não_localizado"],
    nextAction: "Seguir cadência de tentativas",
    group: "pipeline",
    color: "#0B5662",
  },
  {
    key: "EM_ATENDIMENTO",
    label: "2 — Em Atendimento",
    shortLabel: "Em Atendimento",
    definition:
      "Lead acionado, respondeu e está conversando; o perfil ainda está em avaliação.",
    tabulations: ["em_atendimento", "sem_interação-qualificação"],
    nextAction: "Qualificar curso, formação, momento e condição financeira",
    group: "pipeline",
    color: "#168C96",
  },
  {
    key: "QUALIFICADO",
    label: "3 — Qualificado",
    shortLabel: "Qualificado",
    definition: "Tem perfil e interesse real; negociação em andamento.",
    tabulations: ["short_list", "sem_interação-negociação"],
    nextAction: "Enviar proposta e conduzir negociação",
    group: "pipeline",
    color: "#24B8C1",
  },
  {
    key: "FECHAMENTO",
    label: "4 — Fechamento",
    shortLabel: "Fechamento",
    definition: "Aceitou; falta contrato ou pagamento.",
    tabulations: ["pendente-contrato", "pendente-pagamento"],
    nextAction: "Cobrar contrato ou pagamento",
    group: "pipeline",
    color: "#66CDD2",
  },
  {
    key: "MATRICULADO",
    label: "5 — Matriculado",
    shortLabel: "Matriculado",
    definition: "Conversão confirmada.",
    tabulations: ["matriculado"],
    nextAction: "Passar para a equipe de permanência",
    group: "pipeline",
    color: "#34D399",
  },
  {
    key: "RECUSA",
    label: "Recusa",
    shortLabel: "Recusa",
    definition: "Foi acionado e disse não; nunca entra em Qualificado.",
    tabulations: [
      "recusa-sem_interesse",
      "recusa_curso_de_interesse",
      "recusa-datas-disponibilidade",
      "recusa-financeira",
      "recusa-localização",
      "recusa-outra_ies",
      "recusa_proximo_semestre",
    ],
    nextAction: "Registrar motivo; reativar somente se marcado",
    group: "outcome",
    color: "#F06A63",
  },
  {
    key: "DESQUALIFICADO",
    label: "Desqualificado",
    shortLabel: "Desqualificado",
    definition:
      "Não tem perfil para o curso por formação, condição financeira ou público.",
    tabulations: [
      "bad_fit",
      "recusa_formação_incompleta",
      "recusa_sem_perfil_financeiro",
    ],
    nextAction: "Não contactar",
    group: "outcome",
    color: "#D9A928",
  },
  {
    key: "ENCAMINHADO_GRADUACAO",
    label: "Encaminhado p/ Graduação",
    shortLabel: "Encaminhado p/ Graduação",
    definition: "Entrou pela pós, mas o interesse identificado é graduação.",
    tabulations: ["interesse_graduacao"],
    nextAction: "Mover para o funil de Graduação",
    group: "outcome",
    color: "#9B8AE8",
  },
  {
    key: "FORA_DA_BASE",
    label: "Fora da Base",
    shortLabel: "Fora da Base",
    definition:
      "Teste ou atendimento feito em outro canal; excluído dos indicadores.",
    tabulations: ["atendimento_outro_canal", "teste"],
    nextAction: "Nenhuma",
    group: "excluded",
    color: "#7D8B91",
  },
] as const;

export const CRM_STAGE_BY_KEY = Object.fromEntries(
  CRM_STAGE_DEFINITIONS.map(definition => [definition.key, definition])
) as Record<CrmFunnelStage, CrmStageDefinition>;

const STAGE_PRIORITY: Record<CrmFunnelStage, number> = {
  FORA_DA_BASE: 100,
  MATRICULADO: 90,
  ENCAMINHADO_GRADUACAO: 85,
  DESQUALIFICADO: 85,
  RECUSA: 85,
  FECHAMENTO: 80,
  QUALIFICADO: 70,
  EM_ATENDIMENTO: 40,
  NAO_LOCALIZADO: 30,
};

export function normalizeCrmTabulation(
  value: string | null | undefined
): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const TABULATION_STAGE = new Map<string, CrmFunnelStage>();

function register(stage: CrmFunnelStage, aliases: readonly string[]) {
  for (const alias of aliases)
    TABULATION_STAGE.set(normalizeCrmTabulation(alias), stage);
}

for (const definition of CRM_STAGE_DEFINITIONS) {
  register(definition.key, [
    definition.key,
    definition.label,
    definition.shortLabel,
    ...definition.tabulations,
  ]);
}

// Aliases já encontrados no catálogo e no histórico do EducaCRM. Eles mantêm
// a série anterior legível até o CRM adotar integralmente os códigos oficiais.
register("NAO_LOCALIZADO", [
  "novoleadsemcontato",
  "nao-atende-1",
  "nao-atende-2",
  "nao-atende-3",
  "parouderesponder",
  "hubspot-2026-05-11",
  "preinscricaoposgraduacao",
  "preins-posgrad",
  "leadcataleadlp",
  "cata-lead-lp",
  "leadfaleconosco",
  "lead-fale-conosco",
]);
register("EM_ATENDIMENTO", [
  "contato-omni",
  "whatsapp-enviado",
  "material_enviado",
  "transferencia",
  "incompleto",
]);
register("QUALIFICADO", [
  "emnegociacao",
  "aprovado",
  "nota-reaproveitada",
  "oferta-base",
]);
register("FECHAMENTO", [
  "aguardandodocumentac",
  "pre-matriculado",
  "inscrito-pago",
]);
register("RECUSA", [
  "recusa",
  "outro-curso",
  "outra-instituicao",
  "lead_nao_com",
  "sem-disp-integral",
  "desistiu_pos_26_2",
  "desistiu-proximo-sem",
  "desistiu-outros",
  "desistiu-outra-ies",
  "desistiu-nao-informa",
  "desistiu-localizacao",
  "desistiu-financeiro",
  "cond-financeira",
  "aguard_cond_especial",
  "aguardandonovaturma",
]);
register("DESQUALIFICADO", [
  "badfit",
  "semperfilfinanceiro",
  "nao-tem-psicologia",
  "desistiu-em-incomple",
  "desemprego",
]);
register("ENCAMINHADO_GRADUACAO", [
  "inscrito_graduacao",
  "leadgraduacaoaviseme",
  "cl-grad-aviseme",
  "preinscricaograduacao",
  "preins-grad",
]);
register("FORA_DA_BASE", ["atendimento-outro-canal"]);

export function crmStageFromTabulation(
  value: string | null | undefined
): CrmFunnelStage | null {
  const normalized = normalizeCrmTabulation(value);
  return normalized ? (TABULATION_STAGE.get(normalized) ?? null) : null;
}

export function crmStageFromTabulations(
  values: readonly (string | null | undefined)[]
): CrmFunnelStage | null {
  let selected: CrmFunnelStage | null = null;
  for (const value of values) {
    if (!value) continue;
    const candidates = value.split(/\s*,\s*/);
    for (const candidate of candidates) {
      const stage = crmStageFromTabulation(candidate);
      if (
        stage &&
        (!selected || STAGE_PRIORITY[stage] > STAGE_PRIORITY[selected])
      )
        selected = stage;
    }
  }
  return selected;
}

export function isCrmStage(
  value: string | null | undefined
): value is CrmFunnelStage {
  return (
    !!value && Object.prototype.hasOwnProperty.call(CRM_STAGE_BY_KEY, value)
  );
}

export function isCountedCrmStage(
  value: string | null | undefined
): value is CrmFunnelStage {
  return isCrmStage(value) && value !== "FORA_DA_BASE";
}

export function isPipelineCrmStage(
  value: string | null | undefined
): value is (typeof CRM_PIPELINE_STAGES)[number] {
  return !!value && (CRM_PIPELINE_STAGES as readonly string[]).includes(value);
}

export function crmStageLabel(value: string | null | undefined): string {
  return isCrmStage(value)
    ? CRM_STAGE_BY_KEY[value].shortLabel
    : "Sem classificação";
}
