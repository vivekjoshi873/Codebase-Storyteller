import { type HTMLAttributes, type JSX } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  subtitle?: string;
  headerAction?: JSX.Element;
}

/**
 * Card component conforming to The Editorial Developer System guidelines.
 * Surface stacking: card surface color, no shadows, 1px solid border, Inter semi-bold title.
 */
export function Card({
  children,
  title,
  subtitle,
  headerAction,
  className = "",
  ...props
}: CardProps): JSX.Element {
  return (
    <div
      className={`bg-[#ECEAE2] dark:bg-[#18181F] border border-black/[0.08] dark:border-white/[0.08] rounded-xl overflow-hidden transition-colors duration-200 ease-out ${className}`}
      {...props}
    >
      {(title || subtitle || headerAction) && (
        <div className="flex items-center justify-between px-5 py-4 border-b border-black/[0.06] dark:border-white/[0.06] bg-black/[0.02] dark:bg-white/[0.01]">
          <div className="flex flex-col gap-0.5">
            {title && (
              <h3 className="text-sm font-semibold text-[#0F0F12] dark:text-[#F2F2F4] font-sans">
                {title}
              </h3>
            )}
            {subtitle && (
              <span className="text-[11px] text-[#8A8A9A] dark:text-[#5A5A68] font-mono leading-none">
                {subtitle}
              </span>
            )}
          </div>
          {headerAction && <div className="flex items-center">{headerAction}</div>}
        </div>
      )}
      <div className="px-5 py-4 text-sm text-[#4A4A58] dark:text-[#9B9BA8] leading-relaxed">
        {children}
      </div>
    </div>
  );
}
