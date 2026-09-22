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
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Coins, Eye, MousePointerClick, UserPlus, TrendingUp, ShoppingCart, MessageCircle, FilterX } from "lucide-react";

const tooltipStyle = {
  backgroundColor: "oklch(0.25 0.045 222)",
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: 8, fontSize: 12, color: "#E6F2F2",
};
const axisTick = { fontSize: 11, fill: "#7FA0A8" };

function PerfTable<T extends Record<string, unknown>>({ rows, cols, loading, onRowClick, isSelected }: {
  rows: T[]; loading: boolean;
  cols: { key: string; label: string; render: (r: T) => React.ReactNode; align?: "left" | "right" }[];
  onRowClick?: (r: T) => void;
  isSelected?: (r: T) => boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/60 text-xs uppercase tracking-wide text-muted-foreground">
            {cols.map(c => (
              <th key={c.key} className={`px-3 py-2 ${c.align === "right" ? "text-right" : "text-left"}`}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <tr key={i}><td colSpan={cols.length} className="px-3 py-2"><Skeleton className="h-8" /></td></tr>
            ))
          ) : rows.length === 0 ? (
            <tr><td colSpan={cols.length} className="px-3 py-8 text-center text-muted-foreground">Sem dados no período selecionado</td></tr>
          ) : rows.map((r, i) => (
            <tr
              key={i}
              className={`border-b border-border/30 transition-colors hover:bg-accent/40 ${onRowClick ? "cursor-pointer" : ""} ${isSelected?.(r) ? "bg-primary/10" : ""}`}
              onClick={onRowClick ? () => onRowClick(r) : undefined}
              title={onRowClick ? "Clique para filtrar toda a aba por esta campanha" : undefined}
            >
              {cols.map(c => (
                <td key={c.key} className={`px-3 py-2.5 ${c.align === "right" ? "text-right" : ""}`}>{c.render(r)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function MetaAds() {
  const [range, setRange] = useState<DateRange>(() => defaultRange());
  const [selCampaign, setSelCampaign] = useState<string>("all");
  const [selAdset, setSelAdset] = useState<string>("all");
  const [selDestination, setSelDestination] = useState<string>("all");
  const q = { dateFrom: range.dateFrom, dateTo: range.dateTo };
  const opts = { staleTime: 5 * 60 * 1000, retry: 1 };

  const filterQ = useMemo(() => ({
    ...q,
    ...(selCampaign !== "all" ? { campaign: selCampaign } : {}),
    ...(selAdset !== "all" ? { adset: selAdset } : {}),
  }), [q.dateFrom, q.dateTo, selCampaign, selAdset]);

  const overview = trpc.media.metaOverview.useQuery(filterQ, opts);
  const campaigns = trpc.media.metaCampaigns.useQuery(q, opts);
  const adsets = trpc.media.metaAdsets.useQuery(
    { ...q, ...(selCampaign !== "all" ? { campaign: selCampaign } : {}) }, opts);
  const ads = trpc.media.metaAds.useQuery(filterQ, opts);
  const demo = trpc.media.metaDemographics.useQuery(q, opts);
  const whatsapp = trpc.media.metaWhatsapp.useQuery(
    { ...q, ...(selCampaign !== "all" ? { campaign: selCampaign } : {}) }, opts);

  const t = overview.data?.totals;

  // Opções de filtro derivadas dos dados
  const campaignOptions = useMemo(
    () => Array.from(new Set((campaigns.data ?? []).map(c => c.campaign).filter(Boolean))).sort(),
    [campaigns.data]);
  const adsetOptions = useMemo(
    () => Array.from(new Set((adsets.data ?? []).map(a => a.adset).filter(Boolean))).sort(),
    [adsets.data]);
  const hasFilter = selCampaign !== "all" || selAdset !== "all";
  const hasDestFilter = selDestination !== "all";

  // Tabela de campanhas respeita o filtro de campanha (client-side)
  const campaignRows = useMemo(
    () => (campaigns.data ?? []).filter(c => selCampaign === "all" || c.campaign === selCampaign),
    [campaigns.data, selCampaign]);

  // Separação por objetivo: conversão vs reconhecimento
  const filteredByDest = useMemo(() => {
    if (selDestination === "all") return campaignRows;
    return campaignRows.filter((c: any) => c.destination === selDestination);
  }, [campaignRows, selDestination]);
  const convRows = useMemo(() => filteredByDest.filter((c: any) => c.group !== "reconhecimento"), [filteredByDest]);
  const awarenessRows = useMemo(() => filteredByDest.filter((c: any) => c.group === "reconhecimento"), [filteredByDest]);

  // Clique na linha da campanha aplica o filtro em toda a aba
  const clickCampaign = (name: string) => {
    if (selCampaign === name) { setSelCampaign("all"); setSelAdset("all"); }
    else { setSelCampaign(name); setSelAdset("all"); }
  };

  // demografia agregada
  const byAge = new Map<string, { age: string; leads: number; spend: number; clicks: number }>();
  const byGender = new Map<string, { gender: string; leads: number; spend: number; clicks: number }>();
  for (const r of demo.data ?? []) {
    if (r.age && r.age !== "unknown") {
      const e = byAge.get(r.age) ?? { age: r.age, leads: 0, spend: 0, clicks: 0 };
      e.leads += r.leads; e.spend += r.spend; e.clicks += r.clicks;
      byAge.set(r.age, e);
    }
    const g = r.gender === "female" ? "Feminino" : r.gender === "male" ? "Masculino" : "Desconhecido";
    const eg = byGender.get(g) ?? { gender: g, leads: 0, spend: 0, clicks: 0 };
    eg.leads += r.leads; eg.spend += r.spend; eg.clicks += r.clicks;
    byGender.set(g, eg);
  }
  const ageData = Array.from(byAge.values()).sort((a, b) => a.age.localeCompare(b.age));
  const genderData = Array.from(byGender.values());

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Meta Ads</h1>
          <p className="text-sm text-muted-foreground">Conta 1977935416423618 · dados via Windsor.ai{overview.data?.fromCache ? " (cache)" : ""}</p>
        </div>
        <DateRangePicker value={range} onChange={setRange} />
      </div>

      {/* Filtros por campanha e conjunto */}
      <Card className="flex flex-wrap items-center gap-3 p-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Filtrar:</span>
        <Select value={selDestination} onValueChange={setSelDestination}>
          <SelectTrigger className="h-9 w-[180px]">
            <SelectValue placeholder="Todos os destinos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os destinos</SelectItem>
            <SelectItem value="form_nativo">Form Nativo (Lead Ads)</SelectItem>
            <SelectItem value="whatsapp">WhatsApp</SelectItem>
            <SelectItem value="site">Site</SelectItem>
          </SelectContent>
        </Select>
        <Select value={selCampaign} onValueChange={(v) => { setSelCampaign(v); setSelAdset("all"); }}>
          <SelectTrigger className="h-9 w-[260px]">
            <SelectValue placeholder="Todas as campanhas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as campanhas</SelectItem>
            {campaignOptions.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={selAdset} onValueChange={setSelAdset}>
          <SelectTrigger className="h-9 w-[240px]">
            <SelectValue placeholder="Todos os conjuntos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os conjuntos</SelectItem>
            {adsetOptions.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
        {(hasFilter || hasDestFilter) && (
          <Button variant="ghost" size="sm" className="h-9 gap-1 text-muted-foreground"
            onClick={() => { setSelCampaign("all"); setSelAdset("all"); setSelDestination("all"); }}>
            <FilterX className="h-4 w-4" /> Limpar
          </Button>
        )}
        {(hasFilter || hasDestFilter) && (
          <Badge variant="outline" className="border-primary/40 text-primary">
            {hasDestFilter ? `Destino: ${selDestination === "form_nativo" ? "Form Nativo" : selDestination === "whatsapp" ? "WhatsApp" : "Site"}` : ""}
            {hasFilter && hasDestFilter ? " · " : ""}
            {hasFilter ? "Campanhas/conjuntos filtrados" : ""}
          </Badge>
        )}
      </Card>

      {overview.isLoading || !t ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
          {Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
          <KpiCard title="Investimento" value={fmtBRL(t.spend)} icon={Coins} accent />
          <KpiCard title="Impressões" value={fmtNumCompact(t.impressions)} sub={`CPM ${fmtBRL(t.cpm)}`} icon={Eye} />
          <KpiCard title="Cliques no link" value={fmtNumCompact(t.clicks)} sub={`CTR ${fmtPct(t.ctr)} · CPC ${fmtBRL(t.cpc)}`} icon={MousePointerClick} />
          <KpiCard title="Leads" value={fmtNumCompact(t.leads)} sub={`CPL ${fmtBRL(t.cpl)}`} icon={UserPlus} />
          <KpiCard title="Conversas WhatsApp" value={t.conversations > 0 ? fmtNumCompact(t.conversations) : "—"}
            sub={t.conversations > 0 ? `Custo/conversa ${fmtBRL(whatsapp.data?.totals.costPerConversation ?? 0)}` : "sem conversas"} icon={MessageCircle} />
          <KpiCard title="Compras" value={t.purchases > 0 ? fmtNumCompact(t.purchases) : "—"} sub={t.purchases > 0 ? `CAC ${fmtBRL(t.cac)}` : "sem compras"} icon={ShoppingCart} />
          <KpiCard title="ROAS" value={t.revenue > 0 ? `${fmtDec(t.roas)}x` : "—"} sub={t.revenue > 0 ? `Receita ${fmtBRL(t.revenue)}` : "sem receita"} icon={TrendingUp} />
        </div>
      )}

      {/* Comparativos: hoje vs ontem vs 7d vs média 30d */}
      <CompareStrip channel="meta" metrics={["investimento", "impressoes", "cliques", "leads", "conversas", "cpl"]} />

      {/* Pacing de investimento do canal */}
      <PacingPanel channels={["meta"]} />

      {/* Tendência */}
      <Card className="p-4">
        <h3 className="mb-3 text-sm font-semibold">Tendência diária — investimento e leads</h3>
        {overview.isLoading ? <Skeleton className="h-64" /> : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={overview.data?.daily ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="date" tickFormatter={fmtDate} tick={axisTick} />
              <YAxis yAxisId="l" tickFormatter={(v) => fmtNumCompact(v)} tick={axisTick} width={48} />
              <YAxis yAxisId="r" orientation="right" allowDecimals={false} tick={axisTick} width={36} />
              <Tooltip contentStyle={tooltipStyle} labelFormatter={(l) => fmtDate(String(l))}
                formatter={(v: number, name: string) => name === "spend" ? [fmtBRL(v), "Investimento"] : [v, "Leads"]} />
              <Legend formatter={(v) => v === "spend" ? "Investimento" : "Leads"} />
              <Line yAxisId="l" type="monotone" dataKey="spend" stroke="#4A9FE8" strokeWidth={2} dot={false} />
              <Line yAxisId="r" type="monotone" dataKey="leads" stroke="#00ACB3" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Card>

      <Tabs defaultValue="campanhas">
        <TabsList>
          <TabsTrigger value="campanhas">Campanhas</TabsTrigger>
          <TabsTrigger value="conjuntos">Conjuntos</TabsTrigger>
          <TabsTrigger value="criativos">Criativos</TabsTrigger>
          <TabsTrigger value="publicos">Públicos</TabsTrigger>
          <TabsTrigger value="whatsapp" className="gap-1">
            <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
          </TabsTrigger>
        </TabsList>

        <TabsContent value="campanhas">
          {(() => {
            const cols = [
              { key: "c", label: "Campanha", render: (r: any) => (
                <div className="flex items-center gap-2">
                  <span className="max-w-[260px] truncate font-medium">{r.campaign}</span>
                  {r.status === "ACTIVE" && <Badge variant="outline" className="border-primary/40 text-primary text-[10px]">Ativa</Badge>}
                </div>
              ) },
              { key: "inv", label: "Invest.", align: "right" as const, render: (r: any) => fmtBRL(r.spend) },
              { key: "imp", label: "Impr.", align: "right" as const, render: (r: any) => fmtNumCompact(r.impressions) },
              { key: "clk", label: "Cliques", align: "right" as const, render: (r: any) => fmtNumCompact(r.clicks) },
              { key: "ctr", label: "CTR", align: "right" as const, render: (r: any) => fmtPct(r.ctr) },
              { key: "leads", label: "Leads", align: "right" as const, render: (r: any) => r.leads > 0 ? fmtNumCompact(r.leads) : "—" },
              { key: "conv", label: "Conversas", align: "right" as const, render: (r: any) => r.conversations > 0 ? fmtNumCompact(r.conversations) : "—" },
              { key: "cpl", label: "CPL", align: "right" as const, render: (r: any) => r.leads > 0 ? fmtBRL(r.cpl) : "—" },
              { key: "roas", label: "ROAS", align: "right" as const, render: (r: any) => r.revenue > 0 ? `${fmtDec(r.roas)}x` : "—" },
            ];
            const sect = (title: string, desc: string, rows: any[]) => (
              <Card className="p-4">
                <div className="mb-2 flex items-baseline justify-between">
                  <h3 className="text-sm font-semibold">{title}</h3>
                  <span className="text-[10px] text-muted-foreground">{desc}</span>
                </div>
                <PerfTable
                  loading={campaigns.isLoading}
                  rows={rows}
                  onRowClick={(r: any) => clickCampaign(r.campaign)}
                  isSelected={(r: any) => selCampaign === r.campaign}
                  cols={cols}
                />
              </Card>
            );
            return (
              <div className="flex flex-col gap-4">
                <p className="text-[11px] text-muted-foreground">Clique em uma campanha para filtrar toda a aba. Clique novamente para limpar.</p>
                {sect("Campanhas de Conversão", "Leads, WhatsApp, vendas e formulários", convRows)}
                {sect("Campanhas de Reconhecimento", "Alcance, engajamento e branding", awarenessRows)}
              </div>
            );
          })()}
        </TabsContent>

        <TabsContent value="conjuntos">
          {(() => {
            const cols = [
              { key: "a", label: "Conjunto", render: (r: any) => (
                <div>
                  <div className="max-w-[240px] truncate font-medium">{r.adset}</div>
                  <div className="max-w-[240px] truncate text-xs text-muted-foreground">{r.campaign}</div>
                </div>
              ) },
              { key: "inv", label: "Invest.", align: "right" as const, render: (r: any) => fmtBRL(r.spend) },
              { key: "imp", label: "Impr.", align: "right" as const, render: (r: any) => fmtNumCompact(r.impressions) },
              { key: "clk", label: "Cliques", align: "right" as const, render: (r: any) => fmtNumCompact(r.clicks) },
              { key: "ctr", label: "CTR", align: "right" as const, render: (r: any) => fmtPct(r.ctr) },
              { key: "freq", label: "Freq.", align: "right" as const, render: (r: any) => fmtDec(r.frequency) },
              { key: "leads", label: "Leads", align: "right" as const, render: (r: any) => r.leads > 0 ? fmtNumCompact(r.leads) : "—" },
              { key: "conv", label: "Conversas", align: "right" as const, render: (r: any) => r.conversations > 0 ? fmtNumCompact(r.conversations) : "—" },
              { key: "cpl", label: "CPL", align: "right" as const, render: (r: any) => r.leads > 0 ? fmtBRL(r.cpl) : "—" },
            ];
            const all = adsets.data ?? [];
            const conv = all.filter((r: any) => r.group !== "reconhecimento");
            const awar = all.filter((r: any) => r.group === "reconhecimento");
            const sect = (title: string, desc: string, rows: any[]) => (
              <Card className="p-4">
                <div className="mb-2 flex items-baseline justify-between">
                  <h3 className="text-sm font-semibold">{title}</h3>
                  <span className="text-[10px] text-muted-foreground">{desc}</span>
                </div>
                <PerfTable loading={adsets.isLoading} rows={rows} cols={cols} />
              </Card>
            );
            return (
              <div className="flex flex-col gap-4">
                {sect("Conjuntos — Conversão", "Leads, WhatsApp, vendas e formulários", conv)}
                {sect("Conjuntos — Reconhecimento", "Alcance, engajamento, tráfego e branding", awar)}
              </div>
            );
          })()}
        </TabsContent>

        <TabsContent value="criativos">
          {(() => {
            const cols = [
              { key: "ad", label: "Criativo", render: (r: any) => (
                <div className="flex items-center gap-2">
                  {r.thumbnail && r.thumbnail !== "" && (
                    <img src={r.thumbnail} alt="" className="h-9 w-9 shrink-0 rounded object-cover" loading="lazy" />
                  )}
                  <div>
                    <div className="max-w-[220px] truncate font-medium">{r.ad}</div>
                    <div className="max-w-[220px] truncate text-xs text-muted-foreground">{r.campaign}</div>
                  </div>
                </div>
              ) },
              { key: "inv", label: "Invest.", align: "right" as const, render: (r: any) => fmtBRL(r.spend) },
              { key: "imp", label: "Impr.", align: "right" as const, render: (r: any) => fmtNumCompact(r.impressions) },
              { key: "clk", label: "Cliques", align: "right" as const, render: (r: any) => fmtNumCompact(r.clicks) },
              { key: "ctr", label: "CTR", align: "right" as const, render: (r: any) => fmtPct(r.ctr) },
              { key: "vv", label: "Views vídeo", align: "right" as const, render: (r: any) => r.videoViews > 0 ? fmtNumCompact(r.videoViews) : "—" },
              { key: "leads", label: "Leads", align: "right" as const, render: (r: any) => r.leads > 0 ? fmtNumCompact(r.leads) : "—" },
              { key: "conv", label: "Conversas", align: "right" as const, render: (r: any) => r.conversations > 0 ? fmtNumCompact(r.conversations) : "—" },
              { key: "cpl", label: "CPL", align: "right" as const, render: (r: any) => r.leads > 0 ? fmtBRL(r.cpl) : "—" },
            ];
            const all = ads.data ?? [];
            const conv = all.filter((r: any) => r.group !== "reconhecimento");
            const awar = all.filter((r: any) => r.group === "reconhecimento");
            const sect = (title: string, desc: string, rows: any[]) => (
              <Card className="p-4">
                <div className="mb-2 flex items-baseline justify-between">
                  <h3 className="text-sm font-semibold">{title}</h3>
                  <span className="text-[10px] text-muted-foreground">{desc}</span>
                </div>
                <PerfTable loading={ads.isLoading} rows={rows} cols={cols} />
              </Card>
            );
            return (
              <div className="flex flex-col gap-4">
                {sect("Criativos — Conversão", "Leads, WhatsApp, vendas e formulários", conv)}
                {sect("Criativos — Reconhecimento", "Alcance, engajamento, tráfego e branding", awar)}
              </div>
            );
          })()}
        </TabsContent>

        <TabsContent value="publicos">
          {hasFilter && (
            <p className="mb-3 text-xs text-muted-foreground">
              Nota: a demografia (idade/sexo) é exibida para a conta inteira — a API não permite combinar esse detalhamento com filtro de campanha/conjunto.
            </p>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-4">
              <h3 className="mb-3 text-sm font-semibold">Performance por idade</h3>
              {demo.isLoading ? <Skeleton className="h-56" /> : (
                <ResponsiveContainer width="100%" height={230}>
                  <BarChart data={ageData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="age" tick={axisTick} />
                    <YAxis tick={axisTick} width={40} />
                    <Tooltip contentStyle={tooltipStyle}
                      formatter={(v: number, name: string) => name === "spend" ? [fmtBRL(v), "Investimento"] : [v, name === "leads" ? "Leads" : "Cliques"]} />
                    <Legend formatter={(v) => v === "spend" ? "Investimento" : v === "leads" ? "Leads" : "Cliques"} />
                    <Bar dataKey="clicks" fill="#4A9FE8" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="leads" fill="#00ACB3" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>
            <Card className="p-4">
              <h3 className="mb-3 text-sm font-semibold">Performance por sexo</h3>
              {demo.isLoading ? <Skeleton className="h-56" /> : (
                <ResponsiveContainer width="100%" height={230}>
                  <BarChart data={genderData} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                    <XAxis type="number" tick={axisTick} />
                    <YAxis type="category" dataKey="gender" width={90} tick={{ fontSize: 12, fill: "#B8D2D6" }} />
                    <Tooltip contentStyle={tooltipStyle}
                      formatter={(v: number, name: string) => name === "spend" ? [fmtBRL(v), "Investimento"] : [v, name === "leads" ? "Leads" : "Cliques"]} />
                    <Legend formatter={(v) => v === "spend" ? "Investimento" : v === "leads" ? "Leads" : "Cliques"} />
                    <Bar dataKey="clicks" fill="#4A9FE8" radius={[0, 3, 3, 0]} />
                    <Bar dataKey="leads" fill="#00ACB3" radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="whatsapp">
          <div className="flex flex-col gap-4">
            {whatsapp.isLoading ? (
              <div className="grid grid-cols-3 gap-3">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <KpiCard title="Conversas iniciadas" value={fmtNumCompact(whatsapp.data?.totals.conversations ?? 0)} icon={MessageCircle} accent />
                <KpiCard title="Investimento (campanhas WhatsApp)" value={fmtBRL(whatsapp.data?.totals.spend ?? 0)} icon={Coins} />
                <KpiCard title="Custo por conversa" value={fmtBRL(whatsapp.data?.totals.costPerConversation ?? 0)} icon={TrendingUp} />
              </div>
            )}

            <Card className="p-4">
              <h3 className="mb-3 text-sm font-semibold">Conversas iniciadas por dia</h3>
              {whatsapp.isLoading ? <Skeleton className="h-64" /> : (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={whatsapp.data?.daily ?? []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="date" tickFormatter={fmtDate} tick={axisTick} />
                    <YAxis yAxisId="l" allowDecimals={false} tick={axisTick} width={36} />
                    <YAxis yAxisId="r" orientation="right" tickFormatter={(v) => fmtNumCompact(v)} tick={axisTick} width={48} />
                    <Tooltip contentStyle={tooltipStyle} labelFormatter={(l) => fmtDate(String(l))}
                      formatter={(v: number, name: string) =>
                        name === "conversations" ? [v, "Conversas"] :
                        name === "spend" ? [fmtBRL(v), "Investimento"] : [fmtBRL(v), "Custo/conversa"]} />
                    <Legend formatter={(v) => v === "conversations" ? "Conversas" : v === "spend" ? "Investimento" : "Custo/conversa"} />
                    <Line yAxisId="l" type="monotone" dataKey="conversations" stroke="#00ACB3" strokeWidth={2} dot={false} />
                    <Line yAxisId="r" type="monotone" dataKey="spend" stroke="#4A9FE8" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </Card>

            <Card className="p-4">
              <h3 className="mb-3 text-sm font-semibold">Campanhas com conversas de WhatsApp</h3>
              <PerfTable
                loading={whatsapp.isLoading}
                rows={whatsapp.data?.campaigns ?? []}
                cols={[
                  { key: "c", label: "Campanha", render: r => (
                    <div className="flex items-center gap-2">
                      <span className="max-w-[260px] truncate font-medium">{r.campaign}</span>
                      {r.status === "ACTIVE" && <Badge variant="outline" className="border-primary/40 text-primary text-[10px]">Ativa</Badge>}
                    </div>
                  ) },
                  { key: "inv", label: "Invest.", align: "right", render: r => fmtBRL(r.spend) },
                  { key: "imp", label: "Impr.", align: "right", render: r => fmtNumCompact(r.impressions) },
                  { key: "clk", label: "Cliques", align: "right", render: r => fmtNumCompact(r.clicks) },
                  { key: "alc", label: "Alcance", align: "right", render: r => fmtNumCompact(r.reach) },
                  { key: "conv", label: "Conversas", align: "right", render: r => fmtNumCompact(r.conversations) },
                  { key: "cpc2", label: "Custo/conversa", align: "right", render: r => r.conversations > 0 ? fmtBRL(r.costPerConversation) : "—" },
                ]}
              />
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
