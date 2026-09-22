/** Formatação pt-BR para o dashboard */
export const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: v >= 1000 ? 0 : 2 }).format(v || 0);

export const fmtNum = (v: number) =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(v || 0);

export const fmtNumCompact = (v: number) =>
  new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(v || 0);

export const fmtPct = (v: number, digits = 2) =>
  `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: digits }).format((v || 0) * 100)}%`;

export const fmtDec = (v: number, digits = 2) =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(v || 0);

export const fmtDate = (d: string | Date) => {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d + (d.length === 10 ? "T12:00:00" : "")) : d;
  if (isNaN(date.getTime())) return "";
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
};

export const fmtDateTime = (d: string | Date) => {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return "";
  return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
};
