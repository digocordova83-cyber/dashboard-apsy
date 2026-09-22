const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Primeiro mês com dados disponíveis no EducaCRM. */
export const CRM_HISTORY_START = "2026-05-01";

const isoDate = (date: Date) => date.toISOString().slice(0, 10);

/**
 * Atualiza todo o histórico disponível no EducaCRM até D-1 BRT.
 * A API não oferece filtros de atualização, por isso o snapshot é integral e transacional.
 */
export function getCrmSyncWindow(now = new Date()) {
  const brtNow = new Date(now.getTime() - BRT_OFFSET_MS);
  const yesterdayBrt = new Date(brtNow.getTime() - DAY_MS);
  const historyStart = new Date(`${CRM_HISTORY_START}T00:00:00.000Z`);
  return { from: isoDate(historyStart), to: isoDate(yesterdayBrt) };
}

/** Divide intervalos longos em meses para evitar limites de paginação da API. */
export function splitMonthlyRanges(from: string, to: string) {
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  const ranges: Array<{ from: string; to: string }> = [];

  let cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  while (cursor <= end) {
    const monthStart = cursor < start ? start : cursor;
    const monthEnd = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0));
    ranges.push({ from: isoDate(monthStart), to: isoDate(monthEnd > end ? end : monthEnd) });
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
  }

  return ranges;
}
