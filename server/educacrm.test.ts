import { describe, expect, it } from "vitest";
import { mapEducaCrmSnapshot, type EducaCrmSnapshot } from "./educacrm";

const baseLead = {
  email: null,
  celular: null,
  telefone: null,
  cpf: null,
  data_criacao_original: null,
  data_criacao: "2026-09-20T10:00:00",
  data_atualizacao: "2026-09-20T11:00:00",
  curso: null,
  tipo: "pos-graduacao",
  turno: null,
  modalidade: "presencial",
  acao: null,
  unidade: "artmed",
  polo: null,
  situacao: null,
  tags: [],
  utm_sources: [],
  utm_mediums: [],
  utm_campaigns: [],
  utm_contents: [],
  utm_terms: [],
  referer: [],
};

const baseContact = {
  email: "",
  celular: null,
  telefone: null,
  cpf: null,
  curso: null,
  tipo: "pos-graduacao",
  turno: null,
  modalidade: "presencial",
  unidade: "artmed",
  polo: null,
  cidade: null,
  estado: null,
  acao: null,
  tags: [],
  str_tags: "",
  utm_sources: [],
  utm_mediums: [],
  utm_campaigns: [],
  utm_contents: [],
  utm_terms: [],
  data_ultimo_hsm: null,
  data_ultima_atividade_omni: null,
};

const baseEnrollment = {
  email: "",
  celular: null,
  telefone: null,
  cpf: null,
  data_nascimento: null,
  endereco: null,
  numero: null,
  bairro: null,
  cidade: null,
  estado: null,
  cep: null,
  curso: "terapia-processos",
  tipo: "pos-graduacao",
  turno: "noturno",
  modalidade: "presencial",
  polo: null,
  unidade: "artmed",
  concurso: "P2026.2",
  data_criacao: "2026-09-20T12:00:00",
  data_aprovacao: null,
  data_pgto_matricula: null,
  data_efetiv_matricula: null,
  data_cancel_matricula: null,
  matricula_academica: null,
  situacao: null,
  tags: [],
  utm_sources: [],
  utm_mediums: [],
  utm_campaigns: [],
  utm_contents: [],
  utm_terms: [],
};

