import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarDays } from "lucide-react";
import { useState } from "react";

export type DateRange = { dateFrom: string; dateTo: string; label: string };

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function presetRanges(): DateRange[] {
  const today = new Date();
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const d7 = new Date(today); d7.setDate(today.getDate() - 7);
  const d14 = new Date(today); d14.setDate(today.getDate() - 14);
  const d30 = new Date(today); d30.setDate(today.getDate() - 30);
  const d90 = new Date(today); d90.setDate(today.getDate() - 90);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const prevMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const prevMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
  return [
    { label: "Últimos 7 dias", dateFrom: iso(d7), dateTo: iso(yesterday) },
    { label: "Últimos 14 dias", dateFrom: iso(d14), dateTo: iso(yesterday) },
    { label: "Últimos 30 dias", dateFrom: iso(d30), dateTo: iso(yesterday) },
    { label: "Últimos 90 dias", dateFrom: iso(d90), dateTo: iso(yesterday) },
    { label: "Este mês", dateFrom: iso(monthStart), dateTo: iso(yesterday < monthStart ? monthStart : yesterday) },
    { label: "Mês passado", dateFrom: iso(prevMonthStart), dateTo: iso(prevMonthEnd) },
    { label: "Junho/2026", dateFrom: "2026-06-01", dateTo: "2026-06-30" },
  ];
}

/** Range padrão do dashboard: mês atual, do dia 01 até ontem (dados completos). */
export function defaultRange(): DateRange {
  const presets = presetRanges();
  return presets.find(p => p.label === "Este mês") ?? presets[2];
}

export function DateRangePicker({ value, onChange }: { value: DateRange; onChange: (r: DateRange) => void }) {
  const [open, setOpen] = useState(false);
  const presets = presetRanges();
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 border-border/70">
          <CalendarDays className="h-4 w-4 text-primary" />
          <span className="hidden sm:inline">{value.label}</span>
          <span className="text-xs text-muted-foreground">{value.dateFrom.slice(5)} → {value.dateTo.slice(5)}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-52 p-1">
        {presets.map(p => (
          <button
            key={p.label}
            className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent ${p.label === value.label ? "bg-primary/10 text-primary font-medium" : ""}`}
            onClick={() => { onChange(p); setOpen(false); }}
          >
            {p.label}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
