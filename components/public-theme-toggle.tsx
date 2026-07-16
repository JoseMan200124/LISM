"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

type ResolvedTheme = "light" | "dark";

function readTheme(): ResolvedTheme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function PublicThemeToggle({ className = "" }: Readonly<{ className?: string }>) {
  const [theme, setTheme] = useState<ResolvedTheme>("light");

  useEffect(() => {
    setTheme(readTheme());
  }, []);

  function toggleTheme() {
    const nextTheme: ResolvedTheme = readTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = nextTheme;
    document.documentElement.dataset.themePreference = nextTheme;
    window.localStorage.setItem("nexalab.theme", nextTheme);
    setTheme(nextTheme);
  }

  const dark = theme === "dark";

  return (
    <button
      type="button"
      className={`public-theme-toggle ${className}`.trim()}
      onClick={toggleTheme}
      aria-label={dark ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
      title={dark ? "Usar tema claro" : "Usar tema oscuro"}
    >
      {dark ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
      <span className="sr-only">{dark ? "Tema claro" : "Tema oscuro"}</span>
    </button>
  );
}
