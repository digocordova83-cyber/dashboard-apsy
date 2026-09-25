import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { KpiCard } from "@/components/KpiCard";
import { PacingPanel } from "@/components/PacingPanel";
import {
  DateRangePicker,
  defaultRange,
  type DateRange,
} from "@/components/DateRangePicker";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtBRL, fmtDate, fmtDec, fmtNumCompact, fmtPct } from "@/lib/format";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Coins,
  Eye,
  Lightbulb,
  MousePointerClick,
  Trophy,
  UserPlus,
  Receipt,
  ShoppingCart,
  TrendingUp,
} from "lucide-react";
import { CRM_STAGE_BY_KEY } from "@shared/crmFunnel";

const COLORS = {
  meta: "#4A9FE8",
  google: "#00ACB3",
  prog: "#8AD9C3",
};

const tooltipStyle = {
  backgroundColor: "oklch(0.25 0.045 222)",
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: 8,
  fontSize: 12,
  color: "#E6F2F2",
};

export default function Home() {
  const [range, setRange] = useState<DateRange>(() => defaultRange()); // mês atual (01 → ontem)
  const { data, isLoading } = trpc.media.overview.useQuery(
    { dateFrom: range.dateFrom, dateTo: range.dateTo },
    { staleTime: 5 * 60 * 1000, retry: 1 }
  );
  const { data: crmData } = trpc.crm.crmSummary.useQuery(
    { from: range.dateFrom, to: range.dateTo },
    { staleTime: 5 * 60 * 1000, retry: 1 }
  );
  const { data: metaCampaigns } = trpc.media.metaCampaigns.useQuery(
    { dateFrom: range.dateFrom, dateTo: range.dateTo },
    { staleTime: 5 * 60 * 1000, retry: 1 }
  );
  const { data: googleCampaigns } = trpc.media.googleCampaigns.useQuery(
    { dateFrom: range.dateFrom, dateTo: range.dateTo },
    { staleTime: 5 * 60 * 1000, retry: 1 }
  );

  const c = data?.consolidated;
  const ch = data?.byChannel;

  // Ranking consolidado de campanhas (Meta + Google) por leads e eficiência
  const ranking = useMemo(() => {
    const rows = [
      ...(metaCampaigns ?? []).map(r => ({
        canal: "Meta",
        cor: COLORS.meta,
        name: (r as { campaign: string }).campaign,
        ...(r as unknown as {
          spend: number;
          leads: number;
          cpl: number;
          ctr: number;
        }),
      })),
      ...(googleCampaigns ?? []).map(r => ({
        canal: "Google",
        cor: COLORS.google,
        name: (r as { campaign: string }).campaign,
        ...(r as unknown as {
          spend: number;
          leads: number;
          cpl: number;
          ctr: number;
        }),
      })),
    ].filter(r => r.spend > 0);
    return rows
      .sort(
        (a, b) => b.leads - a.leads || (a.cpl || Infinity) - (b.cpl || Infinity)
      )
      .slice(0, 6);
  }, [metaCampaigns, googleCampaigns]);

  // Insights automáticos de BI baseados nos dados consolidados
  const insights = useMemo(() => {
    if (!c || !ch) return [];
    const list: { tone: "pos" | "neg" | "info"; text: string }[] = [];
    const rows = [
      { canal: "Meta Ads", ...ch.meta },
      { canal: "Google Ads", ...ch.google },
    ].filter(r => r.spend > 0);
    const withLeads = rows.filter(r => r.leads > 0);
    if (withLeads.length > 1) {
      const best = withLeads.reduce((a, b) => (a.cpl < b.cpl ? a : b));
      const worst = withLeads.reduce((a, b) => (a.cpl > b.cpl ? a : b));
      if (best.canal !== worst.canal && worst.cpl > best.cpl * 1.5) {
        list.push({
          tone: "pos",
          text: `${best.canal} tem o melhor custo por lead (${fmtBRL(best.cpl)}), ${fmtDec(worst.cpl / best.cpl)}x mais eficiente que ${worst.canal} (${fmtBRL(worst.cpl)}). Considere realocar orçamento incremental para ${best.canal}.`,
        });
      }
    }
    const bestCamp = ranking[0];
    if (bestCamp && bestCamp.leads > 0) {
      list.push({
        tone: "pos",
        text: `A campanha "${bestCamp.name}" (${bestCamp.canal}) lidera em geração de leads no período, com ${fmtNumCompact(bestCamp.leads)} leads a ${fmtBRL(bestCamp.cpl)} por lead.`,
      });
    }
    const zeroLeadSpend = [
      ...(metaCampaigns ?? []).map(
        r => r as unknown as { campaign: string; spend: number; leads: number }
      ),
      ...(googleCampaigns ?? []).map(
        r => r as unknown as { campaign: string; spend: number; leads: number }
      ),
    ].filter(r => r.spend > 500 && (!r.leads || r.leads === 0));
    if (zeroLeadSpend.length > 0) {
      const total = zeroLeadSpend.reduce((s, r) => s + r.spend, 0);
      list.push({
        tone: "neg",
        text: `${zeroLeadSpend.length} campanha(s) somam ${fmtBRL(total)} investidos sem gerar leads no período (ex.: "${zeroLeadSpend[0].campaign}"). Avalie pausar, revisar segmentação ou atribuir objetivo de reconhecimento explícito.`,
      });
    }
    if (c.revenue <= 0 && c.leads > 0) {
      list.push({
        tone: "info",
        text: `Há ${fmtNumCompact(c.leads)} leads registrados mas nenhuma receita rastreada nos canais. Integrar o retorno de vendas do CRM aos pixels permitirá calcular CAC e ROAS reais.`,
      });
    }
    if (ch.programatica.spend > 0 && ch.programatica.leads === 0) {
      list.push({
        tone: "info",
        text: `A Programática (${fmtBRL(ch.programatica.spend)}) opera como mídia de awareness — sem rastreio de leads. O CTR do canal foi ${fmtPct(ch.programatica.ctr)}.`,
      });
    }
    return list.slice(0, 4);
  }, [c, ch, ranking, metaCampaigns, googleCampaigns]);

  const channelRows = ch
    ? [
        { canal: "Meta Ads", key: "meta", cor: COLORS.meta, ...ch.meta },
        {
          canal: "Google Ads",
          key: "google",
          cor: COLORS.google,
          ...ch.google,
        },
        {
          canal: "Programática",
          key: "prog",
          cor: COLORS.prog,
          ...ch.programatica,
        },
      ]
    : [];

  const funnel = c
    ? [
        { etapa: "Impressões", valor: c.impressions, cor: "#4A9FE8" },
        { etapa: "Cliques", valor: c.clicks, cor: "#00ACB3" },
        {
          etapa: "Leads CRM",
          valor: crmData?.kpis?.total ?? 0,
          cor: "#8AD9C3",
        },
        {
          etapa: "Não Localizado",
          valor: crmData?.kpis?.naoLocalizado ?? 0,
          cor: CRM_STAGE_BY_KEY.NAO_LOCALIZADO.color,
        },
        {
          etapa: "Em Atendimento",
          valor: crmData?.kpis?.emAtendimento ?? 0,
          cor: CRM_STAGE_BY_KEY.EM_ATENDIMENTO.color,
        },
        {
          etapa: "Qualificado",
          valor: crmData?.kpis?.qualificado ?? 0,
          cor: CRM_STAGE_BY_KEY.QUALIFICADO.color,
        },
        {
          etapa: "Fechamento",
          valor: crmData?.kpis?.fechamento ?? 0,
          cor: CRM_STAGE_BY_KEY.FECHAMENTO.color,
        },
        {
          etapa: "Matriculado",
          valor: crmData?.kpis?.matriculados ?? 0,
          cor: CRM_STAGE_BY_KEY.MATRICULADO.color,
        },
      ]
    : [];

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Visão Geral</h1>
          <p className="text-sm text-muted-foreground">
            Performance consolidada de todos os canais
          </p>
        </div>
        <DateRangePicker value={range} onChange={setRange} />
      </div>

      {/* KPIs */}
      {isLoading || !c ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
          <KpiCard
            title="Investimento"
            value={fmtBRL(c.spend)}
            icon={Coins}
            accent
          />
          <KpiCard
            title="Impressões"
            value={fmtNumCompact(c.impressions)}
            sub={`CPM ${fmtBRL(c.cpm)}`}
            icon={Eye}
          />
          <KpiCard
            title="Cliques"
            value={fmtNumCompact(c.clicks)}
            sub={`CTR ${fmtPct(c.ctr)} · CPC ${fmtBRL(c.cpc)}`}
            icon={MousePointerClick}
          />
          <KpiCard
            title="Leads (CRM)"
            value={fmtNumCompact(crmData?.kpis?.total ?? 0)}
            sub={`Oportunidades reais`}
            icon={UserPlus}
          />
          <KpiCard title="CPA" value={fmtBRL(c.cpa)} icon={Receipt} />
          <KpiCard
            title="CAC"
            value={c.purchases > 0 ? fmtBRL(c.cac) : "—"}
            sub={
              c.purchases > 0
                ? `${fmtNumCompact(c.purchases)} compras`
                : "sem compras"
            }
            icon={ShoppingCart}
          />
          <KpiCard
            title="ROAS"
            value={`${fmtDec(c.roas)}x`}
            sub={c.revenue > 0 ? `Receita ${fmtBRL(c.revenue)}` : "sem receita"}
            icon={TrendingUp}
            accent={c.roas >= 1}
          />
        </div>
      )}

      {/* Pacing de investimento por canal */}
      <PacingPanel />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Evolução temporal */}
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold">
            Evolução do investimento por canal
          </h3>
          {isLoading ? (
            <Skeleton className="h-64" />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={data?.daily ?? []}>
                <defs>
                  {Object.entries(COLORS).map(([k, v]) => (
                    <linearGradient
                      key={k}
                      id={`g-${k}`}
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="0%" stopColor={v} stopOpacity={0.5} />
                      <stop offset="100%" stopColor={v} stopOpacity={0.05} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.06)"
                />
                <XAxis
                  dataKey="date"
                  tickFormatter={fmtDate}
                  tick={{ fontSize: 11, fill: "#7FA0A8" }}
                />
                <YAxis
                  tickFormatter={v => fmtNumCompact(v)}
                  tick={{ fontSize: 11, fill: "#7FA0A8" }}
                  width={50}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={l => fmtDate(String(l))}
                  formatter={(v: number, name: string) => [
                    fmtBRL(v),
                    name === "meta"
                      ? "Meta"
                      : name === "google"
                        ? "Google"
                        : "Programática",
                  ]}
                />
                <Legend
                  formatter={v =>
                    v === "meta"
                      ? "Meta"
                      : v === "google"
                        ? "Google"
                        : "Programática"
                  }
                />
                <Area
                  type="monotone"
                  dataKey="meta"
                  stroke={COLORS.meta}
                  fill="url(#g-meta)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="google"
                  stroke={COLORS.google}
                  fill="url(#g-google)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="prog"
                  stroke={COLORS.prog}
                  fill="url(#g-prog)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Funil */}
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold">Funil de mídia e CRM</h3>
          {isLoading ? (
            <Skeleton className="h-64" />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={funnel} layout="vertical" margin={{ left: 12 }}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.06)"
                  horizontal={false}
                />
                <XAxis
                  type="number"
                  scale="sqrt"
                  domain={[0, "dataMax"]}
                  tickFormatter={v => fmtNumCompact(v)}
                  tick={{ fontSize: 11, fill: "#7FA0A8" }}
                />
                <YAxis
                  type="category"
                  dataKey="etapa"
                  width={108}
                  tick={{ fontSize: 11, fill: "#B8D2D6" }}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(v: number) => [fmtNumCompact(v), ""]}
                />
                <Bar dataKey="valor" radius={[0, 6, 6, 0]}>
                  {funnel.map((row, i) => (
                    <Cell key={i} fill={row.cor} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      {/* Comparativo por canal */}
      <Card className="p-4">
        <h3 className="mb-3 text-sm font-semibold">
          Comparativo de performance por canal
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2">Canal</th>
                <th className="px-3 py-2 text-right">Investimento</th>
                <th className="px-3 py-2 text-right">Impressões</th>
                <th className="px-3 py-2 text-right">Cliques</th>
                <th className="px-3 py-2 text-right">CTR</th>
                <th className="px-3 py-2 text-right">CPC</th>
                <th className="px-3 py-2 text-right">Leads</th>
                <th className="px-3 py-2 text-right">CPL</th>
                <th className="px-3 py-2 text-right">ROAS</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={9} className="px-3 py-2">
                        <Skeleton className="h-8" />
                      </td>
                    </tr>
                  ))
                : channelRows.map(r => (
                    <tr
                      key={r.key}
                      className="border-b border-border/30 transition-colors hover:bg-accent/40"
                    >
                      <td className="px-3 py-2.5 font-medium">
                        <span
                          className="mr-2 inline-block h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: r.cor }}
                        />
                        {r.canal}
                      </td>
                      <td className="px-3 py-2.5 text-right font-medium">
                        {fmtBRL(r.spend)}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {fmtNumCompact(r.impressions)}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {fmtNumCompact(r.clicks)}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {fmtPct(r.ctr)}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {fmtBRL(r.cpc)}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {r.leads > 0 ? fmtNumCompact(r.leads) : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {r.leads > 0 ? fmtBRL(r.cpl) : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {r.revenue > 0 ? `${fmtDec(r.roas)}x` : "—"}
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Meta e Google: dados em tempo real via Windsor.ai · Programática:
          planilha DV360/Push de junho (leads/receita não rastreados neste
          canal)
        </p>
      </Card>

      {/* Evolução de leads */}
      <Card className="p-4">
        <h3 className="mb-3 text-sm font-semibold">
          Evolução de leads (Meta + Google)
        </h3>
        {isLoading ? (
          <Skeleton className="h-56" />
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data?.daily ?? []}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.06)"
              />
              <XAxis
                dataKey="date"
                tickFormatter={fmtDate}
                tick={{ fontSize: 11, fill: "#7FA0A8" }}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11, fill: "#7FA0A8" }}
                width={36}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                labelFormatter={l => fmtDate(String(l))}
                formatter={(v: number, name: string) => [
                  v,
                  name === "leadsMeta" ? "Leads Meta" : "Leads Google",
                ]}
              />
              <Legend
                formatter={v =>
                  v === "leadsMeta" ? "Leads Meta" : "Leads Google"
                }
              />
              <Bar dataKey="leadsMeta" stackId="l" fill={COLORS.meta} />
              <Bar
                dataKey="leadsGoogle"
                stackId="l"
                fill={COLORS.google}
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Ranking de campanhas */}
        <Card className="p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Trophy className="h-4 w-4 text-primary" /> Ranking — top campanhas
            por leads
          </h3>
          {!metaCampaigns && !googleCampaigns ? (
            <Skeleton className="h-56" />
          ) : ranking.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Sem campanhas com investimento no período.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {ranking.map((r, i) => (
                <div
                  key={`${r.canal}-${r.name}`}
                  className="flex items-center gap-3 rounded-lg border border-border/40 px-3 py-2"
                >
                  <span className="w-5 text-center text-sm font-bold text-primary">
                    {i + 1}
                  </span>
                  <span
                    className="mr-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: r.cor }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{r.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.canal} · Invest. {fmtBRL(r.spend)} · CTR{" "}
                      {fmtPct(r.ctr)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">
                      {r.leads > 0 ? `${fmtNumCompact(r.leads)} leads` : "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {r.leads > 0 ? `CPL ${fmtBRL(r.cpl)}` : "sem leads"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Insights automáticos */}
        <Card className="p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Lightbulb className="h-4 w-4 text-primary" /> Insights automáticos
          </h3>
          {isLoading ? (
            <Skeleton className="h-56" />
          ) : insights.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Sem insights para o período selecionado.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {insights.map((ins, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 rounded-lg border border-border/40 p-3"
                >
                  <Badge
                    variant="outline"
                    className={
                      ins.tone === "pos"
                        ? "border-emerald-500/50 text-emerald-400"
                        : ins.tone === "neg"
                          ? "border-red-500/50 text-red-400"
                          : "border-sky-500/50 text-sky-400"
                    }
                  >
                    {ins.tone === "pos"
                      ? "Oportunidade"
                      : ins.tone === "neg"
                        ? "Atenção"
                        : "Observação"}
                  </Badge>
                  <p className="text-sm leading-relaxed text-foreground/90">
                    {ins.text}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
