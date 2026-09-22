import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { fmtBRL, fmtPct } from "@/lib/format";
import { Gauge } from "lucide-react";

const CHANNEL_LABEL: Record<string, string> = {
  geral: "Geral", meta: "Meta Ads", google: "Google Ads", programatica: "Programática",
};
const CHANNEL_COLOR: Record<string, string> = {
  geral: "#E6F2F2", meta: "#4A9FE8", google: "#00ACB3", programatica: "#8AD9C3",
};

function pacingTone(p: number): { label: string; cls: string } {
  if (p === 0) return { label: "sem gasto", cls: "border-muted-foreground/40 text-muted-foreground" };
  if (p < 0.85) return { label: "abaixo do ritmo", cls: "border-amber-500/50 text-amber-400" };
  if (p <= 1.15) return { label: "no ritmo", cls: "border-emerald-500/50 text-emerald-400" };
  return { label: "acima do ritmo", cls: "border-red-500/50 text-red-400" };
}

/**
 * Painel de pacing de investimento do mês atual por canal.
 * Mostra gasto acumulado, orçamento (meta de investimento), projeção de
 * fechamento e o ritmo diário necessário para cumprir o orçamento.
 * `channels` restringe quais canais mostrar (ex.: só "meta" na aba Meta Ads).
 */
export function PacingPanel({ channels }: { channels?: string[] }) {
  const { data, isLoading } = trpc.media.pacing.useQuery(undefined, { staleTime: 5 * 60 * 1000 });

  if (isLoading) {
    return (
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: channels?.length ?? 4 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
      </div>
    );
  }
  if (!data) return null;

  const rows = data.channels.filter(c => !channels || channels.includes(c.channel));
  const gridCols = rows.length >= 4 ? "md:grid-cols-2 xl:grid-cols-4" : rows.length === 3 ? "md:grid-cols-3" : rows.length === 2 ? "md:grid-cols-2" : "";

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Gauge className="h-4 w-4 text-primary" /> Pacing de investimento — mês atual
        </h3>
        <span className="text-[10px] text-muted-foreground">
          Dia {data.elapsedDays} de {data.daysInMonth} · gasto até ontem
        </span>
      </div>
      <div className={`grid gap-3 ${gridCols}`}>
        {rows.map(c => {
          const tone = pacingTone(c.hasGoal ? c.pacingPct : 0);
          const pctBudget = Math.min(c.budgetUsedPct * 100, 100);
          return (
            <Card key={c.channel} className="border-border/60 bg-card/70">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CHANNEL_COLOR[c.channel] }} />
                    {CHANNEL_LABEL[c.channel] ?? c.channel}
                  </span>
                  {c.hasGoal ? (
                    <Badge variant="outline" className={`text-[10px] ${tone.cls}`}>{tone.label}</Badge>
                  ) : (
                    <Badge variant="outline" className="border-muted-foreground/40 text-[10px] text-muted-foreground">sem orçamento definido</Badge>
                  )}
                </div>
                <p className="mt-2 text-xl font-bold">{fmtBRL(c.spent)}</p>
                {c.hasGoal ? (
                  <>
                    <p className="text-[11px] text-muted-foreground">de {fmtBRL(c.budget)} ({fmtPct(c.budgetUsedPct)} usado)</p>
                    <Progress value={pctBudget} className="mt-2 h-1.5" />
                    <div className="mt-2.5 space-y-1 text-[11px] text-muted-foreground">
                      <div className="flex justify-between">
                        <span>Ritmo ideal até ontem</span><span className="font-medium text-foreground/80">{fmtBRL(c.idealSpent)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Projeção de fechamento</span>
                        <span className={`font-medium ${c.projectedVsBudgetPct > 1.05 ? "text-red-400" : c.projectedVsBudgetPct < 0.9 ? "text-amber-400" : "text-emerald-400"}`}>
                          {fmtBRL(c.projected)} ({fmtPct(c.projectedVsBudgetPct)})
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Necessário/dia p/ cumprir</span><span className="font-medium text-foreground/80">{fmtBRL(c.dailyNeeded)}</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Média diária {fmtBRL(c.dailyAvg)} · projeção {fmtBRL(c.projected)}. Cadastre uma meta de <span className="font-medium">Investimento</span> para este canal na aba Metas para acompanhar o pacing.
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

