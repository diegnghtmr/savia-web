export const draftWarning =
  "Puede que este movimiento ya se haya registrado. Revisa la lista antes de volver a intentarlo.";

export type DraftWarning = { error: typeof draftWarning; confirmation: string };

export function draftConfirmation(form: FormData) {
  const values = form.getAll("confirmDraft");
  return values.length === 1 && typeof values[0] === "string"
    ? values[0]
    : undefined;
}
