import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Skeleton } from "./Skeleton";
import { EmptyState } from "./EmptyState";

export interface DataTableColumn<T> {
  key: string;
  header: string;
  sortable?: boolean;
  width?: number | string;
  align?: "left" | "right" | "center";
  render: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading = false,
  emptyTitle,
  emptyDescription,
  emptyAction,
  onRowClick,
  ariaLabel,
}: {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  onRowClick?: (row: T) => void;
  ariaLabel?: string;
}) {
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(
    null,
  );
  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    const column = columns.find((c) => c.key === sort.key);
    if (!column?.sortValue) return rows;
    const factor = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = column.sortValue!(a);
      const bv = column.sortValue!(b);
      if (av < bv) return -factor;
      if (av > bv) return factor;
      return 0;
    });
  }, [rows, sort, columns]);
  return (
    <div className="ui-table-wrap">
      <table className="ui-table" aria-label={ariaLabel}>
        <thead>
          <tr>
            {columns.map((column) => {
              const isSorted = sort?.key === column.key;
              return (
                <th
                  key={column.key}
                  style={{
                    width: column.width,
                    textAlign: column.align ?? "left",
                  }}
                  aria-sort={
                    isSorted
                      ? sort!.dir === "asc"
                        ? "ascending"
                        : "descending"
                      : column.sortable
                        ? "none"
                        : undefined
                  }
                >
                  {column.sortable ? (
                    <button
                      type="button"
                      className="ui-table-sort"
                      onClick={() =>
                        setSort((current) =>
                          current?.key === column.key
                            ? {
                                key: column.key,
                                dir: current.dir === "asc" ? "desc" : "asc",
                              }
                            : { key: column.key, dir: "asc" },
                        )
                      }
                    >
                      {column.header}
                      {isSorted ? (
                        sort!.dir === "asc" ? (
                          <ChevronUp size={13} />
                        ) : (
                          <ChevronDown size={13} />
                        )
                      ) : (
                        <ChevronDown size={13} className="ui-table-sort-idle" />
                      )}
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: 5 }, (_, i) => (
                <tr key={`skeleton-${i}`}>
                  {columns.map((column) => (
                    <td key={column.key}>
                      <Skeleton width="72%" height={14} />
                    </td>
                  ))}
                </tr>
              ))
            : sortedRows.map((row, index) => (
                <tr
                  key={rowKey(row, index)}
                  className={onRowClick ? "is-clickable" : ""}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      style={{ textAlign: column.align ?? "left" }}
                    >
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
        </tbody>
      </table>
      {!loading && rows.length === 0 && (
        <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
      )}
    </div>
  );
}
