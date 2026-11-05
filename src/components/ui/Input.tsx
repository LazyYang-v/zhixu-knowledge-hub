import { forwardRef } from "react";
import type { InputHTMLAttributes } from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  function Input({ invalid = false, className = "", ...props }, ref) {
    return (
      <input
        ref={ref}
        className={`ui-input ${invalid ? "is-invalid" : ""} ${className}`.trim()}
        aria-invalid={invalid || undefined}
        {...props}
      />
    );
  },
);
