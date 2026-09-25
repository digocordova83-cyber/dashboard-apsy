/**
 * Parser da base de leads do CRM (export CSV separado por ";").
 * Usado tanto pelo script de importação inicial quanto pelo endpoint
 * de importação (admin) da aba Leads.
 */
import type { crmLeads } from "../drizzle/schema";
import { crmStageFromTabulations } from "../shared/crmFunnel";

type CrmLeadInsert = typeof crmLeads.$inferInsert;

/** Parse de uma linha CSV com separador ";" respeitando aspas. */
function parseCsvLine(line: string, sep = ";"): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = false;
      } else cur += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === sep) {
        out.push(cur);
        cur = "";
      } else cur += ch;
    }
  }
  out.push(cur);
  return out;
}

/** dd/mm/yyyy -> Date (UTC midnight) | null */
function parseBrDate(s: string | undefined): Date | null {
  if (!s) return null;
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
  return isNaN(d.getTime()) ? null : d;
}

const clean = (s: string | undefined) => {
  const t = (s ?? "").trim();
  return t === "" ? null : t;
};

/** Cabeçalhos esperados (nomes do export do CRM). */
const HEADER_MAP: Record<string, string> = {
  ID: "externalId",
  "Nome da Empresa": "companyName",
  "Nome do Contato": "contactName",
  Email: "email",
  Telefone: "phone",
  CPF: "cpf",
  "Canal de Origem": "sourceChannel",
  Formulário: "formName",
  "UTM Source": "utmSource",
  "UTM Medium": "utmMedium",
  "UTM Campaign": "utmCampaign",
  CEP: "cep",
  Rua: "street",
  Número: "addrNumber",
  Bairro: "neighborhood",
  Cidade: "city",
  Estado: "state",
  "Data de Nascimento": "birthDate",
  Produtos: "products",
  "Contexto Adicional": "extraContext",
  Status: "status",
  "Oportunidade (Nº)": "opportunityNumber",
  "Oportunidade (Nome)": "opportunityName",
  "Oportunidade (Tag)": "opportunityTag",
  "Oportunidade (Etapa)": "opportunityStage",
  "Criado em": "createdDate",
  "Atualizado em": "updatedDate",
};

export interface ParseResult {
  rows: CrmLeadInsert[];
  total: number;
  skipped: number;
  errors: string[];
  headersFound: string[];
}

/**
 * Converte o conteúdo do CSV em registros prontos para inserir em crm_leads.
 * Mantém TODAS as linhas válidas (não deduplica) para bater com o CRM.
 */
export function parseLeadsCsv(content: string): ParseResult {
  // Remove BOM e normaliza quebras de linha
  const text = content.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const lines = text.split("\n").filter(l => l.trim() !== "");
  const errors: string[] = [];
  if (lines.length < 2) {
    return {
      rows: [],
      total: 0,
      skipped: 0,
      errors: ["Arquivo vazio ou sem linhas de dados."],
      headersFound: [],
    };
  }
  const headers = parseCsvLine(lines[0]).map(h =>
    h.replace(/^"|"$/g, "").trim()
  );
  const idx: Record<string, number> = {};
  headers.forEach((h, i) => {
    const key = HEADER_MAP[h];
    if (key) idx[key] = i;
  });
  if (idx.sourceChannel === undefined || idx.createdDate === undefined) {
    return {
      rows: [],
      total: lines.length - 1,
      skipped: lines.length - 1,
      errors: [
        `Cabeçalhos obrigatórios não encontrados ("Canal de Origem", "Criado em"). Colunas lidas: ${headers.join(", ")}`,
      ],
      headersFound: headers,
    };
  }
  const rows: CrmLeadInsert[] = [];
  let skipped = 0;
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const get = (key: string) => clean(cols[idx[key]]);
    const created = parseBrDate(get("createdDate") ?? undefined);
    if (!created) {
      skipped++;
      if (errors.length < 5)
        errors.push(
          `Linha ${i + 1}: data "Criado em" inválida (${get("createdDate") ?? "vazia"}).`
        );
      continue;
    }
    rows.push({
      externalId: get("externalId"),
      companyName: get("companyName"),
      contactName: get("contactName"),
      email: get("email"),
      phone: get("phone"),
      cpf: get("cpf"),
      sourceChannel: get("sourceChannel") ?? "desconhecido",
      formName: get("formName"),
      utmSource: get("utmSource"),
      utmMedium: get("utmMedium"),
      utmCampaign: get("utmCampaign"),
      cep: get("cep"),
      street: get("street"),
      addrNumber: get("addrNumber"),
      neighborhood: get("neighborhood"),
      city: get("city"),
      state: get("state"),
      birthDate: get("birthDate"),
      products: get("products"),
      extraContext: get("extraContext"),
      status: get("status"),
      opportunityNumber: get("opportunityNumber"),
      opportunityName: get("opportunityName"),
      opportunityTag: get("opportunityTag"),
      opportunityStage: crmStageFromTabulations([
        get("opportunityStage"),
        get("opportunityTag"),
      ]),
      createdDate: created,
      updatedDate: parseBrDate(get("updatedDate") ?? undefined),
    });
  }
  return {
    rows,
    total: lines.length - 1,
    skipped,
    errors,
    headersFound: headers,
  };
}

/** Agrupamento de canais de origem em famílias para gráficos. */
export function channelFamily(sourceChannel: string): string {
  const s = sourceChannel.toLowerCase();
  if (s.includes("whatsapp")) return "WhatsApp";
  if (s.includes("meta_lead_ads")) return "Meta Lead Ads";
  if (s === "meta" || s.includes("facebook") || s.includes("instagram"))
    return "Meta";
  if (s === "google" || s.includes("adwords") || s.includes("gads"))
    return "Google";
  if (s.includes("formul") || s.includes("form")) return "Formulários";
  if (s === "site" || s.includes("site")) return "Site";
  if (s.includes("auto")) return "Auto-contato";
  if (s.includes("importacao") || s.includes("hubspot"))
    return "Importação histórica";
  return "Outros";
}
