import { type HTMLAttributes, type JSX, type LiHTMLAttributes, type KeyboardEvent, type MouseEvent } from "react";

interface ListProps extends HTMLAttributes<HTMLUListElement> {
  divided?: boolean;
}

/**
 * List wrapper component conforming to The Editorial Developer System list guidelines.
 */
export function List({
  children,
  divided = true,
  className = "",
  ...props
}: ListProps): JSX.Element {
  return (
    <ul
      className={`flex flex-col w-full list-none p-0 m-0 ${
        divided ? "divide-y divide-black/[0.08] dark:divide-white/[0.08]" : ""
      } ${className}`}
      {...props}
    >
      {children}
    </ul>
  );
}

interface ListItemProps extends LiHTMLAttributes<HTMLLIElement> {
  interactive?: boolean;
}

/**
 * ListItem component with instant hover background states, divider options, and robust accessibility structure.
 * When interactive, it automatically applies button ARIA role, focus tab-index, and Enter/Space keyboard selection.
 */
export function ListItem({
  children,
  interactive = false,
  className = "",
  ...props
}: ListItemProps): JSX.Element {
  const baseStyle =
    "px-4 py-3 flex items-center justify-between text-sm transition-colors duration-0 focus-visible:outline-none focus-visible:bg-black/[0.04] dark:focus-visible:bg-white/[0.03] focus-visible:ring-1 focus-visible:ring-[#7C7CFA]/50 rounded-lg";
  const interactiveStyle = interactive
    ? "cursor-pointer bg-transparent hover:bg-black/[0.04] dark:hover:bg-white/[0.03] text-[#4A4A58] dark:text-[#9B9BA8] hover:text-[#0F0F12] dark:hover:text-[#F2F2F4] active:bg-black/[0.08] dark:active:bg-white/[0.06]"
    : "text-[#0F0F12] dark:text-[#F2F2F4]";

  const handleKeyDown = (event: KeyboardEvent<HTMLLIElement>): void => {
    if (interactive && props.onClick && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      // Cast the keyboard event to a standard mouse event for click handlers
      props.onClick(event as unknown as MouseEvent<HTMLLIElement>);
    }
    if (props.onKeyDown) {
      props.onKeyDown(event);
    }
  };

  return (
    <li
      className={`${baseStyle} ${interactiveStyle} ${className}`}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={handleKeyDown}
      {...props}
    >
      {children}
    </li>
  );
}
