'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { WalletConnectControl } from '../../components/WalletConnectControl';
import { Button } from '../../components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/Dialog';
import { useSession } from '../../components/providers/SessionProvider';
import { getAppServerBaseUrl } from '../../lib/server-url';

type TableInfo = {
  schema: string;
  name: string;
  type: string;
};

type TableColumn = {
  name: string;
  dataType: string;
  isNullable: boolean;
  hasDefault: boolean;
  ordinalPosition: number;
  isSensitive: boolean;
  isSortable: boolean;
};

type TablePagination = {
  limit: number;
  offset: number;
  total: number | null;
  totalRaw: unknown;
  orderBy: string | null;
  orderDirection: 'asc' | 'desc';
};

type TableResponse = {
  schema: string;
  table: string;
  columns: TableColumn[];
  rows: Record<string, unknown>[];
  pagination: TablePagination;
};

type FetchTableOptions = {
  schema: string;
  table: string;
  limit?: number;
  offset?: number;
  orderBy?: string | null;
  orderDirection?: 'asc' | 'desc';
};

const DEFAULT_PAGE_SIZE = 25;

const formatAddress = (address: string | null) => {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

const formatCellValue = (value: unknown, column: TableColumn): string => {
  if (value === null || value === undefined) {
    return '—';
  }

  if (column.isSensitive) {
    if (typeof value === 'string' && value.includes('*')) {
      return '••••••••';
    }
    return '••••••••';
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'object') {
    try {
      const stringified = JSON.stringify(value);
      if (!stringified) {
        return '[object]';
      }
      return stringified.length > 120
        ? `${stringified.slice(0, 117)}...`
        : stringified;
    } catch {
      return '[object]';
    }
  }

  const stringValue = String(value);
  if (stringValue.length > 160) {
    return `${stringValue.slice(0, 157)}...`;
  }
  return stringValue || '—';
};

export default function AdminPageClient() {
  const {
    isWalletConnected,
    walletAddress,
    hasValidSession,
    isSessionVerified,
    disconnectWallet,
  } = useSession();

  const serverBaseUrl = useMemo(() => getAppServerBaseUrl(), []);

  const [tables, setTables] = useState<TableInfo[]>([]);
  const [tablesLoading, setTablesLoading] = useState(false);
  const [tablesError, setTablesError] = useState<string | null>(null);
  const [selectedSchema, setSelectedSchema] = useState<string | null>(null);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [tableData, setTableData] = useState<TableResponse | null>(null);
  const [tableLoading, setTableLoading] = useState(false);
  const [tableError, setTableError] = useState<string | null>(null);
  const [adminAddress, setAdminAddress] = useState<string | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [selectedRow, setSelectedRow] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [isRowDialogOpen, setIsRowDialogOpen] = useState(false);

  const tablesBySchema = useMemo(() => {
    const grouped = new Map<string, TableInfo[]>();
    for (const entry of tables) {
      if (!grouped.has(entry.schema)) {
        grouped.set(entry.schema, []);
      }
      grouped.get(entry.schema)!.push(entry);
    }
    return Array.from(grouped.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([schema, entries]) => ({
        schema,
        tables: entries.sort((a, b) => a.name.localeCompare(b.name)),
      }));
  }, [tables]);

  const fetchTables = useCallback(async () => {
    setTablesLoading(true);
    setTablesError(null);
    setUnauthorized(false);
    setForbidden(false);

    try {
      const response = await fetch(`${serverBaseUrl}/api/admin/db/tables`, {
        credentials: 'include',
      });

      if (response.status === 401) {
        setUnauthorized(true);
        setAdminAddress(null);
        setTables([]);
        return [];
      }

      if (response.status === 403) {
        setForbidden(true);
        setAdminAddress(null);
        setTables([]);
        return [];
      }

      if (!response.ok) {
        const errorMessage = await response
          .json()
          .catch(() => ({ error: 'Failed to load tables' }));
        setTablesError(errorMessage.error || 'Failed to load tables');
        setTables([]);
        return [];
      }

      const payload: { tables?: TableInfo[]; adminAddress?: string } =
        await response.json();
      const list = Array.isArray(payload.tables) ? payload.tables : [];
      setTables(list);
      setAdminAddress(payload.adminAddress || null);
      return list;
    } catch (error) {
      console.error('Failed to fetch tables', error);
      setTablesError('Failed to load tables');
      setTables([]);
      return [];
    } finally {
      setTablesLoading(false);
    }
  }, [serverBaseUrl]);

  const fetchTableData = useCallback(
    async (options: FetchTableOptions) => {
      const {
        schema,
        table,
        limit = DEFAULT_PAGE_SIZE,
        offset = 0,
        orderBy,
        orderDirection,
      } = options;

      setTableLoading(true);
      setTableError(null);
      setUnauthorized(false);
      setForbidden(false);

      const params = new URLSearchParams({
        schema,
        table,
        limit: Math.max(1, Math.min(limit, 200)).toString(),
        offset: Math.max(0, offset).toString(),
      });

      if (orderBy) {
        params.set('orderBy', orderBy);
        params.set(
          'orderDirection',
          orderDirection === 'desc' ? 'desc' : 'asc'
        );
      }

      try {
        const response = await fetch(
          `${serverBaseUrl}/api/admin/db/table?${params.toString()}`,
          {
            credentials: 'include',
          }
        );

        if (response.status === 401) {
          setUnauthorized(true);
          setTableData(null);
          return;
        }

        if (response.status === 403) {
          setForbidden(true);
          setTableData(null);
          return;
        }

        if (response.status === 404) {
          setTableError('Table not found');
          setTableData(null);
          return;
        }

        if (!response.ok) {
          const errorPayload = await response
            .json()
            .catch(() => ({ error: 'Failed to load table data' }));
          setTableError(errorPayload.error || 'Failed to load table data');
          setTableData(null);
          return;
        }

        const payload: TableResponse = await response.json();
        setTableData(payload);
      } catch (error) {
        console.error('Failed to fetch table data', error);
        setTableError('Failed to load table data');
        setTableData(null);
      } finally {
        setTableLoading(false);
      }
    },
    [serverBaseUrl]
  );

  useEffect(() => {
    if (!isSessionVerified) {
      return;
    }

    if (!hasValidSession) {
      setTables([]);
      setTableData(null);
      setAdminAddress(null);
      return;
    }

    let cancelled = false;

    const bootstrap = async () => {
      const loadedTables = await fetchTables();
      if (cancelled) {
        return;
      }

      const nextSelection = loadedTables.find(
        (entry) =>
          entry.schema === selectedSchema && entry.name === selectedTable
      );

      const target = nextSelection || loadedTables[0];
      if (!target) {
        setSelectedSchema(null);
        setSelectedTable(null);
        setTableData(null);
        return;
      }

      setSelectedSchema(target.schema);
      setSelectedTable(target.name);
      await fetchTableData({
        schema: target.schema,
        table: target.name,
        limit: DEFAULT_PAGE_SIZE,
        offset: 0,
        orderDirection: 'desc',
      });
    };

    bootstrap().catch((error) => {
      console.error('Failed to bootstrap admin tables', error);
    });

    return () => {
      cancelled = true;
    };
  }, [
    hasValidSession,
    isSessionVerified,
    fetchTables,
    fetchTableData,
    selectedSchema,
    selectedTable,
  ]);

  const handleSelectTable = useCallback(
    (schema: string, name: string) => {
      setSelectedSchema(schema);
      setSelectedTable(name);
      setSelectedRow(null);
      setIsRowDialogOpen(false);
      fetchTableData({
        schema,
        table: name,
        limit: DEFAULT_PAGE_SIZE,
        offset: 0,
        orderDirection: 'desc',
      }).catch((error) => {
        console.error('Failed to load table', error);
      });
    },
    [fetchTableData]
  );

  const handleSortColumn = useCallback(
    (column: TableColumn) => {
      if (!tableData) {
        return;
      }

      if (!selectedSchema || !selectedTable) {
        return;
      }

      if (!column.isSortable) {
        return;
      }

      const currentSorting = tableData.pagination.orderBy;
      const currentDirection = tableData.pagination.orderDirection;
      const nextDirection: 'asc' | 'desc' =
        currentSorting === column.name && currentDirection === 'desc'
          ? 'asc'
          : 'desc';

      fetchTableData({
        schema: selectedSchema,
        table: selectedTable,
        limit: tableData.pagination.limit,
        offset: 0,
        orderBy: column.name,
        orderDirection: nextDirection,
      }).catch((error) => {
        console.error('Failed to sort table', error);
      });
    },
    [fetchTableData, selectedSchema, selectedTable, tableData]
  );

  const handleNextPage = useCallback(() => {
    if (!tableData || !selectedSchema || !selectedTable) {
      return;
    }

    const { limit, offset, total, orderBy, orderDirection } =
      tableData.pagination;

    const nextOffset = offset + limit;
    const hasMore =
      total == null ? tableData.rows.length === limit : nextOffset < total;

    if (!hasMore) {
      return;
    }

    fetchTableData({
      schema: selectedSchema,
      table: selectedTable,
      limit,
      offset: nextOffset,
      orderBy,
      orderDirection,
    }).catch((error) => {
      console.error('Failed to fetch next page', error);
    });
  }, [fetchTableData, selectedSchema, selectedTable, tableData]);

  const handlePrevPage = useCallback(() => {
    if (!tableData || !selectedSchema || !selectedTable) {
      return;
    }

    const { limit, offset, orderBy, orderDirection } = tableData.pagination;
    const nextOffset = Math.max(0, offset - limit);
    if (offset === 0) {
      return;
    }

    fetchTableData({
      schema: selectedSchema,
      table: selectedTable,
      limit,
      offset: nextOffset,
      orderBy,
      orderDirection,
    }).catch((error) => {
      console.error('Failed to fetch previous page', error);
    });
  }, [fetchTableData, selectedSchema, selectedTable, tableData]);

  const handleRowClick = useCallback((row: Record<string, unknown>) => {
    setSelectedRow(row);
    setIsRowDialogOpen(true);
  }, []);

  const renderMainContent = () => {
    if (!isSessionVerified) {
      return (
        <div className="flex h-full items-center justify-center text-sm text-slate-400">
          Verifying session…
        </div>
      );
    }

    if (!hasValidSession) {
      return (
        <div className="flex h-full items-center justify-center">
          <div className="max-w-md text-center text-sm text-slate-300">
            Connect your wallet to load the admin database explorer.
          </div>
        </div>
      );
    }

    if (unauthorized) {
      return (
        <div className="flex h-full items-center justify-center">
          <div className="max-w-md text-center text-sm text-slate-300">
            Session expired or not found. Reconnect your wallet to continue.
          </div>
        </div>
      );
    }

    if (forbidden) {
      return (
        <div className="flex h-full items-center justify-center">
          <div className="max-w-md text-center text-sm text-red-400">
            This wallet is not authorized to access the admin database tools.
          </div>
        </div>
      );
    }

    if (tableError) {
      return (
        <div className="flex h-full items-center justify-center">
          <div className="max-w-md text-center text-sm text-red-400">
            {tableError}
          </div>
        </div>
      );
    }

    if (!selectedSchema || !selectedTable) {
      if (tablesLoading) {
        return (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">
            Loading tables…
          </div>
        );
      }

      if (tablesError) {
        return (
          <div className="flex h-full items-center justify-center text-sm text-red-400">
            {tablesError}
          </div>
        );
      }

      return (
        <div className="flex h-full items-center justify-center text-sm text-slate-400">
          Select a table to begin.
        </div>
      );
    }

    if (tableLoading || !tableData) {
      return (
        <div className="flex h-full items-center justify-center text-sm text-slate-400">
          Loading data…
        </div>
      );
    }

    const { columns, rows, pagination } = tableData;
    const limit = pagination.limit;
    const offset = pagination.offset;
    const total = pagination.total;
    const currentPage = Math.floor(offset / limit) + 1;
    const totalPages = total ? Math.ceil(total / limit) : null;

    const canGoPrevious = offset > 0;
    const canGoNext =
      total == null ? rows.length === limit : offset + limit < total;

    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">
              {selectedSchema}.{selectedTable}
            </h2>
            <p className="text-xs uppercase tracking-wide text-slate-500">
              {columns.length} columns · {total ?? '—'} rows
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span>
              Page {currentPage}
              {totalPages ? ` of ${totalPages}` : ''}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrevPage}
              disabled={!canGoPrevious}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleNextPage}
              disabled={!canGoNext}
            >
              Next
            </Button>
          </div>
        </div>
        <div className="mt-4 flex-1 overflow-auto rounded-lg border border-slate-800 bg-slate-950">
          <div className="min-w-full overflow-auto">
            <table className="min-w-full text-left text-xs text-slate-200">
              <thead className="bg-slate-900 text-slate-300">
                <tr>
                  {columns.map((column) => {
                    const isSorted =
                      tableData.pagination.orderBy === column.name;
                    const direction = tableData.pagination.orderDirection;
                    return (
                      <th
                        key={column.name}
                        className="whitespace-nowrap border-b border-slate-800 px-3 py-2 font-semibold"
                      >
                        <button
                          className={`flex items-center gap-1 ${
                            column.isSortable
                              ? 'hover:text-white'
                              : 'cursor-default'
                          }`}
                          onClick={() => handleSortColumn(column)}
                          disabled={!column.isSortable}
                        >
                          <span>{column.name}</span>
                          {column.isSortable && isSorted && (
                            <span>{direction === 'desc' ? '▼' : '▲'}</span>
                          )}
                        </button>
                        <div className="text-[10px] font-normal uppercase tracking-wide text-slate-500">
                          {column.dataType}
                          {column.isSensitive ? ' • masked' : ''}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={columns.length}
                      className="px-3 py-6 text-center text-slate-400"
                    >
                      No rows found for this page.
                    </td>
                  </tr>
                ) : (
                  rows.map((row, rowIndex) => (
                    <tr
                      key={`${rowIndex}-${offset}`}
                      className="border-b border-slate-900/60 hover:bg-slate-900"
                      onClick={() => handleRowClick(row)}
                    >
                      {columns.map((column) => {
                        const displayValue = formatCellValue(
                          row[column.name],
                          column
                        );
                        return (
                          <td
                            key={column.name}
                            className="max-w-[240px] px-3 py-2 align-top text-slate-100"
                          >
                            <span className="block truncate whitespace-nowrap">
                              {displayValue}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        <p className="mt-3 text-[10px] uppercase tracking-wide text-slate-500">
          Showing rows {offset + 1} - {offset + rows.length}
          {total ? ` of ${total}` : ''}
        </p>
      </div>
    );
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100 font-mono">
      <header className="border-b border-slate-900 bg-slate-950/80 px-6 py-4 backdrop-blur">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-white">Database Admin</h1>
            <p className="text-sm text-slate-400">
              Read-only Supabase explorer gated by wallet allowlist.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right text-xs text-slate-400">
              <div>
                Admin wallet:{' '}
                <span className="font-mono text-slate-200">
                  {formatAddress(adminAddress)}
                </span>
              </div>
              <div>
                Session wallet:{' '}
                <span className="font-mono text-slate-200">
                  {formatAddress(walletAddress || null)}
                </span>
              </div>
            </div>
            <WalletConnectControl />
            {isWalletConnected && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => disconnectWallet().catch(console.error)}
              >
                Disconnect
              </Button>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                fetchTables().catch((error) => {
                  console.error('Failed to refresh tables', error);
                });
                if (selectedSchema && selectedTable) {
                  fetchTableData({
                    schema: selectedSchema,
                    table: selectedTable,
                    limit: DEFAULT_PAGE_SIZE,
                    offset: tableData?.pagination.offset ?? 0,
                    orderBy: tableData?.pagination.orderBy ?? undefined,
                    orderDirection:
                      tableData?.pagination.orderDirection ?? 'desc',
                  }).catch((error) => {
                    console.error('Failed to refresh table data', error);
                  });
                }
              }}
              disabled={tablesLoading || tableLoading}
            >
              Refresh
            </Button>
          </div>
        </div>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <aside className="w-72 border-r border-slate-900 bg-slate-950/60 p-4">
          <div className="mb-3 text-xs uppercase tracking-wide text-slate-500">
            Schemas
          </div>
          {tablesLoading && (
            <div className="text-xs text-slate-400">Loading…</div>
          )}
          {tablesError && (
            <div className="text-xs text-red-400">{tablesError}</div>
          )}
          <div className="space-y-4 overflow-y-auto pr-2">
            {tablesBySchema.map(({ schema, tables: tableList }) => (
              <div key={schema}>
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  {schema}
                </div>
                <ul className="space-y-1">
                  {tableList.map((entry) => {
                    const isActive =
                      entry.schema === selectedSchema &&
                      entry.name === selectedTable;
                    return (
                      <li key={`${entry.schema}.${entry.name}`}>
                        <button
                          className={`w-full rounded-md px-2 py-1 text-left text-xs transition ${
                            isActive
                              ? 'bg-slate-800 text-white'
                              : 'text-slate-300 hover:bg-slate-900 hover:text-white'
                          }`}
                          onClick={() =>
                            handleSelectTable(entry.schema, entry.name)
                          }
                        >
                          {entry.name}
                          <span className="ml-2 text-[10px] uppercase tracking-wide text-slate-500">
                            {entry.type}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </aside>
        <main className="flex-1 overflow-hidden p-6">
          {renderMainContent()}
        </main>
      </div>

      <Dialog open={isRowDialogOpen} onOpenChange={setIsRowDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Row details</DialogTitle>
          </DialogHeader>
          <pre className="max-h-[60vh] overflow-auto rounded-md bg-slate-900 p-4 text-xs text-slate-200">
            {selectedRow
              ? JSON.stringify(selectedRow, null, 2)
              : 'No row selected'}
          </pre>
        </DialogContent>
      </Dialog>
    </div>
  );
}
