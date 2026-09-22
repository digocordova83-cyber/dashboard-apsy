import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useLocalAuth } from "@/contexts/LocalAuthContext";
import { PacingPanel } from "@/components/PacingPanel";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fmtBRL, fmtDec, fmtNumCompact, fmtPct } from "@/lib/format";
import { Plus, Target, Trash2, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";

const CHANNEL_LABEL: Record<string, string> = {
  geral: "Geral", meta: "Meta Ads", google: "Google Ads", programatica: "Programática",
};
const METRICS = [
  { value: "investimento", label: "Investimento (R$)", direction: "min" },
  { value: "leads", label: "Leads", direction: "max" },
  { value: "compras", label: "Compras", direction: "max" },
  { value: "receita", label: "Receita (R$)", direction: "max" },
  { value: "cpa", label: "CPA (R$)", direction: "min" },
  { value: "cac", label: "CAC (R$)", direction: "min" },
  { value: "roas", label: "ROAS (x)", direction: "max" },
  { value: "ctr", label: "CTR (%)", direction: "max" },
  { value: "cpc", label: "CPC (R$)", direction: "min" },
] as const;

function monthRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const yesterday = new Date(now.getTime() - 24 * 3600 * 1000);
  const to = yesterday < from ? from : yesterday;
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { dateFrom: iso(from), dateTo: iso(to) };
}

function metricLabel(m: string) { return METRICS.find(x => x.value === m)?.label ?? m; }

function fmtMetric(metric: string, v: number) {
  if (["receita", "cpa", "cac", "cpc", "investimento"].includes(metric)) return fmtBRL(v);
  if (metric === "ctr") return fmtPct(v / 100);
  if (metric === "roas") return `${fmtDec(v)}x`;
  return fmtNumCompact(v);
}

