import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../../infrastructure/database';
import { writeAudit } from '../../../infrastructure/audit';
import { requireAuth, requirePermission } from '../middleware/security';

export const shiftsRouter = Router();
shiftsRouter.use(requireAuth);

const idParam = z.string().uuid();
const openSchema = z.object({
  openingCash: z.coerce.number().int().min(0).max(1_000_000_000),
  note: z.string().trim().max(240).optional().default(''),
});
const closeSchema = z.object({
  closingCash: z.coerce.number().int().min(0).max(1_000_000_000),
  note: z.string().trim().max(240).optional().default(''),
});

async function getShiftSummary(shiftId: string) {
  const result = await pool.query(`
    SELECT sh.id,sh.cashier_id AS "cashierId",u.full_name AS "cashierName",
      sh.opened_by AS "openedBy",sh.opened_at AS "openedAt",sh.opening_cash AS "openingCash",sh.opening_note AS "openingNote",
      sh.closed_at AS "closedAt",sh.closed_by AS "closedBy",sh.closing_cash AS "closingCash",sh.expected_cash AS "storedExpectedCash",
      sh.cash_difference AS "cashDifference",sh.closing_note AS "closingNote",sh.status,
      COALESCE(cs.cash_sales,0)::bigint AS "cashSales",COALESCE(cs.cash_count,0)::int AS "cashSaleCount",
      COALESCE(ex.cash_expenses,0)::bigint AS "cashExpenses",
      (sh.opening_cash + COALESCE(cs.cash_sales,0) - COALESCE(ex.cash_expenses,0))::bigint AS "expectedCash"
    FROM cashier_shifts sh JOIN users u ON u.id=sh.cashier_id
    LEFT JOIN LATERAL (SELECT SUM(total) AS cash_sales,COUNT(*) AS cash_count FROM sales WHERE shift_id=sh.id AND payment_method='cash') cs ON TRUE
    LEFT JOIN LATERAL (SELECT SUM(amount) AS cash_expenses FROM expenses WHERE shift_id=sh.id) ex ON TRUE
    WHERE sh.id=$1`, [shiftId]);
  const row = result.rows[0];
  if (!row) return null;
  for (const key of ['openingCash','closingCash','storedExpectedCash','cashDifference','cashSales','cashExpenses','expectedCash']) {
    if (row[key] !== null && row[key] !== undefined) row[key] = Number(row[key]);
  }
  row.cashSaleCount = Number(row.cashSaleCount);
  return row;
}

shiftsRouter.get('/current', requirePermission('pos.access'), async (req, res, next) => {
  try {
    const found = await pool.query(`SELECT id FROM cashier_shifts WHERE cashier_id=$1 AND status='open' LIMIT 1`, [req.user!.id]);
    if (!found.rowCount) return res.json({ shift: null });
    return res.json({ shift: await getShiftSummary(found.rows[0].id) });
  } catch (error) { return next(error); }
});

shiftsRouter.post('/open', requirePermission('shifts.open'), async (req, res, next) => {
  try {
    const input = openSchema.parse(req.body);
    const result = await pool.query(`
      INSERT INTO cashier_shifts(cashier_id,opened_by,opening_cash,opening_note,status)
      VALUES($1,$1,$2,$3,'open') RETURNING id`, [req.user!.id, input.openingCash, input.note]);
    const shift = await getShiftSummary(result.rows[0].id);
    await writeAudit(req, 'shift.open', 'cashier_shift', result.rows[0].id, { openingCash: input.openingCash, note: input.note });
    return res.status(201).json({ shift, message: 'Shift dibuka dan modal awal tercatat.' });
  } catch (error: any) {
    if (error?.code === '23505' && String(error?.constraint || '').includes('one_open_shift')) {
      return res.status(409).json({ error: 'Kasir ini masih memiliki shift terbuka. Tutup shift sebelumnya terlebih dahulu.' });
    }
    return next(error);
  }
});

