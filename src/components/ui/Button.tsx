import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "sm" | "md";
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "primary",
      size = "md",
      loading = false,
      icon,
      className = "",
      children,
      disabled,
      type = "button",
      ...props
    },
    ref,
  ) {
    const classes = [
      "ui-btn",
      `ui-btn-${variant}`,
      size === "sm" ? "ui-btn-sm" : "",
      className,
    ]
      .filter(Boolean)
      .join(" ");
    return (
      <button
        ref={ref}
        type={type}
        className={classes}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading ? (
          <span className="ui-btn-spinner" aria-hidden="true" />
        ) : (
          icon
        )}
        {children}
      </button>
    );
  },
);
