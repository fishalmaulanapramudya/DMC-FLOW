import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { z } from 'zod';
import { pool } from '../../../infrastructure/database';
import { writeAudit } from '../../../infrastructure/audit';
import { requireAuth, requirePermission } from '../middleware/security';

export type UserManageActor = { id?: string; roleKey: string };
export type UserManageTarget = { id?: string; roleKey: string };

export function buildUserAccountPatchInput(raw: unknown) {
  const parsed = z.object({
    fullName: z.string().trim().min(2).max(140).optional(),
    email: z.string().trim().email().max(190).optional(),
    password: z.string().min(8).max(100).optional(),
    transactionPin: z.string().regex(/^(?!([0-9])\1{3,5}$)\d{4,6}$/,'PIN harus 4–6 digit dan tidak boleh semuanya sama.').optional(),
    accountType: z.enum(['student','teacher']).optional(),
    studentNumber: z.string().trim().max(50).optional(),
    className: z.string().trim().max(50).optional(),
  }).passthrough().safeParse(raw);

  if (!parsed.success) {
    throw parsed.error;
  }

  const output: Record<string, string> = {};
  const { fullName, email, password, transactionPin, accountType, studentNumber, className } = parsed.data;
  if (fullName !== undefined) output.fullName = fullName.trim();
  if (email !== undefined) output.email = email.trim().toLowerCase();
  if (password !== undefined) output.password = password;
  if (transactionPin !== undefined) output.transactionPin = transactionPin;
  if (accountType !== undefined) output.accountType = accountType;
  if (studentNumber !== undefined) output.studentNumber = studentNumber.trim();
  if (className !== undefined) output.className = className.trim();
  return output;
}

export function getUserAccountAccessCheck(actor: UserManageActor, target: UserManageTarget, operation: 'update' | 'delete' | 'status' | 'role') {
  if (!actor || !target) {
    return { allowed: false, reason: 'Identitas pengguna tidak valid.' };
  }

  if (operation === 'delete' && actor.id && target.id && actor.id === target.id) {
    return { allowed: false, reason: 'Anda tidak dapat menghapus akun sendiri.' };
  }

  if (target.roleKey === 'superadmin' && actor.roleKey !== 'superadmin') {
    return { allowed: false, reason: 'Hanya Super Admin yang dapat mengelola akun Super Admin.' };
  }

  if (['admin', 'superadmin'].includes(target.roleKey) && actor.roleKey !== 'superadmin') {
    return { allowed: false, reason: 'Hanya Super Admin yang dapat mengelola akun Admin atau Super Admin.' };
  }

  return { allowed: true };
}

export const usersRouter = Router();
usersRouter.use(requireAuth);
const makeQrToken = () => crypto.randomBytes(32).toString('base64url');

usersRouter.get('/', requirePermission('users.view'), async (req,res,next) => {
  try {
    const search = String(req.query.search ?? '').trim();
    const result = await pool.query(
      `SELECT u.id,u.full_name AS "fullName",u.email,u.status,r.id AS "roleId",r.role_key AS "roleKey",r.name AS "roleName",
       up.account_type AS "accountType",up.student_number AS "studentNumber",up.class_name AS "className",
       COALESCE(w.balance,0)::bigint AS balance,CASE WHEN $3::boolean THEN q.qr_token ELSE NULL END AS "qrToken",q.status AS "qrStatus",u.created_at AS "createdAt"
       FROM users u JOIN roles r ON r.id=u.role_id LEFT JOIN user_profiles up ON up.user_id=u.id
       LEFT JOIN wallets w ON w.user_id=u.id LEFT JOIN account_qr_tokens q ON q.user_id=u.id
       WHERE ($1='' OR u.full_name ILIKE $2 OR u.email ILIKE $2 OR COALESCE(up.student_number,'') ILIKE $2 OR COALESCE(q.qr_token,'') ILIKE $2)
       ORDER BY u.created_at DESC LIMIT 500`, [search,`%${search}%`,req.user!.roleKey==='superadmin'||req.user!.permissions.includes('users.manage')]);
    return res.json({ users: result.rows.map(row => ({...row,balance:Number(row.balance)})) });
  } catch(error) { return next(error); }
});

