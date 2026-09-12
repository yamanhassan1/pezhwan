import type { ReactNode } from 'react';

export interface DataTableColumn {
  key: string;
  label: string;
  render?: (row: Record<string, unknown> & { id?: string }) => ReactNode;
  width?: string;
}

interface DataTableProps<T> {
  columns: Array<
    | {
        key: string;
        label: string;
        render?: (row: T) => ReactNode;
        width?: string;
      }
    | undefined
  >;
  rows: T[];
  rowKey?: (row: T) => string;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
}

export default function DataTable<T extends object>({ columns, rows, rowKey, onRowClick, emptyMessage = 'No records found' }: DataTableProps<T>) {
  if (rows.length === 0) {
    return <div className="empty-state">{emptyMessage}</div>;
  }

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {columns.map((col) =>
              col ? (
                <th key={col.key} style={col.width ? { width: col.width } : undefined}>
                  {col.label}
                </th>
              ) : null,
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const key = rowKey
              ? rowKey(row)
              : (row as Record<string, unknown>)['id']?.toString() ?? String(i);
            return (
              <tr
                key={key}
                onClick={() => onRowClick?.(row)}
                style={onRowClick ? { cursor: 'pointer' } : undefined}
              >
                {columns.map((col) =>
                  col ? (
                    <td key={col.key}>{col.render ? col.render(row) : String((row as Record<string, unknown>)[col.key] ?? '')}</td>
                  ) : null,
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}