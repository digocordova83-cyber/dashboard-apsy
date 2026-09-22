import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export function KpiCard({
  title, value, sub, icon: Icon, accent, className,
}: {
  title: string;
  value: string;
  sub?: string;
  icon?: LucideIcon;
  accent?: boolean;
  className?: string;
}) {
  return (
    <Card className={cn("p-4 gap-1 border-border/60 bg-card", accent && "border-primary/40 bg-primary/5", className)}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</span>
        {Icon && <Icon className={cn("h-4 w-4", accent ? "text-primary" : "text-muted-foreground/70")} />}
      </div>
      <div className="text-2xl font-bold tracking-tight">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </Card>
  );
}
