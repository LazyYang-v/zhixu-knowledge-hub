import type { HTMLAttributes, ReactElement, ReactNode } from "react";
import { cloneElement, isValidElement, useId } from "react";

export function Field({
  label,
  hint,
  error,
  required = false,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  htmlFor?: string;
  children: ReactNode;
}) {
  const generated = useId();
  const id = htmlFor ?? generated;
  const descriptionId = `${id}-description`;
  const control = isValidElement(children)
    ? cloneElement(children as ReactElement<HTMLAttributes<HTMLElement>>, {
        id,
        "aria-describedby": error || hint ? descriptionId : undefined,
        "aria-invalid": !!error,
      })
    : children;
  return (
    <div className="ui-field">
      <label htmlFor={id}>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      {control}
      {error ? (
        <span id={descriptionId} className="ui-field-error" role="alert">
          {error}
        </span>
      ) : (
        hint && (
          <span id={descriptionId} className="ui-field-hint">
            {hint}
          </span>
        )
      )}
    </div>
  );
}
