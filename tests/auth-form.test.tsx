import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  AuthForm,
  type AuthFormAction,
} from "../src/app/_components/auth-form";
import { AUTH_RESULT_KINDS, type AuthResult } from "../src/lib/auth-result";

function renderForm({
  mode = "sign-in",
  result,
}: {
  mode?: "sign-in" | "sign-up";
  result?: AuthResult | Promise<never>;
}) {
  const action = vi.fn<AuthFormAction>(async () =>
    result instanceof Promise
      ? await result
      : (result ?? { kind: AUTH_RESULT_KINDS.failed }),
  );
  render(<AuthForm mode={mode} action={action} />);
  return action;
}

function fillAndSubmit(buttonName: string) {
  fireEvent.change(screen.getByLabelText("Correo electrónico"), {
    target: { value: "tester@savia.test" },
  });
  fireEvent.change(screen.getByLabelText("Contraseña"), {
    target: { value: "SecretPass123!" },
  });
  fireEvent.click(screen.getByRole("button", { name: buttonName }));
}

describe("the auth form", () => {
  it("labels email and password fields and requires them", () => {
    renderForm({ mode: "sign-in" });

    expect(screen.getByLabelText("Correo electrónico")).toBeRequired();
    expect(screen.getByLabelText("Contraseña")).toBeRequired();
  });

  it("shows sign-in button text in sign-in mode", () => {
    renderForm({ mode: "sign-in" });
    expect(
      screen.getByRole("button", { name: "Iniciar sesión" }),
    ).toBeInTheDocument();
  });

  it("shows sign-up button text in sign-up mode", () => {
    renderForm({ mode: "sign-up" });
    expect(
      screen.getByRole("button", { name: "Crear cuenta" }),
    ).toBeInTheDocument();
  });

  it("hands email and password to the action", async () => {
    const action = renderForm({
      mode: "sign-in",
      result: { kind: AUTH_RESULT_KINDS.signedIn },
    });

    fillAndSubmit("Iniciar sesión");

    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    const form = action.mock.calls[0][1];
    expect(Object.fromEntries(form)).toEqual({
      email: "tester@savia.test",
      password: "SecretPass123!",
    });
  });

  it("announces email confirmation required as a status outcome (success path)", async () => {
    renderForm({
      mode: "sign-up",
      result: { kind: AUTH_RESULT_KINDS.confirmationRequired },
    });

    fillAndSubmit("Crear cuenta");

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("Revisa tu correo");
  });

  it("announces signedIn outcome as a status", async () => {
    renderForm({
      mode: "sign-in",
      result: { kind: AUTH_RESULT_KINDS.signedIn },
    });

    fillAndSubmit("Iniciar sesión");

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("Sesión iniciada");
  });

  it("announces signedOut outcome as a status", async () => {
    renderForm({
      mode: "sign-in",
      result: { kind: AUTH_RESULT_KINDS.signedOut },
    });

    fillAndSubmit("Iniciar sesión");

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("Sesión cerrada");
  });

  it.each([
    [AUTH_RESULT_KINDS.invalidCredentials, "Correo o contraseña incorrectos"],
    [
      AUTH_RESULT_KINDS.userAlreadyExists,
      "Ya existe una cuenta con este correo",
    ],
    [
      AUTH_RESULT_KINDS.weakPassword,
      "La contraseña no cumple con los requisitos mínimos",
    ],
    [
      AUTH_RESULT_KINDS.unavailable,
      "El servicio de autenticación no está disponible",
    ],
    [AUTH_RESULT_KINDS.failed, "No pudimos completar la solicitud"],
  ])("announces the %s outcome as an alert", async (kind, message) => {
    renderForm({
      mode: "sign-in",
      result: { kind } as AuthResult,
    });

    fillAndSubmit("Iniciar sesión");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(message);
  });

  it("blocks a second submission while the first is in flight", async () => {
    renderForm({
      mode: "sign-in",
      result: new Promise<never>(() => {}),
    });

    fillAndSubmit("Iniciar sesión");

    const button = await screen.findByRole("button", {
      name: "Iniciando sesión…",
    });
    expect(button).toBeDisabled();
  });
});
