import { ENV } from "./_core/env";
import type { NormalisedLead } from "./crmTypes";
import {
  crmStageFromTabulations,
  type CrmFunnelStage,
} from "../shared/crmFunnel";

const PAGE_SIZE = 500;
const PAGE_CONCURRENCY = 2;
const CACHE_TTL_MS = 10 * 60 * 1000;
const FETCH_ATTEMPTS = 6;

interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface EducaCrmLead {
  id: number;
  nome: string;
  email: string | null;
  celular: string | null;
  telefone: string | null;
  cpf: string | null;
  data_criacao_original: string | null;
  data_criacao: string | null;
  data_atualizacao: string | null;
  curso: string | null;
  tipo: string | null;
  turno: string | null;
  modalidade: string | null;
  acao: string | null;
  unidade: string | null;
  polo: string | null;
  situacao: string | null;
  tags: unknown[];
  utm_sources: unknown[];
  utm_mediums: unknown[];
  utm_campaigns: unknown[];
  utm_contents: unknown[];
  utm_terms: unknown[];
  referer: unknown[] | string | null;
  contato: number | null;
}

export interface EducaCrmContact {
  id: number;
  nome: string;
  email: string;
  celular: string | null;
  telefone: string | null;
  cpf: string | null;
  curso: string | null;
  tipo: string | null;
  turno: string | null;
  modalidade: string | null;
  unidade: string | null;
  polo: string | null;
  cidade: string | null;
  estado: string | null;
  acao: string | null;
  tags: unknown[];
  str_tags: string;
  utm_sources: unknown[];
  utm_mediums: unknown[];
  utm_campaigns: unknown[];
  utm_contents: unknown[];
  utm_terms: unknown[];
  data_ultimo_hsm: string | null;
  data_ultima_atividade_omni: string | null;
}

export interface EducaCrmEnrollment {
  codigo: string;
  nome: string;
  email: string;
  celular: string | null;
  telefone: string | null;
  cpf: string | null;
  data_nascimento: string | null;
  endereco: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  cep: string | null;
  curso: string | null;
  tipo: string | null;
  turno: string | null;
  modalidade: string | null;
  polo: string | null;
  unidade: string | null;
  concurso: string;
  etapa: string;
  data_criacao: string | null;
  data_aprovacao: string | null;
  data_pgto_matricula: string | null;
  data_efetiv_matricula: string | null;
  data_cancel_matricula: string | null;
  matricula_academica: string | null;
  situacao: string | null;
  tags: unknown[] | null;
  utm_sources: unknown[];
  utm_mediums: unknown[];
  utm_campaigns: unknown[];
  utm_contents: unknown[];
  utm_terms: unknown[];
}

export interface EducaCrmCourse {
  codigo: string;
  nome: string;
  produto: string | null;
}

export interface EducaCrmSituation {
  codigo: string;
  nome: string;
  descricao: string;
  decisao: string;
}

export interface EducaCrmSnapshot {
  leads: EducaCrmLead[];
  contacts: EducaCrmContact[];
  enrollments: EducaCrmEnrollment[];
  courses: EducaCrmCourse[];
  situations: EducaCrmSituation[];
  fetchedAt: Date;
}

function assertConfigured() {
  if (!ENV.crmEducaToken) throw new Error("CRM_EDUCACRM_TOKEN não configurado");
}

async function fetchPage<T>(
  path: string,
  limit: number,
  offset: number
): Promise<PaginatedResponse<T>> {
  assertConfigured();
  const url = new URL(
    `${ENV.crmEducaApiUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`
  );
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("offset", String(offset));

  let lastError: unknown;
  for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Token ${ENV.crmEducaToken}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(90_000),
      });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(
          `EducaCRM ${path} retornou ${response.status}: ${body.slice(0, 300)}`
        );
      }
      return (await response.json()) as PaginatedResponse<T>;
    } catch (error) {
      lastError = error;
      if (attempt === FETCH_ATTEMPTS) break;
      await new Promise(resolve =>
        setTimeout(resolve, Math.min(8_000, 750 * 2 ** (attempt - 1)))
      );
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`Falha ao consultar EducaCRM ${path}`);
}

