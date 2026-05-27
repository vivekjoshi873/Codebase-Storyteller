import { type ButtonHTMLAttributes, type JSX } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary";
  fullWidth?: boolean;
}

/**
 * Standard Button component conforming to The Editorial Developer System guidelines.
 * Primary: Solid Amber background with dark text.
 * Secondary: Transparent background with a 1px border.
 * Focus State: 2px Indigo focus ring.
 */
export function Button({
  children,
  variant = "primary",
  fullWidth = false,
  className = "",
  type = "button",
  ...props
}: ButtonProps): JSX.Element {
  const baseStyle =
    "inline-flex items-center justify-center px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ease-out select-none active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C7CFA] focus-visible:ring-offset-2 focus-visible:ring-offset-[#F2EFE8] dark:focus-visible:ring-offset-[#0A0A0F]";

  const variantStyles = {
    primary:
      "bg-[#E8A838] hover:bg-[#E8A838]/95 active:bg-[#E8A838]/90 text-[#120D07] font-semibold border border-transparent shadow-sm",
    secondary:
      "bg-transparent border border-black/[0.08] dark:border-white/[0.08] hover:border-black/[0.14] dark:hover:border-white/[0.14] hover:bg-black/[0.04] dark:hover:bg-white/[0.04] text-[#4A4A58] dark:text-[#9B9BA8] hover:text-[#0F0F12] dark:hover:text-[#F2F2F4]",
  };

  const widthStyle = fullWidth ? "w-full" : "";

  return (
    <button
      type={type}
      className={`${baseStyle} ${variantStyles[variant]} ${widthStyle} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
