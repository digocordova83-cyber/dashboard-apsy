import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useLocalAuth } from "@/contexts/LocalAuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { DateRangePicker, defaultRange, type DateRange } from "@/components/DateRangePicker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fmtDateTime } from "@/lib/format";
import { Sparkles, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { Streamdown } from "streamdown";

const PRIORITY_COLOR: Record<string, string> = { alta: "#E86A5E", media: "#D9B54A", baixa: "#8AD9C3" };
const STATUS_LABEL: Record<string, string> = {
  pendente: "Pendente", em_andamento: "Em andamento", concluida: "Concluída", descartada: "Descartada",
};
const STATUS_COLOR: Record<string, string> = {
  pendente: "#7FA0A8", em_andamento: "#4A9FE8", concluida: "#34D399", descartada: "#9AA7AD",
};
const CHANNEL_LABEL: Record<string, string> = {
  geral: "Geral", meta: "Meta Ads", google: "Google Ads", programatica: "Programática",
};

type ChecklistItem = { item: string; done: boolean; motivo?: string; canal?: string; prioridade?: string; completedBy?: string; completedAt?: string };

export default function Otimizacoes() {
  const { user } = useLocalAuth();
  const canEdit = user?.role === "admin" || user?.role === "analista";
  const [range, setRange] = useState<DateRange>(() => defaultRange());
  const [expanded, setExpanded] = useState<number | null>(null);
  const [genChannel, setGenChannel] = useState<"geral" | "meta" | "google" | "programatica">("geral");
  const [viewChannel, setViewChannel] = useState<string>("todos");

  const utils = trpc.useUtils();
  const list = trpc.ai.list.useQuery(undefined, { staleTime: 60 * 1000 });
  const filteredList = (list.data ?? []).filter((o: any) => viewChannel === "todos" || o.channel === viewChannel);

  const generate = trpc.ai.generate.useMutation({
    onSuccess: (d) => {
      toast.success("Análise de IA gerada com sucesso");
      utils.ai.list.invalidate();
      setExpanded(d.id);
    },
    onError: (e) => toast.error(e.message),
  });

  const toggleItem = trpc.ai.toggleChecklistItem.useMutation({
    onSuccess: () => { utils.ai.list.invalidate(); utils.crm.auditLogs.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const updateStatus = trpc.ai.updateStatus.useMutation({
    onSuccess: () => { toast.success("Status atualizado"); utils.ai.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Otimizações com IA</h1>
          <p className="text-sm text-muted-foreground">Diagnóstico de metas, redistribuição de verba e plano de ação gerados por IA</p>
        </div>
        {canEdit && (
          <div className="flex flex-wrap items-center gap-2">
            <DateRangePicker value={range} onChange={setRange} />
            <Select value={genChannel} onValueChange={(v) => setGenChannel(v as any)}>
              <SelectTrigger className="h-9 w-40 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="geral">Geral (todos)</SelectItem>
                <SelectItem value="meta">Meta Ads</SelectItem>
                <SelectItem value="google">Google Ads</SelectItem>
                <SelectItem value="programatica">Programática</SelectItem>
              </SelectContent>
            </Select>
            <Button
              onClick={() => generate.mutate({ dateFrom: range.dateFrom, dateTo: range.dateTo, channel: genChannel })}
              disabled={generate.isPending}
              className="gap-2"
            >
              {generate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {generate.isPending ? "Analisando dados..." : `Gerar análise (${CHANNEL_LABEL[genChannel]})`}
            </Button>
          </div>
        )}
      </div>

      {/* Filtro da listagem por canal */}
      <Tabs value={viewChannel} onValueChange={setViewChannel}>
        <TabsList>
          <TabsTrigger value="todos">Todas</TabsTrigger>
          <TabsTrigger value="meta">Meta Ads</TabsTrigger>
          <TabsTrigger value="google">Google Ads</TabsTrigger>
          <TabsTrigger value="programatica">Programática</TabsTrigger>
          <TabsTrigger value="geral">Geral</TabsTrigger>
        </TabsList>
      </Tabs>

      {generate.isPending && (
        <Card className="border-primary/30 p-4">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <div>
              <p className="text-sm font-medium">A IA está analisando o canal {CHANNEL_LABEL[genChannel]}...</p>
              <p className="text-xs text-muted-foreground">Coletando dados reais, comparando com metas e montando o plano de ação. Isso pode levar até 1 minuto.</p>
            </div>
          </div>
        </Card>
      )}

      {list.isLoading ? (
        <div className="flex flex-col gap-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28" />)}</div>
      ) : filteredList.length === 0 ? (
        <Card className="p-10 text-center">
          <Sparkles className="mx-auto mb-3 h-10 w-10 text-primary/60" />
          <h3 className="mb-1 font-semibold">{viewChannel === "todos" ? "Nenhuma análise gerada ainda" : `Nenhuma análise para ${CHANNEL_LABEL[viewChannel] ?? viewChannel}`}</h3>
          <p className="text-sm text-muted-foreground">
            {canEdit ? "Escolha o período e o canal, e clique em \"Gerar análise\" para receber diagnóstico e plano de ação." : "Aguarde a equipe gerar a primeira análise."}
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {filteredList.map((opt: any) => {
            const checklist = (opt.checklist as ChecklistItem[] | null) ?? [];
            const doneCount = checklist.filter(c => c.done).length;
            const isOpen = expanded === opt.id;
            return (
              <Card key={opt.id} className="overflow-hidden p-0">
                <button
                  className="flex w-full flex-wrap items-center gap-3 p-4 text-left transition-colors hover:bg-accent/30"
                  onClick={() => setExpanded(isOpen ? null : opt.id)}
                >
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{opt.title}</span>
                      <Badge variant="outline" className="text-[10px]" style={{ borderColor: `${STATUS_COLOR[opt.status]}66`, color: STATUS_COLOR[opt.status] }}>
                        {STATUS_LABEL[opt.status]}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]" style={{ borderColor: `${PRIORITY_COLOR[opt.priority]}66`, color: PRIORITY_COLOR[opt.priority] }}>
                        Prioridade {opt.priority}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">{CHANNEL_LABEL[opt.channel]}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Criada em {fmtDateTime(opt.createdAt)} por {opt.assignee ?? "—"} · Checklist {doneCount}/{checklist.length}
                    </p>
                  </div>
                  {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </button>

                {isOpen && (
                  <div className="flex flex-col gap-4 border-t border-border/50 p-4">
                    <div className="grid gap-4 lg:grid-cols-3">
                      <div>
                        <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-primary">Diagnóstico de metas</h4>
                        <div className="prose prose-sm prose-invert max-w-none text-sm"><Streamdown>{opt.diagnosis}</Streamdown></div>
                      </div>
                      <div>
                        <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-primary">Defesa / justificativa</h4>
                        <div className="prose prose-sm prose-invert max-w-none text-sm"><Streamdown>{opt.defense}</Streamdown></div>
                      </div>
                      <div>
                        <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-primary">Redistribuição de orçamento</h4>
                        <div className="prose prose-sm prose-invert max-w-none text-sm"><Streamdown>{opt.actionPlan}</Streamdown></div>
                      </div>
                    </div>

                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-primary">Checklist de execução ({doneCount}/{checklist.length})</h4>
                        {canEdit && (
                          <Select value={opt.status} onValueChange={(v) => updateStatus.mutate({ optimizationId: opt.id, status: v as any })}>
                            <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {Object.entries(STATUS_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                      <div className="flex flex-col gap-2">
                        {checklist.map((c, idx) => (
                          <div key={idx} className={`flex items-start gap-3 rounded-md border border-border/40 p-3 transition-colors ${c.done ? "bg-primary/5" : "bg-secondary/30"}`}>
                            <Checkbox
                              checked={c.done}
                              disabled={!canEdit || toggleItem.isPending}
                              onCheckedChange={(v) => toggleItem.mutate({ optimizationId: opt.id, index: idx, done: Boolean(v) })}
                              className="mt-0.5"
                            />
                            <div className="flex-1">
                              <p className={`text-sm font-medium ${c.done ? "text-muted-foreground line-through" : ""}`}>{c.item}</p>
                              {c.motivo && <p className="mt-0.5 text-xs text-muted-foreground"><span className="font-medium text-foreground/70">Motivo:</span> {c.motivo}</p>}
                              <div className="mt-1 flex flex-wrap gap-1.5">
                                {c.canal && <Badge variant="outline" className="text-[9px] text-muted-foreground">{CHANNEL_LABEL[c.canal] ?? c.canal}</Badge>}
                                {c.prioridade && (
                                  <Badge variant="outline" className="text-[9px]" style={{ borderColor: `${PRIORITY_COLOR[c.prioridade]}66`, color: PRIORITY_COLOR[c.prioridade] }}>
                                    {c.prioridade}
                                  </Badge>
                                )}
                                {c.done && c.completedBy && (
                                  <span className="text-[10px] text-muted-foreground">
                                    Concluída por {c.completedBy}{c.completedAt ? ` em ${fmtDateTime(c.completedAt)}` : ""}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
