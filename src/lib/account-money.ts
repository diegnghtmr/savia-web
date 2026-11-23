function currencyFormat(currency: string) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency,
    currencyDisplay: "code",
    // TRD §22.1 uses centavos for COP even when Intl defaults to whole pesos.
    ...(currency === "COP" && { minimumFractionDigits: 2 }),
  });
}

export function decimalToMinor(decimal: string, currency: string) {
  const parts = /^(-?)(\d+)(?:[.,](\d+))?$/.exec(decimal);
  if (!parts) return null;
  const [, sign, whole, fraction = ""] = parts;
  const scale =
    currencyFormat(currency).resolvedOptions().maximumFractionDigits ?? 0;
  if (fraction.length > scale) return null;
  const digits = `${whole}${fraction.padEnd(scale, "0")}`.replace(
    /^0+(?=\d)/,
    "",
  );
  if (digits.length > 19) return null;
  const minor = BigInt(`${sign}${digits}`);
  return BigInt.asIntN(64, minor) === minor ? minor.toString() : null;
}

export function positiveMoney(value: string, currency: string) {
  if (!/^[A-Z]{3}$/.test(currency)) return null;
  const amountMinor = decimalToMinor(value, currency);
  return amountMinor && amountMinor !== "0" && !amountMinor.startsWith("-")
    ? { amountMinor, currency }
    : null;
}

export function money({
  amountMinor,
  currency,
}: {
  amountMinor: string;
  currency: string;
}) {
  const format = currencyFormat(currency);
  const scale = format.resolvedOptions().maximumFractionDigits ?? 0;
  const digits = amountMinor.replace(/^-/, "").padStart(scale + 1, "0");
  const decimal = scale
    ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}`
    : digits;
  const sign = amountMinor.startsWith("-") ? "-" : "";
  const signed = `${sign}${decimal}` as `${number}`;
  // Intl formats the decimal string without first losing precision to Number.
  return format.format(signed).replace(/^-/, "−");
}

export function decimalForInput({
  amountMinor,
  currency,
}: Parameters<typeof money>[0]) {
  const scale =
    currencyFormat(currency).resolvedOptions().maximumFractionDigits ?? 0;
  if (!scale) return amountMinor;
  const minor = BigInt(amountMinor);
  const unit = BigInt(10) ** BigInt(scale);
  const negative = minor < BigInt(0);
  const absolute = negative ? -minor : minor;
  return `${negative ? "-" : ""}${absolute / unit}.${String(absolute % unit).padStart(scale, "0")}`;
}
