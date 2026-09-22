import { describe, expect, it } from "vitest";
import { getCrmSyncWindow, splitMonthlyRanges } from "./syncWindow";

describe("janela histórica do sync EducaCRM", () => {
  it("usa maio como início mínimo e D-1 em BRT", () => {
    expect(getCrmSyncWindow(new Date("2026-09-01T12:00:00.000Z"))).toEqual({
      from: "2026-05-01",
      to: "2026-08-31",
    });
  });

  it("mantém todo o histórico para capturar mudanças retroativas", () => {
    expect(getCrmSyncWindow(new Date("2026-10-15T12:00:00.000Z"))).toEqual({
      from: "2026-05-01",
      to: "2026-10-14",
    });
  });

  it("divide intervalos longos em meses quando necessário", () => {
    expect(splitMonthlyRanges("2026-07-03", "2026-09-01")).toEqual([
      { from: "2026-07-03", to: "2026-07-31" },
      { from: "2026-08-01", to: "2026-08-31" },
      { from: "2026-09-01", to: "2026-09-01" },
    ]);
  });
});
