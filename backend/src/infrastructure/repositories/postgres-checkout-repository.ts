import type { PoolClient } from 'pg';
import { pool } from '../database';
import type { CheckoutQrAccount,CheckoutProduct,CheckoutRepository,CheckoutTransaction,CheckoutShift,CheckoutPaymentMethod } from '../../application/ports/checkout-repository';
class PostgresCheckoutTransaction implements CheckoutTransaction {
  constructor(private readonly client:PoolClient){}
  async lockIdempotencyKey(key:string){await this.client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`,[key]);}
  async findReplay(key:string){
    const r=await this.client.query(`
      SELECT s.id,s.receipt_no AS "receiptNo",s.subtotal,s.total,s.created_at AS "createdAt",
        COALESCE(u.full_name,'Pembeli Tunai') AS "studentName",s.payment_method AS "paymentMethod",s.shift_id AS "shiftId",
        s.cash_received AS "cashReceived",s.cash_change AS "cashChange",
        CASE WHEN s.payment_method='qr_wallet' THEN COALESCE((SELECT wt.balance_after FROM wallet_transactions wt WHERE wt.sale_id=s.id AND wt.type='payment' ORDER BY wt.created_at DESC LIMIT 1),w.balance,0)::bigint ELSE NULL END AS "balanceAfter",
        COALESCE((SELECT json_agg(json_build_object('sku',si.sku_snapshot,'name',si.name_snapshot,'qty',si.qty,'unitPrice',si.unit_price,'subtotal',si.subtotal) ORDER BY si.name_snapshot) FROM sale_items si WHERE si.sale_id=s.id),'[]'::json) AS items
      FROM sales s LEFT JOIN users u ON u.id=s.customer_id LEFT JOIN wallets w ON w.user_id=s.customer_id
      WHERE s.idempotency_key=$1`,[key]);
    const row=r.rows[0];
    return row ? {...row,subtotal:Number(row.subtotal),total:Number(row.total),balanceAfter:row.balanceAfter===null?null:Number(row.balanceAfter),cashReceived:row.cashReceived===null?null:Number(row.cashReceived),cashChange:row.cashChange===null?null:Number(row.cashChange),items:(row.items||[]).map((item:any)=>({...item,unitPrice:Number(item.unitPrice),subtotal:Number(item.subtotal)}))} : null;
  }
  async lockOpenShift(cashierId:string):Promise<CheckoutShift|null>{const r=await this.client.query(`SELECT id,cashier_id AS "cashierId",opening_cash AS "openingCash" FROM cashier_shifts WHERE cashier_id=$1 AND status='open' FOR UPDATE`,[cashierId]);const row=r.rows[0];return row?{id:row.id,cashierId:row.cashierId,openingCash:Number(row.openingCash)}:null;}
  async lockQrAccount(token:string):Promise<CheckoutQrAccount|null>{const r=await this.client.query(`SELECT q.qr_token,u.id AS user_id,u.full_name,u.status AS user_status,q.status AS qr_status,ro.role_key FROM account_qr_tokens q JOIN users u ON u.id=q.user_id JOIN roles ro ON ro.id=u.role_id WHERE q.qr_token=$1 FOR UPDATE OF q`,[token]);const row=r.rows[0];return row?{qrToken:row.qr_token,qrStatus:row.qr_status,userId:row.user_id,fullName:row.full_name,userStatus:row.user_status,roleKey:row.role_key}:null;}
  async lockWallet(userId:string){const r=await this.client.query(`SELECT balance FROM wallets WHERE user_id=$1 FOR UPDATE`,[userId]);return r.rowCount?Number(r.rows[0].balance):null;}
  async lockProducts(skus:string[]){const r=await this.client.query(`SELECT id,sku,name,price,stock,active FROM products WHERE sku=ANY($1::varchar[]) FOR UPDATE`,[skus]);return r.rows.map(row=>({id:row.id,sku:row.sku,name:row.name,price:Number(row.price),stock:Number(row.stock),active:row.active}));}
  async insertSale(input:{receiptNo:string;cashierId:string;customerId:string|null;shiftId:string;paymentMethod:CheckoutPaymentMethod;idempotencyKey:string;subtotal:number;cashReceived:number|null;cashChange:number|null}){const r=await this.client.query(`INSERT INTO sales(receipt_no,cashier_id,customer_id,shift_id,payment_method,idempotency_key,subtotal,discount,total,cash_received,cash_change) VALUES($1,$2,$3,$4,$5,$6,$7,0,$7,$8,$9) RETURNING id,receipt_no AS "receiptNo",subtotal,total,created_at AS "createdAt",payment_method AS "paymentMethod",shift_id AS "shiftId",cash_received AS "cashReceived",cash_change AS "cashChange"`,[input.receiptNo,input.cashierId,input.customerId,input.shiftId,input.paymentMethod,input.idempotencyKey,input.subtotal,input.cashReceived,input.cashChange]);return {...r.rows[0],subtotal:Number(r.rows[0].subtotal),total:Number(r.rows[0].total),cashReceived:r.rows[0].cashReceived===null?null:Number(r.rows[0].cashReceived),cashChange:r.rows[0].cashChange===null?null:Number(r.rows[0].cashChange)};}
  async insertSaleItem(input:{saleId:string;product:CheckoutProduct;qty:number;subtotal:number}){await this.client.query(`INSERT INTO sale_items(sale_id,product_id,sku_snapshot,name_snapshot,qty,unit_price,subtotal) VALUES($1,$2,$3,$4,$5,$6,$7)`,[input.saleId,input.product.id,input.product.sku,input.product.name,input.qty,input.product.price,input.subtotal]);}
  async decreaseStock(productId:string,qty:number,saleId:string,receiptNo:string,cashierId:string){await this.client.query(`UPDATE products SET stock=stock-$1,updated_at=NOW() WHERE id=$2`,[qty,productId]);await this.client.query(`INSERT INTO stock_movements(product_id,movement_type,quantity_delta,reference_id,note,recorded_by) VALUES($1,'sale',$2,$3,$4,$5)`,[productId,-qty,saleId,`Penjualan ${receiptNo}`,cashierId]);}
  async updateWallet(userId:string,balance:number){await this.client.query(`UPDATE wallets SET balance=$1,updated_at=NOW() WHERE user_id=$2`,[balance,userId]);}
  async insertPayment(input:{userId:string;amount:number;before:number;after:number;saleId:string;cashierId:string;receiptNo:string}){await this.client.query(`INSERT INTO wallet_transactions(user_id,type,amount,direction,balance_before,balance_after,sale_id,admin_id,note) VALUES($1,'payment',$2,'out',$3,$4,$5,$6,$7)`,[input.userId,input.amount,input.before,input.after,input.saleId,input.cashierId,`Pembayaran ${input.receiptNo}`]);}
  async touchQr(token:string){await this.client.query(`UPDATE account_qr_tokens SET last_used_at=NOW() WHERE qr_token=$1`,[token]);}
}
export class PostgresCheckoutRepository implements CheckoutRepository {
  async transaction<T>(work:(tx:CheckoutTransaction)=>Promise<T>){const client=await pool.connect();try{await client.query('BEGIN');const result=await work(new PostgresCheckoutTransaction(client));await client.query('COMMIT');return result;}catch(error){await client.query('ROLLBACK').catch(()=>undefined);throw error;}finally{client.release();}}
}
