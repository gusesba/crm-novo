export function messagePhones(text: string) {
  const phones: { start: number; text: string; phone: string }[] = [];
  const pattern = /(?<![\p{L}\p{N}_])\+?(?:\(\d{2,3}\)|\d)[\d ()-]*\d(?![\p{L}\p{N}_])/gu;
  for (const match of text.matchAll(pattern)) {
    const digits = match[0].replace(/\D/g, "");
    if (digits.length < 10 || digits.length > 15) continue;
    const phone = !match[0].startsWith("+") && digits.length <= 11
      ? "55" + digits
      : digits;
    phones.push({ start: match.index, text: match[0], phone });
  }
  return phones;
}
