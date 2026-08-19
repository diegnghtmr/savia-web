/**
 * The vocabulary shared between auth Server Actions and whatever
 * renders their outcome.
 *
 * This module is deliberately free of network and session code so future
 * auth forms — client components — can import it without breaching
 * ADR-0018. Nothing here may ever reach out to any backend or auth provider.
 */

export const AUTH_RESULT_KINDS = {
  signedIn: "signedIn",
  confirmationRequired: "confirmationRequired",
  signedOut: "signedOut",
  invalidCredentials: "invalidCredentials",
  userAlreadyExists: "userAlreadyExists",
  weakPassword: "weakPassword",
  unavailable: "unavailable",
  failed: "failed",
} as const;

export type AuthResultKind =
  (typeof AUTH_RESULT_KINDS)[keyof typeof AUTH_RESULT_KINDS];

/** The credentials submitted for sign-in or sign-up. */
export interface AuthCredentials {
  readonly email: string;
  readonly password: string;
}

/**
 * The complete set of outcomes auth operations may return. They never throw
 * at their caller, and every member is safe to serialise to the browser.
 */
export type AuthResult =
  | { readonly kind: typeof AUTH_RESULT_KINDS.signedIn }
  | { readonly kind: typeof AUTH_RESULT_KINDS.confirmationRequired }
  | { readonly kind: typeof AUTH_RESULT_KINDS.signedOut }
  | { readonly kind: typeof AUTH_RESULT_KINDS.invalidCredentials }
  | { readonly kind: typeof AUTH_RESULT_KINDS.userAlreadyExists }
  | { readonly kind: typeof AUTH_RESULT_KINDS.weakPassword }
  | { readonly kind: typeof AUTH_RESULT_KINDS.unavailable }
  | { readonly kind: typeof AUTH_RESULT_KINDS.failed };
