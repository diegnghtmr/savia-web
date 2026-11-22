"use server";

import { revalidatePath } from "next/cache";
import {
  fields,
  rateDecimal,
  submitFinancialDraft,
  type FinancialResult,
} from "@/lib/financial-draft";
import { calendarDate } from "@/lib/view-filters";
import { WORKSPACE_ID } from "@/lib/workspace-gateway";

export async function recordRate(
  workspaceId: string,
  _state: FinancialResult | null,
  form: FormData,
): Promise<FinancialResult> {
  const invalid = { error: "Revisa los datos de la tasa." };
  const input = fields(form, [
    "baseCurrency",
    "quoteCurrency",
    "rate",
    "effectiveAt",
    "notes",
  ]);
  if (!input || !WORKSPACE_ID.test(workspaceId)) return invalid;
  const baseCurrency = input.baseCurrency.toUpperCase(),
    quoteCurrency = input.quoteCurrency.toUpperCase();
  const rate = rateDecimal(input.rate);
  const instant =
    /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(
      input.effectiveAt,
    );
  if (
    baseCurrency === quoteCurrency ||
    ![baseCurrency, quoteCurrency].every((code) => /^[A-Z]{3}$/.test(code)) ||
    !rate ||
    !instant ||
    !calendarDate(instant[1]) ||
    [...input.notes].length > 500
  )
    return invalid;
  const [, date, hours, minutes, seconds = "00"] = instant;
  const result = await submitFinancialDraft(
    workspaceId,
    "exchange-rates",
    {
      baseCurrency,
      quoteCurrency,
      rate,
      effectiveAt: `${date}T${hours}:${minutes}:${seconds}Z`,
      notes: input.notes || null,
    },
    {
      workspace: "El espacio activo cambió. Vuelve a Tasas de cambio.",
      failed:
        "No se pudo guardar la tasa. Revisa si ya existe para esa fecha y hora.",
    },
    form,
  );
  if (result.receipt) revalidatePath("/exchange-rates");
  return result;
}
