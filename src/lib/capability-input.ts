import "server-only";

import { createHash } from "node:crypto";
import { dataId } from "./data-access";
import { fields } from "./financial-draft";

export type CapabilityBinding = {
  kind: string;
  workspaceId: string;
  userId: string;
  id?: string;
  argumentsHash?: string;
  version?: string;
};

type Command = {
  route: string;
  status: number;
  method?: "PATCH" | "DELETE" | "PUT";
  body?: object;
  fingerprint?: object;
  version?: string;
  personal?: true;
};

export const providerId = (value: unknown): value is string =>
  typeof value === "string" && /^[a-z0-9][a-z0-9-]{0,63}$/.test(value);
export const versionTag = (value: unknown): value is string =>
  typeof value === "string" && /^"[1-9]\d{0,9}"$/.test(value);
export const approvalHash = (value: unknown): value is string =>
  typeof value === "string" &&
  !!value.trim() &&
  value.length <= 256 &&
  !value.includes("\0");
const localTime = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function secretFrom(form: FormData) {
  const [value, ...extra] = form.getAll("secret");
  return !extra.length &&
    typeof value === "string" &&
    value.length <= 8192 &&
    value.trim() &&
    !value.includes("\0")
    ? value
    : null;
}

function timeZone(value: string) {
  if (!/^[A-Za-z][\w+/-]{0,79}$/.test(value)) return false;
  try {
    new Intl.DateTimeFormat("es", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function capabilityCommand(
  bound: CapabilityBinding,
  form: FormData,
): Command | null {
  const id = dataId(bound.id);
  const { kind, argumentsHash, version } = bound;
  switch (kind) {
    case "conversation": {
      const data = fields(form, ["title"]);
      if (!data || [...data.title].length > 120) return null;
      return {
        route: "agent/conversations",
        status: 201,
        body: { ...(data.title && { title: data.title }) },
      };
    }
    case "message": {
      const message = fields(form, ["message"])?.message;
      if (!id || !message || [...message].length > 20000) return null;
      return {
        route: `agent/conversations/${id}/messages`,
        status: 200,
        body: { message },
      };
    }
    case "confirm":
    case "reject":
      return id && approvalHash(argumentsHash)
        ? {
            route: `approvals/${id}/${kind}`,
            status: 200,
            body: { argumentsHash },
          }
        : null;
    case "credential-add":
    case "credential-replace": {
      const secret = secretFrom(form);
      if (secret === null) return null;
      const sha256 = createHash("sha256").update(secret).digest("hex");
      if (kind === "credential-replace")
        return id && versionTag(version)
          ? {
              route: `ai/credentials/${id}`,
              method: "PATCH",
              status: 200,
              body: { replacementSecret: secret },
              fingerprint: { sha256 },
              version,
            }
          : null;
      const data = fields(form, ["provider"]);
      if (!providerId(data?.provider)) return null;
      const metadata = {
        ownerType: "user",
        providerId: data.provider,
        credentialType: "api_key",
      };
      return {
        route: "ai/credentials",
        status: 201,
        body: { ...metadata, secret },
        fingerprint: { ...metadata, sha256 },
      };
    }
    case "credential-remove":
      return id
        ? { route: `ai/credentials/${id}`, method: "DELETE", status: 204 }
        : null;
    case "notification-read":
      return id
        ? { route: `notifications/${id}/read`, status: 204, personal: true }
        : null;
    case "notification-preferences": {
      const data = fields(form, [
        "in_app",
        "push",
        "email",
        "digest",
        "start",
        "end",
        "timezone",
      ]);
      if (!data || (version !== undefined && !versionTag(version))) return null;
      const { start, end, timezone, digest, in_app, push, email } = data;
      const switches = [digest, in_app, push, email];
      if (switches.some((item) => item !== "" && item !== "yes")) return null;
      const enabled = !!(start || end);
      const validHours = localTime.test(start) && localTime.test(end);
      if (enabled && (!validHours || start === end || !timeZone(timezone)))
        return null;
      return {
        route: "me/notification-preferences",
        method: "PUT",
        status: 200,
        personal: true,
        version,
        body: {
          channels: {
            in_app: in_app === "yes",
            push: push === "yes",
            email: email === "yes",
          },
          digestEnabled: digest === "yes",
          quietHours: enabled ? { start, end, timezone } : null,
        },
      };
    }
    default:
      return null;
  }
}
