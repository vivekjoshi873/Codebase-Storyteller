import { type HTMLAttributes, type JSX } from "react";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "active" | "success" | "warning" | "muted";
}

/**
 * Chip/Badge component conforming to The Editorial Developer System guidelines.
 * Pill-shaped, using JetBrains Mono at 10px.
 */
export function Badge({
  children,
  variant = "default",
  className = "",
  ...props
}: BadgeProps): JSX.Element {
  const baseStyle =
    "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-mono text-[10px] font-semibold tracking-wider uppercase select-none border";

  const variantStyles = {
    default:
      "bg-black/[0.04] dark:bg-white/[0.04] border-black/[0.08] dark:border-white/[0.08] text-[#4A4A58] dark:text-[#9B9BA8]",
    active:
      "bg-[#7C7CFA]/10 border-[#7C7CFA]/25 text-[#7C7CFA]",
    success:
      "bg-[#3DD68C]/10 border-[#3DD68C]/25 text-[#3DD68C] dark:text-[#3DD68C]",
    warning:
      "bg-[#E8A838]/10 border-[#E8A838]/25 text-[#E8A838]",
    muted:
      "bg-transparent border-black/[0.06] dark:border-white/[0.06] text-[#8A8A9A] dark:text-[#5A5A68]",
  };

  return (
    <span
      className={`${baseStyle} ${variantStyles[variant]} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}
