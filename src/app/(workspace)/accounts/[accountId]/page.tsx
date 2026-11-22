import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AccountChangeForm } from "@/app/_components/account-change-form";
import { money } from "@/lib/account-money";
import {
  ACCOUNT_STATUSES,
  ACCOUNT_TEXT,
  ACCOUNT_TYPES,
  INFORMAL_DEBT_DIRECTIONS,
} from "@/lib/account-types";
import {
  accountScope,
  getAccount,
  getAccountBalance,
} from "@/lib/accounts-gateway";
import { requireProfile } from "@/lib/require-profile";
import { WORKSPACE_ID } from "@/lib/workspace-gateway";

export const metadata = { title: "Detalle de cuenta" };

export default async function AccountPage({
  params,
}: {
  params: Promise<{ accountId: string }>;
}) {
  const profile = await requireProfile();
  if (profile.kind === "failed")
    return <p role="alert">No pudimos consultar tu perfil.</p>;
  const accountId = (await params).accountId.toLowerCase();
  if (!WORKSPACE_ID.test(accountId)) notFound();
  const scope = await accountScope(profile.accessToken);
  if (scope.kind === "unauthenticated") redirect("/sign-in");
  if (scope.kind === "empty") redirect("/accounts");
  if (scope.kind === "failed")
    return <p role="alert">No pudimos verificar el espacio activo.</p>;
  const resource = await getAccount(scope.target, accountId);
  if (resource.kind === "unauthenticated") redirect("/sign-in");
  if (resource.kind === "failed") {
    if (resource.status === 404) notFound();
    return (
      <p role="alert">No pudimos cargar la cuenta. Vuelve a intentarlo.</p>
    );
  }
  const { etag, ...account } = resource.value;
  const result = await getAccountBalance(scope.target, accountId);
  if (result.kind === "unauthenticated") redirect("/sign-in");
  const workspaceId = scope.target.workspaceId;
  const submission = { workspaceId, accountId, etag };
  const formKey = `${workspaceId}:${accountId}:${etag}`;
  const balance = result.kind === "ok" ? result.value : null;
  const fx = balance?.equivalent;
  return (
    <>
      <Link className="call-to-action" href="/accounts">
        Volver a Cuentas
      </Link>
      <p className="eyebrow">Espacio: {scope.name}</p>
      <h1>{account.name}</h1>
      <p>
        {ACCOUNT_TYPES[account.type]} · {account.currency}
      </p>
      <p>{ACCOUNT_STATUSES[account.status]}</p>
      {account.informalDebt && (
        <dl>
          <dt>Contraparte</dt>
          <dd>{account.informalDebt.counterpartyName}</dd>
          <dt>Dirección</dt>
          <dd>{INFORMAL_DEBT_DIRECTIONS[account.informalDebt.direction]}</dd>
        </dl>
      )}
      <h2>Saldos</h2>
      {balance ? (
        <>
          <p>
            Corte: <time dateTime={balance.asOf}>{balance.asOf}</time>
          </p>
          <dl>
            <Balance label="Saldo confirmado" value={balance} />
            <Balance label="Saldo pendiente" value={balance.pending} />
            <Balance label="Saldo disponible" value={balance.available} />
            <Balance label="Saldo conciliado" value={balance.reconciled} />
            <Balance
              label="Equivalente en moneda base"
              value={fx?.converted}
              approximate={!!fx && fx.converted.currency !== balance.currency}
            />
          </dl>
          {fx && (
            <p>
              Tasa: {fx.rate} ·{" "}
              <time dateTime={fx.rateDate}>{fx.rateDate}</time> · Fuente:{" "}
              {fx.rateSource}
            </p>
          )}
        </>
      ) : (
        <p role="alert">Saldos no disponibles.</p>
      )}
      {account.status === "closed" ? (
        <dl>
          {ACCOUNT_TEXT.slice(1).map(
            ([field, label]) =>
              account[field] && (
                <div key={field}>
                  <dt>{label}</dt>
                  <dd>{account[field]}</dd>
                </div>
              ),
          )}
          <dt>Incluida en el patrimonio</dt>
          <dd>{account.includeInNetWorth === "true" ? "Sí" : "No"}</dd>
        </dl>
      ) : (
        <>
          <h2>Editar cuenta</h2>
          <AccountChangeForm
            key={formKey}
            submission={submission}
            account={account}
          />
          <h2>Cerrar cuenta</h2>
          <p>Cerrar la cuenta no elimina sus movimientos.</p>
          <AccountChangeForm
            key={`close:${formKey}`}
            submission={{ ...submission, closeKey: randomUUID() }}
            account={account}
          />
        </>
      )}
    </>
  );
}

function Balance({
  label,
  value,
  approximate,
}: {
  label: string;
  value?: Parameters<typeof money>[0] | null;
  approximate?: boolean;
}) {
  return (
    <>
      <dt>{label}</dt>
      <dd className="type-finance-md">
        {value ? `${approximate ? "≈ " : ""}${money(value)}` : "No disponible"}
      </dd>
    </>
  );
}
