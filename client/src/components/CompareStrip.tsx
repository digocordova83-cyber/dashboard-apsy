import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { fmtBRL, fmtNumCompact, fmtPct } from "@/lib/format";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

type Channel = "meta" | "google" | "leads";

const METRIC_LABELS: Record<string, { label: string; kind: "currency" | "number" | "percent" }> = {
  investimento: { label: "Investimento", kind: "currency" },
  impressoes: { label: "Impressões", kind: "number" },
  cliques: { label: "Cliques", kind: "number" },
  leads: { label: "Leads", kind: "number" },
  conversas: { label: "Conversas WA", kind: "number" },
  conversoes: { label: "Conversões", kind: "number" },
  cpl: { label: "CPL", kind: "currency" },
  cpa: { label: "CPA", kind: "currency" },
  ctr: { label: "CTR", kind: "percent" },
  qualificados: { label: "Qualificados", kind: "number" },
  clientes: { label: "Clientes", kind: "number" },
  oportunidades: { label: "Oportunidades", kind: "number" },
  matriculados: { label: "Matriculados", kind: "number" },
};

// Métricas em que "menor é melhor" (custo)
const LOWER_IS_BETTER = new Set(["cpl", "cpa"]);

function fmtVal(v: number, kind: "currency" | "number" | "percent"): string {
  if (kind === "currency") return fmtBRL(v);
  if (kind === "percent") return fmtPct(v);
  return fmtNumCompact(v);
}

function Delta({ current, ref: refVal, metric }: { current: number; ref: number; metric: string }) {
  if (refVal === 0 && current === 0) return <span className="text-muted-foreground text-[10px]">—</span>;
  if (refVal === 0) return <span className="text-muted-foreground text-[10px]">novo</span>;
  const pct = (current - refVal) / refVal;
  const up = pct > 0.005;
  const down = pct < -0.005;
  const lower = LOWER_IS_BETTER.has(metric);
  const good = lower ? down : up;
  const bad = lower ? up : down;
  const color = good ? "text-emerald-400" : bad ? "text-red-400" : "text-muted-foreground";
  const Icon = up ? ArrowUpRight : down ? ArrowDownRight : Minus;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-medium ${color}`}>
      <Icon className="h-3 w-3" />
      {Math.abs(pct * 100).toFixed(0)}%
    </span>
  );
}

/**
 * Barra de comparativos temporais: hoje vs ontem vs 7 dias atrás vs média 30d.
 * Usada nas abas Meta, Google e Leads para leitura rápida do dia a dia.
 */
export function CompareStrip({ channel, metrics }: { channel: Channel; metrics: string[] }) {
  const { data, isLoading } = trpc.media.compare.useQuery({ channel }, { staleTime: 5 * 60 * 1000 });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {metrics.map(m => <Skeleton key={m} className="h-24 rounded-xl" />)}
      </div>
    );
  }
  if (!data) return null;

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-foreground">Hoje vs ontem · 7 dias atrás · média 30d</h3>
        <span className="text-[10px] text-muted-foreground">Hoje ({data.dates.today.slice(8)}/{data.dates.today.slice(5, 7)}) parcial · média 30d até ontem</span>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {metrics.map(m => {
          const def = METRIC_LABELS[m] ?? { label: m, kind: "number" as const };
          const today = data.today?.[m] ?? 0;
          const yesterday = data.yesterday?.[m] ?? 0;
          const d7 = data.d7?.[m] ?? 0;
          const avg30 = data.avg30?.[m] ?? 0;
          return (
            <Card key={m} className="border-border/60 bg-card/70">
              <CardContent className="p-3">
                <p className="text-[11px] font-medium text-muted-foreground">{def.label}</p>
                <p className="mt-0.5 text-lg font-bold text-foreground">{fmtVal(today, def.kind)}</p>
                <div className="mt-1.5 space-y-0.5 text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Ontem: {fmtVal(yesterday, def.kind)}</span>
                    <Delta current={today} ref={yesterday} metric={m} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">7d atrás: {fmtVal(d7, def.kind)}</span>
                    <Delta current={today} ref={d7} metric={m} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Média 30d: {fmtVal(avg30, def.kind)}</span>
                    <Delta current={today} ref={avg30} metric={m} />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