shiftsRouter.post('/close', requirePermission('shifts.close'), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const input = closeSchema.parse(req.body);
    await client.query('BEGIN');
    const found = await client.query(`SELECT id,opening_cash FROM cashier_shifts WHERE cashier_id=$1 AND status='open' FOR UPDATE`, [req.user!.id]);
    if (!found.rowCount) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Tidak ada shift terbuka milik kasir ini.' }); }
    const shift = found.rows[0];
    const [cashSales, cashExpenses] = await Promise.all([
      client.query(`SELECT COALESCE(SUM(total),0)::bigint AS total FROM sales WHERE shift_id=$1 AND payment_method='cash'`, [shift.id]),
      client.query(`SELECT COALESCE(SUM(amount),0)::bigint AS total FROM expenses WHERE shift_id=$1`, [shift.id]),
    ]);
    const expectedCash = Number(shift.opening_cash) + Number(cashSales.rows[0].total) - Number(cashExpenses.rows[0].total);
    const difference = input.closingCash - expectedCash;
    await client.query(`UPDATE cashier_shifts SET status='closed',closed_at=NOW(),closed_by=$2,closing_cash=$3,expected_cash=$4,cash_difference=$5,closing_note=$6 WHERE id=$1`, [shift.id, req.user!.id, input.closingCash, expectedCash, difference, input.note]);
    await client.query('COMMIT');
    const details = { shiftId: shift.id, openingCash: Number(shift.opening_cash), cashSales: Number(cashSales.rows[0].total), cashExpenses: Number(cashExpenses.rows[0].total), expectedCash, closingCash: input.closingCash, cashDifference: difference, note: input.note };
    await writeAudit(req, 'shift.close', 'cashier_shift', shift.id, details);
    return res.json({ shift: await getShiftSummary(shift.id), message: difference === 0 ? 'Shift ditutup. Kas sesuai.' : `Shift ditutup. Selisih kas ${difference > 0 ? '+' : ''}${difference}.` });
  } catch (error) { await client.query('ROLLBACK').catch(() => undefined); return next(error); }
  finally { client.release(); }
});

shiftsRouter.get('/', requirePermission('shifts.view'), async (_req, res, next) => {
  try {
    const found = await pool.query(`SELECT id FROM cashier_shifts ORDER BY opened_at DESC LIMIT 300`);
    const shifts = await Promise.all(found.rows.map(row => getShiftSummary(row.id)));
    return res.json({ shifts: shifts.filter(Boolean) });
  } catch (error) { return next(error); }
});

shiftsRouter.post('/:id/admin-close', requirePermission('shifts.manage'), async (req, res, next) => {
  const parsedId = idParam.safeParse(req.params.id);
  if (!parsedId.success) return res.status(400).json({ error: 'ID shift tidak valid.' });
  const client = await pool.connect();
  try {
    const input = closeSchema.parse(req.body);
    await client.query('BEGIN');
    const found = await client.query(`SELECT id,cashier_id,opening_cash,status FROM cashier_shifts WHERE id=$1 FOR UPDATE`, [parsedId.data]);
    if (!found.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Shift tidak ditemukan.' }); }
    const shift = found.rows[0];
    if (shift.status !== 'open') { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Shift ini sudah ditutup.' }); }
    const [cashSales, cashExpenses] = await Promise.all([
      client.query(`SELECT COALESCE(SUM(total),0)::bigint AS total FROM sales WHERE shift_id=$1 AND payment_method='cash'`, [shift.id]),
      client.query(`SELECT COALESCE(SUM(amount),0)::bigint AS total FROM expenses WHERE shift_id=$1`, [shift.id]),
    ]);
    const expectedCash = Number(shift.opening_cash) + Number(cashSales.rows[0].total) - Number(cashExpenses.rows[0].total);
    const difference = input.closingCash - expectedCash;
    await client.query(`UPDATE cashier_shifts SET status='closed',closed_at=NOW(),closed_by=$2,closing_cash=$3,expected_cash=$4,cash_difference=$5,closing_note=$6 WHERE id=$1`, [shift.id, req.user!.id, input.closingCash, expectedCash, difference, input.note]);
    await client.query('COMMIT');
    await writeAudit(req, 'shift.admin_close', 'cashier_shift', shift.id, { cashierId: shift.cashier_id, expectedCash, closingCash: input.closingCash, cashDifference: difference, note: input.note });
    return res.json({ shift: await getShiftSummary(shift.id), message: 'Shift ditutup oleh admin.' });
  } catch (error) { await client.query('ROLLBACK').catch(() => undefined); return next(error); }
  finally { client.release(); }
});
