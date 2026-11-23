import "server-only";

import { dataId } from "./data-access";
import { fields } from "./financial-draft";
import { record } from "./insights-gateway";

function positiveVersion(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

function bulkAction(form: FormData) {
  const data = fields(form, [
    "action",
    "categoryId",
    "payeeId",
    "targetType",
    "extraordinary",
  ]);
  if (!data) return null;
  const type = data.action;
  switch (type) {
    case "confirm":
    case "archive":
    case "unarchive":
    case "excludeFromReports":
    case "includeInReports":
      return { type };
    case "categorize":
    case "setPayee": {
      const field = type === "categorize" ? "categoryId" : "payeeId";
      const input = data[field];
      const id = dataId(input);
      return form.has(field) && (id || input === "")
        ? { type, [field]: id }
        : null;
    }
    case "tag": {
      const tagIds = form.getAll("tagIds").map(dataId);
      return tagIds.length &&
        tagIds.every(Boolean) &&
        new Set(tagIds).size === tagIds.length
        ? { type, tagIds: tagIds.sort() }
        : null;
    }
    case "convertImported": {
      const { targetType } = data;
      return targetType === "income" || targetType === "expense"
        ? { type, targetType }
        : null;
    }
    case "setExtraordinary": {
      const value = data.extraordinary;
      return value === "true" || value === "false"
        ? { type, extraordinary: value === "true" }
        : null;
    }
    default:
      return null;
  }
}

export function bulkDraft(form: FormData) {
  const list = form.getAll("target");
  if (
    !list.length ||
    list.length > 100 ||
    fields(form, ["confirmed"])?.confirmed !== "yes"
  )
    return null;
  const targets = [];
  const ids = new Set<string>();
  for (const entry of list) {
    const parts =
      typeof entry === "string" &&
      /^([\da-f-]{36}):([1-9]\d{0,15})$/i.exec(entry);
    if (!parts) return null;
    const id = dataId(parts[1]);
    const expectedVersion = Number(parts[2]);
    if (!id || ids.has(id) || !positiveVersion(expectedVersion)) return null;
    ids.add(id);
    targets.push({ id, expectedVersion });
  }
  const action = bulkAction(form);
  return action && { targets, action };
}

export function bulkResult(
  response: unknown,
  draft: ReturnType<typeof bulkDraft>,
) {
  const updated = record(response)?.updated;
  return (
    !!draft &&
    Array.isArray(updated) &&
    updated.length === draft.targets.length &&
    draft.targets.every(({ id }, index) => {
      const row = record(updated[index]);
      return dataId(row?.id) === id && positiveVersion(row?.version);
    })
  );
}
