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

    root.classList.add("theme-transitioning");
    root.classList.remove("dark", "light");
    root.classList.add(newTheme);
    root.style.backgroundColor = newTheme === "light" ? "#F8F6F1" : "#0A0A0F";

    try {
      localStorage.setItem("cs-theme", newTheme);
    } catch {
      // localStorage may be unavailable in private or restricted contexts.
    }

    window.setTimeout((): void => {
      root.classList.remove("theme-transitioning");
    }, 220);

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

