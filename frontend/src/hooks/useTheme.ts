import { useCallback, useEffect, useState } from "react";

type Theme = "dark" | "light";

interface ThemeChangeDetail {
  theme: Theme;
}

interface UseThemeReturn {
  theme: Theme;
  isDark: boolean;
  isLight: boolean;
  toggle: () => void;
  setTheme: (theme: Theme) => void;
}

const THEME_EVENT = "cs-theme-change";

const getInitialTheme = (): Theme => {
  if (typeof window === "undefined") return "dark";
  return document.documentElement.classList.contains("light") ? "light" : "dark";
};

const dispatchThemeChange = (theme: Theme): void => {
  window.dispatchEvent(new CustomEvent<ThemeChangeDetail>(THEME_EVENT, { detail: { theme } }));
};

export function useTheme(): UseThemeReturn {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);

  const applyTheme = useCallback((newTheme: Theme): void => {
    const root = document.documentElement;

    // Single atomic class swap — the CSS custom property transition on :root
    // handles the smooth animated handoff without touching individual elements.
    root.classList.remove("dark", "light");
    root.classList.add(newTheme);

    try {
      localStorage.setItem("cs-theme", newTheme);
    } catch {
      // localStorage may be unavailable in private or restricted contexts.
    }

    setThemeState(newTheme);
    dispatchThemeChange(newTheme);
  }, []);

  const toggle = useCallback((): void => {
    applyTheme(theme === "dark" ? "light" : "dark");
  }, [theme, applyTheme]);

  const setTheme = useCallback((newTheme: Theme): void => {
    applyTheme(newTheme);
  }, [applyTheme]);

  useEffect((): (() => void) => {
    const handleThemeChange = (event: Event): void => {
      const customEvent = event as CustomEvent<ThemeChangeDetail>;
      setThemeState(customEvent.detail.theme);
    };

    window.addEventListener(THEME_EVENT, handleThemeChange);
    return (): void => window.removeEventListener(THEME_EVENT, handleThemeChange);
  }, []);

  useEffect((): (() => void) | void => {
    const stored = localStorage.getItem("cs-theme");
    if (stored) return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (event: MediaQueryListEvent): void => {
      applyTheme(event.matches ? "dark" : "light");
    };

    mediaQuery.addEventListener("change", handleChange);
    return (): void => mediaQuery.removeEventListener("change", handleChange);
  }, [applyTheme]);

  return {
    theme,
    isDark: theme === "dark",
    isLight: theme === "light",
    toggle,
    setTheme,
  };
}

