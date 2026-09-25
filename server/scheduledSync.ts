import type { Request, Response } from "express";
import { sdk } from "./_core/sdk";
import { fetchEducaCrmSnapshot, mapEducaCrmSnapshot } from "./educacrm";
import { replaceCrmLeads } from "./db";
import { getPublyaData } from "./routers/media";
import { getCrmSyncWindow } from "./syncWindow";
import { ENV } from "./_core/env";
import { CRM_STAGE_ORDER } from "../shared/crmFunnel";

async function isAuthorizedScheduler(req: Request) {
  const expected = ENV.scheduledSyncSecret;
  const bearer = req.headers.authorization;
  if (expected && bearer === `Bearer ${expected}`) return true;

  try {
    const user = await sdk.authenticateRequest(req);
    return Boolean((user as any).isCron);
  } catch {
    return false;
  }
}

/**
 * Handler: POST /api/scheduled/sync-data
 * Atualiza o snapshot do EducaCRM até D-1 BRT e aquece Programática (Publya).
 * Chamado pelo Heartbeat cron — não precisa de sessão de usuário real.
 */
export async function syncDataHandler(req: Request, res: Response) {
  try {
    if (!(await isAuthorizedScheduler(req))) {
      return res.status(403).json({ error: "cron-only" });
    }

    const now = new Date();
    const { from: fromStr, to: toStr } = getCrmSyncWindow(now);
    const results: Record<string, string> = {};

    // 1. Sincronizar o snapshot oficial de Leads (EducaCRM)
    try {
      const snapshot = await fetchEducaCrmSnapshot(true);
      const allNormalised = mapEducaCrmSnapshot(snapshot);
      const normalised = allNormalised.filter(lead => {
        const createdDate = String(lead.createdDate).slice(0, 10);
        return createdDate >= fromStr && createdDate <= toStr;
      });

      if (snapshot.leads.length < 100 || normalised.length < 100) {
        throw new Error(
          `Carga recusada por segurança: ${snapshot.leads.length} leads brutos e ${normalised.length} normalizados`
        );
      }

      const dbRows = normalised.map(lead => ({
        externalId: lead.externalId,
        companyName: lead.companyName,
        contactName: lead.contactName,
        email: lead.email,
        phone: lead.phone,
        cpf: lead.cpf,
        sourceChannel: lead.sourceChannel,
        formName: lead.formName,
        utmSource: lead.utmSource,
        utmMedium: lead.utmMedium,
        utmCampaign: lead.utmCampaign,
        cep: lead.cep,
        street: lead.street,
        addrNumber: lead.addrNumber,
        neighborhood: lead.neighborhood,
        city: lead.city,
        state: lead.state,
        birthDate: lead.birthDate,
        products: lead.products,
        extraContext: lead.extraContext,
        status: lead.status,
        opportunityNumber: lead.opportunityNumber,
        opportunityName: lead.opportunityName,
        opportunityTag: lead.opportunityTag,
        opportunityStage: lead.opportunityStage,
        createdDate:
          typeof lead.createdDate === "string"
            ? new Date(`${lead.createdDate.slice(0, 10)}T00:00:00.000Z`)
            : lead.createdDate,
        updatedDate: lead.updatedDate
          ? typeof lead.updatedDate === "string"
            ? new Date(`${lead.updatedDate.slice(0, 10)}T00:00:00.000Z`)
            : lead.updatedDate
          : null,
      }));

      const count = await replaceCrmLeads(dbRows);
      const byStage = normalised.reduce<Record<string, number>>((acc, lead) => {
        const stage = lead.opportunityStage ?? "SEM_ETAPA";
        acc[stage] = (acc[stage] ?? 0) + 1;
        return acc;
      }, {});
      results.leads = `OK — EducaCRM: ${snapshot.leads.length} leads, ${snapshot.contacts.length} contatos, ${snapshot.enrollments.length} inscritos; ${count} registros persistidos de ${fromStr} a ${toStr} (D-1 BRT)`;
      results.funnel = CRM_STAGE_ORDER.map(
        stage => `${stage} ${byStage[stage] ?? 0}`
      ).join(" · ");
    } catch (error: any) {
      results.leads = `ERRO — ${error.message}`;
    }

    // 2. Aquecer cache de Programática (Publya)
    try {
      const publya = await getPublyaData();
      results.programatica = `OK — ${publya.rows.length} linhas, ${publya.campaigns.length} campanhas`;
    } catch (error: any) {
      results.programatica = `ERRO — ${error.message}`;
    }

    return res.json({
      ok: !results.leads.startsWith("ERRO"),
      syncedAt: now.toISOString(),
      period: { from: fromStr, to: toStr },
      source: "EducaCRM",
      results,
    });
  } catch (error: any) {
    return res.status(500).json({
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    });
  }
}
