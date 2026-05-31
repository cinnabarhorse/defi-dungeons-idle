import type { Application, Request, Response } from 'express';
import { getPgPool } from '../lib/db';
import { requireAdminSession } from './admin-auth';
import { logError } from '../lib/http-logging';

interface TableColumn {
  name: string;
  dataType: string;
  isNullable: boolean;
  hasDefault: boolean;
  ordinalPosition: number;
  isSensitive: boolean;
  isSortable: boolean;
}

const SENSITIVE_COLUMN_PATTERNS = [
  'password',
  'secret',
  'token',
  'key',
  'private',
  'nonce',
  'signature',
];

const SENSITIVE_COLUMN_EXCEPTIONS = new Set(['token_address']);

const SORTABLE_TYPES = new Set([
  'smallint',
  'integer',
  'bigint',
  'decimal',
  'numeric',
  'real',
  'double precision',
  'serial',
  'bigserial',
  'timestamp without time zone',
  'timestamp with time zone',
  'date',
]);

const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_$]*$/;

function assertIdentifier(value: string, kind: string): string {
  if (!value) {
    throw new Error(`${kind} is required`);
  }
  if (!IDENTIFIER_PATTERN.test(value)) {
    throw new Error(`Invalid ${kind}`);
  }
  return value;
}

function quoteIdentifier(value: string): string {
  return '"' + value.replace(/"/g, '""') + '"';
}

function detectSensitiveColumns(columns: TableColumn[]): Set<string> {
  const sensitive = new Set<string>();
  for (const column of columns) {
    const name = column.name.toLowerCase();
    if (SENSITIVE_COLUMN_EXCEPTIONS.has(name)) {
      continue;
    }
    if (column.dataType === 'bytea') {
      sensitive.add(name);
      continue;
    }
    if (SENSITIVE_COLUMN_PATTERNS.some((pattern) => name.includes(pattern))) {
      sensitive.add(name);
    }
  }
  return sensitive;
}

function maskValue(value: unknown): unknown {
  if (value == null) {
    return null;
  }
  if (typeof value === 'string' && value.length <= 8) {
    return '*'.repeat(Math.max(value.length, 4));
  }
  return '********';
}

function maskRow(
  row: Record<string, unknown>,
  sensitiveColumns: Set<string>
): Record<string, unknown> {
  const masked: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (sensitiveColumns.has(key.toLowerCase())) {
      masked[key] = maskValue(value);
    } else {
      masked[key] = value;
    }
  }
  return masked;
}

