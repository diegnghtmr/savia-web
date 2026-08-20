/**
 * The vocabulary shared between the onboarding Server Action and whatever
 * renders its outcome.
 *
 * This module is deliberately free of network and session code so the future
 * onboarding form — a client component — can import it without breaching
 * ADR-0018. Nothing here may ever reach out to the backend.
 */

export const ONBOARDING_DATE_FORMATS = [
  "DD/MM/YYYY",
  "MM/DD/YYYY",
  "YYYY-MM-DD",
] as const;

export const ONBOARDING_NUMBER_FORMATS = ["1,234.56", "1.234,56"] as const;

/** The `OnboardingRequest` schema of `savia.openapi.yaml`. */
export interface OnboardingDraft {
  readonly email: string;
  readonly displayName: string;
  readonly locale: string;
  readonly countryCode: string;
  readonly timezone: string;
  readonly dateFormat: (typeof ONBOARDING_DATE_FORMATS)[number];
  readonly weekStartsOn: number;
  readonly numberFormat: (typeof ONBOARDING_NUMBER_FORMATS)[number];
  readonly defaultCurrency: string;
  readonly workspaceName: string;
  readonly baseCurrency: string;
  readonly privacyModeEnabled?: boolean;
}

/** The `OnboardingAggregate` schema of `savia.openapi.yaml`. */
export interface OnboardingAggregate {
  readonly profileId: string;
  readonly workspaceId: string;
}

/** One entry of the `errors` array the backend returns on a 400 problem response. */
export interface FieldViolation {
  readonly field: string;
  readonly message: string;
}

export const ONBOARDING_RESULT_KINDS = {
  created: "created",
  replayed: "replayed",
  invalid: "invalid",
  unauthenticated: "unauthenticated",
  conflict: "conflict",
  retryable: "retryable",
  failed: "failed",
} as const;

export type OnboardingResultKind =
  (typeof ONBOARDING_RESULT_KINDS)[keyof typeof ONBOARDING_RESULT_KINDS];

/**
 * The complete set of outcomes the Server Action may return. It never throws
 * at its caller, and every member is safe to serialise to the browser: no
 * bearer token, no problem `type`, `detail`, or `instance`, no stack.
 */
export type OnboardingResult =
  | {
      readonly kind: typeof ONBOARDING_RESULT_KINDS.created;
      readonly aggregate: OnboardingAggregate;
    }
  | {
      readonly kind: typeof ONBOARDING_RESULT_KINDS.replayed;
      readonly aggregate: OnboardingAggregate;
    }
  | {
      readonly kind: typeof ONBOARDING_RESULT_KINDS.invalid;
      readonly violations: readonly FieldViolation[];
    }
  | { readonly kind: typeof ONBOARDING_RESULT_KINDS.unauthenticated }
  | { readonly kind: typeof ONBOARDING_RESULT_KINDS.conflict }
  | {
      readonly kind: typeof ONBOARDING_RESULT_KINDS.retryable;
      readonly retryAfterSeconds: number | null;
    }
  | { readonly kind: typeof ONBOARDING_RESULT_KINDS.failed };
