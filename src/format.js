// Formatadores (portados do front-end original, pt-BR).
export function fmtBRL(n) {
  if (!isFinite(n)) return "—";
  return Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
export function fmtPct(n) {
  return Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + "%";
}
export function fmtNum(n, casas) {
  return Number(n).toLocaleString("pt-BR", {
    minimumFractionDigits: casas || 0,
    maximumFractionDigits: casas || 2,
  });
}