usersRouter.post('/', requirePermission('users.manage'), async (req,res,next) => {
  const client = await pool.connect();
  try {
    const input = z.object({
      fullName:z.string().trim().min(2).max(140), email:z.string().trim().email().max(190), password:z.string().min(8).max(100),
      transactionPin:z.string().regex(/^(?!([0-9])\1{3,5}$)\d{4,6}$/,'PIN harus 4–6 digit dan tidak boleh semuanya sama.'),
      roleKey:z.enum(['superadmin','admin','kasir','pelanggan']).default('pelanggan'),
      accountType:z.enum(['student','teacher']).default('student'), studentNumber:z.string().trim().max(50).optional().default(''),
      className:z.string().trim().max(50).optional().default(''),
    }).parse(req.body);
    if (req.user!.roleKey !== 'superadmin' && ['admin','superadmin','kasir'].includes(input.roleKey)) return res.status(403).json({error:'Hanya Super Admin yang dapat membuat akun staff atau role tinggi.'});
    await client.query('BEGIN');
    const role = await client.query(`SELECT id FROM roles WHERE role_key=$1`,[input.roleKey]);
    if (!role.rowCount) { await client.query('ROLLBACK'); return res.status(400).json({error:'Role tidak ditemukan.'}); }
    const passwordHash = await bcrypt.hash(input.password,Number(process.env.BCRYPT_ROUNDS||12));
    const pinHash = await bcrypt.hash(input.transactionPin,Number(process.env.BCRYPT_ROUNDS||12));
    const created = await client.query(`INSERT INTO users(full_name,email,password_hash,transaction_pin_hash,role_id) VALUES($1,lower($2),$3,$4,$5) RETURNING id,full_name AS "fullName",email`,[input.fullName,input.email,passwordHash,pinHash,role.rows[0].id]);
    const user = created.rows[0];
    await client.query(`INSERT INTO wallets(user_id,balance) VALUES($1,0)`,[user.id]);
    let qrToken: string | null = null;
    if (input.roleKey === 'pelanggan') {
      await client.query(`INSERT INTO user_profiles(user_id,account_type,student_number,class_name) VALUES($1,$2,$3,$4)`,[user.id,input.accountType,input.studentNumber||null,input.className||null]);
      qrToken = makeQrToken();
      await client.query(`INSERT INTO account_qr_tokens(qr_token,user_id) VALUES($1,$2)`,[qrToken,user.id]);
    }
    await client.query('COMMIT');
    await writeAudit(req,'user.create','user',user.id,{roleKey:input.roleKey,accountType:input.roleKey==='pelanggan'?input.accountType:null});
    return res.status(201).json({user:{...user,roleKey:input.roleKey,accountType:input.roleKey==='pelanggan'?input.accountType:null,qrToken,qrStatus:qrToken?'active':null}});
  } catch(error:any) {
    await client.query('ROLLBACK').catch(()=>undefined);
    if(error?.code==='23505') return res.status(409).json({error:'Email atau nomor induk sudah terdaftar.'});
    return next(error);
  } finally { client.release(); }
});

usersRouter.get('/:id', requirePermission('users.view'), async (req,res,next) => {
  try {
    const result = await pool.query(
      `SELECT u.id,u.full_name AS "fullName",u.email,u.status,r.role_key AS "roleKey",r.name AS "roleName",
       up.account_type AS "accountType",up.student_number AS "studentNumber",up.class_name AS "className",
       COALESCE(w.balance,0)::bigint AS balance,
       q.qr_token AS "qrToken",q.status AS "qrStatus"
       FROM users u
       JOIN roles r ON r.id=u.role_id
       LEFT JOIN user_profiles up ON up.user_id=u.id
       LEFT JOIN wallets w ON w.user_id=u.id
       LEFT JOIN account_qr_tokens q ON q.user_id=u.id
       WHERE u.id=$1`,
      [req.params.id],
    );

    if (!result.rowCount) return res.status(404).json({ error: 'Akun tidak ditemukan.' });
    return res.json({ user: { ...result.rows[0], balance: Number(result.rows[0].balance) } });
  } catch (error) { return next(error); }
});

