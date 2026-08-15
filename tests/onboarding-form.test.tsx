import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  OnboardingForm,
  type OnboardingFormAction,
} from "../src/app/_components/onboarding-form";
import {
  ONBOARDING_RESULT_KINDS,
  type OnboardingResult,
} from "../src/lib/onboarding-result";

const answers: Record<string, string> = {
  "Correo electrónico": "ana@savia.test",
  "Nombre para mostrar": "Ana",
  "Nombre del espacio": "Casa",
  "Moneda base del espacio": "COP",
  "Idioma y región": "es-CO",
  País: "CO",
  "Zona horaria": "America/Bogota",
  "Formato de fecha": "DD/MM/YYYY",
  "La semana empieza en": "1",
  "Formato de números": "1.234,56",
  "Moneda que usas por defecto": "COP",
};

function renderForm(result: OnboardingResult | Promise<never>) {
  const action = vi.fn<OnboardingFormAction>(async () =>
    result instanceof Promise ? await result : result,
  );
  render(<OnboardingForm action={action} />);
  return action;
}

function fillAndSubmit() {
  for (const [label, value] of Object.entries(answers))
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: "Crear mi espacio" }));
}

describe("the onboarding form", () => {
  it("labels every field the contract requires and mirrors its constraints", () => {
    renderForm({ kind: ONBOARDING_RESULT_KINDS.failed });

    for (const label of Object.keys(answers))
      expect(screen.getByLabelText(label)).toBeRequired();
    expect(screen.getByLabelText("Correo electrónico")).toHaveAttribute(
      "maxLength",
      "254",
    );
    expect(screen.getByLabelText("Nombre para mostrar")).toHaveAttribute(
      "maxLength",
      "120",
    );
    expect(screen.getByLabelText("País")).toHaveAttribute(
      "pattern",
      "[A-Za-z]{2}",
    );
    expect(screen.getByLabelText("Moneda base del espacio")).toHaveAttribute(
      "pattern",
      "[A-Za-z]{3}",
    );
    // Privacy mode is the one optional field in the schema.
    expect(
      screen.getByLabelText("Ocultar los importes al abrir Savia"),
    ).not.toBeRequired();
  });

  it("attaches each hint to the field it explains", () => {
    renderForm({ kind: ONBOARDING_RESULT_KINDS.failed });

    expect(
      screen.getByLabelText("Correo electrónico"),
    ).toHaveAccessibleDescription("Lo usamos para identificarte.");
    expect(screen.getByLabelText("País")).toHaveAccessibleDescription(
      "Código de dos letras, como CO.",
    );
    // A field with nothing to explain must not point at a description that is
    // not there.
    expect(screen.getByLabelText("Formato de fecha")).not.toHaveAttribute(
      "aria-describedby",
    );
  });

  it("hands the submission to the action as the backend spells it", async () => {
    const action = renderForm({ kind: ONBOARDING_RESULT_KINDS.failed });

    fillAndSubmit();

    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    const form = action.mock.calls[0][1];
    expect(Object.fromEntries(form)).toEqual({
      email: "ana@savia.test",
      displayName: "Ana",
      workspaceName: "Casa",
      baseCurrency: "COP",
      locale: "es-CO",
      countryCode: "CO",
      timezone: "America/Bogota",
      dateFormat: "DD/MM/YYYY",
      weekStartsOn: "1",
      numberFormat: "1.234,56",
      defaultCurrency: "COP",
    });
  });

  it("announces a created workspace", async () => {
    renderForm({
      kind: ONBOARDING_RESULT_KINDS.created,
      aggregate: { profileId: "p-1", workspaceId: "w-1" },
    });

    fillAndSubmit();

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("Tu espacio quedó creado");
    expect(status).toHaveTextContent("w-1");
  });

  it("does not claim new work when the backend replayed an earlier request", async () => {
    renderForm({
      kind: ONBOARDING_RESULT_KINDS.replayed,
      aggregate: { profileId: "p-1", workspaceId: "w-1" },
    });

    fillAndSubmit();

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Tu espacio ya estaba creado",
    );
  });

  it("names the field each backend violation belongs to", async () => {
    renderForm({
      kind: ONBOARDING_RESULT_KINDS.invalid,
      violations: [
        { field: "email", message: "must be a valid email address" },
        { field: "weekStartsOn", message: "must be between 0 and 6" },
      ],
    });

    fillAndSubmit();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Correo electrónico");
    expect(alert).toHaveTextContent("must be a valid email address");
    expect(alert).toHaveTextContent("La semana empieza en");
    expect(
      screen.getByRole("link", { name: /Correo electrónico/ }),
    ).toHaveAttribute("href", "#onboarding-email");
  });

  it("reports a violation about a field it cannot name without inventing one", async () => {
    renderForm({
      kind: ONBOARDING_RESULT_KINDS.invalid,
      violations: [{ field: "subject", message: "must be a valid UUID" }],
    });

    fillAndSubmit();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("subject");
    expect(alert).toHaveTextContent("must be a valid UUID");
    expect(screen.queryByRole("link", { name: /subject/ })).toBeNull();
  });

  it("admits it when the rejection named no field at all", async () => {
    renderForm({ kind: ONBOARDING_RESULT_KINDS.invalid, violations: [] });

    fillAndSubmit();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "no dijo qué dato corregir",
    );
  });

  it("states the delay the backend gave, and stays silent when it gave none", async () => {
    renderForm({
      kind: ONBOARDING_RESULT_KINDS.retryable,
      retryAfterSeconds: 30,
    });

    fillAndSubmit();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Vuelve a intentarlo en 30 segundos",
    );
  });

  it("invents no delay when the backend stated none", async () => {
    renderForm({
      kind: ONBOARDING_RESULT_KINDS.retryable,
      retryAfterSeconds: null,
    });

    fillAndSubmit();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Vuelve a intentarlo en un momento");
    expect(alert.textContent).not.toMatch(/\d+\s*segundos/);
  });

  it.each([
    [ONBOARDING_RESULT_KINDS.unauthenticated, "Tu sesión no está activa"],
    [ONBOARDING_RESULT_KINDS.conflict, "Ya existe un espacio"],
    [ONBOARDING_RESULT_KINDS.failed, "No pudimos crear tu espacio"],
  ])("announces the %s outcome", async (kind, message) => {
    renderForm({ kind } as OnboardingResult);

    fillAndSubmit();

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
  });

  it("blocks a second submission while the first is still in flight", async () => {
    renderForm(new Promise<never>(() => {}));

    fillAndSubmit();

    const button = await screen.findByRole("button", {
      name: "Creando tu espacio…",
    });
    expect(button).toBeDisabled();
  });
});
