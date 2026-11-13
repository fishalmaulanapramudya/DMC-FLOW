import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { pool } from '../infrastructure/database';
import { PERMISSIONS } from '../domain/permissions';

dotenv.config();
const roles = [
  { key: 'superadmin', name: 'Super Admin', description: 'Akses penuh ke semua fitur.', system: true },
  { key: 'admin', name: 'Admin', description: 'Mengelola operasional kantin sesuai izin.', system: true },
  { key: 'kasir', name: 'Kasir', description: 'Menjalankan POS dan pembayaran QR.', system: true },
  { key: 'pelanggan', name: 'Pelanggan', description: 'Akun siswa/guru untuk saldo dan riwayat sendiri.', system: true },
];
const grants: Record<string, string[]> = {
  admin: ['dashboard.view','products.view','products.manage','sales.view','wallet.view','wallet.topup','users.view','users.manage','reports.view','expenses.view','expenses.manage','stock.view','stock.manage','settings.manage','shifts.view','shifts.manage'],
  kasir: ['dashboard.view','pos.access','products.view','sales.view','wallet.view','shifts.open','shifts.close'],
  pelanggan: [],
};
const products = [
  ['SKU-001','Air Mineral 600 ml','Minuman','botol',4000,80,10],
  ['SKU-002','Teh Kotak','Minuman','kotak',5000,55,8],
  ['SKU-003','Roti Cokelat','Makanan','pcs',4500,35,6],
  ['SKU-004','Nasi Kuning Mini','Makanan','box',10000,24,5],
  ['SKU-005','Mie Cup','Makanan','cup',8500,30,5],
  ['SKU-006','Pisang Cokelat','Camilan','pcs',3000,45,8],
  ['SKU-007','Susu UHT','Minuman','kotak',6000,40,7],
  ['SKU-008','Biskuit Gandum','Camilan','bungkus',3500,32,6],
  ['SKU-009','Puding Cokelat','Camilan','cup',5000,18,5],
  ['SKU-010','Air Mineral 330 ml','Minuman','botol',2500,70,10],
] as const;
const demoUsers = [
  { name:'Super Administrator', email:'superadmin@dpay.local', password:'SuperAdmin123!', pin:null, role:'superadmin', type:null, number:null, className:null, balance:0 },
  { name:'Admin Kantin', email:'admin@dpay.local', password:'Admin123!', pin:null, role:'admin', type:null, number:null, className:null, balance:0 },
  { name:'Kasir Kantin', email:'kasir@dpay.local', password:'Kasir123!', pin:null, role:'kasir', type:null, number:null, className:null, balance:0 },
  { name:'Nadia Putri (Demo)', email:'siswa@dpay.local', password:'Siswa123!', pin:'4321', role:'pelanggan', type:'student', number:'2026-0701', className:'VII-A', balance:100000 },
  { name:'Budi Santoso (Guru Demo)', email:'guru@dpay.local', password:'Guru123!', pin:'4321', role:'pelanggan', type:'teacher', number:'NIP-001', className:'Guru', balance:100000 },
];

