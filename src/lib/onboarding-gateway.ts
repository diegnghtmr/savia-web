import "server-only";

import {
  ONBOARDING_RESULT_KINDS,
  type FieldViolation,
  type OnboardingAggregate,
  type OnboardingDraft,
  type OnboardingResult,
} from "./onboarding-result";
import { SESSION_KINDS, currentSession, type Session } from "./session";
import { loadServerConfig, type ServerConfig } from "./server-config";

const ONBOARDING_PATH = "v1/onboarding";

/** Everything one onboarding request needs, injected so it can be tested. */
export interface OnboardingTarget {
  readonly baseUrl: URL;
  readonly accessToken: string;
  readonly fetchImpl: typeof fetch;
}

/** The collaborators the Server Action binds to their real implementations. */
export interface OnboardingPorts {
  readonly currentSession: () => Promise<Session>;
  readonly loadConfig: () => ServerConfig;
  readonly fetchImpl: typeof fetch;
}

export const productionPorts: OnboardingPorts = {
  currentSession,
  loadConfig: loadServerConfig,
  fetchImpl: (input, init) => fetch(input, init),
};

/**
 * Issues `POST /v1/onboarding` and folds every documented answer — and every
 * undocumented one — into an `OnboardingResult`.
 *
 * `fetch` lives here rather than in a client component because ADR-0018 puts
 * the HTTP boundary on the server; the `server-only` marker at the top of this
 * module is what makes that structural rather than a convention.
 */
export async function postOnboarding(
  draft: OnboardingDraft,
  target: OnboardingTarget,
): Promise<OnboardingResult> {
  let response: Response;
  try {
    response = await target.fetchImpl(endpoint(target.baseUrl), {
      method: "POST",
      cache: "no-store",
      headers: {
        authorization: `Bearer ${target.accessToken}`,
        "content-type": "application/json",
        accept: "application/json, application/problem+json",
      },
      body: JSON.stringify(draft),
    });
  } catch {
    // The request may or may not have reached the backend. The operation is
    // idempotent per subject, so retrying is safe — but no delay was stated,
    // and inventing one would be a fabricated server instruction.
    return {
      kind: ONBOARDING_RESULT_KINDS.retryable,
      retryAfterSeconds: null,
    };
  }
  return mapResponse(response);
}

/**
 * The whole action, minus the Next.js binding: resolve the session, resolve
 * the configuration, then call the backend. Every failure becomes a result.
 */
export async function onboard(
  draft: OnboardingDraft,
  ports: OnboardingPorts,
): Promise<OnboardingResult> {
  try {
    const session = await ports.currentSession();
    // No sign-in flow exists yet, so this is the ordinary path. It is answered
    // without a request: an unauthenticated call would only earn a 401.
    if (session.kind === SESSION_KINDS.absent)
      return { kind: ONBOARDING_RESULT_KINDS.unauthenticated };
    const config = ports.loadConfig();
    return await postOnboarding(draft, {
      baseUrl: config.backendBaseUrl,
      accessToken: session.accessToken,
      fetchImpl: ports.fetchImpl,
    });
  } catch (error) {
    // A misconfigured deployment names an environment variable in its message.
    // That belongs in the server log, never in a value the browser receives.
    //
    // `failed` is also what an ordinary backend 500 produces, so leaving this
    // path unrecorded would make a deployment fault indistinguishable from a
    // backend that is merely unwell — and only one of the two is fixed by
    // redeploying. The reason stays on the server, matching `currentSession`.
    console.error(
      "Could not prepare the onboarding request; reporting a failure.",
      error instanceof Error ? error.message : String(error),
    );
    return { kind: ONBOARDING_RESULT_KINDS.failed };
  }
}

function endpoint(baseUrl: URL): string {
  const base = baseUrl.href.endsWith("/") ? baseUrl.href : `${baseUrl.href}/`;
  return new URL(ONBOARDING_PATH, base).href;
}

async function mapResponse(response: Response): Promise<OnboardingResult> {
  const body = await readJson(response);
  switch (response.status) {
    case 201:
      return created(body, ONBOARDING_RESULT_KINDS.created);
    case 200:
      return created(body, ONBOARDING_RESULT_KINDS.replayed);
    case 400:
      // The violations are the only part of a problem body a caller can act
      // on, so they are the only part that crosses back.
      return {
        kind: ONBOARDING_RESULT_KINDS.invalid,
        violations: readViolations(body),
      };
    case 401:
      // The token was rejected rather than missing, but the caller's remedy is
      // identical, so both collapse onto one kind.
      return { kind: ONBOARDING_RESULT_KINDS.unauthenticated };
    case 409:
      return { kind: ONBOARDING_RESULT_KINDS.conflict };
    case 503:
      return {
        kind: ONBOARDING_RESULT_KINDS.retryable,
        retryAfterSeconds: readRetryAfter(response),
      };
    default:
      // 500 and anything undocumented alike: the client cannot act on it, and
      // the cause is already recorded on the backend.
      return { kind: ONBOARDING_RESULT_KINDS.failed };
  }
}

function created(
  body: unknown,
  kind:
    | typeof ONBOARDING_RESULT_KINDS.created
    | typeof ONBOARDING_RESULT_KINDS.replayed,
): OnboardingResult {
  const aggregate = readAggregate(body);
  // A success the contract cannot describe is a defect, not a success.
  if (!aggregate) return { kind: ONBOARDING_RESULT_KINDS.failed };
  return { kind, aggregate };
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function readAggregate(body: unknown): OnboardingAggregate | null {
  if (typeof body !== "object" || body === null) return null;
  const { profileId, workspaceId } = body as Record<string, unknown>;
  if (typeof profileId !== "string" || typeof workspaceId !== "string")
    return null;
  return { profileId, workspaceId };
}

// The OpenAPI authority declares validation problems under `errors`. The
// backend currently emits `violations` during transition; we prefer `errors`
// and fall back to `violations` temporarily until the backend ships `errors`.
function readViolations(body: unknown): readonly FieldViolation[] {
  if (typeof body !== "object" || body === null) return [];
  const record = body as Record<string, unknown>;
  const rawEntries = Array.isArray(record.errors)
    ? record.errors
    : Array.isArray(record.violations)
      ? record.violations
      : [];
  return rawEntries.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return [];
    const { field, message } = entry as Record<string, unknown>;
    if (typeof field !== "string" || typeof message !== "string") return [];
    return [{ field, message }];
  });
}

// RFC 9110 also allows an HTTP-date here. The backend documents an integer, so
// anything else is reported as "no stated delay" rather than guessed at.
function readRetryAfter(response: Response): number | null {
  const header = response.headers.get("retry-after");
  if (header === null) return null;
  const seconds = Number(header.trim());
  return Number.isInteger(seconds) && seconds >= 0 ? seconds : null;
}
