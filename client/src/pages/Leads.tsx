import { useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { KpiCard } from "@/components/KpiCard";
import { type DateRange } from "@/components/DateRangePicker";
import { Calendar } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { useLocalAuth } from "@/contexts/LocalAuthContext";
import { fmtNumCompact, fmtPct } from "@/lib/format";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { LabelList } from "recharts";
import { toast } from "sonner";
import {
  Users, Target, GraduationCap, Upload, Search, Filter,
  MessageCircle, FileSpreadsheet, Globe, UserPlus, CircleHelp, Megaphone,
  X, MousePointerClick,
} from "lucide-react";
import { Download, ChevronLeft, ChevronRight } from "lucide-react";

const tooltipStyle = {
  backgroundColor: "oklch(0.25 0.045 222)",
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: 8, fontSize: 12, color: "#E6F2F2",
};
const tooltipItemStyle = { color: "#E6F2F2" };
const tooltipLabelStyle = { color: "#B8D2D6", fontWeight: 600 };
const axisTick = { fontSize: 11, fill: "#7FA0A8" };

/** Cores fixas por família de canal (mesma ordem de relevância da base). */
const FAMILY_COLORS: Record<string, string> = {
  "WhatsApp": "#34D399",
  "Formulários": "#4A9FE8",
  "Meta Lead Ads": "#9B8AE8",
  "Site": "#D9B54A",
  "Auto-contato": "#8AD9C3",
  "Outros": "#9AA7AD",
};
const FAMILY_ICON: Record<string, typeof Users> = {
  "WhatsApp": MessageCircle,
  "Formulários": FileSpreadsheet,
  "Meta Lead Ads": Megaphone,
  "Site": Globe,
  "Auto-contato": UserPlus,
  "Outros": CircleHelp,
};

const STAGE_COLORS: Record<string, string> = {
  "Leads": "#4A9FE8",
  "Oportunidades": "#8AD9C3",
  "MQL": "#00ACB3",
  "SAL": "#D9B54A",
  "SQL": "#E8935E",
  "Matriculados": "#34D399",
};
const STAGE_DESC: Record<string, string> = {
  MQL: "Qualificado pelo marketing",
  SAL: "Aceito pelo comercial",
  SQL: "Qualificado pelo comercial",
  MATRICULADO: "Matrícula efetivada",
  OUTROS: "Testes / outros",
};

const prettyTag = (t: string) => t.replace(/[-_]/g, " ").replace(/\s+/g, " ").trim();

/** Rótulos amigáveis das etapas usadas no filtro cruzado. */
const STAGE_FILTER_LABEL: Record<string, string> = {
  MQL: "MQL", SAL: "SAL", SQL: "SQL", MATRICULADO: "Matriculados", OUTROS: "Outros",
};
/** Mapeia o nome da barra do funil para o valor do filtro stage. */
const FUNNEL_TO_STAGE: Record<string, string | undefined> = {
  Leads: undefined,
  MQL: "MQL", SAL: "SAL", SQL: "SQL", Matriculados: "MATRICULADO",
};

function ImportDialog() {
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();
  const importMut = trpc.crm.importLeadsCsv.useMutation({
    onSuccess: (res) => {
      if (res.success) {
        toast.success(`Base importada: ${res.imported} leads (${res.skipped} linhas ignoradas).`);
        utils.crm.crmLeads.invalidate();
        utils.crm.crmSummary.invalidate();
        utils.media.compare.invalidate();
        setOpen(false); setFileName(null); setContent(null);
      } else {
        toast.error(res.errors[0] ?? "Falha ao importar o arquivo.");
      }
    },
    onError: (e) => toast.error(e.message || "Erro ao importar a base."),
  });

  const onFile = (f: File | undefined) => {
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".csv")) { toast.error("Envie um arquivo .csv exportado do CRM."); return; }
    const reader = new FileReader();
    reader.onload = () => { setContent(String(reader.result ?? "")); setFileName(f.name); };
    reader.readAsText(f, "utf-8");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-9 gap-2"><Upload className="h-4 w-4" /> Importar base</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Importar base de leads</DialogTitle>
          <DialogDescription>
            Envie o CSV exportado do CRM (separado por ponto e vírgula, com as colunas padrão: Canal de Origem, UTMs, Oportunidade, Criado em...).
            A base atual será <strong>substituída</strong> pelo conteúdo do arquivo.
          </DialogDescription>
        </DialogHeader>
        <div
          className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/80 bg-secondary/30 px-4 py-8 text-center transition-colors hover:border-primary/60 hover:bg-secondary/50"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files?.[0]); }}
        >
          <FileSpreadsheet className="h-8 w-8 text-muted-foreground" />
          {fileName ? (
            <p className="text-sm font-medium">{fileName}</p>
          ) : (
            <>
              <p className="text-sm font-medium">Clique ou arraste o arquivo .csv aqui</p>
              <p className="text-xs text-muted-foreground">Exporte do CRM em "Exportar leads (CSV)"</p>
            </>
          )}
          <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden"
            onChange={(e) => onFile(e.target.files?.[0])} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button disabled={!content || importMut.isPending} onClick={() => content && importMut.mutate({ content, filename: fileName ?? undefined })}>
            {importMut.isPending ? "Importando..." : "Substituir base"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Leads() {
  const [range, setRange] = useState<DateRange>(() => {
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth();
    const from = `${y}-${String(m + 1).padStart(2, "0")}-01`;
    const to = now.toISOString().slice(0, 10);
    return { dateFrom: from, dateTo: to, label: "Este mês" };
  });
  const [preset, setPreset] = useState<string>("month");
  const { user } = useLocalAuth();
  const isAdmin = user?.role === "admin";

  const applyPreset = (key: string) => {
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
    let from: string, to: string, label: string;
    if (key === "d1") {
      const yesterday = new Date(now); yesterday.setDate(d - 1);
      from = yesterday.toISOString().slice(0, 10);
      to = from;
      label = "D-1 (ontem)";
    } else if (key === "month") {
      from = `${y}-${String(m + 1).padStart(2, "0")}-01`;
      to = now.toISOString().slice(0, 10);
      label = "Este mês";
    } else if (key === "lastMonth") {
      const pm = m === 0 ? 11 : m - 1;
      const py = m === 0 ? y - 1 : y;
      from = `${py}-${String(pm + 1).padStart(2, "0")}-01`;
      const lastDay = new Date(y, m, 0).getDate();
      to = `${py}-${String(pm + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      label = "Mês passado";
    } else {
      // last7
      const d7 = new Date(now); d7.setDate(d - 6);
      from = d7.toISOString().slice(0, 10);
      const yesterday = new Date(now); yesterday.setDate(d - 1);
      to = yesterday.toISOString().slice(0, 10);
      label = "Últimos 7D";
    }
    setRange({ dateFrom: from, dateTo: to, label });
    setPreset(key);
  };

  // ---- Filtros cruzados interativos (clique nos gráficos filtra tudo) ----
  const [fChannel, setFChannel] = useState<string | undefined>(undefined);   // sourceChannel ou "fam:Família"
  const [fStage, setFStage] = useState<string | undefined>(undefined);
  const [fCampaign, setFCampaign] = useState<string | undefined>(undefined);
  const hasFilters = !!(fChannel || fStage || fCampaign);
  const clearFilters = () => { setFChannel(undefined); setFStage(undefined); setFCampaign(undefined); };
  const toggleChannel = (v: string) => setFChannel((cur) => (cur === v ? undefined : v));
  const toggleStage = (v?: string) => setFStage((cur) => (v && cur !== v ? v : undefined));
  const toggleCampaign = (v: string) => setFCampaign((cur) => (cur === v ? undefined : v));

  const { data: summary, isLoading: loadingSummary } = trpc.crm.crmSummary.useQuery(
    { from: range.dateFrom, to: range.dateTo, channel: fChannel, stage: fStage, campaign: fCampaign },
    { staleTime: 60 * 1000 },
  );
  const { data: leadRows, isLoading: loadingRows } = trpc.crm.crmLeads.useQuery(
    { from: range.dateFrom, to: range.dateTo, channel: fChannel, stage: fStage, campaign: fCampaign },
    { staleTime: 60 * 1000 },
  );

  const [busca, setBusca] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;

  const kpis = summary?.kpis;
  const families = summary?.families ?? [];

  const canais = useMemo(() => {
    const s = new Set<string>();
    (leadRows ?? []).forEach((l: any) => s.add(l.sourceChannel));
    return Array.from(s).sort();
  }, [leadRows]);

  const filtrados = useMemo(() => {
    return (leadRows ?? []).filter((l: any) => {
      if (busca) {
        const q = busca.toLowerCase();
        return String(l.contactName ?? "").toLowerCase().includes(q)
          || String(l.email ?? "").toLowerCase().includes(q)
          || String(l.phone ?? "").includes(q)
          || String(l.utmCampaign ?? "").toLowerCase().includes(q)
          || String(l.products ?? "").toLowerCase().includes(q);
      }
      return true;
    });
  }, [leadRows, busca]); // eslint-disable-line

  // Reset page when filtrados changes
  const totalPages = Math.max(1, Math.ceil(filtrados.length / PAGE_SIZE));
  const paginatedRows = filtrados.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Export CSV respecting active filters
  const exportCSV = () => {
    const headers = ["Nome", "Email", "Telefone", "Canal", "UTM Campaign", "UTM Source", "Produto", "Etapa", "Tag/Motivo", "Criado em"];
    const rows = filtrados.map((l: any) => [
      l.contactName ?? "", l.email ?? "", l.phone ?? "", l.sourceChannel ?? "",
      l.utmCampaign ?? "", l.utmSource ?? "", l.products ?? "",
      l.opportunityStage ?? "", l.opportunityTag ?? "",
      l.createdDate ? new Date(l.createdDate).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "",
    ]);
    const csv = [headers.join(";"), ...rows.map((r: string[]) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(";"))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads_${range.dateFrom}_${range.dateTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${filtrados.length} leads exportados`);
  };

  const maxLoss = summary?.lossReasons?.[0]?.qtd ?? 1;
  const maxActive = summary?.activeTags?.[0]?.qtd ?? 1;

  // Origem da etapa selecionada (default: Matriculados — pergunta mais comum)
  const selectedFunnelKey = fStage
    ? (Object.entries(FUNNEL_TO_STAGE).find(([, v]) => v === fStage)?.[0] ?? "Leads")
    : "Matriculados";
  const origin = summary?.stageOrigin?.[selectedFunnelKey];
  const maxUtm = summary?.byUtmCampaign?.[0]?.total ?? 1;

  // Donut por família (dados estáveis para clique)
  const donutData = useMemo(() => {
    const acc: Record<string, number> = {};
    (summary?.byChannel ?? []).forEach((c) => { acc[c.family] = (acc[c.family] ?? 0) + c.total; });
    return Object.entries(acc).map(([name, value]) => ({ name, value }));
  }, [summary?.byChannel]);

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Leads</h1>
            <p className="text-sm text-muted-foreground max-w-md">Base real do CRM — lead = oportunidade aberta · clique em canais, etapas ou campanhas para filtrar</p>
          </div>
          {isAdmin && <ImportDialog />}
        </div>

        {/* Filtros de período — responsivo */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-0.5 rounded-lg border border-border/60 bg-secondary/30 p-0.5">
            <button
              onClick={() => applyPreset("d1")}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${preset === "d1" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              D-1
            </button>
            <button
              onClick={() => applyPreset("month")}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${preset === "month" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              Este mês
            </button>
            <button
              onClick={() => applyPreset("lastMonth")}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${preset === "lastMonth" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              Mês passado
            </button>
            <button
              onClick={() => applyPreset("last7")}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${preset === "last7" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              Últimos 7D
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground hidden sm:block" />
            <input
              type="date"
              value={range.dateFrom}
              onChange={(e) => { setRange((r) => ({ ...r, dateFrom: e.target.value })); setPreset("custom"); }}
              className="h-8 w-[120px] rounded-md border border-border/60 bg-secondary/30 px-2 text-xs text-foreground"
            />
            <span className="text-xs text-muted-foreground">→</span>
            <input
              type="date"
              value={range.dateTo}
              onChange={(e) => { setRange((r) => ({ ...r, dateTo: e.target.value })); setPreset("custom"); }}
              className="h-8 w-[120px] rounded-md border border-border/60 bg-secondary/30 px-2 text-xs text-foreground"
            />
          </div>
        </div>
      </div>

      {/* Chips de filtros ativos */}
      {hasFilters && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
          <Filter className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs text-muted-foreground">Filtros ativos:</span>
          {fChannel && (
            <Badge variant="outline" className="cursor-pointer gap-1 border-primary/50 text-xs" onClick={() => setFChannel(undefined)}>
              Canal: {fChannel.startsWith("fam:") ? fChannel.slice(4) : fChannel} <X className="h-3 w-3" />
            </Badge>
          )}
          {fStage && (
            <Badge variant="outline" className="cursor-pointer gap-1 border-primary/50 text-xs" onClick={() => setFStage(undefined)}>
              Etapa: {STAGE_FILTER_LABEL[fStage] ?? fStage} <X className="h-3 w-3" />
            </Badge>
          )}
          {fCampaign && (
            <Badge variant="outline" className="cursor-pointer gap-1 border-primary/50 text-xs" onClick={() => setFCampaign(undefined)}>
              Campanha: {fCampaign} <X className="h-3 w-3" />
            </Badge>
          )}
          <Button variant="ghost" size="sm" className="ml-auto h-7 text-xs" onClick={clearFilters}>Limpar tudo</Button>
        </div>
      )}

      {/* KPIs */}
      {loadingSummary || !kpis ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <KpiCard title="Leads (oportunidades)" value={fmtNumCompact(kpis.total)} sub={`${fmtPct(kpis.oppRate, 1)} dos contatos do CRM`} icon={Users} accent />
          <KpiCard title="Contatos sem oportunidade" value={fmtNumCompact((kpis as any).contactsWithoutOpp ?? 0)} sub="Fora da base de leads" icon={Target} />
          <KpiCard title="MQL" value={fmtNumCompact(kpis.mql)} sub={STAGE_DESC.MQL} />
          <KpiCard title="SAL" value={fmtNumCompact(kpis.sal)} sub={STAGE_DESC.SAL} />
          <KpiCard title="SQL" value={fmtNumCompact(kpis.sql)} sub={STAGE_DESC.SQL} />
          <KpiCard title="Matriculados" value={fmtNumCompact(kpis.matriculados)} sub={`${fmtPct(kpis.enrollRate, 1)} dos leads`} icon={GraduationCap} accent />
        </div>
      )}

      {/* Evolução diária por canal */}
      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Evolução diária de leads por canal</h3>
          <span className="text-xs text-muted-foreground">Data de criação do lead no CRM</span>
        </div>
        {loadingSummary ? <Skeleton className="h-72" /> : (
          <ResponsiveContainer width="100%" height={340}>
            <BarChart data={summary?.dailyByChannel ?? []} margin={{ top: 24, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="date" tick={axisTick} tickFormatter={(d: string) => d.slice(8, 10) + "/" + d.slice(5, 7)} />
              <YAxis tick={axisTick} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} cursor={{ fill: "rgba(255,255,255,0.04)" }}
                labelFormatter={(d: string, payload: any[]) => {
                  const total = (payload ?? []).reduce((s: number, p: any) => s + (p.value ?? 0), 0);
                  return `${d.split("-").reverse().join("/")} — Total: ${total}`;
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: 12, color: "#B8D2D6", cursor: "pointer" }}
                formatter={(v: string) => <span style={{ color: fChannel === `fam:${v}` ? "#00ACB3" : "#B8D2D6" }}>{v}</span>}
                onClick={(e: any) => e?.value && toggleChannel(`fam:${e.value}`)}
              />
              {families.map((f) => (
                <Bar key={f} dataKey={f} stackId="a" fill={FAMILY_COLORS[f] ?? "#9AA7AD"} radius={[0, 0, 0, 0]}
                  cursor="pointer" onClick={() => toggleChannel(`fam:${f}`)}
                  opacity={fChannel && fChannel !== `fam:${f}` ? 0.35 : 1}>
                  {f === families[families.length - 1] && (
                    <LabelList
                      valueAccessor={(entry: any) => {
                        return families.reduce((sum: number, fam: string) => sum + (entry[fam] ?? 0), 0);
                      }}
                      position="top"
                      fill="#B8D2D6"
                      fontSize={11}
                      fontWeight={600}
                    />
                  )}
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
        <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground"><MousePointerClick className="h-3 w-3" /> Clique numa cor/legenda para filtrar o painel por família de canal</p>
      </Card>

      {/* Funil + Motivos */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-4">
          <h3 className="mb-1 text-sm font-semibold">Funil de oportunidades</h3>
          <p className="mb-3 text-xs text-muted-foreground">Lead = oportunidade · clique numa etapa para filtrar e ver a origem</p>
          {loadingSummary ? <Skeleton className="h-56" /> : (
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={summary?.funnel ?? []} layout="vertical" margin={{ left: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                <XAxis type="number" tick={axisTick} />
                <YAxis type="category" dataKey="stage" width={100} tick={{ fontSize: 12, fill: "#B8D2D6" }} />
                <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                <Bar dataKey="value" name="Qtd" radius={[0, 5, 5, 0]} cursor="pointer"
                  onClick={(d: any) => d?.stage && toggleStage(FUNNEL_TO_STAGE[d.stage])}>
                  {(summary?.funnel ?? []).map((f, i) => (
                    <Cell key={i} fill={STAGE_COLORS[f.stage] ?? "#9AA7AD"}
                      opacity={fStage && FUNNEL_TO_STAGE[f.stage] !== fStage ? 0.35 : 1} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
          {/* Origem da etapa selecionada */}
          {!loadingSummary && origin && (
            <div className="mt-2 rounded-lg border border-border/50 bg-secondary/30 p-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-primary">
                Origem — {selectedFunnelKey} {!fStage && "(clique no funil para trocar)"}
              </p>
              {(origin.channels.length === 0) ? (
                <p className="text-xs text-muted-foreground">Sem registros nesta etapa no período.</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="mb-1 text-[10px] uppercase text-muted-foreground">Por canal</p>
                    {origin.channels.slice(0, 5).map((c) => (
                      <div key={c.name} className="flex items-center justify-between gap-2 text-xs">
                        <span className="truncate" title={c.name}>{c.name}</span>
                        <span className="font-semibold">{c.qtd}</span>
                      </div>
                    ))}
                  </div>
                  <div>
                    <p className="mb-1 text-[10px] uppercase text-muted-foreground">Por campanha</p>
                    {origin.campaigns.slice(0, 5).map((c) => (
                      <div key={c.name} className="flex items-center justify-between gap-2 text-xs">
                        <span className="truncate" title={c.name}>{c.name}</span>
                        <span className="font-semibold">{c.qtd}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>

        <Card className="p-4">
          <h3 className="mb-1 text-sm font-semibold">Motivos de recusa / perda</h3>
          <p className="mb-3 text-xs text-muted-foreground">Tags de recusa nas oportunidades do período</p>
          {loadingSummary ? <Skeleton className="h-56" /> : (summary?.lossReasons?.length ?? 0) === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Nenhuma recusa registrada no período</p>
          ) : (
            <div className="flex flex-col gap-2.5 pt-1">
              {summary!.lossReasons.slice(0, 9).map((m) => (
                <div key={m.tag} className="flex items-center gap-2">
                  <div className="w-44 truncate text-xs capitalize" title={m.tag}>{prettyTag(m.tag)}</div>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-secondary">
                    <div className="h-full rounded-full bg-destructive/80" style={{ width: `${(m.qtd / maxLoss) * 100}%` }} />
                  </div>
                  <div className="w-7 text-right text-xs font-medium">{m.qtd}</div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-4">
          <h3 className="mb-1 text-sm font-semibold">Situação das oportunidades ativas</h3>
          <p className="mb-3 text-xs text-muted-foreground">Tags de andamento (sem recusas)</p>
          {loadingSummary ? <Skeleton className="h-56" /> : (summary?.activeTags?.length ?? 0) === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Sem oportunidades ativas no período</p>
          ) : (
            <div className="flex flex-col gap-2.5 pt-1">
              {summary!.activeTags.slice(0, 9).map((m) => (
                <div key={m.tag} className="flex items-center gap-2">
                  <div className="w-44 truncate text-xs capitalize" title={m.tag}>{prettyTag(m.tag)}</div>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-secondary">
                    <div className="h-full rounded-full bg-primary/80" style={{ width: `${(m.qtd / maxActive) * 100}%` }} />
                  </div>
                  <div className="w-7 text-right text-xs font-medium">{m.qtd}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Canais + UTM + Produtos */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-4">
          <h3 className="mb-1 text-sm font-semibold">Leads por canal de origem</h3>
          <p className="mb-3 text-xs text-muted-foreground">Clique numa fatia ou canal para filtrar</p>
          {loadingSummary ? <Skeleton className="h-64" /> : (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={donutData}
                    dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={3} strokeWidth={0}
                    cursor="pointer" onClick={(d: any) => d?.name && toggleChannel(`fam:${d.name}`)}
                  >
                    {donutData.map((d) => (
                      <Cell key={d.name} fill={FAMILY_COLORS[d.name] ?? "#9AA7AD"}
                        opacity={fChannel && fChannel !== `fam:${d.name}` ? 0.35 : 1} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
                  <Legend wrapperStyle={{ fontSize: 11, color: "#B8D2D6" }} formatter={(v: string) => <span style={{ color: "#B8D2D6" }}>{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-2 flex flex-col gap-1.5">
                {(summary?.byChannel ?? []).slice(0, 6).map((c) => {
                  const Icon = FAMILY_ICON[c.family] ?? CircleHelp;
                  const active = fChannel === c.channel;
                  return (
                    <div key={c.channel}
                      className={`flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-xs transition-colors hover:bg-accent/50 ${active ? "bg-primary/15 ring-1 ring-primary/40" : ""}`}
                      onClick={() => toggleChannel(c.channel)}>
                      <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: FAMILY_COLORS[c.family] }} />
                      <span className="flex-1 truncate" title={c.channel}>{c.channel}</span>
                      <span className="font-medium">{c.total}</span>
                      <span className="w-20 text-right text-muted-foreground">{c.opps} opp · {c.matriculados} mat</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </Card>

        <Card className="p-4">
          <h3 className="mb-1 text-sm font-semibold">Campanhas (UTM)</h3>
          <p className="mb-3 text-xs text-muted-foreground">Clique numa campanha para filtrar · somente leads com UTM</p>
          {loadingSummary ? <Skeleton className="h-64" /> : (summary?.byUtmCampaign?.length ?? 0) === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Nenhuma UTM no período</p>
          ) : (
            <div className="flex flex-col gap-2 pt-1">
              {summary!.byUtmCampaign.slice(0, 9).map((u) => {
                const active = fCampaign === u.campaign;
                return (
                  <div key={u.campaign}
                    className={`cursor-pointer rounded px-1 py-0.5 transition-colors hover:bg-accent/50 ${active ? "bg-primary/15 ring-1 ring-primary/40" : ""}`}
                    onClick={() => toggleCampaign(u.campaign)}>
                    <div className="mb-0.5 flex items-center justify-between gap-2 text-xs">
                      <span className="truncate font-medium" title={`${u.campaign} (${u.source})`}>{u.campaign}</span>
                      <span className="shrink-0 text-muted-foreground">{u.source} · <span className="font-semibold text-foreground">{u.total}</span> leads · {u.opps} opp</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-secondary">
                      <div className="h-full rounded-full" style={{ width: `${(u.total / maxUtm) * 100}%`, backgroundColor: "#00ACB3" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {!loadingSummary && (summary?.byUtmSource?.length ?? 0) > 0 && (
            <div className="mt-3 border-t border-border/40 pt-2">
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Por origem (UTM source)</p>
              <div className="flex flex-wrap gap-1.5">
                {summary!.byUtmSource.slice(0, 8).map((s) => (
                  <Badge key={s.source} variant="outline" className="text-[10px] font-normal">
                    {s.source}: <span className="ml-1 font-semibold">{s.total}</span>
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </Card>

        <Card className="p-4">
          <h3 className="mb-1 text-sm font-semibold">Produtos de interesse</h3>
          <p className="mb-3 text-xs text-muted-foreground">Quando informado pelo lead</p>
          {loadingSummary ? <Skeleton className="h-64" /> : (summary?.byProduct?.length ?? 0) === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Nenhum produto informado</p>
          ) : (
            <div className="flex flex-col gap-2.5 pt-1">
              {summary!.byProduct.slice(0, 8).map((p) => (
                <div key={p.product} className="flex items-center gap-2">
                  <div className="w-48 truncate text-xs" title={p.product}>{p.product}</div>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-secondary">
                    <div className="h-full rounded-full bg-chart-2/80" style={{ width: `${(p.qtd / (summary!.byProduct[0]?.qtd ?? 1)) * 100}%`, backgroundColor: "#00ACB3" }} />
                  </div>
                  <div className="w-7 text-right text-xs font-medium">{p.qtd}</div>
                </div>
              ))}
            </div>
          )}
          {!loadingSummary && (summary?.byContext?.length ?? 0) > 0 && (
            <div className="mt-3 border-t border-border/40 pt-2">
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Contexto adicional</p>
              <div className="flex flex-wrap gap-1.5">
                {summary!.byContext.slice(0, 5).map((c) => (
                  <Badge key={c.context} variant="outline" className="text-[10px] font-normal capitalize">
                    {prettyTag(c.context)}: <span className="ml-1 font-semibold">{c.qtd}</span>
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Tabela detalhada */}
      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h3 className="mr-auto text-sm font-semibold">Base de leads ({filtrados.length})</h3>
          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={exportCSV} disabled={filtrados.length === 0}>
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Exportar CSV</span>
          </Button>
          <div className="relative">
           <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={busca} onChange={(e) => { setBusca(e.target.value); setPage(1); }} placeholder="Nome, e-mail, telefone, campanha" className="h-9 w-60 pl-8" />
          </div>
          <Select value={fChannel && !fChannel.startsWith("fam:") ? fChannel : "todos"}
            onValueChange={(v) => setFChannel(v === "todos" ? undefined : v)}>
            <SelectTrigger className="h-9 w-44"><Filter className="mr-1 h-3.5 w-3.5" /><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os canais</SelectItem>
              {canais.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fStage ?? "todas"} onValueChange={(v) => setFStage(v === "todas" ? undefined : v)}>
            <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as etapas</SelectItem>
              <SelectItem value="MQL">MQL</SelectItem>
              <SelectItem value="SAL">SAL</SelectItem>
              <SelectItem value="SQL">SQL</SelectItem>
              <SelectItem value="MATRICULADO">Matriculado</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2">Lead</th>
                <th className="px-3 py-2">Contato</th>
                <th className="px-3 py-2">Canal / UTM</th>
                <th className="px-3 py-2">Produto</th>
                <th className="px-3 py-2">Etapa</th>
                <th className="px-3 py-2">Tag / Motivo</th>
                <th className="px-3 py-2">Criado em</th>
              </tr>
            </thead>
            <tbody>
              {loadingRows ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}><td colSpan={7} className="px-3 py-2"><Skeleton className="h-8" /></td></tr>
                ))
              ) : paginatedRows.map((l: any) => {
                const stage = l.opportunityStage as string | null;
                const stageColor = stage ? (STAGE_COLORS[stage === "MATRICULADO" ? "Matriculados" : stage] ?? "#9AA7AD") : "#5A6B71";
                const tagLoss = l.opportunityTag && (String(l.opportunityTag).startsWith("recusa") || ["não_localizado", "bad_fit"].includes(l.opportunityTag) || String(l.opportunityTag).startsWith("sem_intera"));
                return (
                  <tr key={l.id} className="border-b border-border/30 transition-colors hover:bg-accent/40">
                    <td className="max-w-[180px] truncate px-3 py-2.5 font-medium" title={l.contactName ?? ""}>{l.contactName ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      <div className="max-w-[190px] truncate text-xs" title={l.email ?? ""}>{l.email ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{l.phone ?? ""}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="text-xs font-medium">{l.sourceChannel}</div>
                      <div className="max-w-[170px] truncate text-[11px] text-muted-foreground" title={l.utmCampaign ?? ""}>{l.utmCampaign ?? l.formName ?? "—"}</div>
                    </td>
                    <td className="max-w-[160px] truncate px-3 py-2.5 text-xs" title={l.products ?? ""}>{l.products ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      {stage ? (
                        <Badge variant="outline" className="text-[10px]" style={{ borderColor: `${stageColor}66`, color: stageColor }}>
                          {stage === "MATRICULADO" ? "Matriculado" : stage}
                        </Badge>
                      ) : <span className="text-[11px] text-muted-foreground">Sem oportunidade</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      {l.opportunityTag ? (
                        <span className={`text-[11px] capitalize ${tagLoss ? "text-destructive" : "text-muted-foreground"}`}>{prettyTag(l.opportunityTag)}</span>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">
                      {l.createdDate ? new Date(l.createdDate).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!loadingRows && totalPages > 1 && (
            <div className="mt-3 flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Exibindo {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtrados.length)} de {filtrados.length}
              </p>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  let p: number;
                  if (totalPages <= 7) p = i + 1;
                  else if (page <= 4) p = i + 1;
                  else if (page >= totalPages - 3) p = totalPages - 6 + i;
                  else p = page - 3 + i;
                  return (
                    <Button key={p} variant={p === page ? "default" : "outline"} size="icon" className="h-8 w-8 text-xs" onClick={() => setPage(p)}>
                      {p}
                    </Button>
                  );
                })}
                <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
          {!loadingRows && filtrados.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">Nenhum lead encontrado com os filtros atuais.</p>
          )}
        </div>
      </Card>
    </div>
  );
}
