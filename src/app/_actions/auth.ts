"use server";

import { redirect } from "next/navigation";
import { signIn, signUp, signOut } from "@/lib/auth-gateway";
import { AUTH_RESULT_KINDS, type AuthResult } from "@/lib/auth-result";
import { dataId } from "@/lib/data-access";
import { fields } from "@/lib/financial-draft";
import { insightsTransport } from "@/lib/insights-gateway";
import { requireProfile } from "@/lib/require-profile";

/**
 * Server action for user sign-in.
 * The protected entry point checks the profile before rendering the overview.
 */
export async function signInAction(
  _previous: AuthResult | null,
  form: FormData,
): Promise<AuthResult> {
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");

  const result = await signIn({ email, password });
  if (result.kind === AUTH_RESULT_KINDS.signedIn) {
    redirect("/overview");
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

async function sessionChange(userId: string, form: FormData) {
  if (!dataId(userId) || fields(form, ["confirmar"])?.confirmar !== "yes")
    redirect("/sessions?resultado=invalida");
  const profile = await requireProfile();
  if (profile.kind !== "ready" || profile.userId !== userId)
    redirect("/sessions?resultado=error");
  return profile;
}

export async function revokeOtherSessionsAction(
  userId: string,
  form: FormData,
): Promise<never> {
  const { accessToken } = await sessionChange(userId, form);
  const response = await insightsTransport(accessToken)(
    "me/sessions/revoke-others",
    undefined,
    {
      method: "POST",
      signal: AbortSignal.timeout(5000),
    },
  );
  const result =
    response?.status === 204
      ? "otras"
      : response?.status === 404 || response?.status === 501
        ? "no-disponible"
        : "error";
  redirect(`/sessions?resultado=${result}`);
}

export async function revokeAllSessionsAction(
  userId: string,
  form: FormData,
): Promise<never> {
  await sessionChange(userId, form);
  const result = await signOut(undefined, "all");
  if (result.kind !== AUTH_RESULT_KINDS.signedOut)
    redirect("/sessions?resultado=error");
  redirect("/sign-in");
}
