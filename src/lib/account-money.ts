export function money({
  amountMinor,
  currency,
}: {
  amountMinor: string;
  currency: string;
}) {
  const format = new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency,
    currencyDisplay: "code",
    // TRD §22.1 uses centavos for COP even when Intl defaults to whole pesos.
    ...(currency === "COP" && { minimumFractionDigits: 2 }),
  });
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
