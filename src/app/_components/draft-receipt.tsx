"use client";

import { useEffect, useState } from "react";
import { acknowledgeDraft } from "../_actions/draft-receipt";

export function DraftReceipt({ id }: { id: string }) {
  const [pending, setPending] = useState(true);
  useEffect(() => {
    void acknowledgeDraft(id)
      .then(() => setPending(false))
      .catch(() => setPending(false));
  }, [id]);
  return pending ? <p role="status">Confirmando el registro…</p> : null;
}
