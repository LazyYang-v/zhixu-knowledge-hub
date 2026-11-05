import { forwardRef } from "react";
import type { SelectHTMLAttributes } from "react";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  function Select({ invalid = false, className = "", children, ...props }, ref) {
    return (
      <select
        ref={ref}
        className={`ui-select ${invalid ? "is-invalid" : ""} ${className}`.trim()}
        aria-invalid={invalid || undefined}
        {...props}
      >
        {children}
      </select>
    );
  },
);
