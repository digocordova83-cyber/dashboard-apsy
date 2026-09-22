import { describe, expect, it } from "vitest";
import { channelFamily, parseLeadsCsv } from "./leadsCsv";

const HEADER = `"ID";"Nome da Empresa";"Setor";"Nome do Contato";"Email";"Telefone";"CNPJ";"CPF";"Canal de Origem";"Formulário";"UTM Source";"UTM Medium";"UTM Campaign";"CEP";"Rua";"Número";"Bairro";"Cidade";"Estado";"Data de Nascimento";"Produtos";"Contexto Adicional";"Status";"Oportunidade (Nº)";"Oportunidade (Nome)";"Oportunidade (Tag)";"Oportunidade (Etapa)";"Criado em";"Atualizado em"`;

const ROW = `"1535";"maria";"";"Maria Silva";"maria@x.com";"5511999998888";"";"";"meta_lead_ads";"";"ig";"paid_social";"bbro - leads - form nativo";"";"";"";"";"São Paulo";"SP";"";"Pós Validado";"sou_graduado(a)_em_psicologia";"cadastrado";"417";"maria";"acionado";"MQL";"27/07/2026";"27/07/2026"`;

describe("parseLeadsCsv", () => {
  it("faz parse do CSV do CRM com BOM, aspas e datas dd/mm/yyyy", () => {
    const res = parseLeadsCsv(`\uFEFF${HEADER}\n${ROW}\n`);
    expect(res.total).toBe(1);
    expect(res.skipped).toBe(0);
    expect(res.rows).toHaveLength(1);
    const r = res.rows[0];
    expect(r.contactName).toBe("Maria Silva");
    expect(r.sourceChannel).toBe("meta_lead_ads");
    expect(r.utmCampaign).toBe("bbro - leads - form nativo");
    expect(r.opportunityStage).toBe("MQL");
    expect(r.opportunityTag).toBe("acionado");
    expect(r.state).toBe("SP");
    expect((r.createdDate as Date).toISOString().slice(0, 10)).toBe("2026-07-27");
  });

  it("mantém linhas com mesmo ID (não deduplica) e ignora linhas sem data válida", () => {
    const dup = ROW.replace("Maria Silva", "Outra Pessoa");
    const bad = ROW.replace(`"27/07/2026";"27/07/2026"`, `"data-ruim";"27/07/2026"`);
    const res = parseLeadsCsv(`${HEADER}\n${ROW}\n${dup}\n${bad}\n`);
    expect(res.total).toBe(3);
    expect(res.rows).toHaveLength(2);
    expect(res.skipped).toBe(1);
  });

  it("retorna erro quando cabeçalhos obrigatórios não existem", () => {
    const res = parseLeadsCsv(`"A";"B"\n"1";"2"\n`);
    expect(res.rows).toHaveLength(0);
    expect(res.errors[0]).toContain("Cabeçalhos obrigatórios");
  });
});

describe("channelFamily", () => {
  it("agrupa canais em famílias", () => {
    expect(channelFamily("whatsapp - ativo")).toBe("WhatsApp");
    expect(channelFamily("whatsapp - receptivo")).toBe("WhatsApp");
    expect(channelFamily("meta_lead_ads")).toBe("Meta Lead Ads");
    expect(channelFamily("formulario_site")).toBe("Formulários");
    expect(channelFamily("Formulário Pós")).toBe("Formulários");
    expect(channelFamily("site")).toBe("Site");
    expect(channelFamily("auto-contato")).toBe("Auto-contato");
    expect(channelFamily("desconhecido")).toBe("Outros");
  });
});
