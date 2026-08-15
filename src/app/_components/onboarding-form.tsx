"use client";

import { useActionState } from "react";
import { submitOnboardingForm } from "../_actions/onboarding";
import {
  ONBOARDING_DATE_FORMATS,
  ONBOARDING_NUMBER_FORMATS,
  ONBOARDING_RESULT_KINDS,
  type FieldViolation,
  type OnboardingResult,
} from "@/lib/onboarding-result";

/**
 * The shape `useActionState` binds to. Taking it as a prop is what lets the
 * form be exercised without a running backend; the default is the real action.
 */
export type OnboardingFormAction = (
  previous: OnboardingResult | null,
  form: FormData,
) => Promise<OnboardingResult>;

/**
 * The Spanish name of each field the backend may complain about. A violation
 * arrives naming a wire field, and `subject` — which the backend derives from
 * the session and this form never sends — is among them, so the mapping is
 * deliberately partial: an unmapped field is shown as the backend spelled it
 * rather than given an invented label.
 */
const FIELD_LABELS: Readonly<Record<string, string>> = {
  email: "Correo electrónico",
  displayName: "Nombre para mostrar",
  workspaceName: "Nombre del espacio",
  baseCurrency: "Moneda base del espacio",
  locale: "Idioma y región",
  countryCode: "País",
  timezone: "Zona horaria",
  dateFormat: "Formato de fecha",
  weekStartsOn: "La semana empieza en",
  numberFormat: "Formato de números",
  defaultCurrency: "Moneda que usas por defecto",
  privacyModeEnabled: "Ocultar los importes al abrir Savia",
};

const WEEK_DAYS = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
];

const fieldId = (field: string) => `onboarding-${field}`;
const hintId = (field: string) => `${fieldId(field)}-hint`;

export function OnboardingForm({
  action = submitOnboardingForm,
}: {
  action?: OnboardingFormAction;
}) {
  const [result, submit, pending] = useActionState<
    OnboardingResult | null,
    FormData
  >(action, null);

  return (
    <form action={submit} className="onboarding-form">
      {result && <Outcome result={result} />}
      <fieldset>
        <legend>Tu cuenta</legend>
        <Field field="email" hint="Lo usamos para identificarte.">
          <input
            id={fieldId("email")}
            name="email"
            type="email"
            maxLength={254}
            autoComplete="email"
            aria-describedby={hintId("email")}
            required
          />
        </Field>
        <Field field="displayName" hint="Así te saludamos en Savia.">
          <input
            id={fieldId("displayName")}
            name="displayName"
            type="text"
            maxLength={120}
            autoComplete="name"
            aria-describedby={hintId("displayName")}
            required
          />
        </Field>
      </fieldset>

      <fieldset>
        <legend>Tu espacio</legend>
        <Field field="workspaceName" hint="Por ejemplo: Casa, Estudio, Viaje.">
          <input
            id={fieldId("workspaceName")}
            name="workspaceName"
            type="text"
            maxLength={120}
            aria-describedby={hintId("workspaceName")}
            required
          />
        </Field>
        <Field
          field="baseCurrency"
          hint="Código de tres letras, como COP o EUR. Es la moneda en la que se suma todo."
        >
          <CurrencyInput field="baseCurrency" />
        </Field>
      </fieldset>

      <fieldset>
        <legend>Tus preferencias</legend>
        <Field field="locale" hint="Por ejemplo: es-CO.">
          <input
            id={fieldId("locale")}
            name="locale"
            type="text"
            autoComplete="language"
            aria-describedby={hintId("locale")}
            required
          />
        </Field>
        <Field field="countryCode" hint="Código de dos letras, como CO.">
          <input
            id={fieldId("countryCode")}
            name="countryCode"
            type="text"
            pattern="[A-Za-z]{2}"
            autoComplete="country"
            aria-describedby={hintId("countryCode")}
            required
          />
        </Field>
        <Field field="timezone" hint="Por ejemplo: America/Bogota.">
          <input
            id={fieldId("timezone")}
            name="timezone"
            type="text"
            aria-describedby={hintId("timezone")}
            required
          />
        </Field>
        <Field field="dateFormat">
          <select id={fieldId("dateFormat")} name="dateFormat" required>
            {ONBOARDING_DATE_FORMATS.map((format) => (
              <option key={format} value={format}>
                {format}
              </option>
            ))}
          </select>
        </Field>
        <Field field="weekStartsOn">
          <select id={fieldId("weekStartsOn")} name="weekStartsOn" required>
            {WEEK_DAYS.map((day, index) => (
              <option key={day} value={index}>
                {day}
              </option>
            ))}
          </select>
        </Field>
        <Field field="numberFormat">
          <select id={fieldId("numberFormat")} name="numberFormat" required>
            {ONBOARDING_NUMBER_FORMATS.map((format) => (
              <option key={format} value={format}>
                {format}
              </option>
            ))}
          </select>
        </Field>
        <Field
          field="defaultCurrency"
          hint="La que propondremos al registrar un movimiento."
        >
          <CurrencyInput field="defaultCurrency" />
        </Field>
        <div className="field field-inline">
          <input
            id={fieldId("privacyModeEnabled")}
            name="privacyModeEnabled"
            type="checkbox"
          />
          <label htmlFor={fieldId("privacyModeEnabled")}>
            {FIELD_LABELS.privacyModeEnabled}
          </label>
        </div>
      </fieldset>

      <button className="submit" type="submit" disabled={pending}>
        {pending ? "Creando tu espacio…" : "Crear mi espacio"}
      </button>
    </form>
  );
}

