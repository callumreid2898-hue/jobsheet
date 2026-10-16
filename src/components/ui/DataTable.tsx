import { useState, useMemo, type ReactNode } from 'react';

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
  sortable?: boolean;
  getValue?: (row: T) => string | number;
}

interface DataTableProps<T extends { id: string }> {
  columns: Column<T>[];
  data: T[];
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
  actions?: (row: T) => ReactNode;
  filterPlaceholder?: string;
  filterFn?: (row: T, query: string) => boolean;
  pageSize?: number;
}

export function DataTable<T extends { id: string }>({
  columns,
  data,
  emptyMessage = 'No records found.',
  onRowClick,
  actions,
  filterPlaceholder = 'Search…',
  filterFn,
  pageSize = 25,
}: DataTableProps<T>) {
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    if (!query.trim() || !filterFn) return data;
    return data.filter(row => filterFn(row, query.toLowerCase()));
  }, [data, query, filterFn]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const col = columns.find(c => c.key === sortKey);
    if (!col?.getValue) return filtered;
    return [...filtered].sort((a, b) => {
      const av = col.getValue!(a);
      const bv = col.getValue!(b);
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir, columns]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const pageData = sorted.slice(page * pageSize, (page + 1) * pageSize);

  function toggleSort(key: string) {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
    setPage(0);
  }

  function exportCSV() {
    const headers = columns.map(c => c.header).join(',');
    const rows = sorted.map(row =>
      columns.map(c => {
        const val = c.getValue ? c.getValue(row) : '';
        return `"${String(val).replace(/"/g, '""')}"`;
      }).join(',')
    );
    const csv = [headers, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'export.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2">
        {filterFn && (
          <input
            type="search"
            value={query}
            onChange={e => { setQuery(e.target.value); setPage(0); }}
            placeholder={filterPlaceholder}
            className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0D3349]/30"
          />
        )}
        <button
          onClick={exportCSV}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          CSV
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                {columns.map(col => (
                  <th
                    key={col.key}
                    className={`text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wide whitespace-nowrap ${col.sortable ? 'cursor-pointer select-none hover:text-slate-900' : ''}`}
                    onClick={col.sortable ? () => toggleSort(col.key) : undefined}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.header}
                      {col.sortable && sortKey === col.key && (
                        <span>{sortDir === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </span>
                  </th>
                ))}
                {actions && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody>
              {pageData.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + (actions ? 1 : 0)} className="text-center py-12 text-slate-400 text-sm">
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                pageData.map(row => (
                  <tr
                    key={row.id}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={`border-b border-slate-100 last:border-0 ${onRowClick ? 'cursor-pointer hover:bg-slate-50' : ''}`}
                  >
                    {columns.map(col => (
                      <td key={col.key} className="px-4 py-3 text-slate-700">
                        {col.render ? col.render(row) : (col.getValue ? String(col.getValue(row)) : '')}
                      </td>
                    ))}
                    {actions && (
                      <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                        {actions(row)}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>{sorted.length} records</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-2 py-1 rounded hover:bg-slate-100 disabled:opacity-40"
            >
              ←
            </button>
            <span>{page + 1} / {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="px-2 py-1 rounded hover:bg-slate-100 disabled:opacity-40"
            >
              →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
