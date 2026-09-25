-- Lk's Attire — initial schema (Cloudflare D1 / SQLite)
-- Money is stored as whole Taka (INTEGER). Timestamps are ISO-8601 UTC strings.
-- Soft delete: rows with deleted_at IS NOT NULL are in the admin "Trash".

PRAGMA foreign_keys = ON;

CREATE TABLE categories (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id      INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  slug           TEXT NOT NULL UNIQUE,
  name_en        TEXT NOT NULL,
  name_bn        TEXT NOT NULL,
  description_en TEXT,
  description_bn TEXT,
  image_url      TEXT,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  is_active      INTEGER NOT NULL DEFAULT 1,
  deleted_at     TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_categories_parent ON categories(parent_id, sort_order);

CREATE TABLE products (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  slug             TEXT NOT NULL UNIQUE,
  sku              TEXT,
  name_en          TEXT NOT NULL,
  name_bn          TEXT NOT NULL,
  description_en   TEXT,
  description_bn   TEXT,
  fabric_en        TEXT,
  fabric_bn        TEXT,
  care_en          TEXT,
  care_bn          TEXT,
  category_id      INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  price            INTEGER NOT NULL CHECK (price >= 0),
  sale_price       INTEGER CHECK (sale_price IS NULL OR sale_price >= 0),
  tags             TEXT NOT NULL DEFAULT '',
  images           TEXT NOT NULL DEFAULT '[]',          -- JSON array of URLs
  status           TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  is_featured      INTEGER NOT NULL DEFAULT 0,
  sold_count       INTEGER NOT NULL DEFAULT 0,
  rating_avg       REAL NOT NULL DEFAULT 0,
  rating_count     INTEGER NOT NULL DEFAULT 0,
  meta_title       TEXT,
  meta_description TEXT,
  deleted_at       TEXT,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_products_category ON products(category_id, status);
CREATE INDEX idx_products_created ON products(created_at);

CREATE TABLE product_variants (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id          INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku                 TEXT,
  size                TEXT NOT NULL DEFAULT 'Free Size',
  color               TEXT NOT NULL DEFAULT 'Default',
  color_hex           TEXT,
  stock               INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  price_override      INTEGER,
  low_stock_threshold INTEGER NOT NULL DEFAULT 3,
  UNIQUE (product_id, size, color)
);
CREATE INDEX idx_variants_product ON product_variants(product_id);

CREATE TABLE customers (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  phone         TEXT NOT NULL UNIQUE,
  email         TEXT,
  password_hash TEXT,                 -- NULL for guest-only customers
  is_blocked    INTEGER NOT NULL DEFAULT 0,
  notes         TEXT,                 -- internal staff notes, never shown to customer
  last_login_at TEXT,
  deleted_at    TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE addresses (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id    INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  label          TEXT NOT NULL DEFAULT 'Home',
  recipient_name TEXT NOT NULL,
  phone          TEXT NOT NULL,
  division_id    INTEGER NOT NULL,
  district_id    INTEGER NOT NULL,
  upazila_id     INTEGER NOT NULL,
  division       TEXT NOT NULL,
  district       TEXT NOT NULL,
  upazila        TEXT NOT NULL,
  area           TEXT NOT NULL,       -- area / village / road / house
  zone_code      TEXT,                -- delivery-fee tier resolved at save time
  is_default     INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_addresses_customer ON addresses(customer_id);

CREATE TABLE delivery_zones (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  code              TEXT NOT NULL UNIQUE,
  name_en           TEXT NOT NULL,
  name_bn           TEXT NOT NULL,
  fee               INTEGER NOT NULL CHECK (fee >= 0),
  free_shipping_min INTEGER,          -- NULL = never free
  district_ids      TEXT NOT NULL DEFAULT '[]',
  upazila_ids       TEXT NOT NULL DEFAULT '[]',
  eta_en            TEXT,
  eta_bn            TEXT,
  is_default        INTEGER NOT NULL DEFAULT 0,
  is_active         INTEGER NOT NULL DEFAULT 1,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  deleted_at        TEXT,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE coupons (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  code               TEXT NOT NULL UNIQUE COLLATE NOCASE,
  description        TEXT,
  type               TEXT NOT NULL CHECK (type IN ('percent','flat')),
  value              INTEGER NOT NULL CHECK (value > 0),
  min_order          INTEGER NOT NULL DEFAULT 0,
  max_discount       INTEGER,
  starts_at          TEXT,
  expires_at         TEXT,
  usage_limit        INTEGER,
  used_count         INTEGER NOT NULL DEFAULT 0,
  per_customer_limit INTEGER,
  category_ids       TEXT NOT NULL DEFAULT '[]',  -- empty = whole store
  is_active          INTEGER NOT NULL DEFAULT 1,
  deleted_at         TEXT,
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE orders (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no          TEXT NOT NULL UNIQUE,
  public_token      TEXT NOT NULL,     -- lets a guest view their own order
  customer_id       INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  customer_name     TEXT NOT NULL,
  customer_phone    TEXT NOT NULL,
  customer_email    TEXT,
  division_id       INTEGER NOT NULL,
  district_id       INTEGER NOT NULL,
  upazila_id        INTEGER NOT NULL,
  division          TEXT NOT NULL,
  district          TEXT NOT NULL,
  upazila           TEXT NOT NULL,
  area              TEXT NOT NULL,
  zone_code         TEXT NOT NULL,
  subtotal          INTEGER NOT NULL,
  discount          INTEGER NOT NULL DEFAULT 0,
  delivery_fee      INTEGER NOT NULL,
  total             INTEGER NOT NULL,
  coupon_code       TEXT,
  payment_method    TEXT NOT NULL CHECK (payment_method IN ('COD','bKash','Nagad','Rocket','Card')),
  payment_status    TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending','paid','failed','refunded','partially_refunded')),
  payment_ref       TEXT,              -- gateway transaction id / MFS TrxID
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','packed','shipped','delivered','returned','cancelled')),
  courier_partner   TEXT CHECK (courier_partner IS NULL OR courier_partner IN ('Steadfast','Pathao','RedX')),
  tracking_id       TEXT,
  consignment_id    TEXT,
  customer_note     TEXT,
  lang              TEXT NOT NULL DEFAULT 'bn' CHECK (lang IN ('bn','en')),  -- language for SMS/email
  admin_notes       TEXT,
  refund_amount     INTEGER NOT NULL DEFAULT 0,
  refund_note       TEXT,
  deleted_at        TEXT,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_orders_status ON orders(status, created_at);
CREATE INDEX idx_orders_phone ON orders(customer_phone);
CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_created ON orders(created_at);

CREATE TABLE order_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id    INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id  INTEGER REFERENCES products(id) ON DELETE SET NULL,
  variant_id  INTEGER REFERENCES product_variants(id) ON DELETE SET NULL,
  category_id INTEGER,
  name_en     TEXT NOT NULL,
  name_bn     TEXT NOT NULL,
  size        TEXT NOT NULL,
  color       TEXT NOT NULL,
  image       TEXT,
  quantity    INTEGER NOT NULL CHECK (quantity > 0),
  unit_price  INTEGER NOT NULL,
  line_total  INTEGER NOT NULL
);
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_product ON order_items(product_id);

CREATE TABLE order_status_history (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id   INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status     TEXT NOT NULL,
  note       TEXT,
  actor      TEXT NOT NULL,            -- 'customer', 'system', 'courier:Steadfast', or admin name
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_order_history_order ON order_status_history(order_id);

CREATE TABLE reviews (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  name        TEXT NOT NULL,
  rating      INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','flagged')),
  reply       TEXT,
  replied_at  TEXT,
  deleted_at  TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_reviews_product ON reviews(product_id, status);

CREATE TABLE banners (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  placement   TEXT NOT NULL DEFAULT 'hero' CHECK (placement IN ('hero','promo','festive')),
  title_en    TEXT NOT NULL,
  title_bn    TEXT NOT NULL,
  subtitle_en TEXT,
  subtitle_bn TEXT,
  cta_en      TEXT,
  cta_bn      TEXT,
  link_url    TEXT,
  image_url   TEXT,
  starts_at   TEXT,
  ends_at     TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   INTEGER NOT NULL DEFAULT 1,
  deleted_at  TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE admins (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  phone         TEXT,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('super_admin','manager','order_processor','viewer')),
  is_active     INTEGER NOT NULL DEFAULT 1,
  last_login_at TEXT,
  deleted_at    TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE inventory_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id  INTEGER REFERENCES products(id) ON DELETE SET NULL,
  variant_id  INTEGER REFERENCES product_variants(id) ON DELETE SET NULL,
  change      INTEGER NOT NULL,
  stock_after INTEGER,
  reason      TEXT NOT NULL CHECK (reason IN ('order','cancel','return','restock','adjustment','import')),
  note        TEXT,
  actor       TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_inventory_log_variant ON inventory_log(variant_id, created_at);

CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,            -- JSON
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id   INTEGER,
  admin_name TEXT NOT NULL,
  action     TEXT NOT NULL,            -- create | update | delete | restore | purge | status | login | login_failed ...
  entity     TEXT NOT NULL,
  entity_id  TEXT,
  details    TEXT,                     -- JSON
  ip         TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_audit_created ON audit_log(created_at);

CREATE TABLE notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  channel    TEXT NOT NULL CHECK (channel IN ('sms','whatsapp','email')),
  recipient  TEXT NOT NULL,
  template   TEXT NOT NULL,
  message    TEXT NOT NULL,
  status     TEXT NOT NULL CHECK (status IN ('sent','failed','skipped')),
  error      TEXT,
  order_id   INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE wishlist (
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (customer_id, product_id)
);

CREATE TABLE subscribers (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  contact    TEXT NOT NULL UNIQUE,     -- phone (WhatsApp) or email
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
