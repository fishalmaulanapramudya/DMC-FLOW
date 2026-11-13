import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { getLoginUserLookupQuery, normalizeUserEmail } from './auth';

describe('auth login query', () => {
  test('normalizes the login email before lookup', () => {
    assert.equal(normalizeUserEmail('  Admin@DPay.Local  '), 'admin@dpay.local');
  });

  test('includes the full non-aggregated group-by set to avoid PostgreSQL 500s', () => {
    const sql = getLoginUserLookupQuery();
    assert.match(
      sql,
      /GROUP BY\s+u\.id,\s*u\.email,\s*u\.full_name,\s*u\.password_hash,\s*u\.status,\s*r\.id,\s*r\.role_key,\s*r\.name,\s*up\.user_id,\s*up\.student_number,\s*up\.class_name,\s*up\.account_type/i,
    );
  });
});
