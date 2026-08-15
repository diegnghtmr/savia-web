import {
  ONBOARDING_DATE_FORMATS,
  ONBOARDING_NUMBER_FORMATS,
  type FieldViolation,
  type OnboardingDraft,
} from "./onboarding-result";

/**
 * The outcome of reading a submitted onboarding form.
 *
 * This module is free of network and session code so the form — a client
 * component — and the Server Action can both hold it.
 */
export type SubmittedOnboarding =
  | { readonly ok: true; readonly draft: OnboardingDraft }
  | { readonly ok: false; readonly violations: readonly FieldViolation[] };

/** `weekStartsOn` in `savia.openapi.yaml`: an integer, Sunday through Saturday. */
const WEEK_START = { first: 0, last: 6 } as const;

/**
 * Reads a submission into the typed draft the backend contract describes.
 *
 * What it refuses is deliberately narrow: only values outside a set this form
 * itself renders, because for those it can be certain without asking anyone.
 * Email shape, name lengths and currency codes are the backend's to judge.
 * Re-implementing them here would stand up a second authority, free to drift
 * from the first and to contradict it in front of the user.
 */
export function draftFromForm(form: FormData): SubmittedOnboarding {
  const violations: FieldViolation[] = [];
  const dateFormat = closedSet(
    ONBOARDING_DATE_FORMATS,
    text(form, "dateFormat"),
  );
  if (dateFormat === null)
    violations.push({
      field: "dateFormat",
      message: "Elige uno de los formatos de fecha ofrecidos.",
    });
  const weekStartsOn = wholeDay(text(form, "weekStartsOn"));
  if (weekStartsOn === null)
    violations.push({
      field: "weekStartsOn",
      message: "Elige uno de los días ofrecidos.",
    });
  const numberFormat = closedSet(
    ONBOARDING_NUMBER_FORMATS,
    text(form, "numberFormat"),
  );
  if (numberFormat === null)
    violations.push({
      field: "numberFormat",
      message: "Elige uno de los formatos de número ofrecidos.",
    });
  if (dateFormat === null || weekStartsOn === null || numberFormat === null)
    return { ok: false, violations };
  return {
    ok: true,
    draft: {
      email: text(form, "email"),
      displayName: text(form, "displayName"),
      locale: text(form, "locale"),
      countryCode: text(form, "countryCode"),
      timezone: text(form, "timezone"),
      dateFormat,
      weekStartsOn,
      numberFormat,
      defaultCurrency: text(form, "defaultCurrency"),
      workspaceName: text(form, "workspaceName"),
      baseCurrency: text(form, "baseCurrency"),
      // A checkbox reaches the server only when it is checked, so presence is
      // the whole signal; its value carries nothing.
      privacyModeEnabled: form.has("privacyModeEnabled"),
    },
  };
}

// Trimmed because a browser preserves the spaces a user pastes, and the
// backend's patterns are anchored: " CO " would be rejected as a country code
// that the user did in fact type correctly.
function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function closedSet<T extends readonly string[]>(
  options: T,
  value: string,
): T[number] | null {
  return (options as readonly string[]).includes(value)
    ? (value as T[number])
    : null;
}

function wholeDay(value: string): number | null {
  const day = Number(value);
  // `Number("")` is zero, which would silently turn an unanswered select into
  // Sunday.
  if (value === "" || !Number.isInteger(day)) return null;
  return day >= WEEK_START.first && day <= WEEK_START.last ? day : null;
}