export default function Metas() {
  const { user } = useLocalAuth();
  const canEdit = user?.role === "admin" || user?.role === "analista";
  const [range] = useState(() => monthRange());
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ channel: "meta", metric: "leads", period: "mensal", targetValue: "" });

  const utils = trpc.useUtils();
  const goals = trpc.crm.goals.useQuery(undefined, { staleTime: 60 * 1000 });
  const progress = trpc.media.goalProgress.useQuery(range, { staleTime: 5 * 60 * 1000, retry: 1 });

  const save = trpc.crm.saveGoal.useMutation({
    onSuccess: () => {
      toast.success("Meta salva");
      utils.crm.goals.invalidate(); utils.media.goalProgress.invalidate();
      setOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const remove = trpc.crm.deleteGoal.useMutation({
    onSuccess: () => { toast.success("Meta removida"); utils.crm.goals.invalidate(); utils.media.goalProgress.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const progressMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of progress.data ?? []) m.set(`${p.channel}:${p.metric}`, p.currentValue);
    return m;
  }, [progress.data]);

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Configuração de Metas</h1>
          <p className="text-sm text-muted-foreground">Metas por canal com acompanhamento automático (mês atual até ontem)</p>
        </div>
        {canEdit && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="h-4 w-4" /> Nova meta</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Definir meta</DialogTitle></DialogHeader>
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">Canal</label>
                    <Select value={form.channel} onValueChange={(v) => setForm(f => ({ ...f, channel: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(CHANNEL_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">Indicador</label>
                    <Select value={form.metric} onValueChange={(v) => setForm(f => ({ ...f, metric: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {METRICS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">Período</label>
                    <Select value={form.period} onValueChange={(v) => setForm(f => ({ ...f, period: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="mensal">Mensal</SelectItem>
                        <SelectItem value="semanal">Semanal</SelectItem>
                        <SelectItem value="diaria">Diária</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">Valor alvo</label>
                    <Input type="number" step="any" value={form.targetValue}
                      onChange={(e) => setForm(f => ({ ...f, targetValue: e.target.value }))}
                      placeholder="Ex.: 300" />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {METRICS.find(m => m.value === form.metric)?.direction === "min"
                    ? "Indicador de custo: a meta é ficar abaixo do valor alvo."
                    : "Indicador de volume: a meta é atingir ou superar o valor alvo."}
                </p>
                <Button
                  disabled={save.isPending || !form.targetValue}
                  onClick={() => {
                    const dir = METRICS.find(m => m.value === form.metric)?.direction ?? "max";
                    save.mutate({
                      channel: form.channel as any, metric: form.metric,
                      period: form.period as any, targetValue: Number(form.targetValue), direction: dir as any,
                    });
                  }}
                  className="gap-2"
                >
                  {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Salvar meta
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Pacing de investimento por canal (mês atual) */}
      <PacingPanel />

      {goals.isLoading ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40" />)}</div>
      ) : (goals.data ?? []).length === 0 ? (
        <Card className="p-10 text-center">
          <Target className="mx-auto mb-3 h-10 w-10 text-primary/60" />
          <h3 className="mb-1 font-semibold">Nenhuma meta configurada</h3>
          <p className="text-sm text-muted-foreground">Defina metas de Leads, CPA, ROAS, CTR e outros indicadores por canal.</p>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(goals.data ?? []).map((g: any) => {
            const current = progressMap.get(`${g.channel}:${g.metric}`);
            const hasData = current !== undefined && progress.isSuccess;
            const isMin = g.direction === "min";
            let pct = 0; let ok = false;
            if (hasData && g.targetValue > 0) {
              if (isMin) { ok = current! <= g.targetValue; pct = current! > 0 ? Math.min(150, (g.targetValue / current!) * 100) : 100; }
              else { pct = Math.min(150, (current! / g.targetValue) * 100); ok = current! >= g.targetValue; }
            }
            const offTrack = hasData && !ok && (isMin ? current! > g.targetValue * 1.15 : pct < 70);
            return (
              <Card key={g.id} className="flex flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{metricLabel(g.metric)}</span>
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">{CHANNEL_LABEL[g.channel]}</Badge>
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">{g.period}</Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Alvo: {fmtMetric(g.metric, g.targetValue)} ({isMin ? "máximo" : "mínimo"})
                    </p>
                  </div>
                  {canEdit && (
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => remove.mutate({ id: g.id })} disabled={remove.isPending || user?.role !== "admin"}
                      title={user?.role !== "admin" ? "Apenas administradores removem metas" : "Remover meta"}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>

                {progress.isLoading ? <Skeleton className="h-10" /> : hasData ? (
                  <>
                    <div className="flex items-end justify-between">
                      <span className="text-2xl font-bold">{fmtMetric(g.metric, current!)}</span>
                      <span className={`flex items-center gap-1 text-xs font-medium ${ok ? "text-emerald-400" : offTrack ? "text-red-400" : "text-amber-400"}`}>
                        {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                        {ok ? "Dentro da meta" : offTrack ? "Desvio crítico" : "Atenção"}
                      </span>
                    </div>
                    <Progress value={Math.min(100, pct)} className="h-2" />
                    <p className="text-xs text-muted-foreground">
                      {isMin
                        ? ok ? `Custo ${fmtPct(1 - current! / g.targetValue, 0)} abaixo do teto` : `Custo ${fmtPct(current! / g.targetValue - 1, 0)} acima do teto`
                        : `${fmtDec(pct, 0)}% da meta atingida`}
                    </p>
                  </>
                ) : (
                  <p className="py-2 text-xs text-muted-foreground">Sem dados do canal no período para calcular o progresso.</p>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Alertas de desvio */}
      {progress.isSuccess && (goals.data ?? []).length > 0 && (
        <Card className="p-4">
          <h3 className="mb-2 text-sm font-semibold">Alertas automáticos de desvio</h3>
          <AlertList goals={goals.data as any[]} progressMap={progressMap} />
        </Card>
      )}
    </div>
  );
}

function AlertList({ goals, progressMap }: { goals: any[]; progressMap: Map<string, number> }) {
  const alerts = goals.flatMap(g => {
    const current = progressMap.get(`${g.channel}:${g.metric}`);
    if (current === undefined || g.targetValue <= 0) return [];
    const isMin = g.direction === "min";
    const ok = isMin ? current <= g.targetValue : current >= g.targetValue;
    if (ok) return [];
    const severity = isMin
      ? current > g.targetValue * 1.15 ? "crítico" : "atenção"
      : current < g.targetValue * 0.7 ? "crítico" : "atenção";
    return [{
      key: `${g.channel}:${g.metric}`, severity,
      text: `${CHANNEL_LABEL[g.channel]} · ${metricLabel(g.metric)}: atual ${fmtMetric(g.metric, current)} vs. alvo ${fmtMetric(g.metric, g.targetValue)} (${isMin ? "estourou o teto" : "abaixo do esperado"})`,
    }];
  });
  if (alerts.length === 0) return <p className="text-sm text-emerald-400">Todos os indicadores com meta estão dentro do esperado.</p>;
  return (
    <div className="flex flex-col gap-2">
      {alerts.map(a => (
        <div key={a.key} className={`flex items-center gap-2 rounded-md border p-2.5 text-sm ${a.severity === "crítico" ? "border-red-500/40 bg-red-500/10 text-red-300" : "border-amber-500/40 bg-amber-500/10 text-amber-300"}`}>
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="text-xs">{a.text}</span>
          <Badge variant="outline" className={`ml-auto text-[9px] ${a.severity === "crítico" ? "border-red-500/50 text-red-400" : "border-amber-500/50 text-amber-400"}`}>
            {a.severity}
          </Badge>
        </div>
      ))}
    </div>
  );
}
