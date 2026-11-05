export interface TabItem<T extends string> {
  id: T;
  label: string;
  count?: number;
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  ariaLabel,
}: {
  tabs: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div className="ui-tabs" role="tablist" aria-label={ariaLabel}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          type="button"
          aria-selected={value === tab.id}
          className="ui-tab"
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
          {typeof tab.count === "number" && (
            <span className="ui-tab-count">{tab.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}
