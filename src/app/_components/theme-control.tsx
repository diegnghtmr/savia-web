"use client";

import { useState } from "react";
import {
  applyTheme,
  storedTheme,
  systemTheme,
  THEME_STORAGE_KEY,
  THEMES,
  type Theme,
} from "../theme";

export function ThemeControl() {
  const [theme, setTheme] = useState<Theme>(() =>
    typeof window === "undefined"
      ? THEMES.light
      : (storedTheme() ?? systemTheme()),
  );
  const next = theme === THEMES.dark ? THEMES.light : THEMES.dark;
  const select = () => {
    applyTheme(next);
    setTheme(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage is optional; the in-memory theme remains usable.
    }
  };
  return (
    <div className="theme-control" aria-live="polite">
      <span>Tema actual: {theme === THEMES.dark ? "oscuro" : "claro"}</span>
      <button type="button" onClick={select}>
        Usar tema {next === THEMES.dark ? "oscuro" : "claro"}
      </button>
    </div>
  );
}
