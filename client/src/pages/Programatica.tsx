import { trpc } from "@/lib/trpc";
import { KpiCard } from "@/components/KpiCard";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { fmtBRL, fmtDate, fmtDec, fmtNumCompact, fmtPct } from "@/lib/format";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Coins, Eye, MousePointerClick, ScanEye, BellRing } from "lucide-react";
import { useMemo } from "react";

const tooltipStyle = {
  backgroundColor: "oklch(0.25 0.045 222)",
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: 8, fontSize: 12, color: "#E6F2F2",
};
const axisTick = { fontSize: 11, fill: "#7FA0A8" };
const PALETTE = ["#00ACB3", "#4A9FE8", "#8AD9C3", "#D9B54A", "#E86A5E", "#9B8AE8", "#7FA0A8"];

type DvRow = {
  day: string | Date; insertionOrder: string; lineItem: string; format: string;
  device: string; region: string; domain: string; spend: number; impressions: number;
  clicks: number; viewability: number;
};

function agg<T extends Record<string, number | string>>(rows: DvRow[], key: keyof DvRow) {
  const m = new Map<string, { name: string; spend: number; impressions: number; clicks: number; viewWeighted: number; viewImpr: number }>();
  for (const r of rows) {
    const k = String(r[key] || "Não informado");
    const e = m.get(k) ?? { name: k, spend: 0, impressions: 0, clicks: 0, viewWeighted: 0, viewImpr: 0 };
    e.spend += r.spend; e.impressions += r.impressions; e.clicks += r.clicks;
    if (r.viewability > 0 && r.impressions > 0) { e.viewWeighted += r.viewability * r.impressions; e.viewImpr += r.impressions; }
    m.set(k, e);
  }
  return Array.from(m.values())
    .map(e => ({
      ...e,
      ctr: e.impressions > 0 ? e.clicks / e.impressions : 0,
      cpm: e.impressions > 0 ? (e.spend / e.impressions) * 1000 : 0,
      viewability: e.viewImpr > 0 ? e.viewWeighted / e.viewImpr : 0,
    }))
    .sort((a, b) => b.spend - a.spend);
}

