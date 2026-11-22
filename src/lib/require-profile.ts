import "server-only";

import { redirect } from "next/navigation";
import { getCurrentUser } from "./profile-gateway";
import { requireSession } from "./session";

/** Gate each protected page before loading or constructing any user data. */
export async function requireProfile() {
  const { accessToken } = await requireSession();
  const profile = await getCurrentUser(accessToken);
  if (profile.kind === "notOnboarded") redirect("/onboarding");
  if (profile.kind === "unauthenticated") redirect("/sign-in");
  return profile.kind === "failed"
    ? ({ kind: "failed" } as const)
    : ({ kind: "ready", accessToken, userId: profile.userId } as const);
}
