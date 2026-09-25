// Declarative definitions for the simpler admin modules. The generic view (views/resource.js)
// turns each one into a searchable, filterable list with create/edit slide-overs, delete→Trash and restore.
import { t, tt, num, money, dt, lang } from "./i18n.js";
import { html, pill, api, raw } from "./core.js";

const L = (en, bn) => ({ en, bn });
const yes = (v) => (v ? pill("active", t("yesNo_1")) : pill("inactive", t("yesNo_0")));

let catOptions;
export const categoryOptions = async () =>
  (catOptions ??= api("/categories?limit=200&sort=sort_order").then((r) => r.items.map((c) => [c.id, (c.parent_name ? `${c.parent_name} › ` : "") + (lang() === "bn" ? c.name_bn : c.name_en)])));

let geo;
const geoData = async () => (geo ??= fetch("/data/bd-geo.json").then((r) => r.json()));

export const RESOURCES = {
  customers: {
    endpoint: "/customers",
    perm: "customers",
    title: L("Customers", "গ্রাহক"),
    nameOf: (r) => r.name,
    filters: [{ name: "is_blocked", label: L("Status", "অবস্থা"), options: [["", L("All", "সব")], ["0", L("Active", "চালু")], ["1", L("Blocked", "ব্লক করা")]] }],
    columns: [
      { label: L("Name", "নাম"), render: (r) => html`<b>${r.name}</b>${r.has_account ? html` <span class="pill active">${lang() === "bn" ? "অ্যাকাউন্ট" : "Account"}</span>` : ""}<br><span class="muted small">${r.email ?? ""}</span>` },
      { label: L("Phone", "ফোন"), render: (r) => html`<a href="tel:${r.phone}">${r.phone}</a>` },
      { label: L("Orders", "অর্ডার"), render: (r) => num(r.order_count) },
      { label: L("Spent", "মোট কেনা"), render: (r) => money(r.total_spent) },
      { label: L("Status", "অবস্থা"), render: (r) => (r.is_blocked ? pill("blocked", lang() === "bn" ? "ব্লক" : "Blocked") : pill("active", t("active"))) },
      { label: L("Joined", "যোগদান"), render: (r) => dt(r.created_at) },
    ],
    fields: async () => [
      { name: "name", label: L("Full name", "পুরো নাম"), required: true },
      { name: "phone", label: L("Mobile number", "মোবাইল নম্বর"), required: true, placeholder: "01XXXXXXXXX" },
      { name: "email", label: L("Email", "ইমেইল"), type: "email" },
      { name: "is_blocked", label: L("Block this customer (they can't order or sign in)", "এই গ্রাহককে ব্লক করুন (অর্ডার বা সাইন ইন করতে পারবেন না)"), type: "checkbox", span: 2 },
      { name: "notes", label: L("Internal notes (only staff can see)", "অভ্যন্তরীণ নোট (শুধু স্টাফ দেখবেন)"), type: "textarea", span: 2 },
    ],
    rowActions: (r) => html`<button class="btn sm" data-act="toggle-block">${r.is_blocked ? (lang() === "bn" ? "আনব্লক" : "Unblock") : lang() === "bn" ? "ব্লক" : "Block"}</button>`,
    onAction: async (act, r) => {
      if (act === "toggle-block") return api(`/customers/${r.id}`, { method: "PUT", body: { name: r.name, phone: r.phone, email: r.email ?? "", notes: r.notes ?? "", is_blocked: r.is_blocked ? 0 : 1 } });
    },
    detail: (r) => html`<h3>${t("orders")}</h3>${(r.orders ?? []).length ? html`<table class="table">${r.orders.map((o) => html`<tr><td data-label="#"><a href="#/orders/${o.id}">${o.order_no}</a></td><td data-label="${t("status")}">${pill(o.status, t(`s_${o.status}`))}</td><td data-label="${t("total")}">${money(o.total)}</td><td data-label="${t("date")}">${dt(o.created_at)}</td></tr>`)}</table>` : html`<p class="muted">—</p>`}
      ${(r.addresses ?? []).length ? html`<h3>${lang() === "bn" ? "সংরক্ষিত ঠিকানা" : "Saved addresses"}</h3>${r.addresses.map((a) => html`<p class="small"><b>${a.label}</b>: ${a.area}, ${a.upazila}, ${a.district}</p>`)}` : ""}`,
  },

  coupons: {
    endpoint: "/coupons",
    perm: "coupons",
    title: L("Coupons & discounts", "কুপন ও ছাড়"),
    nameOf: (r) => r.code,
    filters: [{ name: "type", label: L("Type", "ধরন"), options: [["", L("All", "সব")], ["percent", L("Percentage", "শতাংশ")], ["flat", L("Flat amount", "নির্দিষ্ট টাকা")]] }],
    columns: [
      { label: L("Code", "কোড"), render: (r) => html`<b style="letter-spacing:.06em">${r.code}</b><br><span class="muted small">${r.description ?? ""}</span>` },
      { label: L("Discount", "ছাড়"), render: (r) => (r.type === "percent" ? `${num(r.value)}%` : money(r.value)) + (r.max_discount ? ` (≤ ${money(r.max_discount)})` : "") },
      { label: L("Min. order", "সর্বনিম্ন অর্ডার"), render: (r) => money(r.min_order) },
      { label: L("Used", "ব্যবহৃত"), render: (r) => `${num(r.used_count)}${r.usage_limit ? ` / ${num(r.usage_limit)}` : ""}` },
      { label: L("Expires", "মেয়াদ"), render: (r) => (r.expires_at ? dt(r.expires_at) : "—") },
      { label: L("Status", "অবস্থা"), render: (r) => (r.expires_at && Date.parse(r.expires_at) < Date.now() ? pill("inactive", lang() === "bn" ? "মেয়াদোত্তীর্ণ" : "Expired") : yes(r.is_active)) },
    ],
    fields: async () => [
      { name: "code", label: L("Coupon code", "কুপন কোড"), required: true, placeholder: "EID25", hint: L("Customers type this at checkout.", "গ্রাহক চেকআউটে এটি লিখবেন।") },
      { name: "description", label: L("Description (for staff)", "বিবরণ (স্টাফের জন্য)") },
      { name: "type", label: L("Discount type", "ছাড়ের ধরন"), type: "select", options: [["percent", L("Percentage (%)", "শতাংশ (%)")], ["flat", L("Flat amount (৳)", "নির্দিষ্ট টাকা (৳)")]], required: true },
      { name: "value", label: L("Discount value", "ছাড়ের পরিমাণ"), type: "number", required: true, min: 1 },
      { name: "min_order", label: L("Minimum order (৳)", "সর্বনিম্ন অর্ডার (৳)"), type: "money", default: 0 },
      { name: "max_discount", label: L("Maximum discount (৳, optional)", "সর্বোচ্চ ছাড় (৳, ঐচ্ছিক)"), type: "money" },
      { name: "starts_at", label: L("Starts", "শুরু"), type: "date" },
      { name: "expires_at", label: L("Expires", "শেষ"), type: "date" },
      { name: "usage_limit", label: L("Total uses allowed (optional)", "মোট কতবার ব্যবহার করা যাবে (ঐচ্ছিক)"), type: "number", min: 1 },
      { name: "per_customer_limit", label: L("Uses per customer (optional)", "প্রতি গ্রাহক কতবার (ঐচ্ছিক)"), type: "number", min: 1 },
      { name: "category_ids", label: L("Only for these categories (leave empty = whole store)", "শুধু এই ক্যাটাগরিগুলোতে (খালি রাখলে পুরো দোকানে)"), type: "multiselect", options: await categoryOptions(), span: 2, hint: L("Hold Ctrl/⌘ (or long-press on phone) to select several.", "একাধিক বাছতে Ctrl/⌘ চেপে ধরুন (ফোনে লম্বা চাপ দিন)।") },
      { name: "is_active", label: L("Coupon is active", "কুপন চালু আছে"), type: "checkbox", default: 1, span: 2 },
    ],
  },

  banners: {
    endpoint: "/banners",
    perm: "banners",
    title: L("Homepage banners", "হোমপেজ ব্যানার"),
    nameOf: (r) => r.title_en,
    filters: [{ name: "placement", label: L("Placement", "অবস্থান"), options: [["", L("All", "সব")], ["hero", L("Hero slider", "হিরো স্লাইডার")], ["festive", L("Festive campaign", "উৎসব ক্যাম্পেইন")], ["promo", L("Promo strip", "প্রোমো")]] }],
    columns: [
      { label: L("Image", "ছবি"), render: (r) => (r.image_url ? html`<img class="thumb" src="${r.image_url}" alt="">` : "—") },
      { label: L("Title", "শিরোনাম"), render: (r) => html`<b>${lang() === "bn" ? r.title_bn : r.title_en}</b><br><span class="muted small">${r.link_url ?? ""}</span>` },
      { label: L("Placement", "অবস্থান"), render: (r) => pill(r.placement) },
      { label: L("Schedule", "সময়সূচি"), render: (r) => `${r.starts_at ? dt(r.starts_at) : "…"} → ${r.ends_at ? dt(r.ends_at) : "…"}` },
      { label: L("Showing", "দেখাচ্ছে"), render: (r) => yes(r.is_active && (!r.ends_at || Date.parse(r.ends_at) > Date.now()) && (!r.starts_at || Date.parse(r.starts_at) <= Date.now())) },
    ],
    fields: async () => [
      { name: "placement", label: L("Where to show", "কোথায় দেখাবে"), type: "select", options: [["hero", L("Hero slider (top of home page)", "হিরো স্লাইডার (হোমপেজের উপরে)")], ["festive", L("Festive campaign banner", "উৎসব ক্যাম্পেইন ব্যানার")], ["promo", L("Promo strip", "প্রোমো")]], required: true, span: 2 },
      { name: "title_en", label: L("Title (English)", "শিরোনাম (ইংরেজি)"), required: true },
      { name: "title_bn", label: L("Title (Bangla)", "শিরোনাম (বাংলা)"), required: true },
      { name: "subtitle_en", label: L("Subtitle (English)", "উপশিরোনাম (ইংরেজি)") },
      { name: "subtitle_bn", label: L("Subtitle (Bangla)", "উপশিরোনাম (বাংলা)") },
      { name: "cta_en", label: L("Button text (English)", "বাটনের লেখা (ইংরেজি)") },
      { name: "cta_bn", label: L("Button text (Bangla)", "বাটনের লেখা (বাংলা)") },
      { name: "link_url", label: L("Button link", "বাটনের লিংক"), placeholder: "/shop/festive", span: 2 },
      { name: "image_url", label: L("Image (1200×900 works best)", "ছবি (১২০০×৯০০ ভালো)"), type: "image", span: 2 },
      { name: "starts_at", label: L("Start showing", "দেখানো শুরু"), type: "date" },
      { name: "ends_at", label: L("Stop showing", "দেখানো বন্ধ"), type: "date" },
      { name: "sort_order", label: L("Order (smaller shows first)", "ক্রম (ছোট সংখ্যা আগে)"), type: "number", default: 0 },
      { name: "is_active", label: L("Active", "চালু"), type: "checkbox", default: 1 },
    ],
  },

  reviews: {
    endpoint: "/reviews",
    perm: "reviews",
    writePerm: "reviews.moderate",
    title: L("Reviews", "রিভিউ"),
    nameOf: (r) => `${r.name} — ${r.product_name}`,
    noCreate: true,
    filters: [{ name: "status", label: L("Status", "অবস্থা"), options: [["", L("All", "সব")], ["pending", L("Waiting", "অপেক্ষমাণ")], ["approved", L("Approved", "অনুমোদিত")], ["rejected", L("Rejected", "বাতিল")], ["flagged", L("Flagged", "চিহ্নিত")]] }],
    columns: [
      { label: L("Review", "রিভিউ"), render: (r) => html`<span style="color:#D98A12">${"★".repeat(r.rating)}${"☆".repeat(5 - r.rating)}</span><br>${r.body}${r.reply ? html`<br><span class="muted small">↳ ${r.reply}</span>` : ""}` },
      { label: L("By", "লিখেছেন"), render: (r) => html`<b>${r.name}</b><br><span class="muted small">${dt(r.created_at)}</span>` },
      { label: L("Product", "পণ্য"), render: (r) => html`<a href="/product/${r.product_slug}" target="_blank" rel="noopener">${r.product_name}</a>` },
      { label: L("Status", "অবস্থা"), render: (r) => pill(r.status) },
    ],
    fields: async () => [
      { name: "status", label: L("Status", "অবস্থা"), type: "select", options: [["pending", L("Waiting", "অপেক্ষমাণ")], ["approved", L("Approved — show on the website", "অনুমোদিত — ওয়েবসাইটে দেখাবে")], ["rejected", L("Rejected — hide", "বাতিল — লুকানো")], ["flagged", L("Flagged as inappropriate", "অনুপযুক্ত হিসেবে চিহ্নিত")]], span: 2 },
      { name: "reply", label: L("Public reply from the shop (optional)", "দোকানের পক্ষ থেকে উত্তর (ঐচ্ছিক)"), type: "textarea", span: 2 },
    ],
    rowActions: (r) => html`${r.status !== "approved" ? html`<button class="btn sm" data-act="approved">✓ ${lang() === "bn" ? "অনুমোদন" : "Approve"}</button>` : ""} ${r.status !== "rejected" ? html`<button class="btn sm" data-act="rejected">✕ ${lang() === "bn" ? "বাতিল" : "Reject"}</button>` : ""} ${r.status !== "flagged" ? html`<button class="btn sm" data-act="flagged">⚑</button>` : ""}`,
    onAction: (act, r) => api(`/reviews/${r.id}`, { method: "PUT", body: { status: act } }),
  },

  zones: {
    endpoint: "/zones",
    perm: "zones",
    title: L("Delivery zones & fees", "ডেলিভারি জোন ও চার্জ"),
    nameOf: (r) => r.name_en,
    filters: [],
    intro: L("The most specific match wins: an upazila rule beats a district rule, which beats the default zone.", "সবচেয়ে নির্দিষ্ট মিলটি প্রযোজ্য হবে: উপজেলার নিয়ম জেলার নিয়মের আগে, জেলার নিয়ম ডিফল্ট জোনের আগে।"),
    columns: [
      { label: L("Zone", "জোন"), render: (r) => html`<b>${lang() === "bn" ? r.name_bn : r.name_en}</b><br><span class="muted small">${r.code}${r.is_default ? " · default" : ""}</span>` },
      { label: L("Fee", "চার্জ"), render: (r) => money(r.fee) },
      { label: L("Free over", "যত টাকার উপরে ফ্রি"), render: (r) => (r.free_shipping_min ? money(r.free_shipping_min) : "—") },
      { label: L("Covers", "এলাকা"), render: (r) => (r.is_default ? (lang() === "bn" ? "বাকি সব এলাকা" : "Everywhere else") : `${num(r.district_ids.length)} ${lang() === "bn" ? "জেলা" : "districts"}, ${num(r.upazila_ids.length)} ${lang() === "bn" ? "উপজেলা" : "upazilas"}`) },
      { label: L("Delivery time", "ডেলিভারির সময়"), render: (r) => (lang() === "bn" ? r.eta_bn : r.eta_en) ?? "—" },
    ],
    fields: async () => {
      const g = await geoData();
      const dname = Object.fromEntries(g.districts.map(([id, , en, bn]) => [id, lang() === "bn" ? bn : en]));
      return [
        { name: "name_en", label: L("Zone name (English)", "জোনের নাম (ইংরেজি)"), required: true },
        { name: "name_bn", label: L("Zone name (Bangla)", "জোনের নাম (বাংলা)"), required: true },
        { name: "code", label: L("Short code", "শর্ট কোড"), required: true, placeholder: "dhaka_city", hint: L("lowercase_with_underscores", "ছোট হাতের ইংরেজি ও _") },
        { name: "fee", label: L("Delivery fee (৳)", "ডেলিভারি চার্জ (৳)"), type: "money", required: true },
        { name: "free_shipping_min", label: L("Free delivery on orders over (৳, optional)", "এর বেশি অর্ডারে ফ্রি ডেলিভারি (৳, ঐচ্ছিক)"), type: "money" },
        { name: "sort_order", label: L("Order", "ক্রম"), type: "number", default: 0 },
        { name: "eta_en", label: L("Delivery time (English)", "ডেলিভারির সময় (ইংরেজি)"), placeholder: "2–3 days" },
        { name: "eta_bn", label: L("Delivery time (Bangla)", "ডেলিভারির সময় (বাংলা)"), placeholder: "২–৩ দিন" },
        { name: "district_ids", label: L("Districts in this zone", "এই জোনের জেলা"), type: "multiselect", options: g.districts.map(([id, , en, bn]) => [id, lang() === "bn" ? bn : en]).sort((a, b) => a[1].localeCompare(b[1])), span: 2 },
        { name: "upazila_ids", label: L("Specific upazilas (override the district)", "নির্দিষ্ট উপজেলা (জেলার নিয়মের আগে প্রযোজ্য)"), type: "multiselect", options: g.upazilas.map(([id, d, en, bn]) => [id, `${lang() === "bn" ? bn : en} (${dname[d]})`]).sort((a, b) => a[1].localeCompare(b[1])), span: 2 },
        { name: "is_default", label: L("Default zone (used when nothing else matches)", "ডিফল্ট জোন (অন্য কিছু না মিললে)"), type: "checkbox" },
        { name: "is_active", label: L("Active", "চালু"), type: "checkbox", default: 1 },
      ];
    },
  },

  staff: {
    endpoint: "/staff",
    perm: "staff",
    writePerm: "staff.manage",
    deletePerm: "staff.manage",
    title: L("Staff & roles", "স্টাফ ও রোল"),
    nameOf: (r) => r.name,
    filters: [{ name: "role", label: L("Role", "রোল"), options: [["", L("All", "সব")], ["super_admin", "Super Admin"], ["manager", "Manager"], ["order_processor", "Order Processor"], ["viewer", "Viewer"]] }],
    columns: [
      { label: L("Name", "নাম"), render: (r) => html`<b>${r.name}</b><br><span class="muted small">${r.email}</span>` },
      { label: L("Role", "রোল"), render: (r) => pill("confirmed", r.role.replace("_", " ")) },
      { label: L("Last sign-in", "শেষ সাইন ইন"), render: (r) => dt(r.last_login_at, true) },
      { label: L("Status", "অবস্থা"), render: (r) => yes(r.is_active) },
    ],
    fields: async () => [
      { name: "name", label: L("Name", "নাম"), required: true },
      { name: "email", label: L("Email (used to sign in)", "ইমেইল (সাইন ইনের জন্য)"), type: "email", required: true },
      { name: "phone", label: L("Phone", "ফোন") },
      { name: "role", label: L("Role", "রোল"), type: "select", required: true, options: [["order_processor", L("Order Processor — handles orders", "অর্ডার প্রসেসর — অর্ডার সামলান")], ["manager", L("Manager — everything except staff & keys", "ম্যানেজার — স্টাফ ও কী ছাড়া সব")], ["viewer", L("Read-only Viewer", "শুধু দেখতে পারবেন")], ["super_admin", L("Super Admin — full control", "সুপার অ্যাডমিন — সম্পূর্ণ নিয়ন্ত্রণ")]] },
      { name: "password", label: L("Password (min 10 characters; leave empty to keep)", "পাসওয়ার্ড (কমপক্ষে ১০ অক্ষর; পরিবর্তন না করলে খালি রাখুন)"), type: "password", span: 2 },
      { name: "is_active", label: L("Can sign in", "সাইন ইন করতে পারবেন"), type: "checkbox", default: 1, span: 2 },
    ],
    extra: async () => {
      const r = await api("/roles");
      const roles = Object.keys(r.matrix);
      const groups = [...new Set(r.permissions.map((p) => p.split(".")[0]))];
      return html`<div class="card" style="margin-top:20px"><h2>${t("roleMatrix")}</h2><div style="overflow-x:auto"><table class="table"><thead><tr><th></th>${roles.map((ro) => html`<th>${tt(r.labels[ro])}</th>`)}</tr></thead>
        <tbody>${groups.map((g) => html`<tr><td data-label=""><b>${g}</b></td>${roles.map((ro) => html`<td data-label="${tt(r.labels[ro])}">${r.permissions.filter((p) => p.startsWith(g + ".")).map((p) => raw(r.matrix[ro].includes(p) ? `<span class="pill active" style="margin:2px">${p.split(".")[1]}</span>` : ""))}</td>`)}</tr>`)}</tbody></table></div></div>`;
    },
  },
};
