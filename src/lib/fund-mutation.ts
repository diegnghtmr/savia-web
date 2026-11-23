import "server-only";

import { positiveMoney } from "./account-money";
import { dataId } from "./data-access";
import { fields } from "./financial-draft";
import { calendarDate } from "./view-filters";

export function editFundDraft(form: FormData, currency: string) {
  const keys = [
    "name",
    "objective",
    "amount",
    "targetDate",
    "linkedAccountId",
    "responsibleMemberIds",
  ] as const;
  const input = fields(form, keys);
  if (!input || !keys.some((key) => form.has(key))) return null;
  const { name, objective, amount, targetDate, linkedAccountId } = input;
  const targetAmount = positiveMoney(amount, currency);
  const linked = dataId(linkedAccountId);
  const people = input.responsibleMemberIds
    ? input.responsibleMemberIds.split(",").map((part) => dataId(part.trim()))
    : [];
  if (
    (form.has("name") && (!name || [...name].length > 120)) ||
    [...objective].length > 500 ||
    (form.has("amount") && !targetAmount) ||
    (targetDate && !calendarDate(targetDate)) ||
    (linkedAccountId && !linked) ||
    people.some((id) => id === null) ||
    new Set(people).size !== people.length
  )
    return null;
  return {
    ...(form.has("name") && { name }),
    ...(form.has("objective") && { objective: objective || null }),
    ...(targetAmount && { targetAmount }),
    ...(form.has("targetDate") && { targetDate: targetDate || null }),
    ...(form.has("linkedAccountId") && { linkedAccountId: linked }),
    ...(form.has("responsibleMemberIds") && {
      responsibleMemberIds: people.sort(),
    }),
  };
}

export function withdrawFundDraft(form: FormData, currency: string) {
  const input = fields(form, ["accountId", "amount", "reason"]);
  if (!input?.reason || [...input.reason].length > 500) return null;
  const accountId = dataId(input.accountId);
  const amount = positiveMoney(input.amount, currency);
  return accountId && amount
    ? { accountId, amount, reason: input.reason }
    : null;
}
