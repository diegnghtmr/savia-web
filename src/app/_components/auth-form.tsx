"use client";

import { useActionState } from "react";
import { AUTH_RESULT_KINDS, type AuthResult } from "@/lib/auth-result";

/**
 * Signature for auth form actions compatible with useActionState.
 */
export type AuthFormAction = (
  previous: AuthResult | null,
  form: FormData,
) => Promise<AuthResult>;

export interface AuthFormProps {
  readonly mode: "sign-in" | "sign-up";
  readonly action: AuthFormAction;
}

/**
 * Client authentication form for sign-in and sign-up flows.
 */
export function AuthForm({ mode, action }: AuthFormProps) {
  const [result, submit, pending] = useActionState<AuthResult | null, FormData>(
    action,
    null,
  );

  const isSignIn = mode === "sign-in";

  return (
    <form action={submit} className="auth-form">
      {result && <Outcome result={result} />}

      <div className="field">
        <label htmlFor="auth-email">Correo electrónico</label>
        <input
          id="auth-email"
          name="email"
          type="email"
          maxLength={254}
          autoComplete="email"
          required
        />
      </div>

      <div className="field">
        <label htmlFor="auth-password">Contraseña</label>
        <input
          id="auth-password"
          name="password"
          type="password"
          autoComplete={isSignIn ? "current-password" : "new-password"}
          required
        />
      </div>

      <button className="submit" type="submit" disabled={pending}>
        {pending
          ? isSignIn
            ? "Iniciando sesión…"
            : "Creando cuenta…"
          : isSignIn
            ? "Iniciar sesión"
            : "Crear cuenta"}
      </button>
    </form>
  );
}

function Outcome({ result }: { result: AuthResult }) {
  switch (result.kind) {
    case AUTH_RESULT_KINDS.confirmationRequired:
      return (
        <p className="outcome outcome-success" role="status">
          Revisa tu correo electrónico para confirmar tu cuenta antes de iniciar
          sesión.
        </p>
      );
    case AUTH_RESULT_KINDS.signedIn:
      return (
        <p className="outcome outcome-success" role="status">
          Sesión iniciada.
        </p>
      );
    case AUTH_RESULT_KINDS.signedOut:
      return (
        <p className="outcome outcome-success" role="status">
          Sesión cerrada.
        </p>
      );
    case AUTH_RESULT_KINDS.invalidCredentials:
      return (
        <p className="outcome outcome-error" role="alert">
          Correo o contraseña incorrectos.
        </p>
      );
    case AUTH_RESULT_KINDS.userAlreadyExists:
      return (
        <p className="outcome outcome-error" role="alert">
          Ya existe una cuenta con este correo electrónico.
        </p>
      );
    case AUTH_RESULT_KINDS.weakPassword:
      return (
        <p className="outcome outcome-error" role="alert">
          La contraseña no cumple con los requisitos mínimos de seguridad.
        </p>
      );
    case AUTH_RESULT_KINDS.unavailable:
      return (
        <p className="outcome outcome-error" role="alert">
          El servicio de autenticación no está disponible en este momento.
          Vuelve a intentarlo más tarde.
        </p>
      );
    case AUTH_RESULT_KINDS.failed:
      return (
        <p className="outcome outcome-error" role="alert">
          No pudimos completar la solicitud. Vuelve a intentarlo.
        </p>
      );
  }
}
