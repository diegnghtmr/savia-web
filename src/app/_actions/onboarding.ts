"use server";

import { draftFromForm } from "@/lib/onboarding-draft";
import { onboard, productionPorts } from "@/lib/onboarding-gateway";
import {
  ONBOARDING_RESULT_KINDS,
  type OnboardingDraft,
  type OnboardingResult,
} from "@/lib/onboarding-result";

/**
 * The onboarding Server Action.
 *
 * Under ADR-0018 the browser issues no application request, so this is the
 * only way `POST /v1/onboarding` is ever reached from the web client. It
 * always resolves to an `OnboardingResult`; it never rejects, and the value it
 * returns carries no bearer token and no backend internals.
 */
export async function submitOnboarding(
  draft: OnboardingDraft,
): Promise<OnboardingResult> {
  return onboard(draft, productionPorts);
}

/**
 * The same action, in the shape `useActionState` and a plain HTML form post
 * both speak. Keeping it separate from `submitOnboarding` means the typed
 * entry point stays typed: `FormData` is a transport detail of the browser
 * boundary, not part of the onboarding vocabulary.
 *
 * The previous result is ignored on purpose. Onboarding is idempotent per
 * subject, so a resubmission is answered by the backend rather than by
 * remembering what it said last time.
 */
export async function submitOnboardingForm(
  _previous: OnboardingResult | null,
  form: FormData,
): Promise<OnboardingResult> {
  const submitted = draftFromForm(form);
  if (!submitted.ok)
    return {
      kind: ONBOARDING_RESULT_KINDS.invalid,
      violations: submitted.violations,
    };
  return onboard(submitted.draft, productionPorts);
}
