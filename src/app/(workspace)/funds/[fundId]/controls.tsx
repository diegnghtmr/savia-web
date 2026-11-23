import { saveCapability } from "@/app/_actions/capabilities";
import { CapabilityForm } from "@/app/_components/capability-form";
import { decimalForInput } from "@/lib/account-money";
import type { Fund } from "@/lib/funds-gateway";

export function FundControls({
  fund,
  accounts,
  binding,
}: {
  fund: Fund;
  accounts: {
    names: Map<string, string>;
    currencies: Record<string, string>;
  } | null;
  binding: { workspaceId: string; userId: string };
}) {
  const bound = { ...binding, id: fund.id, currency: fund.currency };
  const withdrawal = { ...bound, kind: "fund-withdraw" };
  const destinations = [...(accounts?.names ?? [])].filter(
    ([id]) => accounts?.currencies[id] === fund.currency,
  );
  return (
    <>
      {fund.etag && (
        <CapabilityForm
          key={`edit:${fund.etag}`}
          label="Editar fondo"
          action={saveCapability.bind(null, {
            ...bound,
            kind: "fund-edit",
            version: fund.etag,
          })}
        >
          <label className="field">
            Nombre
            <input
              name="name"
              defaultValue={fund.name}
              required
              maxLength={120}
            />
          </label>
          <label className="field">
            Objetivo (opcional)
            <textarea
              name="objective"
              defaultValue={fund.objective}
              maxLength={500}
            />
          </label>
          <label className="field">
            Meta ({fund.currency})
            <input
              name="amount"
              defaultValue={decimalForInput(fund.target)}
              inputMode="decimal"
              required
            />
          </label>
          <label className="field">
            Fecha objetivo (opcional)
            <input
              name="targetDate"
              type="date"
              defaultValue={fund.targetDate ?? undefined}
            />
          </label>
          {accounts && (
            <label className="field">
              Cuenta vinculada (opcional)
              <select
                name="linkedAccountId"
                defaultValue={fund.linkedAccountId ?? ""}
              >
                <option value="">Sin cuenta vinculada</option>
                {fund.linkedAccountId &&
                  !accounts.names.has(fund.linkedAccountId) && (
                    <option value={fund.linkedAccountId}>
                      Cuenta vinculada actual
                    </option>
                  )}
                {[...accounts.names].map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="field">
            Identificadores de miembros responsables (separados por comas)
            <input
              name="responsibleMemberIds"
              defaultValue={fund.responsibleMemberIds?.join(", ")}
            />
          </label>
        </CapabilityForm>
      )}
      {destinations.length ? (
        <CapabilityForm
          label="Retirar del fondo"
          action={saveCapability.bind(null, withdrawal)}
        >
          <label className="field">
            Cuenta de destino
            <select name="accountId" defaultValue="" required>
              <option value="">Selecciona una cuenta</option>
              {destinations.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Importe ({fund.currency})
            <input name="amount" inputMode="decimal" required />
          </label>
          <label className="field">
            Motivo del retiro
            <textarea name="reason" required maxLength={500} />
          </label>
        </CapabilityForm>
      ) : (
        <p>
          {accounts
            ? `No hay cuentas de destino en ${fund.currency}.`
            : "No pudimos cargar las cuentas de destino."}
        </p>
      )}
    </>
  );
}