describe("EducaCRM mapping", () => {
  it("normaliza o histórico para o funil oficial e exclui teste", () => {
    const snapshot: EducaCrmSnapshot = {
      fetchedAt: new Date("2026-09-21T12:00:00Z"),
      courses: [
        {
          codigo: "terapia-processos",
          nome: "Terapia Baseada em Processos",
          produto: "pos-graduacao",
        },
      ],
      situations: [],
      leads: [
        { ...baseLead, id: 1, nome: "MQL", contato: 1 },
        { ...baseLead, id: 2, nome: "SAL", contato: 2, acao: "contato-omni" },
        { ...baseLead, id: 3, nome: "SQL", contato: 3, email: "sql@apsy.test" },
        {
          ...baseLead,
          id: 4,
          nome: "Matrícula",
          contato: 4,
          email: "matricula@apsy.test",
        },
        { ...baseLead, id: 5, nome: "Teste", contato: 5, tags: ["teste"] },
      ],
      contacts: [
        { ...baseContact, id: 1, nome: "MQL" },
        {
          ...baseContact,
          id: 2,
          nome: "SAL",
          data_ultima_atividade_omni: "2026-09-20T11:00:00",
        },
        { ...baseContact, id: 3, nome: "SQL", email: "sql@apsy.test" },
        {
          ...baseContact,
          id: 4,
          nome: "Matrícula",
          email: "matricula@apsy.test",
        },
        { ...baseContact, id: 5, nome: "Teste" },
      ],
      enrollments: [
        {
          ...baseEnrollment,
          codigo: "I1",
          nome: "SQL",
          email: "sql@apsy.test",
          etapa: "aprovado",
        },
        {
          ...baseEnrollment,
          codigo: "I2",
          nome: "Matrícula",
          email: "matricula@apsy.test",
          etapa: "matriculado",
        },
      ],
    };

    const rows = mapEducaCrmSnapshot(snapshot);
    expect(
      Object.fromEntries(
        rows.map(row => [row.contactName, row.opportunityStage])
      )
    ).toMatchObject({
      MQL: "NAO_LOCALIZADO",
      SAL: "EM_ATENDIMENTO",
      SQL: "QUALIFICADO",
      Matrícula: "MATRICULADO",
      Teste: "FORA_DA_BASE",
    });
  });

  it("aplica as tabulações oficiais recebidas do comercial", () => {
    const cases = [
      ["não_localizado", "NAO_LOCALIZADO"],
      ["em_atendimento", "EM_ATENDIMENTO"],
      ["short_list", "QUALIFICADO"],
      ["pendente-pagamento", "FECHAMENTO"],
      ["matriculado", "MATRICULADO"],
      ["recusa-financeira", "RECUSA"],
      ["bad_fit", "DESQUALIFICADO"],
      ["interesse_graduacao", "ENCAMINHADO_GRADUACAO"],
      ["atendimento_outro_canal", "FORA_DA_BASE"],
    ] as const;
    const snapshot: EducaCrmSnapshot = {
      fetchedAt: new Date("2026-09-25T12:00:00Z"),
      courses: [],
      situations: [],
      leads: cases.map(([situacao], index) => ({
        ...baseLead,
        id: index + 100,
        nome: situacao,
        contato: index + 100,
        situacao,
      })),
      contacts: cases.map(([situacao], index) => ({
        ...baseContact,
        id: index + 100,
        nome: situacao,
      })),
      enrollments: [],
    };
    const stages = Object.fromEntries(
      mapEducaCrmSnapshot(snapshot).map(row => [
        row.contactName,
        row.opportunityStage,
      ])
    );
    for (const [tabulation, expected] of cases)
      expect(stages[tabulation]).toBe(expected);
  });

  it("preserva inscrições múltiplas e inclui as não conciliadas", () => {
    const snapshot: EducaCrmSnapshot = {
      fetchedAt: new Date("2026-09-21T12:00:00Z"),
      courses: [
        {
          codigo: "terapia-processos",
          nome: "Terapia Baseada em Processos",
          produto: "pos-graduacao",
        },
      ],
      situations: [],
      leads: [
        {
          ...baseLead,
          id: 10,
          nome: "Pessoa",
          contato: 10,
          email: "pessoa@apsy.test",
        },
        {
          ...baseLead,
          id: 11,
          nome: "Pessoa",
          contato: 10,
          email: "pessoa@apsy.test",
          data_criacao: "2026-09-19T10:00:00",
        },
      ],
      contacts: [
        { ...baseContact, id: 10, nome: "Pessoa", email: "pessoa@apsy.test" },
      ],
      enrollments: [
        {
          ...baseEnrollment,
          codigo: "I10",
          nome: "Pessoa",
          email: "pessoa@apsy.test",
          etapa: "aprovado",
        },
        {
          ...baseEnrollment,
          codigo: "I11",
          nome: "Pessoa",
          email: "pessoa@apsy.test",
          etapa: "matriculado",
        },
        {
          ...baseEnrollment,
          codigo: "I12",
          nome: "Sem lead",
          email: "semlead@apsy.test",
          etapa: "aprovado",
        },
      ],
    };

    const rows = mapEducaCrmSnapshot(snapshot);
    expect(rows).toHaveLength(3);
    expect(
      rows.filter(row => row.opportunityStage === "MATRICULADO")
    ).toHaveLength(1);
    expect(
      rows.filter(row => row.opportunityStage === "QUALIFICADO")
    ).toHaveLength(2);
    expect(rows.some(row => row.externalId === "educacrm-inscrito:I12")).toBe(
      true
    );
  });
});
