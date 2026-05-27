import { type HTMLAttributes, type JSX } from "react";

interface NarrativeMarkerProps extends HTMLAttributes<HTMLDivElement> {
  active?: boolean;
}

/**
 * NarrativeMarker component conforming to The Editorial Developer System guidelines.
 * Displays a vertical Amber line (2px) to the left of its children to indicate a focused storytelling point.
 */
export function NarrativeMarker({
  children,
  active = true,
  className = "",
  ...props
}: NarrativeMarkerProps): JSX.Element {
  return (
    <div
      className={`pl-4 border-l-2 ${
        active ? "border-[#E8A838]" : "border-black/[0.08] dark:border-white/[0.08]"
      } transition-colors duration-200 ease-out ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