async function listAll<T>(path: string): Promise<T[]> {
  const first = await fetchPage<T>(path, PAGE_SIZE, 0);
  const rows = [...first.results];
  const offsets: number[] = [];
  for (let offset = PAGE_SIZE; offset < first.count; offset += PAGE_SIZE)
    offsets.push(offset);

  for (let i = 0; i < offsets.length; i += PAGE_CONCURRENCY) {
    const batch = offsets.slice(i, i + PAGE_CONCURRENCY);
    const pages = await Promise.all(
      batch.map(offset => fetchPage<T>(path, PAGE_SIZE, offset))
    );
    for (const page of pages) rows.push(...page.results);
  }
  return rows;
}

let snapshotCache: { value: EducaCrmSnapshot; ts: number } | null = null;

export async function fetchEducaCrmSnapshot(
  forceRefresh = false
): Promise<EducaCrmSnapshot> {
  if (
    !forceRefresh &&
    snapshotCache &&
    Date.now() - snapshotCache.ts < CACHE_TTL_MS
  ) {
    return snapshotCache.value;
  }

  const [leads, contacts, enrollments, courses, situations] = await Promise.all(
    [
      listAll<EducaCrmLead>("captacao/leads/"),
      listAll<EducaCrmContact>("captacao/contatos/"),
      listAll<EducaCrmEnrollment>("ingresso/inscritos/"),
      listAll<EducaCrmCourse>("estrutura/cursos/"),
      listAll<EducaCrmSituation>("captacao/situacoes/"),
    ]
  );

  const value = {
    leads,
    contacts,
    enrollments,
    courses,
    situations,
    fetchedAt: new Date(),
  };
  snapshotCache = { value, ts: Date.now() };
  return value;
}

function textValue(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number") return String(value);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["value", "nome", "name", "codigo", "description"]) {
      if (typeof record[key] === "string" && record[key].trim())
        return record[key].trim();
    }
  }
  return null;
}

function firstText(values: unknown[] | null | undefined): string | null {
  for (const value of values ?? []) {
    const text = textValue(value);
    if (text) return text;
  }
  return null;
}

function joinText(values: unknown[] | null | undefined): string | null {
  const texts = (values ?? [])
    .map(textValue)
    .filter((value): value is string => !!value);
  return texts.length ? Array.from(new Set(texts)).join(", ") : null;
}

function isoDateBrt(value: string | null | undefined): string | null {
  if (!value) return null;
  const plain = value.match(/^(\d{4}-\d{2}-\d{2})T/);
  if (plain && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(value)) return plain[1];
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value.slice(0, 10) || null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(parsed);
}

function normalizeEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() || null;
}

function normalizeDigits(value: string | null | undefined) {
  const digits = value?.replace(/\D/g, "") || "";
  return digits || null;
}

function sourceChannel(
  utmSource: string | null,
  action: string | null,
  tags: string | null,
  referer: unknown[] | string | null
): string {
  const source = utmSource?.toLowerCase() ?? "";
  const context =
    `${action ?? ""} ${tags ?? ""} ${typeof referer === "string" ? referer : (joinText(referer) ?? "")}`.toLowerCase();
  if (
    source.includes("facebook") ||
    source.includes("instagram") ||
    source.includes("meta") ||
    source === "fb" ||
    source === "ig"
  )
    return "meta";
  if (
    source.includes("google") ||
    source.includes("adwords") ||
    source.includes("gads")
  )
    return "google";
  if (
    source.includes("whatsapp") ||
    context.includes("whatsapp") ||
    context.includes("contato-omni")
  )
    return "whatsapp";
  if (utmSource) return utmSource;
  if (
    context.includes("preins") ||
    context.includes("lead") ||
    context.includes("form")
  )
    return "formulario_site";
  if (context.includes("hubspot")) return "importacao_historica";
  return "desconhecido";
}

