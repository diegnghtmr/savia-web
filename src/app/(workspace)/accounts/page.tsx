import { randomUUID } from "node:crypto";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountForm } from "@/app/_components/account-form";
import { ACCOUNT_STATUSES, type AccountStatus } from "@/lib/account-types";
import {
  accountScope,
  getAccountBalance,
  listAccounts,
} from "@/lib/accounts-gateway";
import { requireProfile } from "@/lib/require-profile";
import { money } from "@/lib/account-money";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cuentas" };

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await requireProfile();
  if (profile.kind === "failed")
    return <p role="alert">No pudimos consultar tu perfil.</p>;
  const scope = await accountScope(profile.accessToken);
  if (scope.kind === "unauthenticated") redirect("/sign-in");
  if (scope.kind === "failed")
    return <p role="alert">No pudimos verificar el espacio activo.</p>;
  if (scope.kind === "empty")
    return (
      <Link className="call-to-action" href="/overview">
        Crea un espacio para continuar
      </Link>
    );

  const query = await searchParams;
  const status =
    typeof query.status === "string" &&
    Object.hasOwn(ACCOUNT_STATUSES, query.status)
      ? (query.status as AccountStatus)
      : undefined;
  const cursor = typeof query.cursor === "string" ? query.cursor : undefined;
  const result = await listAccounts(scope.target, status, cursor);
  if (result.kind === "unauthenticated") redirect("/sign-in");
  if (result.kind === "failed")
    return (
      <p role="alert">No pudimos cargar las cuentas. Vuelve a intentarlo.</p>
    );
  const { items, nextCursor } = result.value;
  const balances = await Promise.all(
    items.map(({ id }) => getAccountBalance(scope.target, id)),
  );
  if (balances.some(({ kind }) => kind === "unauthenticated"))
    redirect("/sign-in");
  const next = new URLSearchParams(status ? { status } : {});
  if (nextCursor) next.set("cursor", nextCursor);

  return (
    <>
      <p className="eyebrow">Espacio: {scope.name}</p>
      <h1>Cuentas</h1>
      <form action="/accounts" method="get">
        <div className="field">
          <label htmlFor="account-status">Estado</label>
          <select id="account-status" name="status" defaultValue={status ?? ""}>
            <option value="">Todas</option>
            {Object.entries(ACCOUNT_STATUSES).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <button className="submit" type="submit">
          Filtrar
        </button>
      </form>
      {items.length ? (
        <ul>
          {items.map((account, index) => {
            const balance = balances[index];
            return (
              <li key={account.id}>
                <h2>
                  <Link href={`/accounts/${account.id}`} prefetch={false}>
                    {account.name}
                  </Link>
                </h2>
                <p>{ACCOUNT_STATUSES[account.status]}</p>
                {balance.kind === "ok" ? (
                  <p className="type-finance-md">
                    Saldo confirmado: {money(balance.value)} · Corte:{" "}
                    <time dateTime={balance.value.asOf}>
                      {balance.value.asOf}
                    </time>
                  </p>
                ) : (
                  <p>Saldo no disponible.</p>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p>No hay cuentas en esta página.</p>
      )}
      {nextCursor && (
        <Link className="call-to-action" href={`/accounts?${next}`}>
          Siguiente
        </Link>
      )}
      <h2>Nueva cuenta</h2>
      <AccountForm
        key={scope.target.workspaceId}
        nonce={randomUUID()}
        workspaceId={scope.target.workspaceId}
      />
    </>
  );
}
