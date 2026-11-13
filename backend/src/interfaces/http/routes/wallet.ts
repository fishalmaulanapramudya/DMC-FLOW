import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../../infrastructure/database';
import { writeAudit } from '../../../infrastructure/audit';
import { requireAuth, requirePermission } from '../middleware/security';
export const walletRouter=Router();
walletRouter.use(requireAuth);
walletRouter.get('/me',async(req,res,next)=>{
  try {
    const result=await pool.query(`SELECT w.balance,q.qr_token AS "qrToken",q.status AS "qrStatus",q.last_used_at AS "lastUsedAt" FROM wallets w LEFT JOIN account_qr_tokens q ON q.user_id=w.user_id WHERE w.user_id=$1`,[req.user!.id]);
    if(!result.rowCount)return res.status(404).json({error:'Dompet belum dibuat.'});
    return res.json({wallet:{...result.rows[0],balance:Number(result.rows[0].balance)}});
  } catch(error){return next(error);}
});
walletRouter.get('/me/transactions',async(req,res,next)=>{
  try {const result=await pool.query(`SELECT wt.id,wt.type,wt.amount,wt.direction,wt.balance_before AS "balanceBefore",wt.balance_after AS "balanceAfter",wt.note,wt.created_at AS "createdAt",s.receipt_no AS "receiptNo" FROM wallet_transactions wt LEFT JOIN sales s ON s.id=wt.sale_id WHERE wt.user_id=$1 ORDER BY wt.created_at DESC LIMIT 100`,[req.user!.id]);return res.json({transactions:result.rows.map(row=>({...row,amount:Number(row.amount),balanceBefore:Number(row.balanceBefore),balanceAfter:Number(row.balanceAfter)}))});}catch(error){return next(error);}
});
walletRouter.get('/users/:id/transactions',requirePermission('wallet.view'),async(req,res,next)=>{
  try {const result=await pool.query(`SELECT wt.id,wt.type,wt.amount,wt.direction,wt.balance_before AS "balanceBefore",wt.balance_after AS "balanceAfter",wt.note,wt.created_at AS "createdAt",s.receipt_no AS "receiptNo" FROM wallet_transactions wt LEFT JOIN sales s ON s.id=wt.sale_id WHERE wt.user_id=$1 ORDER BY wt.created_at DESC LIMIT 100`,[req.params.id]);return res.json({transactions:result.rows.map(row=>({...row,amount:Number(row.amount),balanceBefore:Number(row.balanceBefore),balanceAfter:Number(row.balanceAfter)}))});}catch(error){return next(error);}
});
walletRouter.post('/topups',requirePermission('wallet.topup'),async(req,res,next)=>{
  const client=await pool.connect();
  try {
    const input=z.object({userId:z.string().uuid(),amount:z.coerce.number().int().min(1000).max(1000000000),note:z.string().trim().max(240).optional().default('Top-up saldo kantin')}).parse(req.body);
    await client.query('BEGIN');
    const user=await client.query(`SELECT u.id,u.full_name,r.role_key,u.status FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=$1 FOR UPDATE OF u`,[input.userId]);
    if(!user.rowCount||user.rows[0].role_key!=='pelanggan'||user.rows[0].status!=='active'){await client.query('ROLLBACK');return res.status(404).json({error:'Akun pelanggan aktif tidak ditemukan.'});}
    const wallet=await client.query(`SELECT balance FROM wallets WHERE user_id=$1 FOR UPDATE`,[input.userId]);
    if(!wallet.rowCount){await client.query('ROLLBACK');return res.status(409).json({error:'Dompet akun belum dibuat.'});}
    const before=Number(wallet.rows[0].balance),after=before+input.amount;
    if(!Number.isSafeInteger(after)){await client.query('ROLLBACK');return res.status(400).json({error:'Saldo melebihi batas yang didukung.'});}
    await client.query(`UPDATE wallets SET balance=$1,updated_at=NOW() WHERE user_id=$2`,[after,input.userId]);
    const tx=await client.query(`INSERT INTO wallet_transactions(user_id,type,amount,direction,balance_before,balance_after,admin_id,note) VALUES($1,'topup',$2,'in',$3,$4,$5,$6) RETURNING id,created_at AS "createdAt"`,[input.userId,input.amount,before,after,req.user!.id,input.note]);
    await client.query('COMMIT'); await writeAudit(req,'wallet.topup','wallet',input.userId,{amount:input.amount,transactionId:tx.rows[0].id});
    return res.status(201).json({message:'Top-up berhasil.',user:{id:user.rows[0].id,fullName:user.rows[0].full_name},transaction:{...tx.rows[0],amount:input.amount},balanceBefore:before,balanceAfter:after});
  }catch(error){await client.query('ROLLBACK').catch(()=>undefined);return next(error);}finally{client.release();}
});
