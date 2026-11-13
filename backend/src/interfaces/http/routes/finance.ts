import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../../infrastructure/database';
import { writeAudit } from '../../../infrastructure/audit';
import { requireAuth, requirePermission } from '../middleware/security';

export const financeRouter=Router();financeRouter.use(requireAuth);
const intervalFor=(period:string)=>period==='week'?'7 days':period==='month'?'1 month':'1 day';

financeRouter.get('/dashboard',requirePermission('dashboard.view'),async(req,res,next)=>{
  try{
    const interval=intervalFor(String(req.query.period??'day'));
    const [sales,topups,expenses,stock,lowStock,activity]=await Promise.all([
      pool.query(`SELECT COALESCE(SUM(total),0)::bigint AS total,COUNT(*)::int AS count FROM sales WHERE created_at>=NOW()-($1::interval)`,[interval]),
      pool.query(`SELECT COALESCE(SUM(amount),0)::bigint AS total,COUNT(*)::int AS count FROM wallet_transactions WHERE type='topup' AND direction='in' AND created_at>=NOW()-($1::interval)`,[interval]),
      pool.query(`SELECT COALESCE(SUM(amount),0)::bigint AS total,COUNT(*)::int AS count FROM expenses WHERE created_at>=NOW()-($1::interval)`,[interval]),
      pool.query(`SELECT COUNT(*)::int AS count,COALESCE(SUM(stock*price),0)::bigint AS value FROM products WHERE active=true`),
      pool.query(`SELECT id,sku,name,stock,low_stock_threshold AS threshold FROM products WHERE active=true AND stock<=low_stock_threshold ORDER BY stock ASC LIMIT 6`),
      pool.query(`SELECT s.id,s.receipt_no AS "receiptNo",s.total,s.created_at AS "createdAt",COALESCE(u.full_name,'Pembeli Tunai') AS "studentName" FROM sales s LEFT JOIN users u ON u.id=s.customer_id ORDER BY s.created_at DESC LIMIT 6`),
    ]);
    const salesTotal=Number(sales.rows[0].total),topupTotal=Number(topups.rows[0].total),expenseTotal=Number(expenses.rows[0].total);
    const trend=await pool.query(`SELECT to_char(bucket,'DD Mon') AS label,COALESCE(SUM(s.total),0)::bigint AS sales FROM generate_series(date_trunc('day',NOW()-($1::interval)),date_trunc('day',NOW()),'1 day') bucket LEFT JOIN sales s ON date_trunc('day',s.created_at)=bucket GROUP BY bucket ORDER BY bucket`,[interval]);
    return res.json({summary:{sales:salesTotal,salesCount:sales.rows[0].count,income:salesTotal,topups:topupTotal,topupCount:topups.rows[0].count,expenses:expenseTotal,expenseCount:expenses.rows[0].count,netOperational:salesTotal-expenseTotal,cashFlow:topupTotal-expenseTotal,products:stock.rows[0].count,stockValue:Number(stock.rows[0].value)},lowStock:lowStock.rows,activity:activity.rows.map(row=>({...row,total:Number(row.total)})),trend:trend.rows.map(row=>({...row,sales:Number(row.sales)}))});
  }catch(error){return next(error);}
});

financeRouter.get('/reports',requirePermission('reports.view'),async(req,res,next)=>{
  try{
    const period=String(req.query.period??'day');const interval=intervalFor(period);
    const [sales,topups,expenses,opname]=await Promise.all([
      pool.query(`SELECT COALESCE(SUM(total),0)::bigint AS total,COUNT(*)::int AS count FROM sales WHERE created_at>=NOW()-($1::interval)`,[interval]),
      pool.query(`SELECT COALESCE(SUM(amount),0)::bigint AS total,COUNT(*)::int AS count FROM wallet_transactions WHERE type='topup' AND created_at>=NOW()-($1::interval)`,[interval]),
      pool.query(`SELECT COALESCE(SUM(amount),0)::bigint AS total,COUNT(*)::int AS count FROM expenses WHERE created_at>=NOW()-($1::interval)`,[interval]),
      pool.query(`SELECT COUNT(*)::int AS count,COALESCE(SUM(ABS(difference)),0)::int AS variance FROM stock_opnames WHERE created_at>=NOW()-($1::interval)`,[interval]),
    ]);
    const salesTotal=Number(sales.rows[0].total),topupTotal=Number(topups.rows[0].total),expenseTotal=Number(expenses.rows[0].total);
    const daily=await pool.query(`SELECT date_trunc('day',s.created_at)::date AS day,COALESCE(SUM(s.total),0)::bigint AS sales,COUNT(s.id)::int AS transactions FROM sales s WHERE s.created_at>=NOW()-($1::interval) GROUP BY 1 ORDER BY 1`,[interval]);
    return res.json({period,summary:{sales:salesTotal,salesCount:sales.rows[0].count,income:salesTotal,topups:topupTotal,topupCount:topups.rows[0].count,expenses:expenseTotal,expenseCount:expenses.rows[0].count,netOperational:salesTotal-expenseTotal,cashFlow:topupTotal-expenseTotal,stockOpnames:opname.rows[0].count,stockVariance:opname.rows[0].variance},daily:daily.rows.map(row=>({...row,sales:Number(row.sales)}))});
  }catch(error){return next(error);}
});

