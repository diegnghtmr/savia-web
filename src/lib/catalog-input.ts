import "server-only";

import { dataId } from "./data-access";
import { fields } from "./financial-draft";

export const categoryKinds = {
  income: "Ingreso",
  expense: "Gasto",
  transfer: "Transferencia",
  other: "Otra",
};

const categoryFields = [
  "kind",
  "parentId",
  "icon",
  "colorToken",
  "essential",
] as const;

export function catalogDraft(form: FormData, category: boolean) {
  const input = fields(form, ["name", ...categoryFields]);
  if (!input?.name || [...input.name].length > 120) return null;
  const { name, kind, icon, colorToken, essential } = input;
  if (!category)
    return categoryFields.some((key) => form.has(key)) ? null : { name };
  const parentId = dataId(input.parentId);
  if (
    !Object.hasOwn(categoryKinds, kind) ||
    (input.parentId && !parentId) ||
    (essential && essential !== "yes")
  )
    return null;
  return {
    name,
    kind,
    ...(parentId && { parentId }),
    ...(icon && { icon }),
    ...(colorToken && { colorToken }),
    ...(essential === "yes" && { essential: true }),
  };
}
