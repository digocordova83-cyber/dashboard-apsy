import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CalendarDays } from "lucide-react";
import { useState } from "react";

export type DateRange = { dateFrom: string; dateTo: string; label: string };

function brtTodayIso(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function shiftIso(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function monthStart(isoDate: string): string {
  return `${isoDate.slice(0, 7)}-01`;
}

function previousMonth(isoDate: string): { start: string; end: string } {
  const [year, month] = isoDate.split("-").map(Number);
  const startDate = new Date(Date.UTC(year, month - 2, 1, 12));
  const endDate = new Date(Date.UTC(year, month - 1, 0, 12));
  return {
    start: startDate.toISOString().slice(0, 10),
    end: endDate.toISOString().slice(0, 10),
  };
}

export function presetRanges(now = new Date()): DateRange[] {
  const today = brtTodayIso(now);
  const yesterday = shiftIso(today, -1);
  const previous = previousMonth(today);
  const ranges: DateRange[] = [
    {
      label: "Últimos 7 dias",
      dateFrom: shiftIso(yesterday, -6),
      dateTo: yesterday,
    },
    {
      label: "Últimos 14 dias",
      dateFrom: shiftIso(yesterday, -13),
      dateTo: yesterday,
    },
    {
      label: "Últimos 30 dias",
      dateFrom: shiftIso(yesterday, -29),
      dateTo: yesterday,
    },
    {
      label: "Últimos 90 dias",
      dateFrom: shiftIso(yesterday, -89),
      dateTo: yesterday,
    },
  ];
  if (yesterday >= monthStart(today)) {
    ranges.push({
      label: "Este mês",
      dateFrom: monthStart(today),
      dateTo: yesterday,
    });
  }
  ranges.push(
    { label: "Mês passado", dateFrom: previous.start, dateTo: previous.end },
    { label: "Junho/2026", dateFrom: "2026-06-01", dateTo: "2026-06-30" }
  );
  return ranges;
}

/** Range padrão do dashboard: mês atual, do dia 01 até ontem em Brasília. */
export function defaultRange(): DateRange {
  const presets = presetRanges();
  return (
    presets.find(item => item.label === "Este mês") ??
    presets.find(item => item.label === "Mês passado") ??
    presets[2]
  );
}

export function DateRangePicker({
  value,
  onChange,
}: {
  value: DateRange;
  onChange: (range: DateRange) => void;
}) {
  const [open, setOpen] = useState(false);
  const presets = presetRanges();
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 border-border/70">
          <CalendarDays className="h-4 w-4 text-primary" />
          <span className="hidden sm:inline">{value.label}</span>
          <span className="text-xs text-muted-foreground">
            {value.dateFrom.slice(5)} → {value.dateTo.slice(5)}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-52 p-1">
        {presets.map(preset => (
          <button
            key={preset.label}
            className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent ${preset.label === value.label ? "bg-primary/10 text-primary font-medium" : ""}`}
            onClick={() => {
              onChange(preset);
              setOpen(false);
            }}
          >
            {preset.label}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