usersRouter.patch('/:id', requirePermission('users.manage'), async (req,res,next) => {
  const client = await pool.connect();
  try {
    const input = buildUserAccountPatchInput(req.body);
    if (Object.keys(input).length === 0) return res.status(400).json({ error: 'Tidak ada data akun yang diubah.' });

    const target = await pool.query(
      `SELECT u.id,u.email,u.full_name AS "fullName",r.role_key AS "roleKey" FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=$1`,
      [req.params.id],
    );

    if (!target.rowCount) return res.status(404).json({ error: 'Akun tidak ditemukan.' });

    const check = getUserAccountAccessCheck(req.user!, target.rows[0], 'update');
    if (!check.allowed) return res.status(403).json({ error: check.reason });

    const nextEmail = input.email ? input.email.trim().toLowerCase() : undefined;
    if (nextEmail) {
      const existingEmail = await client.query(`SELECT id FROM users WHERE LOWER(email)=LOWER($1) AND id<>$2`, [nextEmail, req.params.id]);
      if (existingEmail.rowCount) return res.status(409).json({ error: 'Email sudah digunakan akun lain.' });
    }

    await client.query('BEGIN');

    const fields: string[] = [];
    const values: unknown[] = [];

    if (input.fullName) {
      fields.push(`full_name=$${fields.length + 1}`);
      values.push(input.fullName);
    }
    if (nextEmail) {
      fields.push(`email=$${fields.length + 1}`);
      values.push(nextEmail);
    }
    if (input.password) {
      fields.push(`password_hash=$${fields.length + 1}`);
      values.push(await bcrypt.hash(input.password, Number(process.env.BCRYPT_ROUNDS || 12)));
    }
    if (input.transactionPin) {
      fields.push(`transaction_pin_hash=$${fields.length + 1}`);
      values.push(await bcrypt.hash(input.transactionPin, Number(process.env.BCRYPT_ROUNDS || 12)));
    }

    if (fields.length) {
      await client.query(`UPDATE users SET ${fields.join(', ')}, updated_at=NOW() WHERE id=$${fields.length + 1}`,[...values, req.params.id]);
    }

    if (input.accountType !== undefined || input.studentNumber !== undefined || input.className !== undefined) {
      const profile = await client.query(`SELECT 1 FROM user_profiles WHERE user_id=$1`, [req.params.id]);
      const accountType = input.accountType ?? 'student';
      const studentNumber = input.studentNumber ?? null;
      const className = input.className ?? null;

      if (profile.rowCount) {
        await client.query(
          `UPDATE user_profiles SET account_type=$1, student_number=$2, class_name=$3, created_at=created_at WHERE user_id=$4`,
          [accountType, studentNumber, className, req.params.id],
        );
      } else {
        await client.query(
          `INSERT INTO user_profiles(user_id, account_type, student_number, class_name) VALUES ($1,$2,$3,$4)`,
          [req.params.id, accountType, studentNumber, className],
        );
      }
    }

    await client.query('COMMIT');
    const updated = await pool.query(
      `SELECT u.id,u.full_name AS "fullName",u.email,u.status,r.role_key AS "roleKey",r.name AS "roleName",
       up.account_type AS "accountType",up.student_number AS "studentNumber",up.class_name AS "className",
       COALESCE(w.balance,0)::bigint AS balance,
       q.qr_token AS "qrToken",q.status AS "qrStatus"
       FROM users u
       JOIN roles r ON r.id=u.role_id
       LEFT JOIN user_profiles up ON up.user_id=u.id
       LEFT JOIN wallets w ON w.user_id=u.id
       LEFT JOIN account_qr_tokens q ON q.user_id=u.id
       WHERE u.id=$1`,
      [req.params.id],
    );

    await writeAudit(req, 'user.update', 'user', req.params.id, input);
    return res.json({ user: { ...updated.rows[0], balance: Number(updated.rows[0].balance) } });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    return next(error);
  } finally {
    client.release();
  }
});

usersRouter.patch('/:id/status',requirePermission('users.manage'),async(req,res,next)=>{
  try {
    const input=z.object({status:z.enum(['active','suspended'])}).parse(req.body);
    if(req.params.id===req.user!.id&&input.status==='suspended') return res.status(400).json({error:'Anda tidak dapat menonaktifkan akun sendiri.'});
    const target=await pool.query(`SELECT u.id,r.role_key FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=$1`,[req.params.id]);
    if(!target.rowCount)return res.status(404).json({error:'Akun tidak ditemukan.'});
    const guard = getUserAccountAccessCheck(req.user!, { id: req.params.id, roleKey: target.rows[0].role_key }, 'status');
    if (!guard.allowed) return res.status(403).json({ error: guard.reason });
    await pool.query(`UPDATE users SET status=$1,updated_at=NOW() WHERE id=$2`,[input.status,req.params.id]);
    await writeAudit(req,'user.status.update','user',req.params.id,input);
    return res.json({message:'Status akun diperbarui.'});
  } catch(error) { return next(error); }
});

usersRouter.delete('/:id', requirePermission('users.manage'), async (req,res,next) => {
  try {
    const target = await pool.query(`SELECT u.id,r.role_key FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=$1`, [req.params.id]);
    if (!target.rowCount) return res.status(404).json({ error: 'Akun tidak ditemukan.' });

    const guard = getUserAccountAccessCheck(req.user!, { id: req.params.id, roleKey: target.rows[0].role_key }, 'delete');
    if (!guard.allowed) return res.status(403).json({ error: guard.reason });

    await pool.query(`UPDATE users SET status='suspended', updated_at=NOW() WHERE id=$1`, [req.params.id]);
    await pool.query(`UPDATE account_qr_tokens SET status='revoked' WHERE user_id=$1`, [req.params.id]);
    await writeAudit(req, 'user.delete', 'user', req.params.id, { action: 'soft-delete' });

    return res.json({ message: 'Akun berhasil dinonaktifkan.' });
  } catch (error) { return next(error); }
});

