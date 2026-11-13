import test from 'node:test';
import assert from 'node:assert/strict';
import { CheckoutBusinessError, CheckoutUseCase } from './checkout-use-case';
import type { CheckoutRepository,CheckoutTransaction } from '../ports/checkout-repository';
function makeRepository(options:{balance?:number;replay?:any;qrStatus?:string;stock?:number}={}) {
  const events:string[]=[];
  const tx:CheckoutTransaction={
    async lockIdempotencyKey(){events.push('idempotency');}, async findReplay(){return options.replay??null;},
    async lockOpenShift(cashierId){events.push('shift');return {id:'shift-1',cashierId,openingCash:500000};},
    async lockQrAccount(qrToken){events.push('qr');return {qrToken,qrStatus:options.qrStatus??'active',userId:'student-1',fullName:'Siswa Demo',userStatus:'active',roleKey:'pelanggan'};},
    async lockWallet(){events.push('wallet');return options.balance??10000;},
    async lockProducts(skus){return skus.map(sku=>({id:'product-1',sku,name:'Roti',price:3500,stock:options.stock??10,active:true}));},
    async insertSale(input){events.push('sale');return {id:'sale-1',receiptNo:input.receiptNo,total:input.subtotal,paymentMethod:input.paymentMethod,createdAt:new Date().toISOString()};},
    async insertSaleItem(){events.push('item');},async decreaseStock(){events.push('stock');},async updateWallet(){events.push('debit');},async insertPayment(){events.push('ledger');},async touchQr(){events.push('touch-qr');},
  };
  const repository:CheckoutRepository={async transaction(work){events.push('begin');const result=await work(tx);events.push('commit');return result;}};
  return {repository,events};
}
test('checkout success creates sale, stock movement and debit in one transaction',async()=>{
  const {repository,events}=makeRepository();const result=await new CheckoutUseCase(repository).execute({qrToken:'QR-1',items:[{sku:'SKU-001',qty:2}],cashierId:'cashier-1',idempotencyKey:'request-1'});
  assert.equal(result.sale.total,7000);assert.equal(result.sale.balanceAfter,3000);assert.ok(events.includes('ledger'));assert.ok(events.includes('stock'));assert.equal(events.at(-1),'commit');
});
test('checkout rejects insufficient balance without committing',async()=>{
  const {repository,events}=makeRepository({balance:4000});await assert.rejects(()=>new CheckoutUseCase(repository).execute({qrToken:'QR-1',items:[{sku:'SKU-001',qty:2}],cashierId:'cashier-1',idempotencyKey:'request-2'}),(e:any)=>e instanceof CheckoutBusinessError&&e.status===409&&e.payload.shortfall===3000);assert.ok(!events.includes('commit'));
});
test('checkout rejects revoked QR',async()=>{
  const {repository,events}=makeRepository({qrStatus:'revoked'});await assert.rejects(()=>new CheckoutUseCase(repository).execute({qrToken:'QR-1',items:[{sku:'SKU-001',qty:1}],cashierId:'cashier-1',idempotencyKey:'request-3'}),(e:any)=>e instanceof CheckoutBusinessError&&e.status===404);assert.ok(!events.includes('commit'));
});
test('cash checkout records a sale and stock movement without a wallet debit',async()=>{
  const {repository,events}=makeRepository();
  const result=await new CheckoutUseCase(repository).execute({paymentMethod:'cash',cashReceived:10000,items:[{sku:'SKU-001',qty:2}],cashierId:'cashier-1',idempotencyKey:'cash-request-1'});
  assert.equal(result.sale.total,7000);assert.equal(result.sale.cashChange,3000);assert.equal(result.sale.paymentMethod,'cash');assert.ok(events.includes('stock'));assert.ok(!events.includes('debit'));assert.equal(events.at(-1),'commit');
});
test('checkout idempotency replay does not debit twice',async()=>{
  const replay={id:'sale-existing',receiptNo:'DP-EXISTING',total:3500,studentName:'Siswa Demo'};const {repository,events}=makeRepository({replay});const result=await new CheckoutUseCase(repository).execute({qrToken:'QR-1',items:[{sku:'SKU-001',qty:1}],cashierId:'cashier-1',idempotencyKey:'request-existing'});assert.equal(result.idempotentReplay,true);assert.ok(!events.includes('debit'));
});
