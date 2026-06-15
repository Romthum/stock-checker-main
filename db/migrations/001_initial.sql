create extension if not exists pgcrypto;
create extension if not exists pg_trgm;
create extension if not exists pg_stat_statements;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type user_role as enum (
      'OWNER',
      'MANAGER',
      'CASHIER',
      'INVENTORY_STAFF',
      'AUDITOR',
      'STAFF'
    );
  end if;
end $$;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  username text unique,
  password_hash text not null,
  display_name text not null,
  role user_role not null default 'STAFF',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists branches (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into branches (code, name)
values ('MAIN', 'Main Store')
on conflict (code) do nothing;

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  name text not null,
  sku text,
  category text,
  cost_price numeric(12,2) not null default 0,
  sale_price numeric(12,2) not null default 0,
  qty integer not null default 0 check (qty >= 0),
  image_url text,
  is_active boolean not null default true,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ux_products_sku_active
  on products (sku)
  where sku is not null and is_active = true;

create index if not exists idx_products_branch_name
  on products (branch_id, name, id)
  where is_active = true;

create index if not exists idx_products_category
  on products (category)
  where is_active = true;

create index if not exists idx_products_name_trgm
  on products using gin (name gin_trgm_ops);

create index if not exists idx_products_sku_trgm
  on products using gin (sku gin_trgm_ops);

create table if not exists product_barcodes (
  id bigserial primary key,
  product_id uuid not null references products(id) on delete cascade,
  barcode text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists stock_movements (
  id bigserial primary key,
  branch_id uuid not null references branches(id),
  product_id uuid not null references products(id),
  change integer not null,
  reason text not null check (reason in ('RESTOCK', 'SALE', 'ADJUST', 'RETURN', 'VOID')),
  note text,
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_stock_movements_product_created
  on stock_movements (product_id, created_at desc);

create index if not exists idx_stock_movements_branch_created
  on stock_movements (branch_id, created_at desc);

create table if not exists sales_orders (
  id bigserial,
  branch_id uuid not null references branches(id),
  order_no text not null,
  cashier_id uuid references users(id),
  subtotal numeric(12,2) not null default 0,
  discount_total numeric(12,2) not null default 0,
  tax_total numeric(12,2) not null default 0,
  total_amount numeric(12,2) not null default 0,
  status text not null default 'PAID' check (status in ('DRAFT', 'PAID', 'VOID', 'REFUNDED')),
  created_at timestamptz not null default now(),
  primary key (id, created_at)
) partition by range (created_at);

create table if not exists sales_orders_default
  partition of sales_orders default;

create unique index if not exists ux_sales_orders_order_no
  on sales_orders_default (order_no);

create table if not exists sales_order_items (
  id bigserial primary key,
  sales_order_id bigint not null,
  product_id uuid not null references products(id),
  qty integer not null check (qty > 0),
  unit_price numeric(12,2) not null,
  line_total numeric(12,2) not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_sales_order_items_product
  on sales_order_items (product_id);

create table if not exists payments (
  id bigserial primary key,
  sales_order_id bigint not null,
  method text not null check (method in ('CASH', 'CARD', 'QR', 'TRANSFER', 'OTHER')),
  amount numeric(12,2) not null,
  created_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id bigserial primary key,
  actor_user_id uuid references users(id),
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_created
  on audit_logs (created_at desc);

create or replace view products_public as
select
  id,
  name,
  sku,
  sale_price,
  qty,
  updated_at,
  image_url,
  category
from products
where is_active = true;

create or replace view product_categories as
select distinct category
from products
where is_active = true and category is not null and btrim(category) <> '';

create or replace view movements_public as
select
  sm.id,
  sm.product_id,
  sm.change,
  sm.reason,
  sm.created_at
from stock_movements sm;
