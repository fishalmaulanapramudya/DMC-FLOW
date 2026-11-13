import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../../infrastructure/database';
import { writeAudit } from '../../../infrastructure/audit';
import { requireAuth, requirePermission } from '../middleware/security';

export const productsRouter = Router();
const productInput = z.object({ sku: z.string().trim().min(1).max(100), name: z.string().trim().min(2).max(160), category: z.string().trim().max(100).default('Umum'), unit: z.string().trim().max(30).default('pcs'), price: z.coerce.number().int().min(0).max(1000000000), stock: z.coerce.number().int().min(0).max(10000000), lowStockThreshold: z.coerce.number().int().min(0).max(1000000).default(5), active: z.boolean().optional().default(true) });
export function calculateNewStockAfterRestock(currentStock: number, quantity: number) {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new TypeError('Quantity restock harus bernilai positif.');
  }
  return currentStock + quantity;
}
productsRouter.use(requireAuth);
productsRouter.get('/', requirePermission('products.view'), async (req,res,next) => {
  try {
    const search = String(req.query.search ?? '').trim();
    const active = req.query.active === 'all' ? null : req.query.active === 'false' ? false : true;
    const result = await pool.query(`SELECT id,sku,name,category,unit,price,stock,low_stock_threshold AS "lowStockThreshold",active,created_at AS "createdAt" FROM products WHERE ($1='' OR sku ILIKE $2 OR name ILIKE $2 OR category ILIKE $2) AND ($3::boolean IS NULL OR active=$3) ORDER BY name LIMIT 500`,[search,`%${search}%`,active]);
    return res.json({ products: result.rows });
  } catch(error){return next(error);}
});
productsRouter.get('/sku/:sku', requirePermission('pos.access'), async (req,res,next) => {
  try {
    const result = await pool.query(`SELECT id,sku,name,category,unit,price,stock,low_stock_threshold AS "lowStockThreshold",active FROM products WHERE sku=$1 AND active=true`,[req.params.sku.trim()]);
    if(!result.rowCount) return res.status(404).json({error:'SKU tidak ditemukan atau produk nonaktif.'});
    return res.json({product:result.rows[0]});
  } catch(error){return next(error);}
});
productsRouter.post('/', requirePermission('products.manage'), async (req,res,next) => {
  try {
    const input=productInput.parse(req.body);
    const result=await pool.query(`INSERT INTO products(sku,name,category,unit,price,stock,low_stock_threshold,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[input.sku,input.name,input.category,input.unit,input.price,input.stock,input.lowStockThreshold,input.active]);
    await writeAudit(req,'product.create','product',result.rows[0].id,{sku:input.sku});
    return res.status(201).json({product:{...result.rows[0],lowStockThreshold:result.rows[0].low_stock_threshold}});
  } catch(error:any){if(error?.code==='23505')return res.status(409).json({error:'SKU sudah digunakan.'});if(error?.code==='23514')return res.status(409).json({error:'SKU tidak dapat diubah setelah produk memiliki riwayat penjualan.'});return next(error);}
});
productsRouter.patch('/:id', requirePermission('products.manage'), async (req,res,next) => {
  try {
    const input=productInput.partial().parse(req.body);
    const current=await pool.query(`SELECT id,sku,stock FROM products WHERE id=$1`,[req.params.id]);
    if(!current.rowCount)return res.status(404).json({error:'Produk tidak ditemukan.'});
    if(input.sku !== undefined && input.sku !== current.rows[0].sku) {
      const sold=await pool.query(`SELECT 1 FROM sale_items WHERE product_id=$1 LIMIT 1`,[req.params.id]);
      if(sold.rowCount)return res.status(409).json({error:'SKU tidak dapat diubah setelah produk memiliki riwayat penjualan. Nonaktifkan produk lama dan buat SKU baru.'});
    }
    if(input.stock !== undefined && input.stock !== Number(current.rows[0].stock)) {
      return res.status(409).json({error:'Gunakan menu Stok Opname untuk penyesuaian stok agar perubahan tercatat pada riwayat inventori.'});
    }
    const fields: Record<string,string>={sku:'sku',name:'name',category:'category',unit:'unit',price:'price',stock:'stock',lowStockThreshold:'low_stock_threshold',active:'active'};
    const entries=Object.entries(input).filter(([key])=>fields[key]);
    if(!entries.length) return res.status(400).json({error:'Tidak ada data yang diubah.'});
    const values=entries.map(([,value])=>value); const sets=entries.map(([key],i)=>`${fields[key]}=$${i+1}`);
    sets.push('updated_at=NOW()'); values.push(req.params.id);
    const result=await pool.query(`UPDATE products SET ${sets.join(',')} WHERE id=$${values.length} RETURNING id,sku,name,category,unit,price,stock,low_stock_threshold AS "lowStockThreshold",active`,values);
    await writeAudit(req,'product.update','product',req.params.id,input);
    return res.json({product:result.rows[0]});
  } catch(error:any){if(error?.code==='23505')return res.status(409).json({error:'SKU sudah digunakan.'});if(error?.code==='23514')return res.status(409).json({error:'SKU tidak dapat diubah setelah produk memiliki riwayat penjualan.'});return next(error);}
});
productsRouter.post('/:id/restock', requirePermission('products.manage'), async (req,res,next) => {
  try {
    const input=z.object({ quantity: z.coerce.number().int().min(1).max(10000000), note: z.string().trim().max(240).optional().default('') }).parse(req.body);
    const current=await pool.query(`SELECT id,sku,name,stock,unit FROM products WHERE id=$1 FOR UPDATE`,[req.params.id]);
    if(!current.rowCount) return res.status(404).json({error:'Produk tidak ditemukan.'});
    const product=current.rows[0];
    const before=Number(product.stock);
    const after=calculateNewStockAfterRestock(before,input.quantity);
    const result=await pool.query(`UPDATE products SET stock=$1,updated_at=NOW() WHERE id=$2 RETURNING id,sku,name,category,unit,price,stock,low_stock_threshold AS "lowStockThreshold",active`,[after,product.id]);
    const movement=await pool.query(`INSERT INTO stock_movements(product_id,movement_type,quantity_delta,reference_id,note,recorded_by) VALUES($1,'restock',$2,NULL,$3,$4) RETURNING id,created_at AS "createdAt"`,[product.id,input.quantity,input.note || `Restok ${product.name}`,req.user!.id]);
    await writeAudit(req,'product.restock','product',product.id,{sku:product.sku,before,after,quantity:input.quantity,note:input.note || ''});
    return res.status(201).json({product:result.rows[0],restock:{id:movement.rows[0].id,quantity:input.quantity,before,after,note:input.note || `Restok ${product.name}`,createdAt:movement.rows[0].createdAt}});
  } catch(error:any){if(error?.message?.includes('positive')) return res.status(400).json({error:'Jumlah restok harus lebih dari 0.'}); return next(error);} 
});
productsRouter.delete('/:id', requirePermission('products.manage'), async (req,res,next) => {
  try {
    const result=await pool.query(`UPDATE products SET active=false,updated_at=NOW() WHERE id=$1 RETURNING id`,[req.params.id]);
    if(!result.rowCount)return res.status(404).json({error:'Produk tidak ditemukan.'});
    await writeAudit(req,'product.deactivate','product',req.params.id);
    return res.json({message:'Produk dinonaktifkan. Riwayat penjualan tetap tersimpan.'});
  }catch(error){return next(error);}
});
