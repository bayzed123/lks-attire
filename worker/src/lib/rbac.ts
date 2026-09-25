import type { Role } from "../env";

/** Every permission the admin API checks. Keep in sync with admin/js/rbac.js (UI hiding). */
export const PERMISSIONS = [
  "dashboard.view",
  "products.read", "products.write", "products.delete",
  "categories.read", "categories.write", "categories.delete",
  "orders.read", "orders.update", "orders.delete", "orders.refund",
  "customers.read", "customers.write", "customers.delete",
  "coupons.read", "coupons.write", "coupons.delete",
  "banners.read", "banners.write", "banners.delete",
  "reviews.read", "reviews.moderate", "reviews.delete",
  "inventory.read", "inventory.adjust",
  "zones.read", "zones.write", "zones.delete",
  "staff.read", "staff.manage",
  "reports.view",
  "settings.read", "settings.manage",
  "audit.view",
  "trash.purge",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const all = [...PERMISSIONS] as Permission[];
const readOnly = all.filter((p) => p.endsWith(".read") || p === "dashboard.view" || p === "reports.view");

export const ROLE_MATRIX: Record<Role, Permission[]> = {
  super_admin: all,
  manager: all.filter((p) => !["staff.manage", "settings.manage", "trash.purge"].includes(p)),
  order_processor: [
    "dashboard.view",
    "orders.read", "orders.update",
    "customers.read",
    "products.read", "categories.read",
    "inventory.read",
    "reviews.read",
    "zones.read",
  ],
  viewer: readOnly.filter((p) => p !== "staff.read" && p !== "settings.read"),
};

export const ROLE_LABELS: Record<Role, { en: string; bn: string }> = {
  super_admin: { en: "Super Admin", bn: "সুপার অ্যাডমিন" },
  manager: { en: "Manager", bn: "ম্যানেজার" },
  order_processor: { en: "Order Processor", bn: "অর্ডার প্রসেসর" },
  viewer: { en: "Read-only Viewer", bn: "শুধু দেখতে পারবেন" },
};

export function can(role: Role, perm: Permission): boolean {
  return ROLE_MATRIX[role]?.includes(perm) ?? false;
}