export function registerAdminDbRoutes(app: Application) {
  app.get('/api/admin/db/tables', async (req, res) => {
    const session = await requireAdminSession(req, res);
    if (!session) {
      return;
    }

    const pool = getPgPool();
    const schema = 'public';

    try {
      const query =
        'select table_schema, table_name, table_type from information_schema.tables where table_schema = $1 order by table_name asc';

      const { rows } = await pool.query(query, [schema]);
      res.json({
        tables: rows.map((row) => ({
          schema: row.table_schema as string,
          name: row.table_name as string,
          type: row.table_type as string,
        })),
        adminAddress: session.address,
      });
    } catch (error) {
      logError(error, req);
      res.status(500).json({ error: 'Failed to load tables' });
    }
  });

  app.get('/api/admin/db/table', async (req, res) => {
    const session = await requireAdminSession(req, res);
    if (!session) {
      return;
    }

    const schemaRaw =
      typeof req.query.schema === 'string' ? req.query.schema : '';
    const tableRaw = typeof req.query.table === 'string' ? req.query.table : '';

    let limit = Number(req.query.limit) || 50;
    let offset = Number(req.query.offset) || 0;
    const orderByRaw =
      typeof req.query.orderBy === 'string' ? req.query.orderBy : undefined;
    const orderDirectionRaw =
      typeof req.query.orderDirection === 'string'
        ? req.query.orderDirection.toLowerCase()
        : undefined;

    try {
      const schema = assertIdentifier(schemaRaw.trim(), 'schema');
      if (schema.toLowerCase() !== 'public') {
        res.status(403).json({ error: 'Schema not allowed' });
        return;
      }
      const table = assertIdentifier(tableRaw.trim(), 'table');

      if (!Number.isFinite(limit) || limit <= 0) {
        limit = 50;
      }
      if (limit > 200) {
        limit = 200;
      }

      if (!Number.isFinite(offset) || offset < 0) {
        offset = 0;
      }

      const orderDirection = orderDirectionRaw === 'desc' ? 'desc' : 'asc';

      const pool = getPgPool();
      const client = await pool.connect();

      try {
        const columnsResult = await client.query(
          `select column_name, data_type, is_nullable, column_default, ordinal_position
           from information_schema.columns
           where table_schema = $1 and table_name = $2
           order by ordinal_position asc`,
          [schema, table]
        );

        const columns: TableColumn[] = columnsResult.rows.map((row) => ({
          name: row.column_name as string,
          dataType: row.data_type as string,
          isNullable: row.is_nullable === 'YES',
          hasDefault: row.column_default != null,
          ordinalPosition: Number(row.ordinal_position) || 0,
          isSensitive: false,
          isSortable: SORTABLE_TYPES.has(
            (row.data_type as string).toLowerCase()
          ),
        }));

        if (columns.length === 0) {
          res.status(404).json({ error: 'Table not found' });
          return;
        }

        const columnSensitiveSet = detectSensitiveColumns(columns);
        for (const column of columns) {
          column.isSensitive = columnSensitiveSet.has(
            column.name.toLowerCase()
          );
        }

        let effectiveOrderBy: string | null = null;
        let effectiveOrderDirection: 'asc' | 'desc' = orderDirection;

        // Respect explicit client-provided ordering first
        if (orderByRaw) {
          const orderColumn = assertIdentifier(orderByRaw.trim(), 'orderBy');
          if (!columns.find((column) => column.name === orderColumn)) {
            throw new Error('Unknown order column');
          }
          effectiveOrderBy = orderColumn;
        } else {
          // Apply sensible default for specific tables
          // Requirement: loot_distributions should default to created_at DESC
          const hasCreatedAt = columns.some((c) => c.name === 'created_at');
          if (table === 'loot_distributions' && hasCreatedAt) {
            effectiveOrderBy = 'created_at';
            effectiveOrderDirection = 'desc';
          }
        }

        const orderClause = effectiveOrderBy
          ? ` order by ${quoteIdentifier(effectiveOrderBy)} ${effectiveOrderDirection}`
          : '';

        const qualifiedTable = `${quoteIdentifier(schema)}.${quoteIdentifier(table)}`;
        const dataQuery =
          `select * from ${qualifiedTable}` +
          orderClause +
          ` limit ${limit} offset ${offset}`;

        const dataResult = await client.query(dataQuery);
        const maskedRows = dataResult.rows.map((row) =>
          maskRow(row, columnSensitiveSet)
        );

        const countResult = await client.query(
          `select count(*)::bigint as total from ${qualifiedTable}`
        );
        const totalRaw = countResult.rows[0]?.total;
        const totalCount =
          typeof totalRaw === 'string'
            ? Number(totalRaw)
            : typeof totalRaw === 'number'
              ? totalRaw
              : Number(totalRaw ?? 0);

        res.json({
          schema,
          table,
          columns,
          rows: maskedRows,
          pagination: {
            limit,
            offset,
            total: Number.isFinite(totalCount) ? totalCount : null,
            totalRaw: totalRaw ?? totalCount,
            orderBy: effectiveOrderBy,
            orderDirection: effectiveOrderDirection,
          },
        });
      } finally {
        client.release();
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Invalid')) {
        res.status(400).json({ error: error.message });
        return;
      }

      logError(error, req);
      res.status(500).json({ error: 'Failed to load table data' });
    }
  });
}
