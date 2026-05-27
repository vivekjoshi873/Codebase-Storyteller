import { type HTMLAttributes, type JSX } from "react";

interface CodeBlockProps extends HTMLAttributes<HTMLPreElement> {
  code: string;
  language?: string;
}

/**
 * CodeBlock component conforming to The Editorial Developer System guidelines.
 * Uses the deep background color (#0A0A0F or void mode) to create a recessed "sink" effect.
 * Always renders text in JetBrains Mono.
 */
export function CodeBlock({
  code,
  language,
  className = "",
  ...props
}: CodeBlockProps): JSX.Element {
  return (
    <pre
      className={`relative w-full overflow-x-auto rounded-lg px-4 py-3.5 bg-[#F8F6F1] dark:bg-[#0A0A0F] border border-black/[0.08] dark:border-white/[0.08] font-mono text-xs leading-relaxed text-[#4A4A58] dark:text-[#9B9BA8] transition-colors duration-200 ease-out ${className}`}
      {...props}
    >
      {language && (
        <span className="absolute top-2 right-2 eyebrow text-[8px] text-[#8A8A9A] dark:text-[#5A5A68]">
          {language}
        </span>
      )}
      <code className="block select-text font-mono whitespace-pre-wrap word-break-all">
        {code}
      </code>
    </pre>
  );
}
