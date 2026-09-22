import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fmtDateTime } from "@/lib/format";
import { Search, ScrollText } from "lucide-react";

const ACTION_LABEL: Record<string, string> = {
  login: "Login", logout: "Logout",
  meta_alterada: "Meta alterada", meta_removida: "Meta removida",
  otimizacao_gerada: "Otimização gerada", otimizacao_concluida: "Otimização concluída",
  otimizacao_reaberta: "Otimização reaberta", mudanca_status: "Mudança de status",
  usuario_criado: "Usuário criado", usuario_atualizado: "Usuário atualizado",
  comentario: "Comentário",
};
const ACTION_COLOR: Record<string, string> = {
  login: "#4A9FE8", logout: "#7FA0A8",
  meta_alterada: "#D9B54A", meta_removida: "#E86A5E",
  otimizacao_gerada: "#00ACB3", otimizacao_concluida: "#34D399",
  otimizacao_reaberta: "#D9B54A", mudanca_status: "#9B8AE8",
  usuario_criado: "#8AD9C3", usuario_atualizado: "#8AD9C3",
  comentario: "#B8D2D6",
};

export default function Auditoria() {
  const { data, isLoading } = trpc.crm.auditLogs.useQuery(undefined, { staleTime: 30 * 1000 });
  const [busca, setBusca] = useState("");
  const [fAction, setFAction] = useState("todas");

  const logs = (data ?? []) as any[];
  const actions = useMemo(() => Array.from(new Set(logs.map(l => l.action))), [logs]);

  const filtrados = useMemo(() => logs.filter(l => {
    if (fAction !== "todas" && l.action !== fAction) return false;
    if (busca) {
      const q = busca.toLowerCase();
      return String(l.username).toLowerCase().includes(q)
        || String(l.details ?? "").toLowerCase().includes(q)
        || String(l.entity ?? "").toLowerCase().includes(q);
    }
    return true;
  }), [logs, busca, fAction]);

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Auditoria</h1>
        <p className="text-sm text-muted-foreground">Registro completo de ações: usuário, data/hora, alterações, otimizações, metas, comentários e status</p>
      </div>

      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h3 className="mr-auto text-sm font-semibold">Logs ({filtrados.length})</h3>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar usuário ou descrição" className="h-9 w-60 pl-8" />
          </div>
          <Select value={fAction} onValueChange={setFAction}>
            <SelectTrigger className="h-9 w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as ações</SelectItem>
              {actions.map(a => <SelectItem key={a} value={a}>{ACTION_LABEL[a] ?? a}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="flex flex-col gap-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : filtrados.length === 0 ? (
          <div className="py-12 text-center">
            <ScrollText className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">Nenhum registro encontrado</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2">Data / hora</th>
                  <th className="px-3 py-2">Usuário</th>
                  <th className="px-3 py-2">Ação</th>
                  <th className="px-3 py-2">Entidade</th>
                  <th className="px-3 py-2">Descrição da alteração</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((l, i) => (
                  <tr key={i} className="border-b border-border/30 transition-colors hover:bg-accent/40">
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs text-muted-foreground">{fmtDateTime(l.createdAt)}</td>
                    <td className="px-3 py-2.5 font-medium">{l.username}</td>
                    <td className="px-3 py-2.5">
                      <Badge variant="outline" className="text-[10px]" style={{ borderColor: `${ACTION_COLOR[l.action] ?? "#7FA0A8"}66`, color: ACTION_COLOR[l.action] ?? "#7FA0A8" }}>
                        {ACTION_LABEL[l.action] ?? l.action}
                      </Badge>
                    </td>
                    <td className="max-w-[140px] truncate px-3 py-2.5 text-xs text-muted-foreground">{l.entity ?? "—"}</td>
                    <td className="max-w-[420px] px-3 py-2.5 text-xs">{l.details ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

