// Importa a base real de leads (CSV ;-separado) para a tabela crm_leads.
// Uso: node scripts/import-leads-csv.mjs <caminho-do-csv>
import { readFileSync } from "node:fs";
import mysql from "mysql2/promise";

const file = process.argv[2] ?? "/home/ubuntu/upload/pasted_file_QVCweX_leads.csv";
const content = readFileSync(file, "utf-8");

function parseCsvLine(line, sep = ";") {
  const out = []; let cur = ""; let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"') { if (line[i+1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else { if (ch === '"') q = true; else if (ch === sep) { out.push(cur); cur = ""; } else cur += ch; }
  }
  out.push(cur); return out;
}
const parseBrDate = (s) => {
  if (!s) return null;
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`;
};
const clean = (s) => { const t = (s ?? "").trim(); return t === "" ? null : t; };

const text = content.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
const lines = text.split("\n").filter((l) => l.trim() !== "");
const headers = parseCsvLine(lines[0]).map((h) => h.replace(/^"|"$/g, "").trim());
const HM = { "ID":"externalId","Nome da Empresa":"companyName","Nome do Contato":"contactName","Email":"email","Telefone":"phone","CPF":"cpf","Canal de Origem":"sourceChannel","Formulário":"formName","UTM Source":"utmSource","UTM Medium":"utmMedium","UTM Campaign":"utmCampaign","CEP":"cep","Rua":"street","Número":"addrNumber","Bairro":"neighborhood","Cidade":"city","Estado":"state","Data de Nascimento":"birthDate","Produtos":"products","Contexto Adicional":"extraContext","Status":"status","Oportunidade (Nº)":"opportunityNumber","Oportunidade (Nome)":"opportunityName","Oportunidade (Tag)":"opportunityTag","Oportunidade (Etapa)":"opportunityStage","Criado em":"createdDate","Atualizado em":"updatedDate" };
const idx = {};
headers.forEach((h, i) => { if (HM[h]) idx[HM[h]] = i; });

const rows = [];
let skipped = 0;
for (let i = 1; i < lines.length; i++) {
  const cols = parseCsvLine(lines[i]);
  const get = (k) => clean(cols[idx[k]]);
  const created = parseBrDate(get("createdDate"));
  if (!created) { skipped++; continue; }
  rows.push([
    get("externalId"), get("companyName"), get("contactName"), get("email"), get("phone"), get("cpf"),
    get("sourceChannel") ?? "desconhecido", get("formName"), get("utmSource"), get("utmMedium"), get("utmCampaign"),
    get("cep"), get("street"), get("addrNumber"), get("neighborhood"), get("city"), get("state"), get("birthDate"),
    get("products"), get("extraContext"), get("status"), get("opportunityNumber"), get("opportunityName"),
    get("opportunityTag"), (get("opportunityStage") ?? "")?.toUpperCase() || null, created, parseBrDate(get("updatedDate")),
  ]);
}
console.log(`Linhas de dados: ${lines.length - 1} | válidas: ${rows.length} | ignoradas: ${skipped}`);

const conn = await mysql.createConnection(process.env.DATABASE_URL);
await conn.execute("DELETE FROM crm_leads");
const cols = "(externalId,companyName,contactName,email,phone,cpf,sourceChannel,formName,utmSource,utmMedium,utmCampaign,cep,street,addrNumber,neighborhood,city,state,birthDate,products,extraContext,status,opportunityNumber,opportunityName,opportunityTag,opportunityStage,createdDate,updatedDate)";
const CHUNK = 200;
for (let i = 0; i < rows.length; i += CHUNK) {
  const chunk = rows.slice(i, i + CHUNK);
  const placeholders = chunk.map(() => `(${Array(27).fill("?").join(",")})`).join(",");
  await conn.execute(`INSERT INTO crm_leads ${cols} VALUES ${placeholders}`, chunk.flat());
}
const [[{ n }]] = await conn.query("SELECT COUNT(*) n FROM crm_leads");
console.log("Total na tabela crm_leads:", n);
await conn.end();

