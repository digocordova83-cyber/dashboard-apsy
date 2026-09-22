import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { useLocalAuth } from "@/contexts/LocalAuthContext";
import { Loader2, LockKeyhole } from "lucide-react";
import { toast } from "sonner";

const LOGO = "/manus-storage/logo-upsy-oficial_63b69479.svg";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [, navigate] = useLocation();
  const { refetch } = useLocalAuth();
  const utils = trpc.useUtils();

  const login = trpc.localAuth.login.useMutation({
    onSuccess: async () => {
      await utils.localAuth.me.invalidate();
      refetch();
      toast.success("Bem-vindo ao Dashboard APSY!");
      navigate("/");
    },
    onError: (e) => toast.error(e.message || "Falha no login"),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;
    login.mutate({ username, password });
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[oklch(0.17_0.035_226)] px-4">
      {/* fundo decorativo */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-40 -left-24 h-[28rem] w-[28rem] rounded-full bg-[oklch(0.3_0.06_220)]/40 blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <img src={LOGO} alt="UPSY" className="h-14 rounded-lg bg-white px-4 py-2 shadow-lg shadow-black/20" />
          <div className="text-center">
            <h1 className="text-xl font-bold tracking-tight text-white">Dashboard APSY</h1>
            <p className="text-sm text-white/50">Gestão de Mídia Paga & Performance</p>
          </div>
        </div>

        <Card className="border-white/10 bg-white/5 p-6 backdrop-blur-md">
          <form onSubmit={submit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="username" className="text-white/80">Usuário</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Seu login"
                autoComplete="username"
                className="border-white/15 bg-white/10 text-white placeholder:text-white/30"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password" className="text-white/80">Senha</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Sua senha"
                autoComplete="current-password"
                className="border-white/15 bg-white/10 text-white placeholder:text-white/30"
              />
            </div>
            <Button
              type="submit"
              disabled={login.isPending || !username || !password}
              className="mt-1 w-full gap-2 font-semibold"
            >
              {login.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />}
              Entrar
            </Button>
          </form>
        </Card>

        <p className="mt-6 text-center text-xs text-white/30">
          Acesso restrito · APSY — Armed School of Psychology
        </p>
      </div>
    </div>
  );
}
