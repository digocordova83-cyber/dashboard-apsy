import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  auditLogs,
  crmLeads,
  goals,
  InsertUser,
  leads,
  localUsers,
  optimizations,
  progDv360,
  progMetaSocial,
  progPush,
  users,
  windsorCache,
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ===================== Usuários locais =====================
export async function getLocalUserByUsername(username: string) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(localUsers).where(eq(localUsers.username, username)).limit(1);
  return rows[0];
}

export async function listLocalUsers() {
  const db = await getDb();
  if (!db) return [];
  return await db.select({
    id: localUsers.id,
    name: localUsers.name,
    username: localUsers.username,
    role: localUsers.role,
    active: localUsers.active,
    createdAt: localUsers.createdAt,
    lastLogin: localUsers.lastLogin,
  }).from(localUsers);
}

export async function createLocalUser(data: { name: string; username: string; passwordHash: string; role: "admin" | "analista" | "cliente" }) {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  await db.insert(localUsers).values(data);
}

export async function updateLocalUser(id: number, data: Partial<{ name: string; passwordHash: string; role: "admin" | "analista" | "cliente"; active: boolean }>) {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  await db.update(localUsers).set(data).where(eq(localUsers.id, id));
}

export async function touchLastLogin(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(localUsers).set({ lastLogin: new Date() }).where(eq(localUsers.id, id));
}

// ===================== Auditoria =====================
export async function logAudit(entry: { userId?: number; username: string; action: string; entity?: string; details?: string }) {
  const db = await getDb();
  if (!db) return;
  try {
    await db.insert(auditLogs).values(entry);
  } catch (e) {
    console.error("[Audit] falha ao registrar:", e);
  }
}

export async function listAuditLogs(limit = 300) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(limit);
}

// ===================== Cache Windsor =====================
export async function getWindsorCache(cacheKey: string, maxAgeMs: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(windsorCache).where(eq(windsorCache.cacheKey, cacheKey)).limit(1);
  const row = rows[0];
  if (!row) return null;
  const age = Date.now() - new Date(row.fetchedAt).getTime();
  return { payload: row.payload as unknown, fresh: age < maxAgeMs };
}

export async function setWindsorCache(cacheKey: string, payload: unknown) {
  const db = await getDb();
  if (!db) return;
  await db
    .insert(windsorCache)
    .values({ cacheKey, payload, fetchedAt: new Date() })
    .onDuplicateKeyUpdate({ set: { payload, fetchedAt: new Date() } });
}

// ===================== Programática =====================
export async function getDv360Rows() {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(progDv360);
}
export async function getProgMetaRows() {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(progMetaSocial);
}
export async function getProgPushRows() {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(progPush);
}
export async function countDv360() {
  const db = await getDb();
  if (!db) return 0;
  const r = await db.select({ n: sql<number>`count(*)` }).from(progDv360);
  return r[0]?.n ?? 0;
}

// ===================== Leads =====================
export async function getLeads() {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(leads).orderBy(desc(leads.leadAt));
}
export async function countLeads() {
  const db = await getDb();
  if (!db) return 0;
  const r = await db.select({ n: sql<number>`count(*)` }).from(leads);
  return r[0]?.n ?? 0;
}

// ===================== CRM Leads (base real importada) =====================
export async function getCrmLeads() {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(crmLeads).orderBy(desc(crmLeads.createdDate), desc(crmLeads.id));
}
export async function countCrmLeads() {
  const db = await getDb();
  if (!db) return 0;
  const r = await db.select({ n: sql<number>`count(*)` }).from(crmLeads);
  return r[0]?.n ?? 0;
}
/** Substitui toda a base de leads do CRM pelos registros informados (importação full). */
export async function replaceCrmLeads(rows: (typeof crmLeads.$inferInsert)[]) {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  const CHUNK = 200;
  await db.transaction(async (tx) => {
    await tx.delete(crmLeads);
    for (let i = 0; i < rows.length; i += CHUNK) {
      await tx.insert(crmLeads).values(rows.slice(i, i + CHUNK));
    }
  });
  return rows.length;
}

/**
 * Substitui somente o recorte informado e preserva o histórico fora da faixa.
 * Usado pelo sync diário para atualizar mudanças retroativas de etapa sem apagar meses anteriores.
 */
export async function replaceCrmLeadsRange(
  from: string,
  to: string,
  rows: (typeof crmLeads.$inferInsert)[],
) {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  const CHUNK = 200;
  const fromDate = new Date(`${from}T00:00:00.000Z`);
  const toDate = new Date(`${to}T00:00:00.000Z`);

  await db.transaction(async (tx) => {
    await tx.delete(crmLeads).where(and(gte(crmLeads.createdDate, fromDate), lte(crmLeads.createdDate, toDate)));
    for (let i = 0; i < rows.length; i += CHUNK) {
      await tx.insert(crmLeads).values(rows.slice(i, i + CHUNK));
    }
  });

  return rows.length;
}

// ===================== Metas =====================
export async function listGoals() {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(goals);
}
export async function upsertGoal(data: { id?: number; channel: "geral" | "meta" | "google" | "programatica"; metric: string; period: "mensal" | "semanal" | "diaria"; targetValue: number; direction: "min" | "max"; createdBy?: string }) {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  if (data.id) {
    const { id, ...rest } = data;
    await db.update(goals).set(rest).where(eq(goals.id, id));
    return id;
  }
  const existing = await db.select().from(goals).where(and(eq(goals.channel, data.channel), eq(goals.metric, data.metric), eq(goals.period, data.period))).limit(1);
  if (existing[0]) {
    await db.update(goals).set({ targetValue: data.targetValue, direction: data.direction, createdBy: data.createdBy }).where(eq(goals.id, existing[0].id));
    return existing[0].id;
  }
  const res = await db.insert(goals).values(data);
  return (res as unknown as [{ insertId: number }])[0]?.insertId;
}
export async function deleteGoal(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  await db.delete(goals).where(eq(goals.id, id));
}

// ===================== Otimizações =====================
export async function listOptimizations(channel?: "geral" | "meta" | "google" | "programatica") {
  const db = await getDb();
  if (!db) return [];
  if (channel) {
    return await db.select().from(optimizations).where(eq(optimizations.channel, channel)).orderBy(desc(optimizations.createdAt));
  }
  return await db.select().from(optimizations).orderBy(desc(optimizations.createdAt));
}
export async function insertOptimization(data: typeof optimizations.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  await db.insert(optimizations).values(data);
}
export async function updateOptimization(id: number, data: Partial<typeof optimizations.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  await db.update(optimizations).set(data).where(eq(optimizations.id, id));
}
export async function getOptimization(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(optimizations).where(eq(optimizations.id, id)).limit(1);
  return rows[0];
}
