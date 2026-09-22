import { boolean, date, double, int, json, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/** Usuários locais — autenticação própria (sem OAuth) */
export const localUsers = mysqlTable("local_users", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  username: varchar("username", { length: 64 }).notNull().unique(),
  passwordHash: varchar("passwordHash", { length: 255 }).notNull(),
  role: mysqlEnum("role", ["admin", "analista", "cliente"]).default("cliente").notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  lastLogin: timestamp("lastLogin"),
});
export type LocalUser = typeof localUsers.$inferSelect;

/** Cache de respostas Windsor.ai (Meta/Google) para velocidade e fallback */
export const windsorCache = mysqlTable("windsor_cache", {
  id: int("id").autoincrement().primaryKey(),
  cacheKey: varchar("cacheKey", { length: 255 }).notNull().unique(),
  payload: json("payload").notNull(),
  fetchedAt: timestamp("fetchedAt").defaultNow().notNull(),
});

/** Programática — DV360 diário por Insertion Order (planilha junho) */
export const progDv360 = mysqlTable("prog_dv360", {
  id: int("id").autoincrement().primaryKey(),
  insertionOrder: varchar("insertionOrder", { length: 255 }).notNull(),
  format: varchar("format", { length: 40 }).notNull(), // DISPLAY | NATIVE | YOUTUBE
  objective: varchar("objective", { length: 80 }).notNull(),
  geo: varchar("geo", { length: 40 }).notNull(), // São Paulo | Brasil
  day: date("day").notNull(),
  spend: double("spend").notNull(),
  impressions: int("impressions").notNull(),
  clicks: int("clicks").notNull(),
  viewability: double("viewability").notNull(),
  completeViews: int("completeViews").notNull(),
  completionRate: double("completionRate").notNull(),
});

/** Programática — social META (planilha junho) */
export const progMetaSocial = mysqlTable("prog_meta_social", {
  id: int("id").autoincrement().primaryKey(),
  campaign: varchar("campaign", { length: 255 }).notNull(),
  day: date("day").notNull(),
  reach: int("reach").notNull(),
  impressions: int("impressions").notNull(),
  frequency: double("frequency").notNull(),
  spend: double("spend").notNull(),
  resultType: varchar("resultType", { length: 60 }).notNull(),
  results: int("results").notNull(),
  linkClicks: int("linkClicks").notNull(),
  reactions: int("reactions").notNull(),
  followers: int("followers").notNull(),
});

/** Programática — Push Notification (planilha junho) */
export const progPush = mysqlTable("prog_push", {
  id: int("id").autoincrement().primaryKey(),
  day: date("day").notNull(),
  spend: double("spend").notNull(),
  dispatches: int("dispatches").notNull(),
  clicks: int("clicks").notNull(),
});

/** Tabela legada de leads de demonstração. Não alimenta a aba oficial do CRM. */
export const leads = mysqlTable("leads", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  phone: varchar("phone", { length: 40 }),
  email: varchar("email", { length: 160 }),
  company: varchar("company", { length: 120 }),
  source: mysqlEnum("source", ["meta", "google", "programatica", "organico", "direto", "outros"]).notNull(),
  campaign: varchar("campaign", { length: 255 }),
  creative: varchar("creative", { length: 255 }),
  audience: varchar("audience", { length: 120 }),
  ageRange: varchar("ageRange", { length: 20 }),
  gender: varchar("gender", { length: 20 }),
  owner: varchar("owner", { length: 80 }), // vendedor responsável
  status: mysqlEnum("status", ["novo", "em_atendimento", "qualificado", "proposta", "cliente", "perdido", "nao_qualificado"]).notNull(),
  leadAt: timestamp("leadAt").notNull(),
  firstContactAt: timestamp("firstContactAt"),
  proposalAt: timestamp("proposalAt"),
  saleAt: timestamp("saleAt"),
  saleValue: double("saleValue"),
  lossReason: varchar("lossReason", { length: 60 }),
  disqualifyReason: varchar("disqualifyReason", { length: 60 }),
  notes: text("notes"),
});
export type Lead = typeof leads.$inferSelect;

/**
 * Snapshot oficial de leads do EducaCRM.
 * A integração normaliza leads, contatos, inscritos e matrículas no contrato
 * consumido pelo dashboard, preservando origem, UTMs, curso e etapa do funil.
 */
