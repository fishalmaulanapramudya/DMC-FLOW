import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { buildUserAccountPatchInput, getUserAccountAccessCheck } from './users';

describe('user account CRUD guards', () => {
  test('sanitizes profile updates before persistence', () => {
    const input = buildUserAccountPatchInput({
      fullName: '  Budi Santoso  ',
      email: '  budi@dpay.local  ',
      accountType: 'teacher',
      studentNumber: '  T-101 ',
      className: '  VII-A ',
      transactionPin: '1234',
    });

    assert.deepEqual(input, {
      fullName: 'Budi Santoso',
      email: 'budi@dpay.local',
      accountType: 'teacher',
      studentNumber: 'T-101',
      className: 'VII-A',
      transactionPin: '1234',
    });
  });

  test('blocks deleting or mutating protected admin accounts', () => {
    const check = getUserAccountAccessCheck(
      { id: 'actor-id', roleKey: 'admin' },
      { id: 'target-id', roleKey: 'superadmin' },
      'delete',
    );

    assert.equal(check.allowed, false);
    assert.match(check.reason ?? '', /Super Admin/i);
  });
});