usersRouter.patch('/:id/role',requirePermission('roles.manage'),async(req,res,next)=>{
  const client=await pool.connect();
  try{
    const input=z.object({roleKey:z.string().trim().min(2).max(60).regex(/^[a-z0-9-]+$/,'Kunci role tidak valid.')}).parse(req.body);
    if(req.params.id===req.user!.id)return res.status(400).json({error:'Role akun yang sedang digunakan tidak dapat diubah dari sesi yang sama.'});
    if(['admin','superadmin','kasir'].includes(input.roleKey)&&req.user!.roleKey!=='superadmin')return res.status(403).json({error:'Hanya Super Admin yang dapat menetapkan role staff.'});
    await client.query('BEGIN');
    const target=await client.query(`SELECT u.id,u.transaction_pin_hash,r.role_key FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=$1 FOR UPDATE OF u`,[req.params.id]);
    if(!target.rowCount){await client.query('ROLLBACK');return res.status(404).json({error:'Akun tidak ditemukan.'});}
    if(['admin','superadmin'].includes(target.rows[0].role_key)&&req.user!.roleKey!=='superadmin'){await client.query('ROLLBACK');return res.status(403).json({error:'Hanya Super Admin yang dapat mengubah role akun Admin atau Super Admin.'});}
    if(input.roleKey==='pelanggan'&&!target.rows[0].transaction_pin_hash){await client.query('ROLLBACK');return res.status(409).json({error:'Akun ini belum memiliki PIN transaksi. Buat ulang akun atau setel PIN sebelum menjadikannya pelanggan.'});}
    const role=await client.query(`SELECT id FROM roles WHERE role_key=$1`,[input.roleKey]);
    if(!role.rowCount){await client.query('ROLLBACK');return res.status(400).json({error:'Role tujuan tidak ditemukan.'});}
    await client.query(`UPDATE users SET role_id=$1,updated_at=NOW() WHERE id=$2`,[role.rows[0].id,req.params.id]);
    if(input.roleKey==='pelanggan'){
      await client.query(`INSERT INTO wallets(user_id,balance) VALUES($1,0) ON CONFLICT(user_id) DO NOTHING`,[req.params.id]);
      await client.query(`INSERT INTO user_profiles(user_id,account_type) VALUES($1,'student') ON CONFLICT(user_id) DO NOTHING`,[req.params.id]);
      const qr=await client.query(`SELECT id FROM account_qr_tokens WHERE user_id=$1`,[req.params.id]);
      if(!qr.rowCount)await client.query(`INSERT INTO account_qr_tokens(qr_token,user_id,status) VALUES($1,$2,'active')`,[makeQrToken(),req.params.id]);
      else await client.query(`UPDATE account_qr_tokens SET status='active' WHERE user_id=$1`,[req.params.id]);
    }else{
      await client.query(`UPDATE account_qr_tokens SET status='revoked' WHERE user_id=$1`,[req.params.id]);
    }
    await client.query('COMMIT');
    await writeAudit(req,'user.role.update','user',req.params.id,input);
    return res.json({message:'Role berhasil diperbarui. Izin baru berlaku pada request berikutnya.'});
  }catch(error){await client.query('ROLLBACK').catch(()=>undefined);return next(error);}finally{client.release();}
});

usersRouter.post('/:id/qr/rotate',requirePermission('users.manage'),async(req,res,next)=>{
  try {
    const person=await pool.query(`SELECT u.id,r.role_key FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=$1`,[req.params.id]);
    if(!person.rowCount)return res.status(404).json({error:'Akun tidak ditemukan.'});
    if(person.rows[0].role_key!=='pelanggan')return res.status(400).json({error:'QR saldo hanya tersedia untuk akun siswa/guru.'});
    const token=makeQrToken();
    const result=await pool.query(`INSERT INTO account_qr_tokens(qr_token,user_id,status) VALUES($1,$2,'active') ON CONFLICT(user_id) DO UPDATE SET qr_token=EXCLUDED.qr_token,status='active',issued_at=NOW(),last_used_at=NULL RETURNING qr_token AS "qrToken",status AS "qrStatus"`,[token,req.params.id]);
    await writeAudit(req,'account_qr.rotate','account_qr',req.params.id,{});
    return res.json({qr:result.rows[0],message:'QR baru diterbitkan. QR sebelumnya tidak berlaku.'});
  } catch(error) { return next(error); }
});
usersRouter.post('/:id/qr/revoke',requirePermission('users.manage'),async(req,res,next)=>{
  try {
    const result=await pool.query(`UPDATE account_qr_tokens SET status='revoked' WHERE user_id=$1 RETURNING user_id`,[req.params.id]);
    if(!result.rowCount)return res.status(404).json({error:'QR akun tidak ditemukan.'});
    await writeAudit(req,'account_qr.revoke','account_qr',req.params.id,{});
    return res.json({message:'QR akun dicabut dan tidak dapat digunakan untuk pembayaran.'});
  } catch(error) { return next(error); }
});
