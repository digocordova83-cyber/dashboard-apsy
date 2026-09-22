import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useLocalAuth } from "@/contexts/LocalAuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fmtDateTime } from "@/lib/format";
import { Plus, Loader2, KeyRound, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

const ROLE_LABEL: Record<string, string> = { admin: "Administrador", analista: "Analista", cliente: "Cliente" };
const ROLE_COLOR: Record<string, string> = { admin: "#E86A5E", analista: "#00ACB3", cliente: "#4A9FE8" };
const ROLE_DESC: Record<string, string> = {
  admin: "Acesso total: dados, metas, otimizações, usuários e auditoria",
  analista: "Vê tudo, gera otimizações e altera metas; não gerencia usuários",
  cliente: "Somente visualização dos dashboards e relatórios",
};

export default function Usuarios() {
  const { user } = useLocalAuth();
  const isAdmin = user?.role === "admin";
  const utils = trpc.useUtils();
  const list = trpc.localAuth.listUsers.useQuery(undefined, { enabled: isAdmin, staleTime: 30 * 1000 });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", username: "", password: "", role: "cliente" });
  const [pwdFor, setPwdFor] = useState<number | null>(null);
  const [newPwd, setNewPwd] = useState("");

  const create = trpc.localAuth.createUser.useMutation({
    onSuccess: () => {
      toast.success("Usuário criado");
      utils.localAuth.listUsers.invalidate();
      setOpen(false);
      setForm({ name: "", username: "", password: "", role: "cliente" });
    },
    onError: (e) => toast.error(e.message),
  });
  const update = trpc.localAuth.updateUser.useMutation({
    onSuccess: () => {
      toast.success("Usuário atualizado");
      utils.localAuth.listUsers.invalidate();
      setPwdFor(null); setNewPwd("");
    },
    onError: (e) => toast.error(e.message),
  });

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-16 text-center">
        <ShieldAlert className="h-12 w-12 text-muted-foreground/50" />
        <h2 className="text-lg font-semibold">Acesso restrito</h2>
        <p className="max-w-md text-sm text-muted-foreground">Apenas administradores podem gerenciar usuários e perfis de acesso.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Usuários e Perfis</h1>
          <p className="text-sm text-muted-foreground">Gestão de acessos: Administrador, Analista e Cliente</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="h-4 w-4" /> Novo usuário</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Criar usuário</DialogTitle></DialogHeader>
            <div className="flex flex-col gap-3">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Nome completo</label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex.: Maria Souza" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">Usuário (login)</label>
                  <Input value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} placeholder="Ex.: maria" />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">Senha</label>
                  <Input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="mín. 4 caracteres" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Perfil</label>
                <Select value={form.role} onValueChange={v => setForm(f => ({ ...f, role: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(ROLE_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-xs text-muted-foreground">{ROLE_DESC[form.role]}</p>
              </div>
              <Button
                disabled={create.isPending || !form.name || form.username.length < 2 || form.password.length < 4}
                onClick={() => create.mutate(form as any)}
                className="gap-2"
              >
                {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Criar usuário
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {Object.entries(ROLE_LABEL).map(([k, v]) => (
          <Card key={k} className="p-4">
            <Badge variant="outline" className="mb-2 text-[10px]" style={{ borderColor: `${ROLE_COLOR[k]}66`, color: ROLE_COLOR[k] }}>{v}</Badge>
            <p className="text-xs text-muted-foreground">{ROLE_DESC[k]}</p>
          </Card>
        ))}
      </div>

      <Card className="p-4">
        {list.isLoading ? (
          <div className="flex flex-col gap-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2">Nome</th>
                  <th className="px-3 py-2">Usuário</th>
                  <th className="px-3 py-2">Perfil</th>
                  <th className="px-3 py-2">Último login</th>
                  <th className="px-3 py-2">Ativo</th>
                  <th className="px-3 py-2">Ações</th>
                </tr>
              </thead>
              <tbody>
                {(list.data ?? []).map((u: any) => (
                  <tr key={u.id} className="border-b border-border/30 transition-colors hover:bg-accent/40">
                    <td className="px-3 py-2.5 font-medium">{u.name}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{u.username}</td>
                    <td className="px-3 py-2.5">
                      <Select value={u.role} onValueChange={(v) => update.mutate({ id: u.id, role: v as any })}>
                        <SelectTrigger className="h-8 w-36 text-xs" disabled={u.username === "Rodrigo"}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(ROLE_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">{u.lastLogin ? fmtDateTime(u.lastLogin) : "Nunca"}</td>
                    <td className="px-3 py-2.5">
                      <Switch
                        checked={u.active}
                        disabled={u.username === "Rodrigo" || update.isPending}
                        onCheckedChange={(v) => update.mutate({ id: u.id, active: v })}
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      {pwdFor === u.id ? (
                        <div className="flex items-center gap-2">
                          <Input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} placeholder="Nova senha" className="h-8 w-36 text-xs" />
                          <Button size="sm" className="h-8 text-xs" disabled={newPwd.length < 4 || update.isPending}
                            onClick={() => update.mutate({ id: u.id, password: newPwd })}>
                            Salvar
                          </Button>
                          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => { setPwdFor(null); setNewPwd(""); }}>Cancelar</Button>
                        </div>
                      ) : (
                        <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => setPwdFor(u.id)}>
                          <KeyRound className="h-3 w-3" /> Trocar senha
                        </Button>
                      )}
                    </td>
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
