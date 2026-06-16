import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { isUnreadableThaiFragment, repairThaiMojibake } from './textEncoding';

type DevRole = 'OWNER' | 'MANAGER' | 'CASHIER' | 'INVENTORY_STAFF' | 'AUDITOR' | 'STAFF';

export type DevProduct = {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  cost_price: number;
  sale_price: number;
  qty: number;
  image_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type DevMovement = {
  id: string;
  product_id: string;
  change: number;
  reason: 'RESTOCK' | 'SALE' | 'ADJUST' | 'RETURN' | 'VOID';
  note: string | null;
  created_by: string | null;
  created_at: string;
};

export type DevUser = {
  id: string;
  email: string;
  password_hash: string;
  display_name: string;
  role: DevRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type DevAuditLog = {
  id: string;
  actor_user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

type DevStoreData = {
  products: DevProduct[];
  movements: DevMovement[];
  users: DevUser[];
  auditLogs: DevAuditLog[];
};

type ProductInput = {
  name: string;
  sku?: string | null;
  category?: string | null;
  cost_price?: number | null;
  sale_price?: number | null;
  qty?: number | null;
  image_url?: string | null;
  created_by?: string | null;
};

type ProductUpdate = Partial<ProductInput> & {
  qty?: number | null;
};

type Cursor = {
  name: string;
  id: string;
} | null;

const storePath = path.join(process.cwd(), 'data', 'dev-store.json');

export function isDevFileStoreEnabled() {
  return process.env.NODE_ENV !== 'production' && process.env.ALLOW_DEV_FILE_STORE !== 'false';
}

async function readStore(): Promise<DevStoreData> {
  try {
    const raw = await fs.readFile(storePath, 'utf8');
    const parsed = JSON.parse(raw.replace(/^\uFEFF/, '')) as DevStoreData;
    return normalizeStoreData({
      products: Array.isArray(parsed.products) ? parsed.products : [],
      movements: Array.isArray(parsed.movements) ? parsed.movements : [],
      users: Array.isArray(parsed.users) ? parsed.users : [],
      auditLogs: Array.isArray(parsed.auditLogs) ? parsed.auditLogs : [],
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return { products: [], movements: [], users: [], auditLogs: [] };
  }
}

async function writeStore(data: DevStoreData) {
  await fs.mkdir(path.dirname(storePath), { recursive: true });
  await fs.writeFile(storePath, JSON.stringify(data, null, 2), 'utf8');
}

function cleanText(value?: string | null) {
  const trimmed = value ? repairThaiMojibake(value).trim() : value;
  return trimmed ? trimmed : null;
}

function cleanRequiredText(value: string) {
  return repairThaiMojibake(value).trim();
}

function normalizeStoreData(data: DevStoreData): DevStoreData {
  return {
    products: data.products.map((product) => ({
      ...product,
      name: cleanRequiredText(product.name),
      sku: cleanText(product.sku),
      category: cleanText(product.category),
    })),
    movements: data.movements.map((movement) => ({
      ...movement,
      note: cleanText(movement.note),
    })),
    users: data.users.map((user) => ({
      ...user,
      display_name: cleanRequiredText(user.display_name),
    })),
    auditLogs: (data.auditLogs ?? []).map((log) => ({
      ...log,
      actor_user_id: log.actor_user_id ?? null,
      entity_id: log.entity_id ?? null,
      metadata: log.metadata && typeof log.metadata === 'object' ? log.metadata : {},
    })),
  };
}

function publicProduct(product: DevProduct) {
  const name = cleanRequiredText(product.name);
  const sku = cleanText(product.sku);
  const category = cleanText(product.category);

  return {
    id: product.id,
    name: isUnreadableThaiFragment(name) ? `สินค้า ${sku ?? product.id.slice(0, 8)}` : name,
    sku,
    category: category && !isUnreadableThaiFragment(category) ? category : null,
    cost_price: product.cost_price,
    sale_price: product.sale_price,
    qty: product.qty,
    image_url: product.image_url,
    updated_at: product.updated_at,
  };
}

function sortProducts(a: DevProduct, b: DevProduct) {
  const name = a.name.localeCompare(b.name);
  if (name !== 0) return name;
  return a.id.localeCompare(b.id);
}

function publicUser(user: DevUser) {
  return {
    id: user.id,
    email: user.email,
    display_name: user.display_name,
    role: user.role,
    is_active: user.is_active,
    created_at: user.created_at,
  };
}

function addAuditLog(
  store: DevStoreData,
  input: {
    actorUserId?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    metadata?: Record<string, unknown>;
  }
) {
  store.auditLogs.push({
    id: randomUUID(),
    actor_user_id: input.actorUserId ?? null,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    metadata: input.metadata ?? {},
    created_at: new Date().toISOString(),
  });
}

function publicAuditLog(log: DevAuditLog, usersById: Map<string, DevUser>) {
  const actor = log.actor_user_id ? usersById.get(log.actor_user_id) : null;
  return {
    id: log.id,
    actor_user_id: log.actor_user_id,
    actor_name: actor?.display_name ?? actor?.email ?? null,
    action: log.action,
    entity_type: log.entity_type,
    entity_id: log.entity_id,
    metadata: log.metadata ?? {},
    created_at: log.created_at,
  };
}

function makeTempPassword() {
  return `Temp-${randomUUID().slice(0, 8)}!1`;
}

export async function listDevUsers(fallbackOwner?: {
  id: string;
  email: string;
  display_name: string;
  role: DevRole;
}) {
  const store = await readStore();
  const users = store.users.map(publicUser);
  if (fallbackOwner && !users.some((user) => user.id === fallbackOwner.id)) {
    users.unshift({
      id: fallbackOwner.id,
      email: fallbackOwner.email,
      display_name: fallbackOwner.display_name,
      role: fallbackOwner.role,
      is_active: true,
      created_at: new Date(0).toISOString(),
    });
  }
  return users;
}

export async function findDevUserById(id: string) {
  const store = await readStore();
  const user = store.users.find((row) => row.id === id && row.is_active);
  return user ? publicUser(user) : null;
}

export async function findDevUserByLogin(login: string, password: string) {
  const store = await readStore();
  const normalizedLogin = login.trim().toLowerCase();
  const user = store.users.find(
    (row) => row.is_active && row.email.toLowerCase() === normalizedLogin
  );
  if (!user) return null;
  const ok = await bcrypt.compare(password, user.password_hash);
  return ok ? publicUser(user) : null;
}

export async function createDevUser(input: {
  email: string;
  display_name?: string | null;
  role: DevRole;
  password?: string | null;
  actorUserId?: string | null;
}) {
  const store = await readStore();
  const email = input.email.trim().toLowerCase();
  const now = new Date().toISOString();
  const tempPassword = input.password?.trim() || makeTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 12);
  const existing = store.users.find((user) => user.email.toLowerCase() === email);

  if (existing) {
    existing.password_hash = passwordHash;
    existing.display_name = cleanText(input.display_name) ?? email;
    existing.role = input.role;
    existing.is_active = true;
    existing.updated_at = now;
    addAuditLog(store, {
      actorUserId: input.actorUserId,
      action: 'USER_UPSERT',
      entityType: 'user',
      entityId: existing.id,
      metadata: { email: existing.email, role: existing.role },
    });
    await writeStore(store);
    return { user: publicUser(existing), tempPassword: input.password ? undefined : tempPassword };
  }

  const user: DevUser = {
    id: randomUUID(),
    email,
    password_hash: passwordHash,
    display_name: cleanText(input.display_name) ?? email,
    role: input.role,
    is_active: true,
    created_at: now,
    updated_at: now,
  };
  store.users.push(user);
  addAuditLog(store, {
    actorUserId: input.actorUserId,
    action: 'USER_CREATE',
    entityType: 'user',
    entityId: user.id,
    metadata: { email: user.email, role: user.role },
  });
  await writeStore(store);
  return { user: publicUser(user), tempPassword: input.password ? undefined : tempPassword };
}

export async function updateDevUser(input: {
  id: string;
  display_name?: string | null;
  role?: DevRole;
  is_active?: boolean;
  reset_password?: boolean;
  actorUserId?: string | null;
}) {
  const store = await readStore();
  const user = store.users.find((row) => row.id === input.id);
  if (!user) {
    const error = new Error('User not found');
    (error as Error & { status?: number }).status = 404;
    throw error;
  }
  const tempPassword = input.reset_password ? makeTempPassword() : null;
  if (tempPassword) {
    user.password_hash = await bcrypt.hash(tempPassword, 12);
  }
  if (input.display_name !== undefined) user.display_name = cleanText(input.display_name) ?? user.email;
  if (input.role) user.role = input.role;
  if (input.is_active !== undefined) user.is_active = input.is_active;
  user.updated_at = new Date().toISOString();
  addAuditLog(store, {
    actorUserId: input.actorUserId,
    action: 'USER_UPDATE',
    entityType: 'user',
    entityId: user.id,
    metadata: {
      email: user.email,
      role: user.role,
      is_active: user.is_active,
      reset_password: Boolean(input.reset_password),
    },
  });
  await writeStore(store);
  return { user: publicUser(user), tempPassword };
}

export async function deactivateDevUser(id: string, actorUserId?: string | null) {
  const store = await readStore();
  const user = store.users.find((row) => row.id === id);
  if (!user) {
    const error = new Error('User not found');
    (error as Error & { status?: number }).status = 404;
    throw error;
  }
  user.is_active = false;
  user.updated_at = new Date().toISOString();
  addAuditLog(store, {
    actorUserId,
    action: 'USER_DEACTIVATE',
    entityType: 'user',
    entityId: user.id,
    metadata: { email: user.email, role: user.role },
  });
  await writeStore(store);
}

export async function getDevStats() {
  const store = await readStore();
  const products = store.products.filter((product) => product.is_active);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return {
    products: products.length,
    lowStock: products.filter((product) => product.qty <= 5).length,
    movementsToday: store.movements.filter((movement) => new Date(movement.created_at) >= today).length,
  };
}

export async function listDevCategories() {
  const store = await readStore();
  return Array.from(
    new Set(
      store.products
        .filter((product) => product.is_active && product.category)
        .map((product) => cleanText(product.category))
        .filter((category): category is string => !!category && !isUnreadableThaiFragment(category))
    )
  ).sort((a, b) => a.localeCompare(b));
}

export async function listDevProducts({
  q,
  category,
  cursor,
  limit,
}: {
  q?: string;
  category?: string;
  cursor?: Cursor;
  limit: number;
}) {
  const needle = q?.trim().toLowerCase() ?? '';
  const store = await readStore();
  let rows = store.products.filter((product) => product.is_active);

  if (category) {
    if (category === '__uncategorized') {
      rows = rows.filter((product) => !product.category);
    } else {
      rows = rows.filter((product) => product.category === category);
    }
  }

  if (needle) {
    rows = rows.filter(
      (product) =>
        product.name.toLowerCase().includes(needle) ||
        (product.sku?.toLowerCase().includes(needle) ?? false)
    );
  }

  rows = rows.sort(sortProducts);
  if (cursor) {
    rows = rows.filter(
      (product) =>
        product.name > cursor.name || (product.name === cursor.name && product.id > cursor.id)
    );
  }

  const page = rows.slice(0, limit + 1);
  const hasMore = page.length > limit;
  const items = page.slice(0, limit);
  return {
    items: items.map(publicProduct),
    nextRow: hasMore ? items[items.length - 1] : null,
  };
}

export async function createDevProduct(input: ProductInput) {
  const store = await readStore();
  const sku = cleanText(input.sku);
  if (sku && store.products.some((product) => product.is_active && product.sku === sku)) {
    const error = new Error('SKU already exists');
    (error as Error & { status?: number }).status = 409;
    throw error;
  }

  const now = new Date().toISOString();
  const product: DevProduct = {
    id: randomUUID(),
    name: cleanRequiredText(input.name),
    sku,
    category: cleanText(input.category),
    cost_price: Number(input.cost_price ?? 0),
    sale_price: Number(input.sale_price ?? 0),
    qty: Number(input.qty ?? 0),
    image_url: cleanText(input.image_url),
    is_active: true,
    created_at: now,
    updated_at: now,
  };
  store.products.push(product);
  addAuditLog(store, {
    actorUserId: input.created_by,
    action: 'PRODUCT_CREATE',
    entityType: 'product',
    entityId: product.id,
    metadata: {
      name: product.name,
      sku: product.sku,
      category: product.category,
      qty: product.qty,
      sale_price: product.sale_price,
    },
  });

  if (product.qty > 0) {
    store.movements.push({
      id: randomUUID(),
      product_id: product.id,
      change: product.qty,
      reason: 'ADJUST',
      note: 'Initial stock',
      created_by: input.created_by ?? null,
      created_at: now,
    });
  }

  await writeStore(store);
  return publicProduct(product);
}

export async function updateDevProduct(id: string, input: ProductUpdate, actorUserId?: string) {
  const store = await readStore();
  const product = store.products.find((row) => row.id === id && row.is_active);
  if (!product) {
    const error = new Error('Product not found');
    (error as Error & { status?: number }).status = 404;
    throw error;
  }

  const sku = input.sku !== undefined ? cleanText(input.sku) : product.sku;
  if (
    sku &&
    store.products.some((row) => row.id !== id && row.is_active && row.sku === sku)
  ) {
    const error = new Error('SKU already exists');
    (error as Error & { status?: number }).status = 409;
    throw error;
  }

  const now = new Date().toISOString();
  const before = {
    name: product.name,
    sku: product.sku,
    category: product.category,
    cost_price: product.cost_price,
    sale_price: product.sale_price,
    qty: product.qty,
  };
  const nextQty = input.qty === undefined || input.qty === null ? product.qty : Number(input.qty);
  const delta = nextQty - product.qty;

  product.name = input.name ? cleanRequiredText(input.name) || product.name : product.name;
  product.sku = sku;
  product.category = input.category !== undefined ? cleanText(input.category) : product.category;
  product.cost_price = input.cost_price === undefined || input.cost_price === null ? product.cost_price : Number(input.cost_price);
  product.sale_price = input.sale_price === undefined || input.sale_price === null ? product.sale_price : Number(input.sale_price);
  product.qty = nextQty;
  product.image_url = input.image_url !== undefined ? cleanText(input.image_url) : product.image_url;
  product.updated_at = now;

  if (delta !== 0) {
    store.movements.push({
      id: randomUUID(),
      product_id: product.id,
      change: delta,
      reason: 'ADJUST',
      note: 'Manual product edit',
      created_by: actorUserId ?? null,
      created_at: now,
    });
  }

  addAuditLog(store, {
    actorUserId,
    action: 'PRODUCT_UPDATE',
    entityType: 'product',
    entityId: product.id,
    metadata: {
      name: product.name,
      sku: product.sku,
      before,
      after: {
        name: product.name,
        sku: product.sku,
        category: product.category,
        cost_price: product.cost_price,
        sale_price: product.sale_price,
        qty: product.qty,
      },
    },
  });

  await writeStore(store);
  return publicProduct(product);
}

export async function deleteDevProduct(id: string, actorUserId?: string | null) {
  const store = await readStore();
  const product = store.products.find((row) => row.id === id && row.is_active);
  if (!product) {
    const error = new Error('Product not found');
    (error as Error & { status?: number }).status = 404;
    throw error;
  }
  product.is_active = false;
  product.updated_at = new Date().toISOString();
  addAuditLog(store, {
    actorUserId,
    action: 'PRODUCT_DELETE',
    entityType: 'product',
    entityId: product.id,
    metadata: { name: product.name, sku: product.sku },
  });
  await writeStore(store);
}

export async function adjustDevStock({
  productId,
  delta,
  reason,
  note,
  actorUserId,
}: {
  productId: string;
  delta: number;
  reason: DevMovement['reason'];
  note?: string | null;
  actorUserId?: string | null;
}) {
  const store = await readStore();
  const product = store.products.find((row) => row.id === productId && row.is_active);
  if (!product) {
    const error = new Error('Product not found');
    (error as Error & { status?: number }).status = 404;
    throw error;
  }
  const nextQty = product.qty + delta;
  if (nextQty < 0) {
    const error = new Error('Insufficient stock');
    (error as Error & { status?: number }).status = 409;
    throw error;
  }
  const now = new Date().toISOString();
  const previousQty = product.qty;
  product.qty = nextQty;
  product.updated_at = now;
  store.movements.push({
    id: randomUUID(),
    product_id: product.id,
    change: delta,
    reason,
    note: note ?? null,
    created_by: actorUserId ?? null,
    created_at: now,
  });
  addAuditLog(store, {
    actorUserId,
    action: 'STOCK_ADJUST',
    entityType: 'product',
    entityId: product.id,
    metadata: {
      name: product.name,
      sku: product.sku,
      delta,
      reason,
      note: note ?? null,
      previous_qty: previousQty,
      next_qty: nextQty,
    },
  });
  await writeStore(store);
  return { qty: product.qty };
}

export async function listDevAuditLogs(limit: number) {
  const store = await readStore();
  const usersById = new Map(store.users.map((user) => [user.id, user]));
  return store.auditLogs
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, limit)
    .map((log) => publicAuditLog(log, usersById));
}

export async function listDevMovements(from: string, to: string, limit: number) {
  const store = await readStore();
  const start = new Date(from).getTime();
  const end = new Date(to).getTime();
  const productsById = new Map(store.products.map((product) => [product.id, product]));
  return store.movements
    .filter((movement) => {
      const time = new Date(movement.created_at).getTime();
      return time >= start && time <= end;
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, limit)
    .map((movement) => {
      const product = productsById.get(movement.product_id);
      return {
        id: movement.id,
        change: movement.change,
        reason: movement.reason,
        created_at: movement.created_at,
        product: {
          id: movement.product_id,
          name: product?.name ?? 'Unknown product',
          sku: product?.sku ?? null,
        },
      };
    });
}

export async function importDevProducts(rows: ProductInput[], actorUserId?: string) {
  let imported = 0;
  for (const row of rows) {
    const store = await readStore();
    const sku = cleanText(row.sku);
    const existing = sku
      ? store.products.find((product) => product.is_active && product.sku === sku)
      : null;
    if (existing) {
      await updateDevProduct(existing.id, row, actorUserId);
    } else {
      await createDevProduct({ ...row, created_by: actorUserId });
    }
    imported += 1;
  }
  const store = await readStore();
  addAuditLog(store, {
    actorUserId,
    action: 'PRODUCT_IMPORT',
    entityType: 'product',
    metadata: { rows: imported },
  });
  await writeStore(store);
  return imported;
}

export async function allDevProductsForExport() {
  const store = await readStore();
  return store.products.filter((product) => product.is_active).sort(sortProducts).map(publicProduct);
}
