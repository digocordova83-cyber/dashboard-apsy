import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fetchEducaCrmSnapshot } from "../server/educacrm";

interface Contact {
  sourceIds: string[];
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
  city: string;
  state: string;
  zip: string;
  latestCreatedAt: string;
  markers: string[];
}

const BRT_TODAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
const OUTPUT_DIR = path.resolve(process.env.AUDIT_OUTPUT_DIR ?? "artifacts");
const DATE_STAMP = BRT_TODAY.replaceAll("-", "");
const CSV_FILE = `${OUTPUT_DIR}/APSY_Meta_Lookalike_Interesse_Graduacao_${DATE_STAMP}.csv`;
const AUDIT_FILE = `${OUTPUT_DIR}/APSY_Meta_Lookalike_Interesse_Graduacao_${DATE_STAMP}_auditoria.json`;

function fold(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function markerText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return String(record.value ?? record.nome ?? record.name ?? record.codigo ?? "");
  }
  return "";
}

function isGraduationInterest(lead: { acao: string | null; situacao: string | null; curso: string | null; tipo: string | null; tags: unknown[] }) {
  const markers = [lead.acao, lead.situacao, lead.curso, lead.tipo, ...lead.tags.map(markerText)].map(fold);
  return markers.some((marker) =>
    marker === "cl-grad-aviseme"
    || marker === "leadgraduacaoaviseme"
    || marker === "interesse_graduacao"
    || marker === "inscrito_graduacao"
    || (marker.includes("graduacao") && !marker.includes("pos-graduacao") && !marker.includes("posgraduacao")),
  );
}

function normalEmail(value: string | null | undefined): string {
  const email = String(value ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function normalPhone(value: string | null | undefined): string {
  let digits = String(value ?? "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith("55")) digits = `55${digits}`;
  if (!digits.startsWith("55") || (digits.length !== 12 && digits.length !== 13)) return "";
  return digits;
}

function normalText(value: string | null | undefined): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\s'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function splitName(value: string | null | undefined) {
  const parts = normalText(value).split(" ").filter(Boolean);
  return { firstName: parts.at(0) ?? "", lastName: parts.slice(1).join(" ") };
}

function csvEscape(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const snapshot = await fetchEducaCrmSnapshot(true);
  const contactsById = new Map(snapshot.contacts.map((contact) => [contact.id, contact]));
  const tagged = snapshot.leads.filter(isGraduationInterest);

  const contacts: Contact[] = [];
  const lookup = new Map<string, Contact>();
  let excludedNoIdentifier = 0;

  for (const lead of [...tagged].sort((a, b) => (a.data_criacao ?? "").localeCompare(b.data_criacao ?? ""))) {
    const source = lead.contato ? contactsById.get(lead.contato) : undefined;
    const email = normalEmail(lead.email ?? source?.email);
    const phone = normalPhone(lead.celular ?? lead.telefone ?? source?.celular ?? source?.telefone);
    if (!email && !phone) {
      excludedNoIdentifier += 1;
      continue;
    }

    const existing = (email ? lookup.get(`e:${email}`) : undefined) ?? (phone ? lookup.get(`p:${phone}`) : undefined);
    const name = splitName(lead.nome ?? source?.nome);
    const markers = [lead.acao, lead.situacao, ...lead.tags.map(markerText)].filter((value): value is string => !!value);
    const incoming: Contact = {
      sourceIds: [String(lead.id)],
      email,
      phone,
      firstName: name.firstName,
      lastName: name.lastName,
      city: normalText(source?.cidade),
      state: String(source?.estado ?? "").trim().toLowerCase().slice(0, 2),
      zip: "",
      latestCreatedAt: lead.data_criacao ?? "",
      markers,
    };

    const contact = existing ?? incoming;
    if (!existing) contacts.push(contact);
    else {
      contact.sourceIds.push(String(lead.id));
      contact.markers.push(...markers);
      for (const field of ["email", "phone", "firstName", "lastName", "city", "state", "latestCreatedAt"] as const) {
        if (incoming[field]) contact[field] = incoming[field] as never;
      }
    }
    if (email) lookup.set(`e:${email}`, contact);
    if (phone) lookup.set(`p:${phone}`, contact);
  }

  const uniqueContacts = contacts.map((contact) => ({
    ...contact,
    sourceIds: Array.from(new Set(contact.sourceIds)),
    markers: Array.from(new Set(contact.markers)),
  }));
  const headers = ["email", "phone", "fn", "ln", "ct", "st", "country", "zip"];
  const rows = uniqueContacts.map((contact) => [
    contact.email,
    contact.phone,
    contact.firstName,
    contact.lastName,
    contact.city,
    contact.state,
    "br",
    contact.zip,
  ]);
  const csv = [headers.join(","), ...rows.map((row) => row.map(csvEscape).join(","))].join("\n") + "\n";
  writeFileSync(CSV_FILE, `\uFEFF${csv}`, { encoding: "utf8", mode: 0o600 });

  const audit = {
    generatedAtBrt: new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "medium" }).format(new Date()),
    source: "EducaCRM API",
    period: { from: "2026-05-14", to: BRT_TODAY },
    criterion: "ação, situação, curso, tipo ou tag contendo marcador explícito de graduação; inclui cl-grad-aviseme e leadgraduacaoaviseme",
    input: {
      leadsRetrieved: snapshot.leads.length,
      graduationMarkedLeads: tagged.length,
      excludedNoValidEmailOrPhone: excludedNoIdentifier,
    },
    output: {
      csvFile: CSV_FILE,
      csvSha256: createHash("sha256").update(csv).digest("hex"),
      rows: uniqueContacts.length,
      withEmail: uniqueContacts.filter((contact) => Boolean(contact.email)).length,
      withPhone: uniqueContacts.filter((contact) => Boolean(contact.phone)).length,
      withEmailAndPhone: uniqueContacts.filter((contact) => Boolean(contact.email && contact.phone)).length,
      duplicateLeadRecordsMerged: tagged.length - excludedNoIdentifier - uniqueContacts.length,
      headers,
    },
    compatibility: {
      platform: "Meta Ads — Público Personalizado / lista de clientes",
      identifiers: "e-mail e telefone normalizados; telefone com DDI 55 quando o número brasileiro original tinha 10 ou 11 dígitos.",
      handling: "Arquivo contém dados pessoais e deve ser carregado somente na conta Meta autorizada da APSY. IDs internos do EducaCRM não são exportados.",
    },
  };
  writeFileSync(AUDIT_FILE, `${JSON.stringify(audit, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });

  assert(rows.length === uniqueContacts.length, "Quantidade de linhas CSV não corresponde ao público.");
  assert(uniqueContacts.every((contact) => contact.email || contact.phone), "Contato sem identificador foi incluído.");

  console.log(JSON.stringify({
    csv: CSV_FILE,
    audit: AUDIT_FILE,
    period: audit.period,
    criterion: audit.criterion,
    taggedLeads: audit.input.graduationMarkedLeads,
    outputRows: audit.output.rows,
    withEmail: audit.output.withEmail,
    withPhone: audit.output.withPhone,
    mergedDuplicates: audit.output.duplicateLeadRecordsMerged,
    sha256: audit.output.csvSha256,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
