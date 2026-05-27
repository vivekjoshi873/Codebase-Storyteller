import {
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
  type JSX,
  forwardRef,
  useId,
} from "react";

interface BaseProps {
  label?: string;
  error?: string;
}

export type InputProps = InputHTMLAttributes<HTMLInputElement> &
  BaseProps & {
    multiline?: false;
  };

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> &
  BaseProps & {
    multiline: true;
  };

/**
 * Reusable Input/Textarea component conforming to The Editorial Developer System guidelines.
 * Features a flat, card-level background, 1px border, Indigo focus ring, and JetBrains Mono input text.
 * Associated with a semantic label using React's useId for full accessibility.
 */
export const Input = forwardRef<
  HTMLInputElement | HTMLTextAreaElement,
  InputProps | TextareaProps
>(function Input(props, ref) {
  const {
    label,
    error,
    multiline = false,
    className = "",
    ...rest
  } = props;

  const generatedId = useId();
  const inputId = rest.id || generatedId;

  const baseStyles =
    "w-full bg-black/[0.04] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.08] rounded-lg px-4 py-3 text-sm text-[#0F0F12] dark:text-[#F2F2F4] placeholder:text-[#8A8A9A] dark:placeholder:text-[#5A5A68] placeholder:font-sans font-mono outline-none focus:border-[#7C7CFA] focus:ring-1 focus:ring-[#7C7CFA] disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150 ease-out";

  return (
    <div className="w-full flex flex-col gap-1.5">
      {label && (
        <label
          htmlFor={inputId}
          className="eyebrow text-left text-[#8A8A9A] dark:text-[#5A5A68] cursor-text"
        >
          {label}
        </label>
      )}

      {multiline ? (
        <textarea
          ref={ref as React.ForwardedRef<HTMLTextAreaElement>}
          id={inputId}
          className={`${baseStyles} resize-y ${className}`}
          {...(rest as TextareaHTMLAttributes<HTMLTextAreaElement>)}
        />
      ) : (
        <input
          ref={ref as React.ForwardedRef<HTMLInputElement>}
          id={inputId}
          className={`${baseStyles} ${className}`}
          {...(rest as InputHTMLAttributes<HTMLInputElement>)}
        />
      )}

      {error && (
        <span className="font-mono text-xs text-red-500 text-left mt-0.5">
          {error}
        </span>
      )}
    </div>
  );
});
