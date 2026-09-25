import { describe, expect, it } from "vitest";
import { defaultRange, presetRanges } from "./DateRangePicker";

describe("DateRangePicker presets", () => {
  it("usa ontem em Brasília como fim do período", () => {
    const ranges = presetRanges(new Date("2026-09-25T15:00:00.000Z"));
    expect(ranges.find(item => item.label === "Este mês")).toEqual({
      label: "Este mês",
      dateFrom: "2026-09-01",
      dateTo: "2026-09-24",
    });
    expect(ranges.find(item => item.label === "Últimos 7 dias")).toEqual({
      label: "Últimos 7 dias",
      dateFrom: "2026-09-18",
      dateTo: "2026-09-24",
    });
  });

  it("não cria um período invertido no primeiro dia do mês", () => {
    const ranges = presetRanges(new Date("2026-10-01T15:00:00.000Z"));
    expect(ranges.some(item => item.label === "Este mês")).toBe(false);
    expect(ranges.find(item => item.label === "Mês passado")).toEqual({
      label: "Mês passado",
      dateFrom: "2026-09-01",
      dateTo: "2026-09-30",
    });
    expect(defaultRange().dateFrom <= defaultRange().dateTo).toBe(true);
  });
});
