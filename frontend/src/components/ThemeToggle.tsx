import { useCallback, useEffect, useRef, useState, type JSX } from "react";
import { useTheme } from "@/hooks/useTheme";

const MoonIcon = ({ className }: { className?: string }): JSX.Element => (
  <svg viewBox="0 0 16 16" fill="currentColor" className={className} aria-hidden="true">
    <path d="M12.3 10.9c-3.5 0-6.3-2.8-6.3-6.3 0-1 .3-2 .7-2.8C3.8 2.8 2 5.2 2 8c0 3.3 2.7 6 6 6 2.8 0 5.2-1.8 6.2-4.3-.6.1-1.2.2-1.9.2z" />
  </svg>
);

const SunIcon = ({ className }: { className?: string }): JSX.Element => (
  <svg viewBox="0 0 16 16" fill="currentColor" className={className} aria-hidden="true">
    <circle cx="8" cy="8" r="3.5" />
    <path
      d="M8 1.5v1.2M8 13.3v1.2M1.5 8h1.2M13.3 8h1.2M3.5 3.5l.85.85M11.65 11.65l.85.85M3.5 12.5l.85-.85M11.65 4.35l.85-.85"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      fill="none"
    />
  </svg>
);

interface ThemeToggleProps {
  className?: string;
}

const ThemeToggle = ({ className = "" }: ThemeToggleProps): JSX.Element => {
  const { isDark, toggle } = useTheme();
  const [isAnimating, setIsAnimating] = useState<boolean>(false);
  const [rippleActive, setRippleActive] = useState<boolean>(false);
  const animationTimerRef = useRef<number | null>(null);
  const rippleTimerRef = useRef<number | null>(null);

  useEffect((): (() => void) => {
    return (): void => {
      if (animationTimerRef.current !== null) window.clearTimeout(animationTimerRef.current);
      if (rippleTimerRef.current !== null) window.clearTimeout(rippleTimerRef.current);
    };
  }, []);

  const handleToggle = useCallback((): void => {
    if (isAnimating) return;

    setIsAnimating(true);
    setRippleActive(true);
    toggle();

    animationTimerRef.current = window.setTimeout((): void => setIsAnimating(false), 400);
    rippleTimerRef.current = window.setTimeout((): void => setRippleActive(false), 700);
  }, [isAnimating, toggle]);

  return (
    <div className={`relative ${className}`}>
      {rippleActive && (
        <span
          className="absolute inset-0 rounded-full pointer-events-none animate-theme-ripple"
          style={{
            background: isDark ? "rgba(248,246,241,0.15)" : "rgba(10,10,15,0.12)",
            transformOrigin: "center",
          }}
        />
      )}

      <button
        type="button"
        onClick={handleToggle}
        disabled={isAnimating}
        aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
        aria-pressed={!isDark}
        className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-full border select-none overflow-hidden bg-[#E5E2D8] dark:bg-[#18181F] border-black/[0.08] dark:border-white/[0.08] text-[#4A4A58] dark:text-[#9B9BA8] hover:border-black/[0.14] dark:hover:border-white/[0.14] hover:text-[#0F0F12] dark:hover:text-[#F2F2F4] focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-[#F2EFE8] dark:focus-visible:ring-offset-[#0A0A0F] transition-all duration-200 ease-out disabled:cursor-wait"
      >
        <span
          className={`relative z-10 w-3.5 h-3.5 flex items-center justify-center transition-all duration-200 ease-out ${
            isDark ? "text-accent opacity-100" : "text-[#8A8A9A] dark:text-[#5A5A68] opacity-45"
          }`}
        >
          <MoonIcon className={`w-3.5 h-3.5 ${!isDark && isAnimating ? "animate-moon-swing" : ""}`} />
        </span>

        <span
          className={`absolute z-0 w-5 h-5 rounded-full border shadow-float-sm transition-all duration-200 ease-out ${
            isDark
              ? "left-1.5 bg-[#18181F] border-white/[0.14]"
              : "left-7 bg-[#F8F6F1] border-black/[0.14]"
          }`}
          style={{ top: "50%", transform: "translateY(-50%)" }}
        />

        <span
          className={`relative z-10 w-3.5 h-3.5 flex items-center justify-center transition-all duration-200 ease-out ${
            !isDark ? "text-accent opacity-100" : "text-[#8A8A9A] dark:text-[#5A5A68] opacity-45"
          }`}
        >
          <SunIcon className={`w-3.5 h-3.5 ${isDark && isAnimating ? "animate-sun-ray" : ""}`} />
        </span>

        <span className="sr-only">{isDark ? "Dark mode active" : "Light mode active"}</span>
      </button>
    </div>
  );
};

export default ThemeToggle;