function isActiveEnrollment(enrollment: EducaCrmEnrollment) {
  if (enrollment.data_cancel_matricula) return false;
  return (
    enrollment.etapa === "matriculado" ||
    !!enrollment.data_efetiv_matricula ||
    !!enrollment.matricula_academica
  );
}

function enrollmentRank(enrollment: EducaCrmEnrollment) {
  if (isActiveEnrollment(enrollment)) return 4;
  if (
    [
      "pre-matriculado",
      "oferta-base",
      "inscrito-pago",
      "aprovado",
      "nota-reaproveitada",
    ].includes(enrollment.etapa)
  )
    return 3;
  return 2;
}

function fallbackStageFromEnrollment(
  enrollment: EducaCrmEnrollment | undefined
): CrmFunnelStage | null {
  if (!enrollment) return null;
  if (isActiveEnrollment(enrollment)) return "MATRICULADO";
  if (["pre-matriculado", "inscrito-pago"].includes(enrollment.etapa))
    return "FECHAMENTO";
  if (
    ["oferta-base", "aprovado", "nota-reaproveitada"].includes(enrollment.etapa)
  )
    return "QUALIFICADO";
  return null;
}

function enrollmentCandidates(
  enrollment: EducaCrmEnrollment,
  emailIndex: Map<string, EducaCrmLead[]>,
  phoneIndex: Map<string, EducaCrmLead[]>,
  cpfIndex: Map<string, EducaCrmLead[]>
) {
  const found = new Map<number, EducaCrmLead>();
  const email = normalizeEmail(enrollment.email);
  const phone = normalizeDigits(enrollment.celular ?? enrollment.telefone);
  const cpf = normalizeDigits(enrollment.cpf);
  for (const candidate of email ? (emailIndex.get(email) ?? []) : [])
    found.set(candidate.id, candidate);
  for (const candidate of phone ? (phoneIndex.get(phone) ?? []) : [])
    found.set(candidate.id, candidate);
  for (const candidate of cpf ? (cpfIndex.get(cpf) ?? []) : [])
    found.set(candidate.id, candidate);
  return Array.from(found.values());
}

