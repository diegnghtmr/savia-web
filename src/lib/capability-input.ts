import "server-only";

import { createHash } from "node:crypto";
import { catalogDraft } from "./catalog-input";
import { dataId } from "./data-access";
import { strongETag } from "./etag";
import { fields } from "./financial-draft";
import { editFundDraft, withdrawFundDraft } from "./fund-mutation";
import { insightsPeriod, type InsightsPeriod } from "./insights-period";
import { grantDraft } from "./mcp-grants";
import { workspaceRole, type WorkspaceRole } from "./workspace-roles";

export type CapabilityBinding = {
  kind: string;
  workspaceId: string;
  userId: string;
  id?: string;
  argumentsHash?: string;
  version?: string;
  currency?: string;
  period?: InsightsPeriod;
};

type Command = {
  route: string;
  status: number;
  method?: "PATCH" | "DELETE" | "PUT";
  body?: object;
  fingerprint?: object;
  version?: string;
  personal?: true;
  expiresAt?: string;
  memberRole?: WorkspaceRole;
};

export const providerId = (value: unknown): value is string =>
  typeof value === "string" && /^[a-z0-9][a-z0-9-]{0,63}$/.test(value);
export const versionTag = (value: unknown): value is string =>
  typeof value === "string" && /^"[1-9]\d{0,9}"$/.test(value);
const credentialVersionTag = (value: unknown): value is string =>
  typeof value === "string" && /^"(?:0|[1-9]\d{0,308})"$/.test(value);
export const creatorOnly = "Solo quien creó la propuesta puede decidir.";
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
    case "catalog-category":
    case "catalog-payee":
    case "catalog-tag": {
      const category = kind === "catalog-category";
      const route = category
        ? "categories"
        : kind === "catalog-payee"
          ? "payees"
          : "tags";
      const body = catalogDraft(form, category);
      return body && { route, status: 201, body };
    }
    case "fund-edit":
    case "fund-withdraw": {
      const { currency } = bound;
      if (!id || typeof currency !== "string" || !/^[A-Z]{3}$/.test(currency))
        return null;
      if (kind === "fund-edit") {
        if (!strongETag(version)) return null;
        const body = editFundDraft(form, currency);
        const route = `funds/${id}`;
        return body && { route, method: "PATCH", status: 200, version, body };
      }
      const body = withdrawFundDraft(form, currency);
      return body && { route: `funds/${id}/withdrawals`, status: 201, body };
    }
    case "subscription-confirm":
    case "subscription-discard": {
      const decision = kind === "subscription-confirm" ? "confirm" : "discard";
      return id &&
        (version === undefined || strongETag(version)) &&
        (bound.period === undefined || insightsPeriod(bound.period))
        ? { route: `subscriptions/${id}/${decision}`, status: 200, version }
        : null;
    }
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
        return id && credentialVersionTag(version)
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
    case "member-invite": {
      const data = fields(form, ["email", "role"]);
      if (!data || !workspaceRole(data.role)) return null;
      const email = data.email.toLowerCase();
      if (
        email.length > 320 ||
        email.indexOf("@") > 64 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      )
        return null;
      return {
        route: `workspaces/${bound.workspaceId}/invitations`,
        status: 201,
        body: { email, role: data.role },
        memberRole: data.role,
        personal: true,
      };
    }
    case "member-invite-revoke":
      return id && fields(form, ["revoke"])?.revoke === "yes"
        ? {
            route: `workspaces/${bound.workspaceId}/invitations/${id}/revoke`,
            status: 200,
            personal: true,
          }
        : null;
    case "member-role": {
      const role = fields(form, ["role"])?.role;
      return id && workspaceRole(role)
        ? {
            route: `workspaces/${bound.workspaceId}/members/${id}`,
            status: 200,
            method: "PATCH",
            body: { role },
            memberRole: role,
            personal: true,
          }
        : null;
    }
    case "member-remove":
      return id && fields(form, ["remove"])?.remove === "yes"
        ? {
            route: `workspaces/${bound.workspaceId}/members/${id}`,
            status: 204,
            method: "DELETE",
            personal: true,
          }
        : null;
    case "grant-create": {
      const body = grantDraft(bound.workspaceId, form);
      return body
        ? {
            route: "mcp/grants",
            status: 201,
            personal: true,
            expiresAt: body.expiresAt,
            body,
          }
        : null;
    }
    case "grant-revoke":
      return id && fields(form, ["revoke"])?.revoke === "yes"
        ? {
            route: `mcp/grants/${id}`,
            method: "DELETE",
            status: 204,
            personal: true,
          }
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
