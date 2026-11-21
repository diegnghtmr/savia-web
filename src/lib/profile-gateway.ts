import "server-only";

import { loadServerConfig } from "./server-config";

type CurrentUserResult =
  | { kind: "onboarded" }
  | { kind: "notOnboarded" }
  | { kind: "unauthenticated" }
  | { kind: "failed" };

interface ProfilePorts {
  loadConfig: typeof loadServerConfig;
  fetchImpl: typeof fetch;
}

const productionPorts: ProfilePorts = {
  loadConfig: loadServerConfig,
  fetchImpl: (input, init) => fetch(input, init),
};

/** Onboarding creates the profile; the documented missing profile is a 404. */
export async function getCurrentUser(
  accessToken: string,
  ports: ProfilePorts = productionPorts,
): Promise<CurrentUserResult> {
  try {
    const { backendBaseUrl } = ports.loadConfig();
    const base = backendBaseUrl.href.endsWith("/")
      ? backendBaseUrl.href
      : `${backendBaseUrl.href}/`;
    const response = await ports.fetchImpl(new URL("v1/me", base).href, {
      method: "GET",
      cache: "no-store",
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: "application/json",
      },
    });

    if (response.status === 404) return { kind: "notOnboarded" };
    if (response.status === 401) return { kind: "unauthenticated" };
    if (response.status === 200) {
      const body: unknown = await response.json();
      if (
        body &&
        typeof body === "object" &&
        "id" in body &&
        typeof body.id === "string" &&
        body.id.trim()
      ) {
        return { kind: "onboarded" };
      }
    }
  } catch {
    // Configuration, transport and parsing failures never imply a missing profile.
  }
  return { kind: "failed" };
}
