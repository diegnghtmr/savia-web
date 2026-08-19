"use server";

import { redirect } from "next/navigation";
import { signIn, signUp, signOut } from "@/lib/auth-gateway";
import { AUTH_RESULT_KINDS, type AuthResult } from "@/lib/auth-result";

/**
 * Server action for user sign-in.
 * On successful sign-in with a session established, redirects to /onboarding.
 */
export async function signInAction(
  _previous: AuthResult | null,
  form: FormData,
): Promise<AuthResult> {
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");

  const result = await signIn({ email, password });
  if (result.kind === AUTH_RESULT_KINDS.signedIn) {
    redirect("/onboarding");
  }
  return result;
}

/**
 * Server action for user registration.
 * On instant session creation, redirects to /onboarding.
 * When email confirmation is required, returns confirmationRequired so the form can render it.
 */
export async function signUpAction(
  _previous: AuthResult | null,
  form: FormData,
): Promise<AuthResult> {
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");

  const result = await signUp({ email, password });
  if (result.kind === AUTH_RESULT_KINDS.signedIn) {
    redirect("/onboarding");
  }
  return result;
}

/**
 * Server action for user sign-out.
 * Signs out the active session and redirects to /sign-in.
 */
export async function signOutAction(): Promise<never> {
  await signOut();
  redirect("/sign-in");
}
