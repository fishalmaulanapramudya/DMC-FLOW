import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { z } from 'zod';
import { pool } from '../../../infrastructure/database';
import { requireAuth } from '../middleware/security';
import { writeAudit } from '../../../infrastructure/audit';

export const authRouter = Router();
export function normalizeUserEmail(value: string): string { return value.trim().toLowerCase(); }
export function getLoginUserLookupQuery() {
  return `${userSelect} WHERE lower(u.email)=lower($1) GROUP BY u.id, u.email, u.full_name, u.password_hash, u.status, r.id, r.role_key, r.name, up.user_id, up.student_number, up.class_name, up.account_type`;
}
const loginSchema = z.object({ email: z.string().trim().email().max(190), password: z.string().min(1).max(200) });
const registerSchema = z.object({
  fullName: z.string().trim().min(2).max(140), email: z.string().trim().email().max(190), password: z.string().min(8).max(100),
  transactionPin: z.string().regex(/^(?!([0-9])\1{3,5}$)\d{4,6}$/, 'PIN harus 4–6 digit dan tidak boleh semuanya sama.'),
  accountType: z.enum(['student','teacher']).default('student'),
  studentNumber: z.string().trim().max(50).optional().default(''), className: z.string().trim().max(50).optional().default(''),
});
function tokenFor(userId: string) {
  return jwt.sign({}, process.env.JWT_SECRET || 'unsafe-development-secret-replace-me-000000', {
    subject: userId, expiresIn: (process.env.JWT_EXPIRES_IN || '8h') as jwt.SignOptions['expiresIn'], issuer: 'dpay-api', audience: 'dpay-web',
  });
}
const safeUser = (row: any) => ({ id: row.id, fullName: row.full_name, email: row.email, roleKey: row.role_key, roleName: row.role_name,
  permissions: row.permissions ?? [], studentNumber: row.student_number ?? null, className: row.class_name ?? null, accountType: row.account_type ?? null });

const userSelect = `SELECT u.id,u.email,u.full_name,u.password_hash,u.status,r.role_key,r.name AS role_name,
  up.student_number,up.class_name,up.account_type,
  COALESCE(array_agg(rp.permission_code) FILTER (WHERE rp.permission_code IS NOT NULL), ARRAY[]::varchar[]) AS permissions
  FROM users u JOIN roles r ON r.id=u.role_id LEFT JOIN user_profiles up ON up.user_id=u.id LEFT JOIN role_permissions rp ON rp.role_id=r.id`;

authRouter.post('/login', async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body);
    const normalizedEmail = normalizeUserEmail(input.email);
    const found = await pool.query(getLoginUserLookupQuery(), [normalizedEmail]);
    const row = found.rows[0];
    if (!row || row.status !== 'active' || !(await bcrypt.compare(input.password, row.password_hash))) return res.status(401).json({ error: 'Email atau kata sandi tidak sesuai.' });
    const token = tokenFor(row.id);
    await pool.query(`INSERT INTO audit_logs(actor_id,action,resource,resource_id,ip_address,user_agent,detail) VALUES($1,'auth.login','session',$2,$3,$4,'{}'::jsonb)`, [row.id, String(row.id), req.ip, req.get('user-agent') ?? '']);
    return res.json({ token, user: safeUser(row) });
  } catch (error) { return next(error); }
});

authRouter.post('/register', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const input = registerSchema.parse(req.body);
    const normalizedEmail = normalizeUserEmail(input.email);
    await client.query('BEGIN');
    const role = await client.query(`SELECT id FROM roles WHERE role_key='pelanggan'`);
    if (!role.rowCount) throw new Error('Role pelanggan belum terpasang. Jalankan npm run db:init.');
    const passwordHash = await bcrypt.hash(input.password, Number(process.env.BCRYPT_ROUNDS || 12));
    const pinHash = await bcrypt.hash(input.transactionPin, Number(process.env.BCRYPT_ROUNDS || 12));
    const created = await client.query(`INSERT INTO users(full_name,email,password_hash,transaction_pin_hash,role_id) VALUES($1,lower($2),$3,$4,$5) RETURNING id,full_name,email`, [input.fullName,normalizedEmail,passwordHash,pinHash,role.rows[0].id]);
    const user = created.rows[0];
    await client.query('INSERT INTO wallets(user_id,balance) VALUES($1,0)', [user.id]);
    await client.query('INSERT INTO user_profiles(user_id,account_type,student_number,class_name) VALUES($1,$2,$3,$4)', [user.id,input.accountType,input.studentNumber || null,input.className || null]);
    const qrToken = crypto.randomBytes(32).toString('base64url');
    await client.query('INSERT INTO account_qr_tokens(qr_token,user_id) VALUES($1,$2)', [qrToken,user.id]);
    await client.query(`INSERT INTO audit_logs(actor_id,action,resource,resource_id,ip_address,user_agent,detail) VALUES($1,'auth.register','user',$2,$3,$4,'{"source":"public-registration"}'::jsonb)`, [user.id,String(user.id),req.ip,req.get('user-agent') ?? '']);
    await client.query('COMMIT');
    return res.status(201).json({ message:'Akun berhasil dibuat.', user:{id:user.id,fullName:user.full_name,email:user.email,roleKey:'pelanggan',roleName:'Pelanggan',permissions:[],studentNumber:input.studentNumber||null,className:input.className||null,accountType:input.accountType}, token:tokenFor(user.id) });
  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (error?.code === '23505') return res.status(409).json({ error: 'Email atau nomor induk sudah terdaftar.' });
    return next(error);
  } finally { client.release(); }
});

authRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query(`SELECT u.id,u.full_name,u.email,u.status,r.role_key,r.name AS role_name,up.student_number,up.class_name,up.account_type,
      COALESCE(array_agg(rp.permission_code) FILTER (WHERE rp.permission_code IS NOT NULL),ARRAY[]::varchar[]) AS permissions
      FROM users u JOIN roles r ON r.id=u.role_id LEFT JOIN user_profiles up ON up.user_id=u.id LEFT JOIN role_permissions rp ON rp.role_id=r.id
      WHERE u.id=$1 GROUP BY u.id, u.full_name, u.email, u.status, r.id, r.role_key, r.name, up.user_id, up.student_number, up.class_name, up.account_type`, [req.user!.id]);
    if (!result.rowCount) return res.status(404).json({ error:'Akun tidak ditemukan.' });
    return res.json({ user: safeUser(result.rows[0]) });
  } catch (error) { return next(error); }
});
