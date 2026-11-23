import { use, type ReactNode } from "react";
import { saveCapability } from "@/app/_actions/capabilities";
import { CapabilityForm } from "@/app/_components/capability-form";
import { money } from "@/lib/account-money";
import type { InsightsPeriod } from "@/lib/insights-period";
import type { readDetected, readUpcoming } from "@/lib/overview-recurring";

function Preview<T extends { id: string; name: string }>({
  id,
  title,
  page,
  empty,
  failure,
  detail,
}: {
  id: string;
  title: string;
  page: { items: T[]; cursor: string | null } | null;
  empty: string;
  failure: string;
  detail: (item: T) => ReactNode;
}) {
  return (
    <section aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      {!page ? (
        <p role="alert">{failure}</p>
      ) : (
        <>
          {page.items.length > 0 ? (
            <ul>
              {page.items.slice(0, 8).map((item) => (
                <li key={item.id}>
                  <span>{item.name}</span> · {detail(item)}
                </li>
              ))}
            </ul>
          ) : (
            !page.cursor && <p>{empty}</p>
          )}
          {(page.cursor || page.items.length > 8) && (
            <p>Se muestran resultados parciales.</p>
          )}
        </>
      )}
    </section>
  );
}

export function UpcomingPreview({
  report,
}: {
  report: ReturnType<typeof readUpcoming>;
}) {
  return (
    <Preview
      id="overview-upcoming"
      title="Próximas recurrencias (UTC)"
      page={use(report)}
      empty="No hay próximas recurrencias."
      failure="No pudimos cargar las próximas recurrencias."
      detail={({ timestamp }) => {
        const date = new Date(timestamp).toISOString();
        return <time dateTime={date}>{date.slice(0, 10)}</time>;
      }}
    />
  );
}

const subscriptionDecisions = [
  ["subscription-confirm", "Confirmar suscripción"],
  ["subscription-discard", "Descartar suscripción"],
] as const;

export function DetectedPreview({
  report,
  editor,
}: {
  report: ReturnType<typeof readDetected>;
  editor?: { userId: string; workspaceId: string; period: InsightsPeriod };
}) {
  return (
    <Preview
      id="overview-subscriptions"
      title="Suscripciones detectadas"
      page={use(report)}
      empty="No hay suscripciones detectadas."
      failure="No pudimos cargar las suscripciones detectadas."
      detail={({ id, name, current, version, canDecide }) => {
        const unknown = "Importe en moneda base no disponible";
        const total = current ? money(current) : unknown;
        return (
          <>
            <span>{total}</span>
            {editor && canDecide && (
              <div role="group" aria-label={`Decidir sobre ${name}`}>
                {subscriptionDecisions.map(([kind, label]) => {
                  const bound = { ...editor, id, version, kind };
                  return (
                    <CapabilityForm
                      key={kind}
                      label={label}
                      action={saveCapability.bind(null, bound)}
                    />
                  );
                })}
              </div>
            )}
          </>
        );
      }}
    />
  );
}
