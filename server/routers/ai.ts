import { z } from "zod";
import { invokeLLM } from "../_core/llm";
import { getDb, getDv360Rows, getProgPushRows, listGoals, logAudit } from "../db";
import { optimizations } from "../../drizzle/schema";
import { desc, eq } from "drizzle-orm";
import {
  GOOGLE_ACCOUNT, GOOGLE_CAMPAIGN_FIELDS, GOOGLE_DAILY_FIELDS, googleTotals,
  META_ACCOUNT, META_CAMPAIGN_FIELDS, META_DAILY_FIELDS,
  metaTotals, num, windsorFetch,
} from "../windsor";
import { localStaffProcedure, localProtectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";

const dateRangeInput = z.object({
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const generateInput = dateRangeInput.extend({
  channel: z.enum(["geral", "meta", "google", "programatica"]).default("geral"),
});

function fmt(n: number, d = 2) { return Number.isFinite(n) ? n.toFixed(d) : "0"; }

type ChecklistItem = { item: string; done: boolean; motivo?: string; canal?: string; prioridade?: string; completedBy?: string; completedAt?: string };

export const aiRouter = router({
  list: localProtectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return await db.select().from(optimizations).orderBy(desc(optimizations.createdAt)).limit(30);
  }),

  generate: localStaffProcedure.input(generateInput).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });

    const ch = input.channel;
    const wantMeta = ch === "geral" || ch === "meta";
    const wantGoogle = ch === "geral" || ch === "google";
    const wantProg = ch === "geral" || ch === "programatica";

    const [metaDaily, googleDaily, metaCamps, googleCamps, goals, dv360, push] = await Promise.all([
      wantMeta ? windsorFetch({ connector: "facebook", accounts: [META_ACCOUNT], fields: META_DAILY_FIELDS, dateFrom: input.dateFrom, dateTo: input.dateTo }).catch(() => ({ rows: [] as any[] })) : Promise.resolve({ rows: [] as any[] }),
      wantGoogle ? windsorFetch({ connector: "google_ads", accounts: [GOOGLE_ACCOUNT], fields: GOOGLE_DAILY_FIELDS, dateFrom: input.dateFrom, dateTo: input.dateTo }).catch(() => ({ rows: [] as any[] })) : Promise.resolve({ rows: [] as any[] }),
      wantMeta ? windsorFetch({ connector: "facebook", accounts: [META_ACCOUNT], fields: META_CAMPAIGN_FIELDS, dateFrom: input.dateFrom, dateTo: input.dateTo }).catch(() => ({ rows: [] as any[] })) : Promise.resolve({ rows: [] as any[] }),
      wantGoogle ? windsorFetch({ connector: "google_ads", accounts: [GOOGLE_ACCOUNT], fields: GOOGLE_CAMPAIGN_FIELDS, dateFrom: input.dateFrom, dateTo: input.dateTo }).catch(() => ({ rows: [] as any[] })) : Promise.resolve({ rows: [] as any[] }),
      listGoals(),
      wantProg ? getDv360Rows().catch(() => [] as any[]) : Promise.resolve([] as any[]),
      wantProg ? getProgPushRows().catch(() => [] as any[]) : Promise.resolve([] as any[]),
    ]);

    const mt = metaTotals(metaDaily.rows as any);
    const gt = googleTotals(googleDaily.rows as any);

    const metaCampLines = (metaCamps.rows as any[]).map(r =>
      `- ${r.campaign} [${r.campaign_status}]: invest R$${fmt(num(r.spend))}, impr ${num(r.impressions)}, cliques ${num(r.link_clicks ?? r.clicks)}, leads ${num(r.actions_lead)}, compras ${num(r.actions_omni_purchase)}, receita R$${fmt(num(r.action_values_omni_purchase))}`
    ).join("\n");
    const googleCampLines = (googleCamps.rows as any[]).map(r =>
      `- ${r.campaign} [${r.campaign_status}]: invest R$${fmt(num(r.spend))}, impr ${num(r.impressions)}, cliques ${num(r.clicks)}, conv ${fmt(num(r.conversions), 1)}, receita R$${fmt(num(r.conversion_value))}, IS ${fmt(num(r.search_impression_share) * 100, 1)}%, perda IS orçamento ${fmt(num(r.search_budget_lost_impression_share) * 100, 1)}%`
    ).join("\n");
    const relevantGoals = ch === "geral" ? goals : goals.filter(g => g.channel === ch || g.channel === "geral");
    const goalLines = relevantGoals.map(g =>
      `- [${g.channel}] ${g.metric} (${g.period}): alvo ${g.targetValue} (${g.direction === "min" ? "quanto menor melhor" : "quanto maior melhor"})`
    ).join("\n") || "Nenhuma meta configurada.";

    // Bloco Programática (planilha DV360/Push de junho)
    const progAgg = (dv360 as any[]).reduce((acc, r) => {
      acc.spend += Number(r.spend ?? 0); acc.impressions += Number(r.impressions ?? 0); acc.clicks += Number(r.clicks ?? 0);
      return acc;
    }, { spend: 0, impressions: 0, clicks: 0 });
    const pushAgg = (push as any[]).reduce((acc, r) => {
      acc.impressions += Number(r.impressions ?? 0); acc.clicks += Number(r.clicks ?? 0);
      return acc;
    }, { impressions: 0, clicks: 0 });
    const progBlock = wantProg
      ? `TOTAIS PROGRAMÁTICA (DV360, junho): invest R$${fmt(progAgg.spend)}, impressões ${progAgg.impressions}, cliques ${progAgg.clicks}, CTR ${fmt(progAgg.impressions > 0 ? (progAgg.clicks / progAgg.impressions) * 100 : 0, 2)}%
PUSH NOTIFICATION (junho): impressões ${pushAgg.impressions}, cliques ${pushAgg.clicks}`
      : "";

    const channelLabel = ch === "meta" ? "Meta Ads" : ch === "google" ? "Google Ads" : ch === "programatica" ? "Programática (DV360/Push)" : "todos os canais";
    const scopeInstruction = ch === "geral"
      ? "Analise todos os canais de forma consolidada."
      : `FOQUE EXCLUSIVAMENTE no canal ${channelLabel}. Todas as tarefas do plano de ação devem ser deste canal. O campo "canal" da resposta e das tarefas deve ser "${ch}".`;

    const prompt = `Você é um especialista sênior em mídia paga analisando as contas da APSY (escola de pós-graduação em psicologia, Brasil).
${scopeInstruction}

PERÍODO ANALISADO: ${input.dateFrom} a ${input.dateTo}

${wantMeta ? `TOTAIS META ADS: investimento R$${fmt(mt.spend)}, impressões ${mt.impressions}, cliques ${mt.clicks}, leads ${mt.leads}, compras ${mt.purchases}, receita R$${fmt(mt.revenue)}` : ""}
${wantGoogle ? `TOTAIS GOOGLE ADS: investimento R$${fmt(gt.spend)}, impressões ${gt.impressions}, cliques ${gt.clicks}, conversões ${fmt(gt.leads, 1)}, receita R$${fmt(gt.revenue)}` : ""}
${progBlock}

${wantMeta ? `CAMPANHAS META:\n${metaCampLines || "sem campanhas"}` : ""}

${wantGoogle ? `CAMPANHAS GOOGLE:\n${googleCampLines || "sem campanhas"}` : ""}

METAS CONFIGURADAS:
${goalLines}

Gere uma análise executiva em português com:
1. Diagnóstico de desvios em relação às metas (compare números reais vs. alvos)
2. Defesa/justificativa da análise com base nos dados (campanhas com melhor e pior CPL, CTR, ROAS)
3. Sugestões de redistribuição de orçamento ${ch === "geral" ? "entre canais e campanhas" : "entre campanhas do canal"} (sem ultrapassar a verba total atual; seja coerente — nunca sugira otimizar e pausar a mesma campanha)
4. Plano de ação com 4 a 8 tarefas concretas, específicas e executáveis, cada uma com o motivo da otimização`;

    const response = await invokeLLM({
      messages: [
        { role: "system", content: "Você é um analista de mídia paga sênior. Responda somente com JSON válido." },
        { role: "user", content: prompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "analise_otimizacao",
          strict: true,
          schema: {
            type: "object",
            properties: {
              titulo: { type: "string" },
              canal: { type: "string", enum: ["geral", "meta", "google", "programatica"] },
              prioridade: { type: "string", enum: ["alta", "media", "baixa"] },
              diagnostico: { type: "string", description: "Diagnóstico de desvios vs. metas, 2-3 parágrafos" },
              defesa: { type: "string", description: "Justificativa baseada em dados" },
              plano_de_acao: { type: "string", description: "Sugestão de redistribuição de orçamento e plano geral" },
              tarefas: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    item: { type: "string" },
                    motivo: { type: "string" },
                    canal: { type: "string", enum: ["meta", "google", "programatica", "geral"] },
                    prioridade: { type: "string", enum: ["alta", "media", "baixa"] },
                  },
                  required: ["item", "motivo", "canal", "prioridade"],
                  additionalProperties: false,
                },
              },
            },
            required: ["titulo", "canal", "prioridade", "diagnostico", "defesa", "plano_de_acao", "tarefas"],
            additionalProperties: false,
          },
        },
      },
    });

    const raw = response.choices[0]?.message?.content;
    const content = typeof raw === "string" ? raw : "";
    let parsed: {
      titulo: string; canal: "geral" | "meta" | "google" | "programatica";
      prioridade: "alta" | "media" | "baixa";
      diagnostico: string; defesa: string; plano_de_acao: string;
      tarefas: { item: string; motivo: string; canal: string; prioridade: string }[];
    };
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "A IA retornou um formato inválido. Tente novamente." });
    }

    const checklist: ChecklistItem[] = parsed.tarefas.map(t => ({
      item: t.item, motivo: t.motivo, canal: t.canal, prioridade: t.prioridade, done: false,
    }));

    const metricsBefore = {
      periodo: `${input.dateFrom} a ${input.dateTo}`,
      meta: { spend: mt.spend, leads: mt.leads, purchases: mt.purchases, revenue: mt.revenue },
      google: { spend: gt.spend, conversions: gt.leads, revenue: gt.revenue },
    };

    const [ins] = await db.insert(optimizations).values({
      channel: ch === "geral" ? parsed.canal : ch,
      title: parsed.titulo,
      diagnosis: parsed.diagnostico,
      defense: parsed.defesa,
      actionPlan: parsed.plano_de_acao,
      priority: parsed.prioridade,
      status: "pendente",
      assignee: ctx.localUser.username,
      checklist,
      metricsBefore,
    });
    const optId = Number(ins.insertId);

    await logAudit({
      userId: ctx.localUser.uid, username: ctx.localUser.username,
      action: "otimizacao_gerada", entity: `otimizacao#${optId}`,
      details: `Análise de IA gerada [${channelLabel}] (${input.dateFrom} a ${input.dateTo}): ${parsed.titulo}`,
    });

    return { id: optId };
  }),

  toggleChecklistItem: localStaffProcedure
    .input(z.object({ optimizationId: z.number(), index: z.number(), done: z.boolean(), comment: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      const [opt] = await db.select().from(optimizations).where(eq(optimizations.id, input.optimizationId)).limit(1);
      if (!opt) throw new TRPCError({ code: "NOT_FOUND", message: "Otimização não encontrada" });

      const checklist = (opt.checklist as ChecklistItem[] | null) ?? [];
      if (input.index < 0 || input.index >= checklist.length) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Item inválido" });
      }
      checklist[input.index] = {
        ...checklist[input.index],
        done: input.done,
        completedBy: input.done ? ctx.localUser.username : undefined,
        completedAt: input.done ? new Date().toISOString() : undefined,
      };

      const allDone = checklist.every(c => c.done);
      const anyDone = checklist.some(c => c.done);
      const newStatus = allDone ? "concluida" : anyDone ? "em_andamento" : "pendente";

      await db.update(optimizations)
        .set({
          checklist,
          status: newStatus,
          completedBy: allDone ? ctx.localUser.username : null,
          completedAt: allDone ? new Date() : null,
        })
        .where(eq(optimizations.id, input.optimizationId));

      await logAudit({
        userId: ctx.localUser.uid, username: ctx.localUser.username,
        action: input.done ? "otimizacao_concluida" : "otimizacao_reaberta",
        entity: `otimizacao#${input.optimizationId}/item${input.index}`,
        details: `${input.done ? "Concluída" : "Reaberta"}: ${checklist[input.index].item}${input.comment ? ` — Comentário: ${input.comment}` : ""}`,
      });
      return { success: true, status: newStatus } as const;
    }),

  updateStatus: localStaffProcedure
    .input(z.object({ optimizationId: z.number(), status: z.enum(["pendente", "em_andamento", "concluida", "descartada"]), comment: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      await db.update(optimizations)
        .set({
          status: input.status,
          completedBy: input.status === "concluida" ? ctx.localUser.username : null,
          completedAt: input.status === "concluida" ? new Date() : null,
        })
        .where(eq(optimizations.id, input.optimizationId));
      await logAudit({
        userId: ctx.localUser.uid, username: ctx.localUser.username,
        action: "mudanca_status", entity: `otimizacao#${input.optimizationId}`,
        details: `Status alterado para ${input.status}${input.comment ? ` — Comentário: ${input.comment}` : ""}`,
      });
      return { success: true } as const;
    }),
});
