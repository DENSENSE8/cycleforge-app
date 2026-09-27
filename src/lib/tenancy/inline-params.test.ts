import test from 'node:test';
import assert from 'node:assert/strict';
import { inlineSqlParams, sqlLiteral } from './inline-params';

test('a quote in a value cannot close the literal', () => {
  assert.equal(sqlLiteral("x'; DROP TABLE orders; --"), "'x''; DROP TABLE orders; --'");
});

test('a backslash switches to an E-string with the backslash doubled', () => {
  assert.equal(sqlLiteral('a\\b'), " E'a\\\\b'");
  assert.equal(sqlLiteral("\\'"), " E'\\\\'''");
});

test('NUL bytes are refused, not silently truncated', () => {
  assert.throws(() => sqlLiteral('ab\0c'), /NUL/);
});

test('arrays travel as quoted array text, element quotes and backslashes escaped', () => {
  assert.equal(sqlLiteral(['a', 'b"c', null]), ` E'{"a","b\\\\"c",NULL}'`);
  assert.equal(sqlLiteral(['x\\y']), ` E'{"x\\\\\\\\y"}'`);
  assert.equal(sqlLiteral([]), "'{}'");
});

test('$10 is not read as $1 followed by 0', () => {
  const params = ['one', 2, 3, 4, 5, 6, 7, 8, 9, 'ten'];
  assert.equal(inlineSqlParams('SELECT $1, $10', params), "SELECT 'one', 'ten'");
});

test('casts stay attached and null binds as NULL', () => {
  assert.equal(inlineSqlParams('x = $1::uuid AND y = $2', ['u', null]), "x = 'u'::uuid AND y = NULL");
});

test('a placeholder without a value throws', () => {
  assert.throws(() => inlineSqlParams('SELECT $2', ['only-one']), /no value for \$2/);
});

test('non-finite numbers are refused', () => {
  assert.throws(() => sqlLiteral(Number.NaN), /non-finite/);
});
