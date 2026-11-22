import {
  saveAllocations,
  saveBudget,
  type Binding,
} from "@/app/_actions/budgets";
import { recordRate } from "@/app/_actions/exchange-rates";
import { saveFund, type FundBinding } from "@/app/_actions/funds";
import {
  saveTransactionAction,
  type TransactionSubmission,
} from "@/app/_actions/transactions";
import { recordTransfer } from "@/app/_actions/transfers";
import { prepareDraft } from "@/lib/draft-preparation";

type Reservation = Awaited<ReturnType<typeof prepareDraft>>;

export function POST(request: Request): Promise<Response>;
export function POST(form: FormData): Promise<Reservation>;
export async function POST(
  input: Request | FormData,
): Promise<Response | Reservation> {
  if (input instanceof FormData) return reserve(input);
  const origin = input.headers.get("origin");
  if (!origin || URL.parse(origin)?.host !== input.headers.get("host"))
    return new Response(null, { status: 403 });
  try {
    return Response.json(await reserve(await input.formData()), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return new Response(null, { status: 400 });
  }
}

function reserve(form: FormData) {
  const meta = JSON.parse(String(form.get("draftContext"))) as {
    kind: string;
    bound: unknown;
  };
  form.delete("draftContext");
  return prepareDraft(async () => {
    switch (meta.kind) {
      case "transaction":
        return saveTransactionAction(
          meta.bound as TransactionSubmission,
          null,
          form,
        );
      case "transfer":
        return recordTransfer(
          meta.bound as Parameters<typeof recordTransfer>[0],
          null,
          form,
        );
      case "rate":
        return recordRate(meta.bound as string, null, form);
      case "budget":
        return saveBudget(meta.bound as Binding, null, form);
      case "allocations":
        return saveAllocations(meta.bound as Binding, null, form);
      case "fund":
        return saveFund(meta.bound as FundBinding, null, form);
      default:
        throw new Error("Unsupported draft command");
    }
  });
}
