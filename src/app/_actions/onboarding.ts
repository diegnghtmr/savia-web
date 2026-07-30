"use server";

import { onboard, productionPorts } from "@/lib/onboarding-gateway";
import type {
  OnboardingDraft,
  OnboardingResult,
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