function Field({
  field,
  hint,
  children,
}: {
  field: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="field">
      <label htmlFor={fieldId(field)}>{FIELD_LABELS[field]}</label>
      {hint && (
        <p className="hint" id={hintId(field)}>
          {hint}
        </p>
      )}
      {children}
    </div>
  );
}

function CurrencyInput({ field }: { field: string }) {
  return (
    <input
      id={fieldId(field)}
      name={field}
      type="text"
      pattern="[A-Za-z]{3}"
      aria-describedby={hintId(field)}
      required
    />
  );
}

function Outcome({ result }: { result: OnboardingResult }) {
  switch (result.kind) {
    case ONBOARDING_RESULT_KINDS.created:
      return (
        <p className="outcome outcome-success" role="status">
          Listo. Tu espacio quedó creado, con el identificador{" "}
          <code>{result.aggregate.workspaceId}</code>.
        </p>
      );
    case ONBOARDING_RESULT_KINDS.replayed:
      return (
        <p className="outcome outcome-success" role="status">
          Tu espacio ya estaba creado, así que no repetimos nada. Su
          identificador es <code>{result.aggregate.workspaceId}</code>.
        </p>
      );
    case ONBOARDING_RESULT_KINDS.invalid:
      return <Violations violations={result.violations} />;
    case ONBOARDING_RESULT_KINDS.unauthenticated:
      return (
        <p className="outcome outcome-error" role="alert">
          Tu sesión no está activa. Inicia sesión y vuelve a intentarlo.
        </p>
      );
    case ONBOARDING_RESULT_KINDS.conflict:
      return (
        <p className="outcome outcome-error" role="alert">
          Ya existe un espacio para esta cuenta con datos distintos.
        </p>
      );
    case ONBOARDING_RESULT_KINDS.retryable:
      return (
        <p className="outcome outcome-error" role="alert">
          Savia no está disponible en este momento.{" "}
          {result.retryAfterSeconds === null
            ? // No delay was stated, and naming one would be an instruction the
              // backend never gave.
              "Vuelve a intentarlo en un momento."
            : `Vuelve a intentarlo en ${result.retryAfterSeconds} segundos.`}
        </p>
      );
    case ONBOARDING_RESULT_KINDS.failed:
      return (
        <p className="outcome outcome-error" role="alert">
          No pudimos crear tu espacio. Vuelve a intentarlo.
        </p>
      );
  }
}

function Violations({ violations }: { violations: readonly FieldViolation[] }) {
  if (violations.length === 0)
    return (
      <p className="outcome outcome-error" role="alert">
        Savia rechazó estos datos, pero no dijo qué dato corregir. Revísalos y
        vuelve a intentarlo.
      </p>
    );
  return (
    <div className="outcome outcome-error" role="alert">
      <h2>Revisa estos datos antes de continuar</h2>
      <ul>
        {violations.map((violation) => {
          const label = FIELD_LABELS[violation.field];
          return (
            <li key={`${violation.field}: ${violation.message}`}>
              {label ? (
                <a href={`#${fieldId(violation.field)}`}>{label}</a>
              ) : (
                violation.field
              )}
              : {violation.message}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
