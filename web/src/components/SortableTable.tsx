import { useMemo, useState } from 'react';

export interface Column<T> {
  key: string;
  label: string;
  accessor: (row: T) => string | number | null;
  render?: (row: T) => React.ReactNode;
  align?: 'left' | 'right';
  cellStyle?: (row: T) => React.CSSProperties | undefined;
  // Columns sharing the same group render under one spanning header cell above their
  // own labels (e.g. "How much Car" over Score + Yrs/MSRP). Only adjacent columns with
  // the same group are merged, so keep grouped columns next to each other in the array.
  group?: string;
}

interface Props<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  onRowClick?: (row: T) => void;
  defaultSortKey?: string;
  defaultSortDir?: 'asc' | 'desc';
  emptyMessage?: string;
}

export function SortableTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  defaultSortKey,
  defaultSortDir = 'asc',
  emptyMessage = 'Nothing here yet.',
}: Props<T>) {
  const [sortKey, setSortKey] = useState<string | undefined>(defaultSortKey);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(defaultSortDir);

  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    const col = columns.find((c) => c.key === sortKey);
    if (!col) return rows;
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = col.accessor(a);
      const bv = col.accessor(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return av - bv;
      return String(av).localeCompare(String(bv));
    });
    if (sortDir === 'desc') copy.reverse();
    return copy;
  }, [rows, sortKey, sortDir, columns]);

  function toggleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  if (rows.length === 0) {
    return <div className="empty-state">{emptyMessage}</div>;
  }

  const hasGroups = columns.some((c) => c.group);

  function sortLabel(col: Column<T>) {
    return (
      <>
        {col.label}
        {sortKey === col.key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
      </>
    );
  }

  return (
    <div className="table-wrap">
      <table className="sortable-table">
        <thead>
          {hasGroups && (
            <tr>
              {columns.map((col, i) => {
                if (col.group) {
                  if (columns[i - 1]?.group === col.group) return null; // merged into the colSpan cell before it
                  let span = 1;
                  while (columns[i + span]?.group === col.group) span += 1;
                  return (
                    <th key={col.key} colSpan={span} className="group-header">
                      {col.group}
                    </th>
                  );
                }
                return (
                  <th
                    key={col.key}
                    rowSpan={2}
                    className={col.align === 'right' ? 'align-right' : undefined}
                    onClick={() => toggleSort(col.key)}
                  >
                    {sortLabel(col)}
                  </th>
                );
              })}
            </tr>
          )}
          <tr>
            {columns.map((col) => {
              if (hasGroups && !col.group) return null; // already rendered with rowSpan above
              return (
                <th
                  key={col.key}
                  className={col.align === 'right' ? 'align-right' : undefined}
                  onClick={() => toggleSort(col.key)}
                >
                  {sortLabel(col)}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={rowKey(row)} onClick={() => onRowClick?.(row)} className={onRowClick ? 'clickable' : undefined}>
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={col.align === 'right' ? 'align-right' : undefined}
                  style={col.cellStyle?.(row)}
                >
                  {col.render ? col.render(row) : col.accessor(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