export default function Programatica() {
  const { data, isLoading } = trpc.media.programatica.useQuery(undefined, { staleTime: 10 * 60 * 1000 });

  const dv = useMemo(() => (data?.dv360 ?? []) as unknown as DvRow[], [data]);
  const push = data?.push ?? [];
  const source = (data as any)?.source ?? "database";

  const totals = useMemo(() => {
    const spend = dv.reduce((s, r) => s + r.spend, 0);
    const impressions = dv.reduce((s, r) => s + r.impressions, 0);
    const clicks = dv.reduce((s, r) => s + r.clicks, 0);
    const viewWeighted = dv.reduce((s, r) => s + (r.viewability > 0 ? r.viewability * r.impressions : 0), 0);
    const viewImpr = dv.reduce((s, r) => s + (r.viewability > 0 ? r.impressions : 0), 0);
    return {
      spend, impressions, clicks,
      ctr: impressions > 0 ? clicks / impressions : 0,
      cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
      viewability: viewImpr > 0 ? viewWeighted / viewImpr : 0,
    };
  }, [dv]);

  const daily = useMemo(() => {
    const m = new Map<string, { date: string; spend: number; impressions: number; clicks: number }>();
    for (const r of dv) {
      const d = String(r.day).slice(0, 10);
      const e = m.get(d) ?? { date: d, spend: 0, impressions: 0, clicks: 0 };
      e.spend += r.spend; e.impressions += r.impressions; e.clicks += r.clicks;
      m.set(d, e);
    }
    return Array.from(m.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [dv]);

  const byFormat = useMemo(() => agg(dv, "format"), [dv]);
  const byDevice = useMemo(() => agg(dv, "device"), [dv]);
  const byRegion = useMemo(() => agg(dv, "region").slice(0, 12), [dv]);
  const byDomain = useMemo(() => agg(dv, "domain").filter(d => d.name !== "Não informado").slice(0, 15), [dv]);
  const byIO = useMemo(() => agg(dv, "insertionOrder"), [dv]);

  const pushTotals = useMemo(() => {
    const dispatches = push.reduce((s: number, r: any) => s + (r.dispatches ?? 0), 0);
    const clicks = push.reduce((s: number, r: any) => s + (r.clicks ?? 0), 0);
    const spend = push.reduce((s: number, r: any) => s + (r.spend ?? 0), 0);
    return { dispatches, clicks, spend, ctr: dispatches > 0 ? clicks / dispatches : 0 };
  }, [push]);

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Programática</h1>
          <p className="text-sm text-muted-foreground">DV360 + Push Notification · Dados em tempo real via API Publya</p>
        </div>
        <Badge variant="outline" className="border-primary/40 text-primary">
          {source === "publya_api" ? "API Publya (live)" : "Planilha importada"}
        </Badge>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <KpiCard title="Investimento DV360" value={fmtBRL(totals.spend)} icon={Coins} accent />
          <KpiCard title="Impressões" value={fmtNumCompact(totals.impressions)} sub={`CPM ${fmtBRL(totals.cpm)}`} icon={Eye} />
          <KpiCard title="Cliques" value={fmtNumCompact(totals.clicks)} sub={`CTR ${fmtPct(totals.ctr)}`} icon={MousePointerClick} />
          <KpiCard title="Viewability" value={fmtPct(totals.viewability, 1)} icon={ScanEye} />
          <KpiCard title="Push — disparos" value={fmtNumCompact(pushTotals.dispatches)} sub={`CTR ${fmtPct(pushTotals.ctr)}`} icon={BellRing} />
          <KpiCard title="Push — investimento" value={fmtBRL(pushTotals.spend)} icon={Coins} />
        </div>
      )}

      <Card className="p-4">
        <h3 className="mb-3 text-sm font-semibold">Evolução diária — investimento e impressões (DV360)</h3>
        {isLoading ? <Skeleton className="h-64" /> : (
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={daily}>
              <defs>
                <linearGradient id="pg-spend" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#00ACB3" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#00ACB3" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="date" tickFormatter={fmtDate} tick={axisTick} />
              <YAxis yAxisId="l" tickFormatter={(v) => fmtNumCompact(v)} tick={axisTick} width={48} />
              <YAxis yAxisId="r" orientation="right" tickFormatter={(v) => fmtNumCompact(v)} tick={axisTick} width={48} />
              <Tooltip contentStyle={tooltipStyle} labelFormatter={(l) => fmtDate(String(l))}
                formatter={(v: number, name: string) => name === "spend" ? [fmtBRL(v), "Investimento"] : [fmtNumCompact(v), "Impressões"]} />
              <Legend formatter={(v) => v === "spend" ? "Investimento" : "Impressões"} />
              <Area yAxisId="l" type="monotone" dataKey="spend" stroke="#00ACB3" fill="url(#pg-spend)" strokeWidth={2} />
              <Area yAxisId="r" type="monotone" dataKey="impressions" stroke="#4A9FE8" fill="transparent" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Card>

      <Tabs defaultValue="formatos">
        <TabsList>
          <TabsTrigger value="formatos">Formatos</TabsTrigger>
          <TabsTrigger value="campanhas">Campanhas</TabsTrigger>
          <TabsTrigger value="dispositivos">Dispositivos</TabsTrigger>
          <TabsTrigger value="geografia">Geografia</TabsTrigger>
          <TabsTrigger value="dominios">Domínios</TabsTrigger>
          <TabsTrigger value="push">Push</TabsTrigger>
        </TabsList>

        <TabsContent value="formatos">
          <div className="grid gap-4 lg:grid-cols-5">
            <Card className="p-4 lg:col-span-2">
              <h3 className="mb-3 text-sm font-semibold">Investimento por formato</h3>
              {isLoading ? <Skeleton className="h-56" /> : (
                <ResponsiveContainer width="100%" height={230}>
                  <PieChart>
                    <Pie data={byFormat} dataKey="spend" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={3} strokeWidth={0}>
                      {byFormat.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [fmtBRL(v), ""]} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </Card>
            <Card className="p-4 lg:col-span-3">
              <TableAgg rows={byFormat} loading={isLoading} firstCol="Formato" />
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="campanhas">
          <Card className="p-4">
            <TableAgg rows={byIO} loading={isLoading} firstCol="Insertion Order" />
          </Card>
        </TabsContent>

        <TabsContent value="dispositivos">
          <div className="grid gap-4 lg:grid-cols-5">
            <Card className="p-4 lg:col-span-2">
              <h3 className="mb-3 text-sm font-semibold">Impressões por dispositivo</h3>
              {isLoading ? <Skeleton className="h-56" /> : (
                <ResponsiveContainer width="100%" height={230}>
                  <PieChart>
                    <Pie data={byDevice} dataKey="impressions" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={3} strokeWidth={0}>
                      {byDevice.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [fmtNumCompact(v), ""]} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </Card>
            <Card className="p-4 lg:col-span-3">
              <TableAgg rows={byDevice} loading={isLoading} firstCol="Dispositivo" />
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="geografia">
          <Card className="p-4">
            <h3 className="mb-3 text-sm font-semibold">Top regiões por investimento</h3>
            {isLoading ? <Skeleton className="h-72" /> : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={byRegion} layout="vertical" margin={{ left: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                  <XAxis type="number" tickFormatter={(v) => fmtNumCompact(v)} tick={axisTick} />
                  <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11, fill: "#B8D2D6" }} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [fmtBRL(v), "Investimento"]} />
                  <Bar dataKey="spend" fill="#00ACB3" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="dominios">
          <Card className="p-4">
            <TableAgg rows={byDomain} loading={isLoading} firstCol="Domínio / App" />
          </Card>
        </TabsContent>

        <TabsContent value="push">
          <Card className="p-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2">Data</th>
                    <th className="px-3 py-2">Campanha</th>
                    <th className="px-3 py-2 text-right">Disparos</th>
                    <th className="px-3 py-2 text-right">Cliques</th>
                    <th className="px-3 py-2 text-right">CTR</th>
                    <th className="px-3 py-2 text-right">Investimento</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <tr key={i}><td colSpan={6} className="px-3 py-2"><Skeleton className="h-8" /></td></tr>
                    ))
                  ) : push.map((r: any, i: number) => (
                    <tr key={i} className="border-b border-border/30 transition-colors hover:bg-accent/40">
                      <td className="px-3 py-2.5">{fmtDate(String(r.day).slice(0, 10))}</td>
                      <td className="max-w-[280px] truncate px-3 py-2.5 font-medium">{r.campaign}</td>
                      <td className="px-3 py-2.5 text-right">{fmtNumCompact(r.dispatches)}</td>
                      <td className="px-3 py-2.5 text-right">{fmtNumCompact(r.clicks)}</td>
                      <td className="px-3 py-2.5 text-right">{fmtPct(r.dispatches > 0 ? r.clicks / r.dispatches : 0)}</td>
                      <td className="px-3 py-2.5 text-right">{fmtBRL(r.spend)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      <p className="mt-2 text-xs text-muted-foreground">
        Fonte: {source === "publya_api" ? "API Publya (dados atualizados em tempo real)" : "Planilha importada manualmente"}.
        Campanhas DV360 ativas são consolidadas automaticamente.
      </p>
    </div>
  );
}

function TableAgg({ rows, loading, firstCol }: {
  rows: { name: string; spend: number; impressions: number; clicks: number; ctr: number; cpm: number; viewability: number }[];
  loading: boolean; firstCol: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2">{firstCol}</th>
            <th className="px-3 py-2 text-right">Invest.</th>
            <th className="px-3 py-2 text-right">Impr.</th>
            <th className="px-3 py-2 text-right">Cliques</th>
            <th className="px-3 py-2 text-right">CTR</th>
            <th className="px-3 py-2 text-right">CPM</th>
            <th className="px-3 py-2 text-right">Viewability</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <tr key={i}><td colSpan={7} className="px-3 py-2"><Skeleton className="h-8" /></td></tr>
            ))
          ) : rows.map((r, i) => (
            <tr key={i} className="border-b border-border/30 transition-colors hover:bg-accent/40">
              <td className="max-w-[240px] truncate px-3 py-2.5 font-medium">{r.name}</td>
              <td className="px-3 py-2.5 text-right">{fmtBRL(r.spend)}</td>
              <td className="px-3 py-2.5 text-right">{fmtNumCompact(r.impressions)}</td>
              <td className="px-3 py-2.5 text-right">{fmtNumCompact(r.clicks)}</td>
              <td className="px-3 py-2.5 text-right">{fmtPct(r.ctr)}</td>
              <td className="px-3 py-2.5 text-right">{fmtBRL(r.cpm)}</td>
              <td className="px-3 py-2.5 text-right">{r.viewability > 0 ? fmtPct(r.viewability, 1) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
