-- Invoice numbers, unique SKUs and per-product offers (discount + delivery rules).
-- Additive only: the previous Worker version keeps working while this deploys.

-- ---------- Invoice number: one per order, e.g. INV-2609-00042 ----------
ALTER TABLE orders ADD COLUMN invoice_no TEXT;
UPDATE orders SET invoice_no = 'INV-' || substr(created_at, 3, 2) || substr(created_at, 6, 2) || '-' || printf('%05d', id) WHERE invoice_no IS NULL;
CREATE UNIQUE INDEX idx_orders_invoice_no ON orders(invoice_no);

-- SKU captured on each order line so invoices keep it even if the product changes later.
ALTER TABLE order_items ADD COLUMN sku TEXT;
UPDATE order_items SET sku = (SELECT v.sku FROM product_variants v WHERE v.id = order_items.variant_id) WHERE sku IS NULL;

-- ---------- Unique SKUs ----------
-- Fill blanks, then make any duplicates unique before adding the indexes.
UPDATE products SET sku = 'SKU-' || printf('%05d', id) WHERE sku IS NULL OR trim(sku) = '';
UPDATE products SET sku = sku || '-' || id
 WHERE id NOT IN (SELECT MIN(id) FROM products GROUP BY upper(sku));
UPDATE product_variants SET sku = (SELECT p.sku FROM products p WHERE p.id = product_variants.product_id) || '-' || id
 WHERE sku IS NULL OR trim(sku) = '';
UPDATE product_variants SET sku = sku || '-' || id
 WHERE id NOT IN (SELECT MIN(id) FROM product_variants GROUP BY upper(sku));
CREATE UNIQUE INDEX idx_products_sku ON products(sku COLLATE NOCASE);
CREATE UNIQUE INDEX idx_variants_sku ON product_variants(sku COLLATE NOCASE);

-- ---------- Per-product offers ----------
-- discount_type: 'none' (use sale_price as typed), 'percent' or 'flat' (sale_price is calculated).
ALTER TABLE products ADD COLUMN discount_type TEXT NOT NULL DEFAULT 'none' CHECK (discount_type IN ('none','percent','flat'));
ALTER TABLE products ADD COLUMN discount_value INTEGER NOT NULL DEFAULT 0 CHECK (discount_value >= 0);
-- delivery_mode: 'zone' (area fee), 'free' (free delivery) or 'fixed' (delivery_charge taka).
ALTER TABLE products ADD COLUMN delivery_mode TEXT NOT NULL DEFAULT 'zone' CHECK (delivery_mode IN ('zone','free','fixed'));
ALTER TABLE products ADD COLUMN delivery_charge INTEGER CHECK (delivery_charge IS NULL OR delivery_charge >= 0);