export const crmLeads = mysqlTable("crm_leads", {
  id: int("id").autoincrement().primaryKey(),
  /** ID estável da entidade na fonte: educacrm-lead:<id> ou educacrm-inscrito:<codigo>. */
  externalId: varchar("externalId", { length: 40 }),
  companyName: varchar("companyName", { length: 255 }),
  contactName: varchar("contactName", { length: 255 }),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 40 }),
  cpf: varchar("cpf", { length: 20 }),
  /** Canal de Origem (whatsapp - ativo, formulario_site, meta_lead_ads, site, auto-contato...) */
  sourceChannel: varchar("sourceChannel", { length: 120 }).notNull().default("desconhecido"),
  formName: varchar("formName", { length: 120 }),
  utmSource: varchar("utmSource", { length: 120 }),
  utmMedium: varchar("utmMedium", { length: 120 }),
  utmCampaign: varchar("utmCampaign", { length: 255 }),
  cep: varchar("cep", { length: 16 }),
  street: varchar("street", { length: 255 }),
  addrNumber: varchar("addrNumber", { length: 24 }),
  neighborhood: varchar("neighborhood", { length: 120 }),
  city: varchar("city", { length: 120 }),
  state: varchar("state", { length: 8 }),
  birthDate: varchar("birthDate", { length: 20 }),
  /** Produtos de interesse (Avaliação Neuropsicológica, Pós Validado...) */
  products: varchar("products", { length: 255 }),
  /** Contexto Adicional (sou_graduado(a)_em_psicologia, outras_profissões_ou_estudante) */
  extraContext: varchar("extraContext", { length: 255 }),
  /** Estado normalizado: aberto, ganho ou perdido. */
  status: varchar("status", { length: 60 }),
  opportunityNumber: varchar("opportunityNumber", { length: 24 }),
  opportunityName: varchar("opportunityName", { length: 255 }),
  /** Tag da oportunidade — motivo/situação (acionado, em_atendimento, recusa-financeira, matriculado...) */
  opportunityTag: varchar("opportunityTag", { length: 120 }),
  /** Etapa do funil (MQL, SAL, SQL, MATRICULADO, OUTROS) — vazio = lead sem oportunidade */
  opportunityStage: varchar("opportunityStage", { length: 40 }),
  createdDate: date("createdDate").notNull(),
  updatedDate: date("updatedDate"),
  importedAt: timestamp("importedAt").defaultNow().notNull(),
});
export type CrmLead = typeof crmLeads.$inferSelect;

/** Metas por canal e indicador */
export const goals = mysqlTable("goals", {
  id: int("id").autoincrement().primaryKey(),
  channel: mysqlEnum("channel", ["geral", "meta", "google", "programatica"]).notNull(),
  metric: varchar("metric", { length: 40 }).notNull(), // leads, compras, receita, cpa, cac, roas, ctr, cpc, conversao
  period: mysqlEnum("period", ["mensal", "semanal", "diaria"]).default("mensal").notNull(),
  targetValue: double("targetValue").notNull(),
  direction: mysqlEnum("direction", ["min", "max"]).default("max").notNull(), // max = quanto maior melhor
  createdBy: varchar("createdBy", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Goal = typeof goals.$inferSelect;

/** Otimizações geradas pela IA + gestão de tarefas */
export const optimizations = mysqlTable("optimizations", {
  id: int("id").autoincrement().primaryKey(),
  channel: mysqlEnum("channel", ["geral", "meta", "google", "programatica"]).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  diagnosis: text("diagnosis").notNull(),
  defense: text("defense").notNull(),
  actionPlan: text("actionPlan").notNull(),
  priority: mysqlEnum("priority", ["alta", "media", "baixa"]).default("media").notNull(),
  status: mysqlEnum("status", ["pendente", "em_andamento", "concluida", "descartada"]).default("pendente").notNull(),
  assignee: varchar("assignee", { length: 80 }),
  dueDate: date("dueDate"),
  checklist: json("checklist"), // [{item, done}]
  metricsBefore: json("metricsBefore"),
  metricsAfter: json("metricsAfter"),
  outcome: mysqlEnum("outcome", ["melhora", "piora", "sem_impacto"]),
  completedBy: varchar("completedBy", { length: 64 }),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Optimization = typeof optimizations.$inferSelect;

/** Auditoria — registro de todas as ações */
export const auditLogs = mysqlTable("audit_logs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"),
  username: varchar("username", { length: 64 }).notNull(),
  action: varchar("action", { length: 80 }).notNull(), // login, meta_alterada, otimizacao_concluida, comentario, status, usuario_criado...
  entity: varchar("entity", { length: 80 }),
  details: text("details"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type AuditLog = typeof auditLogs.$inferSelect;
