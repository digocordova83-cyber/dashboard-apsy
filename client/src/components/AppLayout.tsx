import { type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useLocalAuth } from "@/contexts/LocalAuthContext";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Facebook, SearchCheck, Radio, Users, Target,
  Sparkles, ScrollText, UserCog, LogOut, ChevronDown, Menu, X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const LOGO = "/manus-storage/logo-upsy-oficial_63b69479.svg";

const NAV = [
  { href: "/", label: "Visão Geral", icon: LayoutDashboard, roles: ["admin", "analista", "cliente"] },
  { href: "/meta", label: "Meta Ads", icon: Facebook, roles: ["admin", "analista", "cliente"] },
  { href: "/google", label: "Google Ads", icon: SearchCheck, roles: ["admin", "analista", "cliente"] },
  { href: "/programatica", label: "Programática", icon: Radio, roles: ["admin", "analista", "cliente"] },
  { href: "/leads", label: "Leads", icon: Users, roles: ["admin", "analista", "cliente"] },
] as const;

const NAV_GESTAO = [
  { href: "/otimizacoes", label: "IA & Otimizações", icon: Sparkles, roles: ["admin", "analista"] },
  { href: "/metas", label: "Metas", icon: Target, roles: ["admin", "analista", "cliente"] },
  { href: "/auditoria", label: "Auditoria", icon: ScrollText, roles: ["admin", "analista"] },
  { href: "/usuarios", label: "Usuários", icon: UserCog, roles: ["admin"] },
] as const;

export function AppLayout({ children }: { children: ReactNode }) {
  const { user, refetch } = useLocalAuth();
  const [location, navigate] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const utils = trpc.useUtils();

  const logout = trpc.localAuth.logout.useMutation({
    onSuccess: async () => {
      await utils.localAuth.me.invalidate();
      refetch();
      navigate("/login");
      toast.success("Sessão encerrada");
    },
  });

  const role = user?.role ?? "cliente";
  const roleLabel = role === "admin" ? "Administrador" : role === "analista" ? "Analista" : "Cliente";

  const navSection = (items: typeof NAV | typeof NAV_GESTAO, title?: string) => {
    const visible = items.filter(i => (i.roles as readonly string[]).includes(role));
    if (visible.length === 0) return null;
    return (
      <div className="flex flex-col gap-0.5">
        {title && <span className="px-3 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40">{title}</span>}
        {visible.map(item => {
          const active = location === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary/15 text-primary"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </div>
    );
  };

  const sidebar = (
    <div className="flex h-full flex-col bg-sidebar">
      <div className="flex items-center justify-between px-4 py-5">
        <img src={LOGO} alt="UPSY" className="h-9 rounded-md bg-white px-2 py-1 shadow-sm" />
        <button className="md:hidden text-sidebar-foreground/60" onClick={() => setMobileOpen(false)}>
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="px-3">
        <div className="rounded-md bg-sidebar-accent/50 px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-primary">Dashboard APSY</div>
          <div className="text-xs text-sidebar-foreground/50">Mídia Paga & Performance</div>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {navSection(NAV, "Canais")}
        {navSection(NAV_GESTAO, "Gestão")}
      </nav>
      <div className="border-t border-sidebar-border p-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-sidebar-accent">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">
                  {(user?.name ?? "?").slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="truncate text-sm font-medium text-sidebar-foreground">{user?.name}</div>
                <div className="text-xs text-sidebar-foreground/50">{roleLabel}</div>
              </div>
              <ChevronDown className="h-4 w-4 text-sidebar-foreground/40" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-52">
            <DropdownMenuLabel className="text-xs text-muted-foreground">@{user?.username}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => logout.mutate()} className="gap-2 text-destructive focus:text-destructive">
              <LogOut className="h-4 w-4" /> Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar desktop */}
      <aside className="hidden w-60 shrink-0 border-r border-sidebar-border md:block">{sidebar}</aside>
      {/* Sidebar mobile */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-64 border-r border-sidebar-border">{sidebar}</aside>
        </div>
      )}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Topbar mobile */}
        <header className="flex items-center gap-3 border-b border-border/60 px-4 py-3 md:hidden">
          <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <img src={LOGO} alt="UPSY" className="h-8 rounded-md bg-white px-2 py-1 shadow-sm" />
        </header>
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