async function main() {
  const schema = fs.readFileSync(path.resolve(process.cwd(), 'sql/schema.sql'), 'utf8');
  await pool.query(schema);
  for (const permission of PERMISSIONS) {
    await pool.query(`INSERT INTO permissions(code,label,group_name,description) VALUES($1,$2,$3,$4) ON CONFLICT(code) DO UPDATE SET label=EXCLUDED.label,group_name=EXCLUDED.group_name,description=EXCLUDED.description`, [permission.code, permission.label, permission.group, permission.description]);
  }
  for (const role of roles) {
    await pool.query(`INSERT INTO roles(role_key,name,description,is_system) VALUES($1,$2,$3,$4) ON CONFLICT(role_key) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,is_system=EXCLUDED.is_system`, [role.key, role.name, role.description, role.system]);
  }
  const superRole = await pool.query(`SELECT id FROM roles WHERE role_key='superadmin'`);
  await pool.query(`INSERT INTO role_permissions(role_id,permission_code) SELECT $1,code FROM permissions ON CONFLICT DO NOTHING`, [superRole.rows[0].id]);
  for (const [roleKey, codes] of Object.entries(grants)) {
    const role = await pool.query(`SELECT id FROM roles WHERE role_key=$1`, [roleKey]);
    await pool.query(`DELETE FROM role_permissions WHERE role_id=$1`, [role.rows[0].id]);
    for (const code of codes) await pool.query(`INSERT INTO role_permissions(role_id,permission_code) VALUES($1,$2) ON CONFLICT DO NOTHING`, [role.rows[0].id, code]);
  }
  const ids: Record<string,string> = {};
  for (const person of demoUsers) {
    const role = await pool.query(`SELECT id FROM roles WHERE role_key=$1`, [person.role]);
    const passwordHash = await bcrypt.hash(person.password, Number(process.env.BCRYPT_ROUNDS || 12));
    const pinHash = person.pin ? await bcrypt.hash(person.pin, Number(process.env.BCRYPT_ROUNDS || 12)) : null;
    const created = await pool.query(
      `INSERT INTO users(full_name,email,password_hash,transaction_pin_hash,role_id,status)
       VALUES($1,$2,$3,$4,$5,'active')
       ON CONFLICT(email) DO UPDATE SET full_name=EXCLUDED.full_name,password_hash=EXCLUDED.password_hash,
         transaction_pin_hash=COALESCE(EXCLUDED.transaction_pin_hash,users.transaction_pin_hash),role_id=EXCLUDED.role_id,status='active',updated_at=NOW()
       RETURNING id`, [person.name, person.email, passwordHash, pinHash, role.rows[0].id]);
    const userId = created.rows[0].id as string; ids[person.email] = userId;
    await pool.query(`INSERT INTO wallets(user_id,balance) VALUES($1,$2) ON CONFLICT(user_id) DO NOTHING`, [userId, person.balance]);
    if (person.type) {
      await pool.query(`INSERT INTO user_profiles(user_id,account_type,student_number,class_name) VALUES($1,$2,$3,$4)
        ON CONFLICT(user_id) DO UPDATE SET account_type=EXCLUDED.account_type,student_number=EXCLUDED.student_number,class_name=EXCLUDED.class_name`, [userId,person.type,person.number,person.className]);
      const q = await pool.query(`SELECT id FROM account_qr_tokens WHERE user_id=$1`, [userId]);
      if (!q.rowCount) await pool.query(`INSERT INTO account_qr_tokens(qr_token,user_id) VALUES($1,$2)`, [crypto.randomBytes(32).toString('base64url'), userId]);
      const ledger = await pool.query(`SELECT id FROM wallet_transactions WHERE user_id=$1 AND type='topup' LIMIT 1`, [userId]);
      if (!ledger.rowCount && person.balance > 0) {
        await pool.query(`INSERT INTO wallet_transactions(user_id,type,amount,direction,balance_before,balance_after,admin_id,note) VALUES($1,'topup',$2,'in',0,$2,$3,'Saldo awal demo')`, [userId,person.balance,ids['admin@dpay.local'] ?? userId]);
      }
    }
  }
  for (const product of products) await pool.query(`INSERT INTO products(sku,name,category,unit,price,stock,low_stock_threshold) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(sku) DO NOTHING`, product);
  console.log('DMC FLOW / D-PAY database ready in schema dpay. Demo accounts: superadmin@dpay.local / SuperAdmin123!, kasir@dpay.local / Kasir123!, siswa@dpay.local / Siswa123!, guru@dpay.local / Guru123!. Demo transaction PIN for student/teacher: 4321.');
}
main().catch(error => { console.error('Database initialization failed:', error); process.exitCode = 1; }).finally(() => pool.end());
