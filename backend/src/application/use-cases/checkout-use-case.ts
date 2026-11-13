import crypto from 'node:crypto';
import type { CheckoutLineRequest,CheckoutPaymentMethod,CheckoutRepository } from '../ports/checkout-repository';
export class CheckoutBusinessError extends Error { constructor(message:string,public status=400,public payload:Record<string,unknown>={}){super(message);this.name='CheckoutBusinessError';} }
export type CheckoutCommand={paymentMethod?:CheckoutPaymentMethod;qrToken?:string;transactionPin?:string;cashReceived?:number;items:CheckoutLineRequest[];cashierId:string;idempotencyKey:string};
/** Application use case: validates domain rules; repository owns atomic DB transaction. */
export class CheckoutUseCase {
  constructor(private readonly repository:CheckoutRepository){}
  async execute(command:CheckoutCommand){
    const paymentMethod=command.paymentMethod??'qr_wallet';
    const normalized=new Map<string,number>();
    for(const item of command.items){const sku=item.sku.trim();if(!sku||!Number.isInteger(item.qty)||item.qty<1||item.qty>1000)throw new CheckoutBusinessError('SKU dan jumlah barang tidak valid.');const next=(normalized.get(sku)??0)+item.qty;if(next>1000)throw new CheckoutBusinessError('Jumlah gabungan untuk satu SKU tidak boleh melebihi 1000.');normalized.set(sku,next);}
    const items=[...normalized.entries()].map(([sku,qty])=>({sku,qty}));if(!items.length)throw new CheckoutBusinessError('Keranjang masih kosong.');
    if(paymentMethod==='cash'&&(typeof command.cashReceived!=='number'||!Number.isSafeInteger(command.cashReceived)||command.cashReceived<0))throw new CheckoutBusinessError('Nominal uang tunai yang diterima harus diisi.');
    return this.repository.transaction(async tx=>{
      await tx.lockIdempotencyKey(command.idempotencyKey);const previous=await tx.findReplay(command.idempotencyKey);if(previous)return {sale:previous,idempotentReplay:true as const};
      const shift=await tx.lockOpenShift(command.cashierId);
      if(!shift)throw new CheckoutBusinessError('Tidak ada shift kasir yang terbuka. Buka shift dan masukkan modal awal sebelum bertransaksi.',409,{code:'SHIFT_REQUIRED'});
      let account:null|Awaited<ReturnType<typeof tx.lockQrAccount>>=null;
      let balanceBefore:number|null=null;
      if(paymentMethod==='qr_wallet'){
        if(!command.qrToken?.trim())throw new CheckoutBusinessError('QR akun D-PAY wajib dipindai untuk pembayaran saldo.');
        account=await tx.lockQrAccount(command.qrToken.trim());
        if(!account||account.qrStatus!=='active'||account.userStatus!=='active'||account.roleKey!=='pelanggan')throw new CheckoutBusinessError('QR tidak valid/dicabut atau akun siswa/guru tidak aktif.',404);
        balanceBefore=await tx.lockWallet(account.userId);if(balanceBefore===null)throw new CheckoutBusinessError('Dompet D-PAY belum dibuat untuk akun ini.',409);
      }
      const products=await tx.lockProducts(items.map(i=>i.sku));const bySku=new Map(products.map(p=>[p.sku,p]));if(bySku.size!==items.length||items.some(i=>!bySku.has(i.sku)))throw new CheckoutBusinessError('Ada SKU yang tidak ditemukan. Keranjang belum diproses.');
      let subtotal=0;const resolved=items.map(item=>{const product=bySku.get(item.sku)!;if(!product.active)throw new CheckoutBusinessError(`Produk ${item.sku} sudah nonaktif.`);if(product.stock<item.qty)throw new CheckoutBusinessError(`Stok ${product.name} tidak cukup. Stok tersedia: ${product.stock}.`,409);const line=product.price*item.qty;if(!Number.isSafeInteger(line)||!Number.isSafeInteger(subtotal+line))throw new CheckoutBusinessError('Nilai transaksi terlalu besar.');subtotal+=line;return {...item,product,line};});
      let cashReceived:number|null=null,cashChange:number|null=null;
      if(paymentMethod==='qr_wallet'&&balanceBefore!==null&&balanceBefore<subtotal)throw new CheckoutBusinessError('Saldo D-PAY siswa/guru tidak cukup.',409,{balance:balanceBefore,total:subtotal,shortfall:subtotal-balanceBefore});
      if(paymentMethod==='cash'){
        cashReceived=Number(command.cashReceived);
        if(cashReceived<subtotal)throw new CheckoutBusinessError('Uang tunai yang diterima kurang dari total belanja.',409,{total:subtotal,cashReceived,shortfall:subtotal-cashReceived});
        cashChange=cashReceived-subtotal;
      }
      const receiptNo=`DF-${new Date().toISOString().replace(/[-:TZ.]/g,'').slice(0,14)}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
      const sale=await tx.insertSale({receiptNo,cashierId:command.cashierId,customerId:account?.userId??null,shiftId:shift.id,paymentMethod,idempotencyKey:command.idempotencyKey,subtotal,cashReceived,cashChange});
      for(const item of resolved){await tx.insertSaleItem({saleId:sale.id,product:item.product,qty:item.qty,subtotal:item.line});await tx.decreaseStock(item.product.id,item.qty,sale.id,sale.receiptNo,command.cashierId);}
      let balanceAfter:number|null=null;
      if(paymentMethod==='qr_wallet'&&account&&balanceBefore!==null){
        balanceAfter=balanceBefore-subtotal;
        await tx.updateWallet(account.userId,balanceAfter);
        await tx.insertPayment({userId:account.userId,amount:subtotal,before:balanceBefore,after:balanceAfter,saleId:sale.id,cashierId:command.cashierId,receiptNo:sale.receiptNo});
        await tx.touchQr(account.qrToken);
      }
      return {idempotentReplay:false as const,sale:{...sale,studentName:account?.fullName??'Pembeli Tunai',paymentMethod,balanceBefore,balanceAfter,cashReceived,cashChange,shiftId:shift.id,items:resolved.map(i=>({sku:i.sku,name:i.product.name,qty:i.qty,unitPrice:i.product.price,subtotal:i.line}))}};
    });
  }
}
