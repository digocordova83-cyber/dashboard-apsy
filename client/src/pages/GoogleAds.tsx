import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { KpiCard } from "@/components/KpiCard";
import { CompareStrip } from "@/components/CompareStrip";
import { PacingPanel } from "@/components/PacingPanel";
import { DateRangePicker, defaultRange, type DateRange } from "@/components/DateRangePicker";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { fmtBRL, fmtDate, fmtDec, fmtNumCompact, fmtPct } from "@/lib/format";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Coins, Eye, MousePointerClick, Goal, TrendingUp, Percent, FilterX } from "lucide-react";

const tooltipStyle = {
  backgroundColor: "oklch(0.25 0.045 222)",
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: 8, fontSize: 12, color: "#E6F2F2",
};
const axisTick = { fontSize: 11, fill: "#7FA0A8" };
const TYPE_COLORS: Record<string, string> = {
  Search: "#00ACB3", YouTube: "#E86A5E", Display: "#4A9FE8", "Demand Gen": "#D9B54A", "Performance Max": "#8AD9C3", Outros: "#7FA0A8",
};

type GoogleCampaignRow = {
  campaign: string; status: string; type: string; group?: string;
  spend: number; impressions: number; clicks: number; ctr: number; cpc: number;
  leads: number; cpa: number; impressionShare: number; budgetLostIS: number; rankLostIS: number;
};

