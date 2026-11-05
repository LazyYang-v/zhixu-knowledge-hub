export function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      className="toggle-label"
      onClick={onChange}
      role="switch"
      aria-checked={checked}
      aria-label={label}
    >
      <span>{label}</span>
      <span className={`switch ${checked ? "on" : ""}`}>
        <i />
      </span>
    </button>
  );
}
