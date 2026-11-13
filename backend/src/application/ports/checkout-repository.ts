export type CheckoutQrAccount={qrToken:string;qrStatus:string;userId:string;fullName:string;userStatus:string;roleKey:string};
export type CheckoutProduct={id:string;sku:string;name:string;price:number;stock:number;active:boolean};
export type CheckoutLineRequest={sku:string;qty:number};
export type CheckoutPaymentMethod='cash'|'qr_wallet';
export type CheckoutShift={id:string;cashierId:string;openingCash:number};
export interface CheckoutTransaction {
  lockIdempotencyKey(idempotencyKey:string):Promise<void>;
  findReplay(idempotencyKey:string):Promise<any|null>;
  lockOpenShift(cashierId:string):Promise<CheckoutShift|null>;
  lockQrAccount(qrToken:string):Promise<CheckoutQrAccount|null>;
  lockWallet(userId:string):Promise<number|null>;
  lockProducts(skus:string[]):Promise<CheckoutProduct[]>;
  insertSale(input:{receiptNo:string;cashierId:string;customerId:string|null;shiftId:string;paymentMethod:CheckoutPaymentMethod;idempotencyKey:string;subtotal:number;cashReceived:number|null;cashChange:number|null}):Promise<any>;
  insertSaleItem(input:{saleId:string;product:CheckoutProduct;qty:number;subtotal:number}):Promise<void>;
  decreaseStock(productId:string,qty:number,saleId:string,receiptNo:string,cashierId:string):Promise<void>;
  updateWallet(userId:string,balance:number):Promise<void>;
  insertPayment(input:{userId:string;amount:number;before:number;after:number;saleId:string;cashierId:string;receiptNo:string}):Promise<void>;
  touchQr(qrToken:string):Promise<void>;
}
export interface CheckoutRepository { transaction<T>(work:(tx:CheckoutTransaction)=>Promise<T>):Promise<T>; }
