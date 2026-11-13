import { Router } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { pool } from '../../../infrastructure/database';
import { writeAudit } from '../../../infrastructure/audit';
import { PostgresCheckoutRepository } from '../../../infrastructure/repositories/postgres-checkout-repository';
import { CheckoutBusinessError, CheckoutUseCase } from '../../../application/use-cases/checkout-use-case';
import { requireAuth, requirePermission } from '../middleware/security';
export const posRouter=Router();
posRouter.use(requireAuth);
const checkoutUseCase=new CheckoutUseCase(new PostgresCheckoutRepository());
function normalizeQr(value:string){const raw=value.trim();if(raw.startsWith('DPAY:'))return raw.slice(5).trim();try{const u=new URL(raw);const parts=u.pathname.split('/').filter(Boolean);return parts.at(-1)||raw;}catch{return raw;}}
const qrSchema=z.object({qrToken:z.string().trim().min(8).max(200)});

posRouter.post('/identify',requirePermission('pos.access'),async(req,res,next)=>{
  try {
    const input=qrSchema.parse(req.body),token=normalizeQr(input.qrToken);
    const result=await pool.query(`SELECT u.id,u.full_name AS "fullName",u.status AS "userStatus",r.role_key AS "roleKey",r.name AS "roleName",q.status AS "qrStatus",COALESCE(w.balance,0)::bigint AS balance,up.account_type AS "accountType",up.student_number AS "studentNumber",up.class_name AS "className"
      FROM account_qr_tokens q JOIN users u ON u.id=q.user_id JOIN roles r ON r.id=u.role_id LEFT JOIN wallets w ON w.user_id=u.id LEFT JOIN user_profiles up ON up.user_id=u.id WHERE q.qr_token=$1`,[token]);
    const row=result.rows[0];
    if(!row||row.userStatus!=='active'||row.qrStatus!=='active'||row.roleKey!=='pelanggan')return res.status(404).json({error:'QR tidak valid, telah dicabut, atau akun tidak aktif.'});
    return res.json({account:{...row,balance:Number(row.balance)},message:'Akun valid. Minta pemilik akun memasukkan PIN transaksi sebelum pembayaran.'});
  } catch(error){return next(error);}
});

const checkoutSchema=z.object({
  paymentMethod:z.enum(['cash','qr_wallet']).default('qr_wallet'),
  qrToken:z.string().trim().min(8).max(200).optional(),
  transactionPin:z.string().optional(),
  cashReceived:z.coerce.number().int().min(0).max(1000000000).optional(),
  items:z.array(z.object({sku:z.string().trim().min(1).max(100),qty:z.coerce.number().int().min(1).max(1000)})).min(1).max(100),
  idempotencyKey:z.string().max(100).optional(),
});
posRouter.post('/checkout',requirePermission('pos.access'),async(req,res,next)=>{
  try {
    const input=checkoutSchema.parse(req.body);
    let qrToken:string|undefined;
    if(input.paymentMethod==='qr_wallet'){
      if(!input.qrToken) return res.status(400).json({error:'Scan QR akun D-PAY untuk pembayaran saldo.'});
      if(!input.transactionPin||!/^(?!([0-9])\1{3,5}$)\d{4,6}$/.test(input.transactionPin))return res.status(400).json({error:'PIN transaksi harus 4–6 digit dan tidak boleh semuanya sama.'});
      qrToken=normalizeQr(input.qrToken);
      const account=await pool.query(`SELECT u.id,u.transaction_pin_hash,u.status AS "userStatus",r.role_key,q.status AS "qrStatus" FROM account_qr_tokens q JOIN users u ON u.id=q.user_id JOIN roles r ON r.id=u.role_id WHERE q.qr_token=$1`,[qrToken]);
      const row=account.rows[0];
      if(!row||row.userStatus!=='active'||row.qrStatus!=='active'||row.role_key!=='pelanggan')return res.status(404).json({error:'QR akun tidak valid, dicabut, atau tidak aktif.'});
      const pinState=await pool.query(`SELECT failed_attempts AS "failedAttempts",locked_until AS "lockedUntil" FROM pin_attempts WHERE user_id=$1`,[row.id]);
      if(pinState.rows[0]?.lockedUntil && new Date(pinState.rows[0].lockedUntil).getTime()>Date.now())return res.status(429).json({error:'PIN sementara terkunci setelah beberapa percobaan. Tunggu 15 menit sebelum mencoba kembali.'});
      const pinMatches=Boolean(row.transaction_pin_hash && await bcrypt.compare(input.transactionPin,row.transaction_pin_hash));
      if(!pinMatches){
        const failure=await pool.query(`INSERT INTO pin_attempts(user_id,failed_attempts,locked_until,updated_at) VALUES($1,1,NULL,NOW())
          ON CONFLICT(user_id) DO UPDATE SET
            failed_attempts=CASE WHEN pin_attempts.locked_until IS NOT NULL AND pin_attempts.locked_until<=NOW() THEN 1 ELSE pin_attempts.failed_attempts+1 END,
            locked_until=CASE WHEN (CASE WHEN pin_attempts.locked_until IS NOT NULL AND pin_attempts.locked_until<=NOW() THEN 1 ELSE pin_attempts.failed_attempts+1 END)>=5 THEN NOW()+INTERVAL '15 minutes' ELSE NULL END,
            updated_at=NOW()
          RETURNING failed_attempts AS "failedAttempts",locked_until AS "lockedUntil"`,[row.id]);
        const locked=Boolean(failure.rows[0]?.lockedUntil);
        return res.status(locked ? 429 : 422).json({error:locked?'PIN terkunci selama 15 menit setelah 5 percobaan gagal.':'Mohon maaf, PIN salah.',attemptsRemaining:Math.max(0,5-Number(failure.rows[0]?.failedAttempts||0))});
      }
      await pool.query(`DELETE FROM pin_attempts WHERE user_id=$1`,[row.id]);
    }
    const idempotencyKey=input.idempotencyKey??req.header('x-idempotency-key')??crypto.randomUUID();
    const result=await checkoutUseCase.execute({paymentMethod:input.paymentMethod,qrToken,transactionPin:input.transactionPin,cashReceived:input.cashReceived,items:input.items,cashierId:req.user!.id,idempotencyKey});
    if(!result.idempotentReplay)await writeAudit(req,'pos.checkout','sale',result.sale.id,{receiptNo:result.sale.receiptNo,total:result.sale.total,paymentMethod:result.sale.paymentMethod,itemCount:result.sale.items?.length??0,shiftId:result.sale.shiftId});
    return res.status(result.idempotentReplay?200:201).json({sale:result.sale,idempotentReplay:result.idempotentReplay,message:result.idempotentReplay?'Transaksi sebelumnya sudah berhasil diproses.':input.paymentMethod==='cash'?'Pembayaran tunai berhasil dan tercatat pada shift kasir.':'Pembayaran D-PAY berhasil. Saldo otomatis terpotong.'});
  }catch(error:any){if(error instanceof CheckoutBusinessError)return res.status(error.status).json({error:error.message,...error.payload});if(error?.code==='23505'&&String(error?.constraint||'').includes('idempotency'))return res.status(409).json({error:'Request pembayaran terduplikasi. Periksa riwayat transaksi sebelum mengulang.'});return next(error);}
});
