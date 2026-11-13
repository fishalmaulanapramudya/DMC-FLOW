import { Router } from 'express';
import { pool } from '../../../infrastructure/database';
import { requireAuth, requirePermission } from '../middleware/security';

export const salesRouter=Router();salesRouter.use(requireAuth);
const intervalFor=(period:string)=>period==='week'?'7 days':period==='month'?'1 month':'1 day';

salesRouter.get('/mine',async(req,res,next)=>{
  try{
    const result=await pool.query(`SELECT s.id,s.receipt_no AS "receiptNo",s.total,s.created_at AS "createdAt",u.full_name AS "cashierName",s.payment_method AS "paymentMethod",s.shift_id AS "shiftId",s.cash_received AS "cashReceived",s.cash_change AS "cashChange",json_agg(json_build_object('sku',si.sku_snapshot,'name',si.name_snapshot,'qty',si.qty,'unitPrice',si.unit_price,'subtotal',si.subtotal) ORDER BY si.name_snapshot) AS items FROM sales s JOIN users u ON u.id=s.cashier_id JOIN sale_items si ON si.sale_id=s.id WHERE s.customer_id=$1 GROUP BY s.id,u.full_name ORDER BY s.created_at DESC LIMIT 100`,[req.user!.id]);
    return res.json({sales:result.rows.map(row=>({...row,total:Number(row.total),items:row.items.map((item:any)=>({...item,unitPrice:Number(item.unitPrice),subtotal:Number(item.subtotal)}))}))});
  }catch(error){return next(error);}
});
salesRouter.get('/',requirePermission('sales.view'),async(req,res,next)=>{
  try{
    const period=String(req.query.period??'day');const interval=intervalFor(period);
    const result=await pool.query(`SELECT s.id,s.receipt_no AS "receiptNo",s.subtotal,s.total,s.created_at AS "createdAt",cashier.full_name AS "cashierName",COALESCE(student.full_name,'Pembeli Tunai') AS "studentName",s.payment_method AS "paymentMethod",s.shift_id AS "shiftId",s.cash_received AS "cashReceived",s.cash_change AS "cashChange",json_agg(json_build_object('sku',si.sku_snapshot,'name',si.name_snapshot,'qty',si.qty,'unitPrice',si.unit_price,'subtotal',si.subtotal) ORDER BY si.name_snapshot) AS items FROM sales s JOIN users cashier ON cashier.id=s.cashier_id LEFT JOIN users student ON student.id=s.customer_id JOIN sale_items si ON si.sale_id=s.id WHERE s.created_at>=NOW()-($1::interval) GROUP BY s.id,cashier.full_name,student.full_name ORDER BY s.created_at DESC LIMIT 500`,[interval]);
    return res.json({sales:result.rows.map(row=>({...row,subtotal:Number(row.subtotal),total:Number(row.total),cashReceived:row.cashReceived===null?null:Number(row.cashReceived),cashChange:row.cashChange===null?null:Number(row.cashChange),items:row.items.map((item:any)=>({...item,unitPrice:Number(item.unitPrice),subtotal:Number(item.subtotal)}))}))});
  }catch(error){return next(error);}
});
salesRouter.get('/:id',async(req,res,next)=>{
  try{
    const result=await pool.query(`SELECT s.id,s.receipt_no AS "receiptNo",s.total,s.subtotal,s.created_at AS "createdAt",s.customer_id AS "customerId",s.cashier_id AS "cashierId",COALESCE(student.full_name,'Pembeli Tunai') AS "studentName",cashier.full_name AS "cashierName",s.payment_method AS "paymentMethod",s.shift_id AS "shiftId",s.cash_received AS "cashReceived",s.cash_change AS "cashChange",json_agg(json_build_object('sku',si.sku_snapshot,'name',si.name_snapshot,'qty',si.qty,'unitPrice',si.unit_price,'subtotal',si.subtotal)) AS items FROM sales s LEFT JOIN users student ON student.id=s.customer_id JOIN users cashier ON cashier.id=s.cashier_id JOIN sale_items si ON si.sale_id=s.id WHERE s.id=$1 GROUP BY s.id,student.full_name,cashier.full_name`,[req.params.id]);
    if(!result.rowCount)return res.status(404).json({error:'Transaksi tidak ditemukan.'});
    const sale=result.rows[0];if(req.user!.roleKey!=='superadmin'&&!req.user!.permissions.includes('sales.view')&&sale.customerId!==req.user!.id)return res.status(403).json({error:'Anda hanya dapat melihat transaksi milik sendiri.'});
    return res.json({sale:{...sale,total:Number(sale.total),subtotal:Number(sale.subtotal),cashReceived:sale.cashReceived===null?null:Number(sale.cashReceived),cashChange:sale.cashChange===null?null:Number(sale.cashChange),items:sale.items.map((item:any)=>({...item,unitPrice:Number(item.unitPrice),subtotal:Number(item.subtotal)}))}});
  }catch(error){return next(error);}
});