financeRouter.get('/expenses',requirePermission('expenses.view'),async(req,res,next)=>{
  try{const interval=intervalFor(String(req.query.period??'month'));const result=await pool.query(`SELECT e.id,e.category,e.description,e.amount,e.created_at AS "createdAt",u.full_name AS "recordedBy" FROM expenses e JOIN users u ON u.id=e.recorded_by WHERE e.created_at>=NOW()-($1::interval) ORDER BY e.created_at DESC LIMIT 500`,[interval]);return res.json({expenses:result.rows.map(row=>({...row,amount:Number(row.amount)}))});}catch(error){return next(error);}
});
financeRouter.post('/expenses',requirePermission('expenses.manage'),async(req,res,next)=>{
  try{const input=z.object({category:z.string().trim().min(2).max(80),description:z.string().trim().min(2).max(240),amount:z.coerce.number().int().min(1).max(1000000000)}).parse(req.body);const result=await pool.query(`INSERT INTO expenses(shift_id,category,description,amount,recorded_by) VALUES((SELECT id FROM cashier_shifts WHERE cashier_id=$4 AND status='open' LIMIT 1),$1,$2,$3,$4) RETURNING id,category,description,amount,created_at AS "createdAt"`,[input.category,input.description,input.amount,req.user!.id]);await writeAudit(req,'expense.create','expense',result.rows[0].id,input);return res.status(201).json({expense:{...result.rows[0],amount:Number(result.rows[0].amount)}});}catch(error){return next(error);}
});

financeRouter.get('/stock-opname',requirePermission('stock.view'),async(req,res,next)=>{
  try{const interval=intervalFor(String(req.query.period??'month'));const result=await pool.query(`SELECT so.id,so.sku_snapshot AS sku,so.name_snapshot AS name,so.system_stock AS "systemStock",so.actual_stock AS "actualStock",so.difference,so.note,so.created_at AS "createdAt",u.full_name AS "recordedBy" FROM stock_opnames so JOIN users u ON u.id=so.recorded_by WHERE so.created_at>=NOW()-($1::interval) ORDER BY so.created_at DESC LIMIT 500`,[interval]);return res.json({opnames:result.rows});}catch(error){return next(error);}
});
financeRouter.post('/stock-opname',requirePermission('stock.manage'),async(req,res,next)=>{
  const client=await pool.connect();
  try{const input=z.object({sku:z.string().trim().min(1).max(100),actualStock:z.coerce.number().int().min(0).max(10000000),note:z.string().trim().max(240).optional().default('')}).parse(req.body);await client.query('BEGIN');const found=await client.query(`SELECT id,sku,name,stock FROM products WHERE sku=$1 AND active=true FOR UPDATE`,[input.sku]);if(!found.rowCount){await client.query('ROLLBACK');return res.status(404).json({error:'SKU produk aktif tidak ditemukan.'});}const p=found.rows[0],before=Number(p.stock),difference=input.actualStock-before;const opname=await client.query(`INSERT INTO stock_opnames(product_id,sku_snapshot,name_snapshot,system_stock,actual_stock,difference,note,recorded_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,created_at AS "createdAt"`,[p.id,p.sku,p.name,before,input.actualStock,difference,input.note,req.user!.id]);await client.query(`UPDATE products SET stock=$1,updated_at=NOW() WHERE id=$2`,[input.actualStock,p.id]);await client.query(`INSERT INTO stock_movements(product_id,movement_type,quantity_delta,reference_id,note,recorded_by) VALUES($1,'stock_opname',$2,$3,$4,$5)`,[p.id,difference,opname.rows[0].id,input.note||'Penyesuaian melalui stok opname',req.user!.id]);await client.query('COMMIT');await writeAudit(req,'stock.opname','product',p.id,{sku:p.sku,before,actual:input.actualStock,difference});return res.status(201).json({opname:{...opname.rows[0],sku:p.sku,name:p.name,systemStock:before,actualStock:input.actualStock,difference},message:'Stok sistem disesuaikan dengan stok fisik.'});}catch(error){await client.query('ROLLBACK').catch(()=>undefined);return next(error);}finally{client.release();}
});

financeRouter.get('/audit-logs',requirePermission('audit.view'),async(req,res,next)=>{
  try{const result=await pool.query(`SELECT a.id,a.action,a.resource,a.resource_id AS "resourceId",a.ip_address AS ip,a.detail,a.created_at AS "createdAt",u.full_name AS actor FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.created_at DESC LIMIT 300`);return res.json({logs:result.rows});}catch(error){return next(error);}
});
