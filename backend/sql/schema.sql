-- Keep D-Pay isolated inside the existing PostgreSQL database.
-- This avoids conflicts with an existing public.users table (e.g. LMS).
CREATE SCHEMA IF NOT EXISTS dpay;

CREATE TABLE IF NOT EXISTS dpay.roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_key VARCHAR(40) UNIQUE NOT NULL,
  name VARCHAR(80) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dpay.permissions (
  code VARCHAR(80) PRIMARY KEY,
  label VARCHAR(120) NOT NULL,
  group_name VARCHAR(50) NOT NULL,
  description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS dpay.role_permissions (
  role_id UUID NOT NULL REFERENCES dpay.roles(id) ON DELETE CASCADE,
  permission_code VARCHAR(80) NOT NULL REFERENCES dpay.permissions(code) ON DELETE CASCADE,
  PRIMARY KEY(role_id, permission_code)
);

CREATE TABLE IF NOT EXISTS dpay.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name VARCHAR(140) NOT NULL,
  email VARCHAR(190) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  transaction_pin_hash TEXT,
  role_id UUID NOT NULL REFERENCES dpay.roles(id),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE dpay.users ADD COLUMN IF NOT EXISTS transaction_pin_hash TEXT;

CREATE TABLE IF NOT EXISTS dpay.pin_attempts (
  user_id UUID PRIMARY KEY REFERENCES dpay.users(id) ON DELETE CASCADE,
  failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  locked_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dpay.user_profiles (
  user_id UUID PRIMARY KEY REFERENCES dpay.users(id) ON DELETE CASCADE,
  account_type VARCHAR(20) NOT NULL DEFAULT 'student' CHECK (account_type IN ('student','teacher')),
  student_number VARCHAR(50) UNIQUE,
  class_name VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE dpay.user_profiles ADD COLUMN IF NOT EXISTS account_type VARCHAR(20) NOT NULL DEFAULT 'student';

CREATE TABLE IF NOT EXISTS dpay.account_qr_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  qr_token VARCHAR(160) UNIQUE NOT NULL,
  user_id UUID UNIQUE NOT NULL REFERENCES dpay.users(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS dpay.wallets (
  user_id UUID PRIMARY KEY REFERENCES dpay.users(id) ON DELETE CASCADE,
  balance BIGINT NOT NULL DEFAULT 0 CHECK (balance >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dpay.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(160) NOT NULL,
  category VARCHAR(100) NOT NULL DEFAULT 'Umum',
  unit VARCHAR(30) NOT NULL DEFAULT 'pcs',
  price BIGINT NOT NULL CHECK (price >= 0),
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  low_stock_threshold INTEGER NOT NULL DEFAULT 5 CHECK (low_stock_threshold >= 0),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Cashier shift and opening/closing float (modal kas awal).
CREATE TABLE IF NOT EXISTS dpay.cashier_shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cashier_id UUID NOT NULL REFERENCES dpay.users(id),
  opened_by UUID NOT NULL REFERENCES dpay.users(id),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  opening_cash BIGINT NOT NULL CHECK (opening_cash >= 0),
  opening_note VARCHAR(240) NOT NULL DEFAULT '',
  closed_at TIMESTAMPTZ,
  closed_by UUID REFERENCES dpay.users(id),
  closing_cash BIGINT CHECK (closing_cash >= 0),
  expected_cash BIGINT,
  cash_difference BIGINT,
  closing_note VARCHAR(240) NOT NULL DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_dpay_one_open_shift_per_cashier
  ON dpay.cashier_shifts(cashier_id) WHERE status='open';
CREATE INDEX IF NOT EXISTS idx_dpay_shifts_opened_at ON dpay.cashier_shifts(opened_at DESC);

CREATE TABLE IF NOT EXISTS dpay.sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_no VARCHAR(40) UNIQUE NOT NULL,
  cashier_id UUID NOT NULL REFERENCES dpay.users(id),
  customer_id UUID REFERENCES dpay.users(id),
  shift_id UUID REFERENCES dpay.cashier_shifts(id),
  payment_method VARCHAR(20) NOT NULL DEFAULT 'qr_wallet',
  idempotency_key VARCHAR(100) UNIQUE,
  subtotal BIGINT NOT NULL CHECK (subtotal >= 0),
  discount BIGINT NOT NULL DEFAULT 0 CHECK (discount >= 0),
  total BIGINT NOT NULL CHECK (total >= 0),
  cash_received BIGINT CHECK (cash_received IS NULL OR cash_received >= 0),
  cash_change BIGINT CHECK (cash_change IS NULL OR cash_change >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Additive compatibility migration for earlier prototypes; never store the QR secret on a sale.
ALTER TABLE dpay.sales ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20) NOT NULL DEFAULT 'qr_wallet';
ALTER TABLE dpay.sales ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(100);
ALTER TABLE dpay.sales ADD COLUMN IF NOT EXISTS shift_id UUID REFERENCES dpay.cashier_shifts(id);
ALTER TABLE dpay.sales ADD COLUMN IF NOT EXISTS cash_received BIGINT;
ALTER TABLE dpay.sales ADD COLUMN IF NOT EXISTS cash_change BIGINT;
ALTER TABLE dpay.sales ALTER COLUMN customer_id DROP NOT NULL;
DO $dpay_migration$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='dpay' AND table_name='sales' AND column_name='card_uid'
  ) THEN
    EXECUTE 'ALTER TABLE dpay.sales ALTER COLUMN card_uid DROP NOT NULL';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='dpay' AND table_name='sales' AND column_name='qr_token_snapshot'
  ) THEN
    EXECUTE 'ALTER TABLE dpay.sales ALTER COLUMN qr_token_snapshot DROP NOT NULL';
  END IF;
END
$dpay_migration$;
CREATE UNIQUE INDEX IF NOT EXISTS idx_dpay_sales_idempotency_key
  ON dpay.sales(idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS dpay.sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES dpay.sales(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES dpay.products(id),
  sku_snapshot VARCHAR(100) NOT NULL,
  name_snapshot VARCHAR(160) NOT NULL,
  qty INTEGER NOT NULL CHECK (qty > 0),
  unit_price BIGINT NOT NULL CHECK (unit_price >= 0),
  subtotal BIGINT NOT NULL CHECK (subtotal >= 0)
);

CREATE OR REPLACE FUNCTION dpay.prevent_sku_change_after_sale()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.sku IS DISTINCT FROM NEW.sku AND EXISTS (
    SELECT 1 FROM dpay.sale_items WHERE product_id = OLD.id LIMIT 1
  ) THEN
    RAISE EXCEPTION 'SKU tidak dapat diubah setelah memiliki riwayat penjualan.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS dpay_product_sku_immutable ON dpay.products;
CREATE TRIGGER dpay_product_sku_immutable
BEFORE UPDATE OF sku ON dpay.products
FOR EACH ROW EXECUTE FUNCTION dpay.prevent_sku_change_after_sale();

CREATE TABLE IF NOT EXISTS dpay.wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES dpay.users(id),
  type VARCHAR(30) NOT NULL CHECK (type IN ('topup','payment','refund','adjustment')),
  amount BIGINT NOT NULL CHECK (amount > 0),
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('in','out')),
  balance_before BIGINT NOT NULL,
  balance_after BIGINT NOT NULL,
  sale_id UUID REFERENCES dpay.sales(id),
  admin_id UUID REFERENCES dpay.users(id),
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dpay.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id UUID REFERENCES dpay.cashier_shifts(id),
  category VARCHAR(80) NOT NULL,
  description VARCHAR(240) NOT NULL,
  amount BIGINT NOT NULL CHECK (amount > 0),
  recorded_by UUID NOT NULL REFERENCES dpay.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE dpay.expenses ADD COLUMN IF NOT EXISTS shift_id UUID REFERENCES dpay.cashier_shifts(id);

CREATE TABLE IF NOT EXISTS dpay.stock_opnames (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES dpay.products(id),
  sku_snapshot VARCHAR(100) NOT NULL,
  name_snapshot VARCHAR(160) NOT NULL,
  system_stock INTEGER NOT NULL,
  actual_stock INTEGER NOT NULL CHECK (actual_stock >= 0),
  difference INTEGER NOT NULL,
  note VARCHAR(240) NOT NULL DEFAULT '',
  recorded_by UUID NOT NULL REFERENCES dpay.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dpay.stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES dpay.products(id),
  movement_type VARCHAR(30) NOT NULL,
  quantity_delta INTEGER NOT NULL,
  reference_id UUID,
  note TEXT NOT NULL DEFAULT '',
  recorded_by UUID REFERENCES dpay.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dpay.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES dpay.users(id),
  action VARCHAR(100) NOT NULL,
  resource VARCHAR(100) NOT NULL,
  resource_id VARCHAR(120),
  ip_address VARCHAR(80),
  user_agent TEXT,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_created_at ON dpay.sales(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dpay_sales_shift_payment ON dpay.sales(shift_id, payment_method, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_customer ON dpay.sales(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON dpay.sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_user_created ON dpay.wallet_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_created ON dpay.expenses(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_opname_created ON dpay.stock_opnames(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_created ON dpay.audit_logs(created_at DESC);
