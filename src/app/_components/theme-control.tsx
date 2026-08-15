"use client";

import { useEffect, useState } from "react";
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
  // The document is painted before React arrives, by the inline script in the
  // layout — but React then reconciles `<html>` against markup that carries no
  // `data-theme` and takes the attribute back off, which handed a reader who
  // asked their system for a dark interface the light one instead. Owning the
  // attribute here makes it a function of the state that decides it, so it is
  // restored the moment this control mounts and stays true afterwards.
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);
  const next = theme === THEMES.dark ? THEMES.light : THEMES.dark;
  const select = () => {
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