export function mapEducaCrmSnapshot(
  snapshot: EducaCrmSnapshot
): NormalisedLead[] {
  const contactsById = new Map(
    snapshot.contacts.map(contact => [contact.id, contact])
  );
  const courseByCode = new Map(
    snapshot.courses.map(course => [course.codigo, course.nome])
  );
  const situationByCode = new Map(
    snapshot.situations.map(situation => [situation.codigo, situation])
  );

  const emailIndex = new Map<string, EducaCrmLead[]>();
  const phoneIndex = new Map<string, EducaCrmLead[]>();
  const cpfIndex = new Map<string, EducaCrmLead[]>();
  const addIndex = (
    index: Map<string, EducaCrmLead[]>,
    key: string | null,
    lead: EducaCrmLead
  ) => {
    if (!key) return;
    index.set(key, [...(index.get(key) ?? []), lead]);
  };
  for (const lead of snapshot.leads) {
    const contact = lead.contato ? contactsById.get(lead.contato) : undefined;
    addIndex(emailIndex, normalizeEmail(lead.email ?? contact?.email), lead);
    addIndex(
      phoneIndex,
      normalizeDigits(
        lead.celular ?? lead.telefone ?? contact?.celular ?? contact?.telefone
      ),
      lead
    );
    addIndex(cpfIndex, normalizeDigits(lead.cpf ?? contact?.cpf), lead);
  }

  const enrollmentByLeadId = new Map<number, EducaCrmEnrollment>();
  const unmatchedEnrollments: EducaCrmEnrollment[] = [];
  const orderedEnrollments = [...snapshot.enrollments].sort(
    (a, b) => enrollmentRank(b) - enrollmentRank(a)
  );
  for (const enrollment of orderedEnrollments) {
    const candidates = enrollmentCandidates(
      enrollment,
      emailIndex,
      phoneIndex,
      cpfIndex
    ).filter(candidate => !enrollmentByLeadId.has(candidate.id));
    const createdAt = enrollment.data_criacao ?? "9999";
    const sorted = candidates.sort((a, b) => {
      const courseA = a.curso === enrollment.curso ? 1 : 0;
      const courseB = b.curso === enrollment.curso ? 1 : 0;
      if (courseA !== courseB) return courseB - courseA;
      const dateA = a.data_criacao_original ?? a.data_criacao ?? "";
      const dateB = b.data_criacao_original ?? b.data_criacao ?? "";
      const validA = dateA <= createdAt ? 1 : 0;
      const validB = dateB <= createdAt ? 1 : 0;
      if (validA !== validB) return validB - validA;
      return dateB.localeCompare(dateA);
    });
    const selected = sorted[0];
    if (!selected) {
      unmatchedEnrollments.push(enrollment);
      continue;
    }
    enrollmentByLeadId.set(selected.id, enrollment);
  }

  const mapped: NormalisedLead[] = snapshot.leads.map((lead, index) => {
    const contact = lead.contato ? contactsById.get(lead.contato) : undefined;
    const enrollment = enrollmentByLeadId.get(lead.id);
    const tags =
      joinText(lead.tags) ?? contact?.str_tags ?? joinText(contact?.tags);
    const utmSource =
      firstText(lead.utm_sources) ??
      firstText(contact?.utm_sources) ??
      firstText(enrollment?.utm_sources);
    const utmMedium =
      firstText(lead.utm_mediums) ??
      firstText(contact?.utm_mediums) ??
      firstText(enrollment?.utm_mediums);
    const utmCampaign =
      firstText(lead.utm_campaigns) ??
      firstText(contact?.utm_campaigns) ??
      firstText(enrollment?.utm_campaigns);
    const action = lead.acao ?? contact?.acao ?? null;
    const contacted =
      !!contact?.data_ultima_atividade_omni ||
      !!contact?.data_ultimo_hsm ||
      action === "contato-omni";
    const situation = lead.situacao
      ? situationByCode.get(lead.situacao)
      : undefined;
    const tabulation =
      lead.situacao ??
      situation?.codigo ??
      enrollment?.etapa ??
      tags ??
      action ??
      (contacted ? "contato-omni" : null);
    const stage =
      crmStageFromTabulations([
        lead.situacao,
        situation?.codigo,
        enrollment?.etapa,
        tags,
        action,
        contacted ? "contato-omni" : null,
      ]) ??
      fallbackStageFromEnrollment(enrollment) ??
      "NAO_LOCALIZADO";
    const cancelled =
      !!enrollment?.data_cancel_matricula || enrollment?.etapa === "cancelado";
    const courseCode =
      enrollment?.curso ?? lead.curso ?? contact?.curso ?? null;
    const courseName = courseCode
      ? (courseByCode.get(courseCode) ?? courseCode)
      : null;
    const createdDate =
      isoDateBrt(lead.data_criacao_original ?? lead.data_criacao) ??
      "1970-01-01";

    return {
      id: index + 1,
      externalId: `educacrm-lead:${lead.id}`,
      companyName: null,
      contactName: lead.nome || contact?.nome || enrollment?.nome || null,
      email: lead.email ?? contact?.email ?? enrollment?.email ?? null,
      phone:
        lead.celular ??
        lead.telefone ??
        contact?.celular ??
        contact?.telefone ??
        enrollment?.celular ??
        enrollment?.telefone ??
        null,
      cpf: lead.cpf ?? contact?.cpf ?? enrollment?.cpf ?? null,
      sourceChannel: sourceChannel(utmSource, action, tags, lead.referer),
      formName: action,
      utmSource,
      utmMedium,
      utmCampaign,
      cep: enrollment?.cep ?? null,
      street: enrollment?.endereco ?? null,
      addrNumber: enrollment?.numero ?? null,
      neighborhood: enrollment?.bairro ?? null,
      city: enrollment?.cidade ?? contact?.cidade ?? null,
      state: enrollment?.estado ?? contact?.estado ?? null,
      birthDate: enrollment?.data_nascimento ?? null,
      products: courseName,
      extraContext:
        [
          lead.tipo ?? contact?.tipo,
          lead.modalidade ?? contact?.modalidade,
          lead.unidade ?? contact?.unidade,
        ]
          .filter(Boolean)
          .join(" · ") || null,
      status:
        stage === "MATRICULADO"
          ? "ganho"
          : ["RECUSA", "DESQUALIFICADO", "FORA_DA_BASE"].includes(stage) ||
              cancelled ||
              situation?.decisao === "nao_contactar"
            ? "perdido"
            : stage === "ENCAMINHADO_GRADUACAO"
              ? "encaminhado"
              : "aberto",
      opportunityNumber: String(lead.id),
      opportunityName: courseName ? `${courseName} — ${lead.nome}` : lead.nome,
      opportunityTag: tabulation,
      opportunityStage: stage,
      createdDate,
      updatedDate:
        isoDateBrt(lead.data_atualizacao) ??
        isoDateBrt(
          enrollment?.data_efetiv_matricula ?? enrollment?.data_criacao
        ),
      importedAt: snapshot.fetchedAt,
    };
  });

  for (const enrollment of unmatchedEnrollments) {
    const courseName = enrollment.curso
      ? (courseByCode.get(enrollment.curso) ?? enrollment.curso)
      : null;
    const matriculated = isActiveEnrollment(enrollment);
    const stage =
      crmStageFromTabulations([enrollment.etapa, joinText(enrollment.tags)]) ??
      fallbackStageFromEnrollment(enrollment) ??
      "NAO_LOCALIZADO";
    mapped.push({
      id: mapped.length + 1,
      externalId: `educacrm-inscrito:${enrollment.codigo}`,
      companyName: null,
      contactName: enrollment.nome,
      email: enrollment.email || null,
      phone: enrollment.celular ?? enrollment.telefone,
      cpf: enrollment.cpf,
      sourceChannel: sourceChannel(
        firstText(enrollment.utm_sources),
        null,
        joinText(enrollment.tags),
        null
      ),
      formName: "inscricao",
      utmSource: firstText(enrollment.utm_sources),
      utmMedium: firstText(enrollment.utm_mediums),
      utmCampaign: firstText(enrollment.utm_campaigns),
      cep: enrollment.cep,
      street: enrollment.endereco,
      addrNumber: enrollment.numero,
      neighborhood: enrollment.bairro,
      city: enrollment.cidade,
      state: enrollment.estado,
      birthDate: enrollment.data_nascimento,
      products: courseName,
      extraContext:
        [enrollment.tipo, enrollment.modalidade, enrollment.unidade]
          .filter(Boolean)
          .join(" · ") || null,
      status: matriculated
        ? "ganho"
        : enrollment.data_cancel_matricula
          ? "perdido"
          : "aberto",
      opportunityNumber: enrollment.codigo,
      opportunityName: courseName
        ? `${courseName} — ${enrollment.nome}`
        : enrollment.nome,
      opportunityTag: enrollment.etapa,
      opportunityStage: stage,
      createdDate: isoDateBrt(enrollment.data_criacao) ?? "1970-01-01",
      updatedDate: isoDateBrt(
        enrollment.data_efetiv_matricula ??
          enrollment.data_aprovacao ??
          enrollment.data_criacao
      ),
      importedAt: snapshot.fetchedAt,
    });
  }

  return mapped;
}

export async function getEducaCrmLeadsCached(
  from: string,
  to: string
): Promise<NormalisedLead[]> {
  const snapshot = await fetchEducaCrmSnapshot();
  return mapEducaCrmSnapshot(snapshot).filter(lead => {
    const date = String(lead.createdDate).slice(0, 10);
    return date >= from && date <= to;
  });
}
