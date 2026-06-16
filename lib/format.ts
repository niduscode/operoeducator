// Formato CLP en pesos chilenos: $15.000 (separador de miles, sin decimales).
export function formatCLP(amount: number): string {
  if (!Number.isFinite(amount)) return "$0";
  const sign = amount < 0 ? "-" : "";
  const abs = Math.abs(Math.round(amount));
  // toLocaleString es-CL devuelve "15.000".
  return `${sign}$${abs.toLocaleString("es-CL")}`;
}

export const MESES_ES: { value: number; label: string }[] = [
  { value: 1, label: "Enero" },
  { value: 2, label: "Febrero" },
  { value: 3, label: "Marzo" },
  { value: 4, label: "Abril" },
  { value: 5, label: "Mayo" },
  { value: 6, label: "Junio" },
  { value: 7, label: "Julio" },
  { value: 8, label: "Agosto" },
  { value: 9, label: "Septiembre" },
  { value: 10, label: "Octubre" },
  { value: 11, label: "Noviembre" },
  { value: 12, label: "Diciembre" },
];

export function nombreMes(mes: number): string {
  return MESES_ES.find((m) => m.value === mes)?.label ?? String(mes);
}