function GoogleCampaignTable(props: {
  title: string; subtitle: string; accent: string;
  rows: GoogleCampaignRow[]; loading: boolean;
  selected: string; onSelect: (name: string) => void;
}) {
  const { title, subtitle, accent, rows, loading, selected, onSelect } = props;
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: accent }} />
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="text-xs text-muted-foreground">· {subtitle}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2">Campanha</th>
              <th className="px-3 py-2">Tipo</th>
              <th className="px-3 py-2 text-right">Invest.</th>
              <th className="px-3 py-2 text-right">Impr.</th>
              <th className="px-3 py-2 text-right">Cliques</th>
              <th className="px-3 py-2 text-right">CTR</th>
              <th className="px-3 py-2 text-right">CPC</th>
              <th className="px-3 py-2 text-right">Conv.</th>
              <th className="px-3 py-2 text-right">CPA</th>
              <th className="px-3 py-2 text-right">IS</th>
              <th className="px-3 py-2 text-right">Perda IS (orç.)</th>
              <th className="px-3 py-2 text-right">Perda IS (rank)</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i}><td colSpan={12} className="px-3 py-2"><Skeleton className="h-8" /></td></tr>
              ))
            ) : rows.length === 0 ? (
              <tr><td colSpan={12} className="px-3 py-6 text-center text-muted-foreground">Sem campanhas nesta categoria no período</td></tr>
            ) : rows.map((r, i) => {
              const isSel = selected === r.campaign;
              return (
                <tr
                  key={i}
                  onClick={() => onSelect(r.campaign)}
                  className={`cursor-pointer border-b border-border/30 transition-colors hover:bg-accent/40 ${isSel ? "bg-primary/10" : ""}`}
                  title={isSel ? "Clique para limpar o filtro" : "Clique para filtrar por esta campanha"}
                >
                  <td className="max-w-[240px] truncate px-3 py-2.5 font-medium">
                    <span className={isSel ? "text-primary" : ""}>{r.campaign}</span>
                    {String(r.status).toUpperCase().includes("ENABLED") || String(r.status).toUpperCase().includes("ACTIVE") ? (
                      <Badge variant="outline" className="ml-2 border-emerald-500/40 text-[9px] text-emerald-400">Ativa</Badge>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge variant="outline" className="text-[10px]" style={{ borderColor: `${TYPE_COLORS[r.type] ?? "#7FA0A8"}66`, color: TYPE_COLORS[r.type] ?? "#7FA0A8" }}>
                      {r.type}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5 text-right font-medium">{fmtBRL(r.spend)}</td>
                  <td className="px-3 py-2.5 text-right">{fmtNumCompact(r.impressions)}</td>
                  <td className="px-3 py-2.5 text-right">{fmtNumCompact(r.clicks)}</td>
                  <td className="px-3 py-2.5 text-right">{fmtPct(r.ctr)}</td>
                  <td className="px-3 py-2.5 text-right">{fmtBRL(r.cpc)}</td>
                  <td className="px-3 py-2.5 text-right">{fmtDec(r.leads, 1)}</td>
                  <td className="px-3 py-2.5 text-right">{r.leads > 0 ? fmtBRL(r.cpa) : "—"}</td>
                  <td className="px-3 py-2.5 text-right">{r.impressionShare > 0 ? fmtPct(r.impressionShare) : "—"}</td>
                  <td className="px-3 py-2.5 text-right">{r.budgetLostIS > 0 ? fmtPct(r.budgetLostIS) : "—"}</td>
                  <td className="px-3 py-2.5 text-right">{r.rankLostIS > 0 ? fmtPct(r.rankLostIS) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export default function GoogleAds() {
  const [range, setRange] = useState<DateRange>(() => defaultRange());
  const [selCampaign, setSelCampaign] = useState<string>("all");
  const q = { dateFrom: range.dateFrom, dateTo: range.dateTo };
  const opts = { staleTime: 5 * 60 * 1000, retry: 1 };

  const filterQ = useMemo(() => ({
    ...q,
    ...(selCampaign !== "all" ? { campaign: selCampaign } : {}),
  }), [q.dateFrom, q.dateTo, selCampaign]);

  const overview = trpc.media.googleOverview.useQuery(filterQ, opts);
  const campaigns = trpc.media.googleCampaigns.useQuery(q, opts);
  const keywords = trpc.media.googleKeywords.useQuery(filterQ, opts);
  const terms = trpc.media.googleSearchTerms.useQuery(filterQ, opts);
  const devices = trpc.media.googleDevices.useQuery(filterQ, opts);

  const t = overview.data?.totals;

  // Opções e linhas filtradas / separadas por objetivo
  const campaignOptions = useMemo(
    () => Array.from(new Set((campaigns.data ?? []).map(c => c.campaign).filter(Boolean))).sort(),
    [campaigns.data]);
  const campaignRows = useMemo(
    () => (campaigns.data ?? []).filter(c => selCampaign === "all" || c.campaign === selCampaign),
    [campaigns.data, selCampaign]);
  // Agrupamento por objetivo extraído do NOME da campanha (backend: extractGoogleObjective)
  const objectiveGroups = useMemo(() => {
    const order = ["Leads / Conversão", "Tráfego", "Awareness", "Outros"];
    const map = new Map<string, any[]>();
    for (const c of campaignRows) {
      const key = (c as any).objective ?? "Outros";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    return order.filter(k => (map.get(k) ?? []).length > 0).map(k => ({ objective: k, rows: map.get(k)! }));
  }, [campaignRows]);
  const clickCampaign = (name: string) => setSelCampaign(prev => prev === name ? "all" : name);

  // agregação por tipo de campanha
  const byType = new Map<string, { type: string; spend: number; impressions: number; clicks: number; leads: number }>();
  for (const r of campaignRows) {
    const e = byType.get(r.type) ?? { type: r.type, spend: 0, impressions: 0, clicks: 0, leads: 0 };
    e.spend += r.spend; e.impressions += r.impressions; e.clicks += r.clicks; e.leads += r.leads;
    byType.set(r.type, e);
  }
  const typeData = Array.from(byType.values()).sort((a, b) => b.spend - a.spend);

  const searchCampaigns = campaignRows.filter(c => c.type === "Search");
  const avgIS = searchCampaigns.length > 0
    ? searchCampaigns.reduce((s, c) => s + c.impressionShare, 0) / searchCampaigns.filter(c => c.impressionShare > 0).length || 0
    : 0;

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Google Ads</h1>
          <p className="text-sm text-muted-foreground">Conta 933-247-0027 · dados via Windsor.ai{overview.data?.fromCache ? " (cache)" : ""}</p>
        </div>
        <DateRangePicker value={range} onChange={setRange} />
      </div>

      {/* Filtro por campanha */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={selCampaign} onValueChange={setSelCampaign}>
          <SelectTrigger className="w-[320px]"><SelectValue placeholder="Todas as campanhas" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as campanhas</SelectItem>
            {campaignOptions.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        {selCampaign !== "all" && (
          <>
            <Badge variant="outline" className="border-primary/40 text-primary">dados filtrados</Badge>
            <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground" onClick={() => setSelCampaign("all")}>
              <FilterX className="h-3.5 w-3.5" /> Limpar
            </Button>
          </>
        )}
      </div>

      {overview.isLoading || !t ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <KpiCard title="Investimento" value={fmtBRL(t.spend)} icon={Coins} accent />
          <KpiCard title="Impressões" value={fmtNumCompact(t.impressions)} sub={`CPM ${fmtBRL(t.cpm)}`} icon={Eye} />
          <KpiCard title="Cliques" value={fmtNumCompact(t.clicks)} sub={`CTR ${fmtPct(t.ctr)} · CPC ${fmtBRL(t.cpc)}`} icon={MousePointerClick} />
          <KpiCard title="Conversões" value={fmtDec(t.leads, 1)} sub={`CPA ${fmtBRL(t.cpa)}`} icon={Goal} />
          <KpiCard title="Parcela impr. (Search)" value={avgIS > 0 ? fmtPct(avgIS) : "—"} icon={Percent} />
          <KpiCard title="ROAS" value={t.revenue > 0 ? `${fmtDec(t.roas)}x` : "—"} sub={t.revenue > 0 ? `Receita ${fmtBRL(t.revenue)}` : "sem receita"} icon={TrendingUp} />
        </div>
      )}

      {/* Comparativos: hoje vs ontem vs 7d vs média 30d */}
      <CompareStrip channel="google" metrics={["investimento", "impressoes", "cliques", "conversoes", "cpa", "ctr"]} />

      {/* Pacing de investimento do canal */}
      <PacingPanel channels={["google"]} />

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="p-4 lg:col-span-3">
          <h3 className="mb-3 text-sm font-semibold">Tendência diária — investimento e conversões</h3>
          {overview.isLoading ? <Skeleton className="h-64" /> : (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={overview.data?.daily ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="date" tickFormatter={fmtDate} tick={axisTick} />
                <YAxis yAxisId="l" tickFormatter={(v) => fmtNumCompact(v)} tick={axisTick} width={48} />
                <YAxis yAxisId="r" orientation="right" allowDecimals={false} tick={axisTick} width={36} />
                <Tooltip contentStyle={tooltipStyle} labelFormatter={(l) => fmtDate(String(l))}
                  formatter={(v: number, name: string) => name === "spend" ? [fmtBRL(v), "Investimento"] : [fmtDec(v, 1), "Conversões"]} />
                <Legend formatter={(v) => v === "spend" ? "Investimento" : "Conversões"} />
                <Line yAxisId="l" type="monotone" dataKey="spend" stroke="#00ACB3" strokeWidth={2} dot={false} />
                <Line yAxisId="r" type="monotone" dataKey="leads" stroke="#D9B54A" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Card>
        <Card className="p-4 lg:col-span-2">
          <h3 className="mb-3 text-sm font-semibold">Investimento por tipo de campanha</h3>
          {campaigns.isLoading ? <Skeleton className="h-64" /> : (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={typeData} dataKey="spend" nameKey="type" innerRadius={55} outerRadius={90} paddingAngle={3} strokeWidth={0}>
                  {typeData.map((e) => (
                    <Cell key={e.type} fill={TYPE_COLORS[e.type] ?? TYPE_COLORS.Outros} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [fmtBRL(v), ""]} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      <Tabs defaultValue="campanhas">
        <TabsList>
          <TabsTrigger value="campanhas">Campanhas</TabsTrigger>
          <TabsTrigger value="keywords">Palavras-chave</TabsTrigger>
          <TabsTrigger value="termos">Termos de pesquisa</TabsTrigger>
          <TabsTrigger value="dispositivos">Dispositivos</TabsTrigger>
        </TabsList>

        <TabsContent value="campanhas">
          <div className="flex flex-col gap-4">
            <p className="text-xs text-muted-foreground">Clique em uma campanha para filtrar todos os gráficos e tabelas. Clique novamente para limpar.</p>
            {objectiveGroups.length === 0 && !campaigns.isLoading && (
              <Card className="p-6 text-center text-sm text-muted-foreground">Nenhuma campanha no período selecionado.</Card>
            )}
            {campaigns.isLoading && (
              <GoogleCampaignTable
                title="Campanhas" subtitle="Carregando..." accent="#00ACB3"
                rows={[]} loading selected={selCampaign} onSelect={clickCampaign}
              />
            )}
            {objectiveGroups.map(g => (
              <GoogleCampaignTable
                key={g.objective}
                title={`Objetivo: ${g.objective}`}
                subtitle={
                  g.objective === "Leads / Conversão" ? "Campanhas com foco em geração de leads e conversões (pelo nome da campanha)" :
                  g.objective === "Tráfego" ? "Campanhas com foco em cliques e visitas ao site (pelo nome da campanha)" :
                  g.objective === "Awareness" ? "Branding, alcance e reconhecimento — YouTube/Display (pelo nome da campanha)" :
                  "Campanhas sem objetivo identificado no nome"
                }
                accent={g.objective === "Leads / Conversão" ? "#00ACB3" : g.objective === "Tráfego" ? "#4AA3D9" : g.objective === "Awareness" ? "#D9B54A" : "#8A9BA3"}
                rows={g.rows}
                loading={campaigns.isLoading}
                selected={selCampaign}
                onSelect={clickCampaign}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="keywords">
          <Card className="p-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2">Palavra-chave</th>
                    <th className="px-3 py-2">Campanha</th>
                    <th className="px-3 py-2 text-right">Índice de qualidade</th>
                    <th className="px-3 py-2 text-right">Invest.</th>
                    <th className="px-3 py-2 text-right">Impr.</th>
                    <th className="px-3 py-2 text-right">Cliques</th>
                    <th className="px-3 py-2 text-right">CTR</th>
                    <th className="px-3 py-2 text-right">CPC</th>
                    <th className="px-3 py-2 text-right">Conv.</th>
                  </tr>
                </thead>
                <tbody>
                  {keywords.isLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}><td colSpan={9} className="px-3 py-2"><Skeleton className="h-8" /></td></tr>
                    ))
                  ) : (keywords.data ?? []).length === 0 ? (
                    <tr><td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">Sem dados no período</td></tr>
                  ) : (keywords.data ?? []).map((r, i) => (
                    <tr key={i} className="border-b border-border/30 transition-colors hover:bg-accent/40">
                      <td className="max-w-[200px] truncate px-3 py-2.5 font-medium">{r.keyword}</td>
                      <td className="max-w-[180px] truncate px-3 py-2.5 text-muted-foreground">{r.campaign}</td>
                      <td className="px-3 py-2.5 text-right">
                        {r.qualityScore > 0 ? (
                          <Badge variant="outline" className={`text-[10px] ${r.qualityScore >= 7 ? "border-emerald-500/50 text-emerald-400" : r.qualityScore >= 5 ? "border-amber-500/50 text-amber-400" : "border-red-500/50 text-red-400"}`}>
                            {r.qualityScore}/10
                          </Badge>
                        ) : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right">{fmtBRL(r.spend)}</td>
                      <td className="px-3 py-2.5 text-right">{fmtNumCompact(r.impressions)}</td>
                      <td className="px-3 py-2.5 text-right">{fmtNumCompact(r.clicks)}</td>
                      <td className="px-3 py-2.5 text-right">{fmtPct(r.ctr)}</td>
                      <td className="px-3 py-2.5 text-right">{fmtBRL(r.cpc)}</td>
                      <td className="px-3 py-2.5 text-right">{fmtDec(r.leads, 1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="termos">
          <Card className="p-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2">Termo de pesquisa</th>
                    <th className="px-3 py-2">Campanha</th>
                    <th className="px-3 py-2 text-right">Impr.</th>
                    <th className="px-3 py-2 text-right">Cliques</th>
                    <th className="px-3 py-2 text-right">CTR</th>
                    <th className="px-3 py-2 text-right">Invest.</th>
                    <th className="px-3 py-2 text-right">Conv.</th>
                  </tr>
                </thead>
                <tbody>
                  {terms.isLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}><td colSpan={7} className="px-3 py-2"><Skeleton className="h-8" /></td></tr>
                    ))
                  ) : (terms.data ?? []).length === 0 ? (
                    <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">Sem dados no período</td></tr>
                  ) : (terms.data ?? []).map((r, i) => (
                    <tr key={i} className="border-b border-border/30 transition-colors hover:bg-accent/40">
                      <td className="max-w-[240px] truncate px-3 py-2.5 font-medium">{r.term}</td>
                      <td className="max-w-[180px] truncate px-3 py-2.5 text-muted-foreground">{r.campaign}</td>
                      <td className="px-3 py-2.5 text-right">{fmtNumCompact(r.impressions)}</td>
                      <td className="px-3 py-2.5 text-right">{fmtNumCompact(r.clicks)}</td>
                      <td className="px-3 py-2.5 text-right">{fmtPct(r.ctr)}</td>
                      <td className="px-3 py-2.5 text-right">{fmtBRL(r.spend)}</td>
                      <td className="px-3 py-2.5 text-right">{fmtDec(r.leads, 1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="dispositivos">
          <Card className="p-4">
            <h3 className="mb-3 text-sm font-semibold">Performance por dispositivo</h3>
            {devices.isLoading ? <Skeleton className="h-56" /> : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={devices.data ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="device" tick={axisTick} />
                  <YAxis tickFormatter={(v) => fmtNumCompact(v)} tick={axisTick} width={48} />
                  <Tooltip contentStyle={tooltipStyle}
                    formatter={(v: number, name: string) => name === "spend" ? [fmtBRL(v), "Investimento"] : [fmtNumCompact(v), "Cliques"]} />
                  <Legend formatter={(v) => v === "spend" ? "Investimento" : "Cliques"} />
                  <Bar dataKey="spend" fill="#00ACB3" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="clicks" fill="#4A9FE8" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
