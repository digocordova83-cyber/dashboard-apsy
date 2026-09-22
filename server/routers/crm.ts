import { z } from "zod";
import { getCrmLeads, getLeads, listAuditLogs, listGoals, upsertGoal, deleteGoal, logAudit, replaceCrmLeads } from "../db";
import { channelFamily, parseLeadsCsv } from "../leadsCsv";
import { getEducaCrmLeadsCached } from "../educacrm";
import type { NormalisedLead } from "../crmTypes";
import { localAdminProcedure, localProtectedProcedure, localStaffProcedure, router } from "../_core/trpc";

/** Etapas do funil em ordem de avanço. */
const STAGE_ORDER = ["MQL", "SAL", "SQL", "MATRICULADO"] as const;

/** Tags que representam motivos de recusa/perda. */
function isLossTag(tag: string): boolean {
  const t = tag.toLowerCase();
  return t.startsWith("recusa") || t.includes("não_localizado") || t.includes("nao_localizado")
    || t.startsWith("sem_interação") || t.startsWith("sem_interacao") || t === "bad_fit";
}

const dateKey = (d: Date | string | null) => {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d) : d;
  return isNaN(dt.getTime()) ? "" : dt.toISOString().slice(0, 10);
};

/** Filtros cruzados aplicáveis pelo dashboard interativo. */
const crossFilters = z.object({
  channel: z.string().optional(),   // sourceChannel exato ou família (prefixo "fam:")
  stage: z.string().optional(),     // MQL | SAL | SQL | MATRICULADO | OUTROS | com_oportunidade | sem_oportunidade
  campaign: z.string().optional(),  // utmCampaign exato
});

type CrmLeadRow = NormalisedLead;

/** Fetch leads: EducaCRM is the official source; DB is the production snapshot. */
async function fetchLeads(from: string, to: string): Promise<NormalisedLead[]> {
  // In production (serverless), use DB as primary source to avoid timeout.
  // The DB is kept fresh by the scheduled sync-data handler.
  // In development, try API first for live data.
  if (process.env.NODE_ENV !== "development") {
    try {
      const all = await getCrmLeads();
      // Filter by date range
      const filtered = (all as unknown as NormalisedLead[]).filter(l => {
        const d = typeof l.createdDate === "string" ? l.createdDate : (l.createdDate as Date).toISOString().slice(0, 10);
        return d >= from && d <= to;
      });
      if (filtered.length > 0) return filtered;
      // If DB is empty, try EducaCRM as fallback
    } catch (err) {
      console.error("[CRM] DB query failed, trying API:", err);
    }
  }

  try {
    return await getEducaCrmLeadsCached(from, to);
  } catch (err) {
    console.error("[CRM] EducaCRM API failed, falling back to DB:", err);
    const all = await getCrmLeads();
    return all as unknown as NormalisedLead[];
  }
}

/** Nova definição: "Lead" na aba Leads = contato que virou oportunidade. */
function hasOpp(l: CrmLeadRow): boolean {
  return !!l.opportunityStage && l.opportunityStage !== "OUTROS";
}

function matchStage(l: CrmLeadRow, stage?: string): boolean {
  if (!stage) return true;
  if (stage === "sem_oportunidade") return !l.opportunityStage;
  if (stage === "com_oportunidade") return !!l.opportunityStage && l.opportunityStage !== "OUTROS";
  return l.opportunityStage === stage;
}

function applyFilters(rows: CrmLeadRow[], f: z.infer<typeof crossFilters>): CrmLeadRow[] {
  return rows.filter((l) => {
    if (f.channel) {
      if (f.channel.startsWith("fam:")) {
        if (channelFamily(l.sourceChannel) !== f.channel.slice(4)) return false;
      } else if (l.sourceChannel !== f.channel) return false;
    }
    if (!matchStage(l, f.stage)) return false;
    if (f.campaign && l.utmCampaign !== f.campaign) return false;
    return true;
  });
}

