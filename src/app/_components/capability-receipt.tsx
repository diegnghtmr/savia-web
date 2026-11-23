import { acknowledgeDraft } from "@/app/_actions/draft-receipt";
import { dataId } from "@/lib/data-access";
import { draftReceiptFor } from "@/lib/draft-idempotency";
import { DraftReceipt } from "./draft-receipt";

export async function CapabilityReceipt({
  requested,
  workspaceId,
  userId,
}: {
  requested: unknown;
  workspaceId: string;
  userId: string;
}) {
  const id = dataId(requested);
  if (!id || (await draftReceiptFor(id, workspaceId, userId)) !== id)
    return null;
  return (
    <>
      <p role="status">Solicitud completada.</p>
      <DraftReceipt id={id} />
      <noscript>
        <form action={acknowledgeDraft.bind(null, id)}>
          <button type="submit">Reconocer operación</button>
        </form>
      </noscript>
    </>
  );
}
