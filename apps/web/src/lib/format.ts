export const money = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
export const date = (
  value: string | number,
  options?: Intl.DateTimeFormatOptions,
) =>
  new Date(
    typeof value === "string" && !value.endsWith("Z") && value.includes("T")
      ? value + "Z"
      : value,
  ).toLocaleDateString("pt-BR", options || { day: "2-digit", month: "short" });
export const time = (value: string | number) =>
  new Date(
    typeof value === "string" && !value.endsWith("Z") ? value + "Z" : value,
  ).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
export const initials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0])
    .join("")
    .toUpperCase();
export const phone = (value: string) =>
  value.replace(/^55(\d{2})(\d{5})(\d{4})$/, "($1) $2-$3");
export const statuses = [
  "Agendar Contato",
  "Venda Efetivada",
  "Stand By",
  "Optou pela Concorrência",
  "Não Enviar Mais",
];
export const statusClass = (status: string) =>
  ["contact", "won", "waiting", "lost", "blocked"][statuses.indexOf(status)] ||
  "";
