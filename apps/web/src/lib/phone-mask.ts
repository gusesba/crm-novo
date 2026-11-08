export function phoneMask(value: string): string {
  const digits = value.replace(/\D/g, "");
  const explicitCountry = value.trimStart().startsWith("+");
  if (explicitCountry && !digits.startsWith("55")) return digits ? `+${digits}` : "+";
  const brazil = digits.startsWith("55") && (explicitCountry || digits.length === 12 || digits.length === 13);
  const national = brazil ? digits.slice(2) : digits;
  if (national.length > 11) return explicitCountry ? `+${digits}` : digits;
  const prefix = brazil ? "+55 " : "";
  if (!national) return prefix;
  if (national.length <= 2) return `${prefix}(${national}`;
  const local = national.slice(2);
  const split = national.length > 10 ? 5 : 4;
  return `${prefix}(${national.slice(0, 2)}) ${local.slice(0, split)}${local.length > split ? "-" + local.slice(split) : ""}`;
}
