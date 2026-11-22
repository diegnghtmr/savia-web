"use server";

import { admitDraftSeed, confirmDraftReceipt } from "@/lib/draft-idempotency";
import { POST as reserve } from "../draft-preflight/route";

export async function reserveDraftForm(form: FormData) {
  return reserve(form);
}

export async function admitDraftForm(workspaceId: string) {
  return admitDraftSeed(workspaceId);
}

export async function acknowledgeDraft(id: string) {
  await confirmDraftReceipt(id);
}
