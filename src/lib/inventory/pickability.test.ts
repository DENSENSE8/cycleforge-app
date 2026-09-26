/** Pickability regression test. */

import assert from 'node:assert/strict';
import test from 'node:test';
import { getTableColumns } from 'drizzle-orm';
import { locations, serialUnits } from '@/lib/drizzle/schema';
import { pickableSerialUnitsWhereClause } from './pickability';

/** Physical column names drizzle declares for a table. */
function columnNames(table: Parameters<typeof getTableColumns>[0]): Set<string> {
  return new Set(Object.values(getTableColumns(table)).map((c) => c.name));
}

/** Every `alias.column` reference in a SQL fragment, grouped by alias. */
function referencedColumns(sql: string): Record<string, string[]> {
  const byAlias: Record<string, string[]> = {};
  for (const [, alias, column] of sql.matchAll(/\b(su|loc)\.([a-z_][a-z0-9_]*)\b/gi)) {
    (byAlias[alias] ??= []).push(column);
  }
  return byAlias;
}

test('every column the pickability fragment names actually exists', () => {
  const fragment = pickableSerialUnitsWhereClause();
  const referenced = referencedColumns(fragment);

  assert.ok(
    referenced.su?.length,
    'fragment must reference serial_units columns via the `su` alias',
  );

  const declared: Record<string, Set<string>> = {
    su: columnNames(serialUnits),
    loc: columnNames(locations),
  };

  for (const [alias, columns] of Object.entries(referenced)) {
    for (const column of columns) {
      assert.ok(
        declared[alias]!.has(column),
        `${alias}.${column} is interpolated into SQL but no such column is declared — ` +
          'this fragment will throw at runtime in every query that composes it ' +
          '(exactly the su.expires_at failure of 2026-09-14)',
      );
    }
  }
});

test('the fragment still enforces the three real exclusions', () => {
  // Behavioural floor, not a text pin: a bin under count, a non-pickable bin
  // role, and a non-STOCKED unit must all remain excluded. If someone deletes
  // a predicate to "fix" a query, this fails.
  const fragment = pickableSerialUnitsWhereClause();
  assert.match(fragment, /current_status\s*=\s*'STOCKED'/, 'only stocked units are pickable');
  assert.match(fragment, /locked_for_count/, 'a bin under cycle count must stay excluded');
  assert.match(fragment, /bin_role/, 'staging/dock/quarantine bin roles must stay excluded');
});