export const crmRouter = router({
  leads: localProtectedProcedure.query(async () => await getLeads()),

  // ============ Base real de leads (CRM) ============
  crmLeads: localProtectedProcedure
    .input(z.object({ from: z.string(), to: z.string() }).merge(crossFilters))
    .query(async ({ input }) => {
      const all = await fetchLeads(input.from, input.to);
      const rows = all.filter((l) => hasOpp(l));
      return applyFilters(rows, input);
    }),

  /** Agregados da base real: evolução diária por canal, funil, motivos, UTMs, produtos. */
  crmSummary: localProtectedProcedure
    .input(z.object({ from: z.string(), to: z.string() }).merge(crossFilters))
    .query(async ({ input }) => {
      const inRange = await fetchLeads(input.from, input.to);
      // Contatos sem oportunidade ficam fora da base analisada (métrica só de contexto)
      const contactsWithoutOpp = applyFilters(inRange.filter((l) => !hasOpp(l)), input).length;
      const rows = applyFilters(inRange.filter(hasOpp), input);

      // KPIs
      const total = rows.length;
      const byStage: Record<string, number> = { MQL: 0, SAL: 0, SQL: 0, MATRICULADO: 0, OUTROS: 0 };
      for (const l of rows) {
        if (l.opportunityStage && byStage[l.opportunityStage] !== undefined) byStage[l.opportunityStage] += 1;
      }
      const matriculados = byStage.MATRICULADO;

      // Evolução diária por família de canal (stacked)
      const families = new Set<string>();
      const daily = new Map<string, Record<string, number>>();
      for (const l of rows) {
        const d = dateKey(l.createdDate);
        if (!d) continue;
        const fam = channelFamily(l.sourceChannel);
        families.add(fam);
        const e = daily.get(d) ?? {};
        e[fam] = (e[fam] ?? 0) + 1;
        daily.set(d, e);
      }
      const dailyByChannel = Array.from(daily.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, counts]) => ({ date, ...counts, total: Object.values(counts).reduce((s, v) => s + v, 0) }));

      // Distribuição por canal de origem (valor bruto do CRM)
      const chMap = new Map<string, { total: number; opps: number; matriculados: number }>();
      for (const l of rows) {
        const e = chMap.get(l.sourceChannel) ?? { total: 0, opps: 0, matriculados: 0 };
        e.total += 1;
        if (l.opportunityStage && l.opportunityStage !== "OUTROS") e.opps += 1;
        if (l.opportunityStage === "MATRICULADO") e.matriculados += 1;
        chMap.set(l.sourceChannel, e);
      }
      const byChannel = Array.from(chMap.entries())
        .map(([channel, v]) => ({ channel, family: channelFamily(channel), ...v }))
        .sort((a, b) => b.total - a.total);

      // Funil: Oportunidades (=Leads) → etapas
      const funnel = [
        { stage: "Leads", value: total },
        ...STAGE_ORDER.map((s) => ({ stage: s === "MATRICULADO" ? "Matriculados" : s, value: byStage[s] })),
      ];

      // Motivos (tags de recusa/perda) e situações positivas
      const lossMap = new Map<string, number>();
      const activeMap = new Map<string, number>();
      for (const l of rows) {
        const tag = l.opportunityTag?.trim();
        if (!tag || tag === "teste") continue;
        if (isLossTag(tag)) lossMap.set(tag, (lossMap.get(tag) ?? 0) + 1);
        else activeMap.set(tag, (activeMap.get(tag) ?? 0) + 1);
      }
      const lossReasons = Array.from(lossMap.entries()).map(([tag, qtd]) => ({ tag, qtd })).sort((a, b) => b.qtd - a.qtd);
      const activeTags = Array.from(activeMap.entries()).map(([tag, qtd]) => ({ tag, qtd })).sort((a, b) => b.qtd - a.qtd);

      // UTM campaign (somente preenchidas)
      const utmMap = new Map<string, { total: number; opps: number; source: string }>();
      for (const l of rows) {
        // Se não tem UTM campaign mas veio de whatsapp-anúncio, usar canal como campanha
        const campKey = l.utmCampaign
          || (l.sourceChannel === "whatsapp - anúncio"
            ? "bbro-leads-whatsapp (anúncio)"
            : null);
        if (!campKey) continue;
        const e = utmMap.get(campKey) ?? { total: 0, opps: 0, source: l.utmSource ?? l.sourceChannel ?? "—" };
        e.total += 1;
        if (l.opportunityStage && l.opportunityStage !== "OUTROS") e.opps += 1;
        utmMap.set(campKey, e);
      }
      const byUtmCampaign = Array.from(utmMap.entries())
        .map(([campaign, v]) => ({ campaign, ...v }))
        .sort((a, b) => b.total - a.total);

      // UTM source (somente preenchidas)
      const srcMap = new Map<string, { total: number; opps: number }>();
      for (const l of rows) {
        if (!l.utmSource) continue;
        const e = srcMap.get(l.utmSource) ?? { total: 0, opps: 0 };
        e.total += 1;
        if (l.opportunityStage && l.opportunityStage !== "OUTROS") e.opps += 1;
        srcMap.set(l.utmSource, e);
      }
      const byUtmSource = Array.from(srcMap.entries())
        .map(([source, v]) => ({ source, ...v }))
        .sort((a, b) => b.total - a.total);

      // Contexto adicional (quando informado)
      const ctxMap = new Map<string, number>();
      for (const l of rows) {
        if (l.extraContext) ctxMap.set(l.extraContext, (ctxMap.get(l.extraContext) ?? 0) + 1);
      }
      const byContext = Array.from(ctxMap.entries()).map(([context, qtd]) => ({ context, qtd })).sort((a, b) => b.qtd - a.qtd);

      // Produtos de interesse
      const prodMap = new Map<string, number>();
      for (const l of rows) {
        if (l.products) prodMap.set(l.products, (prodMap.get(l.products) ?? 0) + 1);
      }
      const byProduct = Array.from(prodMap.entries()).map(([product, qtd]) => ({ product, qtd })).sort((a, b) => b.qtd - a.qtd);

      // Origem por etapa: para cada etapa do funil, de onde vieram os leads (canal e campanha)
      const stageOrigin: Record<string, { channels: { name: string; qtd: number }[]; campaigns: { name: string; qtd: number }[] }> = {};
      const stageKeys: { key: string; test: (l: CrmLeadRow) => boolean }[] = [
        { key: "Leads", test: () => true },
        ...STAGE_ORDER.map((s) => ({
          key: s === "MATRICULADO" ? "Matriculados" : s,
          test: (l: CrmLeadRow) => l.opportunityStage === s,
        })),
      ];
      for (const { key, test } of stageKeys) {
        const chM = new Map<string, number>();
        const cpM = new Map<string, number>();
        for (const l of rows) {
          if (!test(l)) continue;
          chM.set(l.sourceChannel, (chM.get(l.sourceChannel) ?? 0) + 1);
          const cp = l.utmCampaign || (l.formName ? `form: ${l.formName}` : "sem rastreamento");
          cpM.set(cp, (cpM.get(cp) ?? 0) + 1);
        }
        stageOrigin[key] = {
          channels: Array.from(chM.entries()).map(([name, qtd]) => ({ name, qtd })).sort((a, b) => b.qtd - a.qtd),
          campaigns: Array.from(cpM.entries()).map(([name, qtd]) => ({ name, qtd })).sort((a, b) => b.qtd - a.qtd),
        };
      }

      return {
        kpis: {
          total,
          opportunities: total,
          contactsWithoutOpp,
          oppRate: total + contactsWithoutOpp > 0 ? total / (total + contactsWithoutOpp) : 0,
          mql: byStage.MQL, sal: byStage.SAL, sql: byStage.SQL,
          matriculados,
          enrollRate: total > 0 ? matriculados / total : 0,
        },
        families: Array.from(families),
        dailyByChannel,
        byChannel,
        funnel,
        lossReasons,
        activeTags,
        byUtmCampaign,
        byUtmSource,
        byContext,
        byProduct,
        stageOrigin,
      };
    }),

  /** Importação da base de leads via CSV (somente admin). Substitui toda a base. */
  importLeadsCsv: localAdminProcedure
    .input(z.object({ content: z.string().min(10), filename: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const parsed = parseLeadsCsv(input.content);
      if (parsed.rows.length === 0) {
        return { success: false as const, imported: 0, total: parsed.total, skipped: parsed.skipped, errors: parsed.errors };
      }
      const imported = await replaceCrmLeads(parsed.rows);
      await logAudit({
        userId: ctx.localUser.uid, username: ctx.localUser.username,
        action: "leads_importados", entity: input.filename ?? "csv",
        details: `Base de leads substituída: ${imported} registros importados (${parsed.skipped} linhas ignoradas).`,
      });
      return { success: true as const, imported, total: parsed.total, skipped: parsed.skipped, errors: parsed.errors };
    }),

  auditLogs: localStaffProcedure.query(async () => await listAuditLogs(400)),

  goals: localProtectedProcedure.query(async () => await listGoals()),

  saveGoal: localStaffProcedure
    .input(z.object({
      id: z.number().optional(),
      channel: z.enum(["geral", "meta", "google", "programatica"]),
      metric: z.string().min(1),
      period: z.enum(["mensal", "semanal", "diaria"]).default("mensal"),
      targetValue: z.number(),
      direction: z.enum(["min", "max"]),
    }))
    .mutation(async ({ ctx, input }) => {
      await upsertGoal({ ...input, createdBy: ctx.localUser.username });
      await logAudit({
        userId: ctx.localUser.uid, username: ctx.localUser.username,
        action: "meta_alterada", entity: `${input.channel}/${input.metric}`,
        details: `Meta ${input.metric} (${input.channel}, ${input.period}) definida para ${input.targetValue}`,
      });
      return { success: true } as const;
    }),

  deleteGoal: localAdminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await deleteGoal(input.id);
      await logAudit({
        userId: ctx.localUser.uid, username: ctx.localUser.username,
        action: "meta_removida", entity: String(input.id), details: `Meta #${input.id} removida`,
      });
      return { success: true } as const;
    }),
});
