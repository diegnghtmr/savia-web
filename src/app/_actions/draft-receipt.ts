"use server";

import { confirmDraftReceipt } from "@/lib/draft-idempotency";

export async function acknowledgeDraft(id: string) {
  await confirmDraftReceipt(id);
}
