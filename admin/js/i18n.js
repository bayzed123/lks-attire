// Admin copy — plain language for a non-technical team. Bangla default, English toggle.
const dict = {
  en: {
    dashboard: "Dashboard", orders: "Orders", products: "Products", categories: "Categories", customers: "Customers", coupons: "Coupons & discounts",
    inventory: "Inventory & stock", banners: "Homepage banners", reviews: "Reviews", staff: "Staff & roles", reports: "Reports", settings: "Settings",
    zones: "Delivery zones", audit: "Activity log", help: "Help center", catalog: "Catalogue", sales: "Sales", marketing: "Marketing", system: "System",
    collapse: "Collapse menu", search: "Search invoice no, phone, name, SKU…", invoiceNo: "Invoice no", orderNo: "Order no", profile: "Profile settings", signOut: "Sign out", notifications: "Notifications",
    onlineNow: "Online now", onlyYou: "Only you are online.", newOrders: "New orders", lowStock: "Low stock", pendingReviews: "Reviews waiting",
    nothingNew: "Nothing new right now.",
    todayOrders: "Today's orders", todayRevenue: "Today's sales", monthRevenue: "This month's sales", pendingCod: "Waiting for confirmation", lowStockItems: "Low-stock items", newCustomers: "New customers (7 days)",
    vsYesterday: "vs yesterday", vsLastMonth: "vs last month", vsLastWeek: "vs last week", ofVariants: "of {n} variants", codCount: "{n} are Cash on Delivery",
    salesChart: "Monthly sales", recentOrders: "Recent orders", topProducts: "Top sellers (30 days)", viewAll: "View all", orderMix: "Last 30 days by status",
    add: "Add new", edit: "Edit", delete: "Delete", restore: "Restore", deleteForever: "Delete forever", save: "Save", cancel: "Cancel", close: "Close", yes: "Yes", back: "Back",
    saving: "Saving…", confirmDelete: "Move \"{name}\" to Trash? You can restore it later.", confirmPurge: "Delete \"{name}\" forever? This cannot be undone.",
    active: "Active", trash: "Trash", all: "All", searchPlaceholder: "Search…", noItems: "Nothing here yet.", noItemsSub: "Items you add will show up here.",
    loadError: "Couldn't load. Check the internet and try again.", retry: "Try again", prev: "Previous", next: "Next", pageOf: "Page {p} of {n}",
    actions: "Actions", status: "Status", date: "Date", total: "Total", customer: "Customer", phone: "Phone", payment: "Payment", items: "Items", courier: "Courier", tracking: "Tracking ID",
    s_pending: "Pending", s_confirmed: "Confirmed", s_packed: "Packed", s_shipped: "Shipped", s_delivered: "Delivered", s_returned: "Returned", s_cancelled: "Cancelled",
    moveTo: "Move to", markAs: "Mark as", orderDetail: "Order", printInvoice: "Print invoice", printLabel: "Print shipping label", sendAgain: "Send SMS again",
    shipDialog: "Ship this order", chooseCourier: "Courier", bookSteadfast: "Book with Steadfast automatically", orEnterTracking: "Or type the tracking ID from the courier",
    notifyCustomer: "Send SMS to the customer", note: "Note (optional)", refund: "Record a refund", refundAmount: "Refund amount (৳)", refundReason: "Reason",
    markPaid: "Mark as paid", paymentRef: "Payment reference / TrxID", adminNotes: "Staff notes (customer can't see)", history: "History", messages: "Messages sent",
    customerHistory: "This customer: {n} orders, {f} cancelled/returned", deliverTo: "Deliver to", subtotal: "Subtotal", discount: "Discount", deliveryFee: "Delivery",
    bulkSelected: "{n} selected", bulkConfirm: "Confirm selected", bulkPack: "Mark selected packed",
    exportCsv: "Export CSV", importCsv: "Import CSV", importHelp: "One row per size/colour. Required columns: slug, name_en, name_bn, category_slug, price, size, color, stock.", importDone: "{n} products imported.",
    duplicate: "Duplicate", images: "Photos", uploadImage: "Add photo", uploading: "Uploading…", firstIsCover: "The first photo is the cover.",
    variants: "Sizes, colours & stock", addVariant: "Add size/colour", basics: "Basic details", descriptions: "Descriptions", pricing: "Price", seo: "Search engine (SEO)",
    aiWrite: "Write with AI", aiWorking: "Writing…",
    adjustStock: "Adjust stock", setTo: "Set to", addQty: "Add", removeQty: "Remove", reason: "Reason", restock: "New stock arrived", adjustment: "Correction", returnR: "Customer return",
    stockLog: "Stock history", lowOnly: "Low stock", outOnly: "Out of stock",
    dragHint: "Drag ⋮⋮ to reorder. Drop onto another category to make it a sub-category.", saveOrder: "Save order", addSub: "Add sub-category",
    from: "From", to: "To", groupBy: "Group by", byDay: "Day", byMonth: "Month", byCategory: "Category", byProduct: "Product", byPayment: "Payment method", byZone: "Delivery zone",
    salesReport: "Sales", bestCustomers: "Best customers", courierPerf: "Courier performance", orders_: "Orders", revenue: "Revenue", avgOrder: "Average order",
    storeInfo: "Store information", paymentsSettings: "Payment methods", notifSettings: "Customer messages", smsTemplates: "Message templates", seoDefaults: "SEO defaults", integrations: "Connected services",
    connected: "Connected", notConnected: "Not connected", secretsNote: "API keys are kept safely as Cloudflare secrets (ask your developer). They are never shown here.",
    manual: "Manual (customer sends money, types TrxID)", api: "Automatic (API)", number: "Receiving number", accountType: "Account type",
    templatesHelp: "You can use {name}, {order_no}, {invoice_no}, {total}, {courier}, {tracking}, {store}.",
    signInTitle: "Staff sign in", email: "Email", loginId: "Username or email", password: "Password", signIn: "Sign in", signingIn: "Signing in…",
    currentPassword: "Current password", newPassword: "New password (min 10 characters)", roleMatrix: "What each role can do",
    saved: "Saved.", deleted: "Moved to Trash.", restored: "Restored.", forbidden: "You don't have permission for this.",
    helpIntro: "Short guides for everyday tasks. Tap a question to open it.",
    yesNo_1: "Yes", yesNo_0: "No",
  },
  bn: {
    dashboard: "ড্যাশবোর্ড", orders: "অর্ডার", products: "পণ্য", categories: "ক্যাটাগরি", customers: "গ্রাহক", coupons: "কুপন ও ছাড়",
    inventory: "স্টক ও ইনভেন্টরি", banners: "হোমপেজ ব্যানার", reviews: "রিভিউ", staff: "স্টাফ ও রোল", reports: "রিপোর্ট", settings: "সেটিংস",
    zones: "ডেলিভারি জোন", audit: "কার্যক্রমের লগ", help: "সাহায্য", catalog: "ক্যাটালগ", sales: "বিক্রি", marketing: "মার্কেটিং", system: "সিস্টেম",
    collapse: "মেনু ছোট করুন", search: "ইনভয়েস নং, মোবাইল, নাম, SKU খুঁজুন…", invoiceNo: "ইনভয়েস নং", orderNo: "অর্ডার নং", profile: "প্রোফাইল সেটিংস", signOut: "সাইন আউট", notifications: "নোটিফিকেশন",
    onlineNow: "এখন অনলাইনে", onlyYou: "শুধু আপনি অনলাইনে আছেন।", newOrders: "নতুন অর্ডার", lowStock: "স্টক কম", pendingReviews: "অপেক্ষমাণ রিভিউ",
    nothingNew: "এই মুহূর্তে নতুন কিছু নেই।",
    todayOrders: "আজকের অর্ডার", todayRevenue: "আজকের বিক্রি", monthRevenue: "এই মাসের বিক্রি", pendingCod: "কনফার্মের অপেক্ষায়", lowStockItems: "স্টক কম এমন আইটেম", newCustomers: "নতুন গ্রাহক (৭ দিন)",
    vsYesterday: "গতকালের তুলনায়", vsLastMonth: "গত মাসের তুলনায়", vsLastWeek: "গত সপ্তাহের তুলনায়", ofVariants: "{n}টি ভ্যারিয়েন্টের মধ্যে", codCount: "{n}টি ক্যাশ অন ডেলিভারি",
    salesChart: "মাসিক বিক্রি", recentOrders: "সাম্প্রতিক অর্ডার", topProducts: "সেরা বিক্রিত (৩০ দিন)", viewAll: "সব দেখুন", orderMix: "গত ৩০ দিনের অবস্থা",
    add: "নতুন যোগ করুন", edit: "সম্পাদনা", delete: "মুছুন", restore: "ফিরিয়ে আনুন", deleteForever: "স্থায়ীভাবে মুছুন", save: "সংরক্ষণ করুন", cancel: "বাতিল", close: "বন্ধ করুন", yes: "হ্যাঁ", back: "ফিরে যান",
    saving: "সংরক্ষণ হচ্ছে…", confirmDelete: "\"{name}\" ট্র্যাশে পাঠাবেন? পরে ফিরিয়ে আনা যাবে।", confirmPurge: "\"{name}\" স্থায়ীভাবে মুছে ফেলবেন? এটি আর ফেরত আনা যাবে না।",
    active: "চালু", trash: "ট্র্যাশ", all: "সব", searchPlaceholder: "খুঁজুন…", noItems: "এখানে এখনো কিছু নেই।", noItemsSub: "যা যোগ করবেন তা এখানে দেখা যাবে।",
    loadError: "লোড হয়নি। ইন্টারনেট দেখে আবার চেষ্টা করুন।", retry: "আবার চেষ্টা করুন", prev: "আগের", next: "পরের", pageOf: "পৃষ্ঠা {p} / {n}",
    actions: "কাজ", status: "অবস্থা", date: "তারিখ", total: "মোট", customer: "গ্রাহক", phone: "ফোন", payment: "পেমেন্ট", items: "পণ্য", courier: "কুরিয়ার", tracking: "ট্র্যাকিং আইডি",
    s_pending: "অপেক্ষমাণ", s_confirmed: "কনফার্মড", s_packed: "প্যাকড", s_shipped: "পাঠানো হয়েছে", s_delivered: "ডেলিভারড", s_returned: "ফেরত", s_cancelled: "বাতিল",
    moveTo: "পরের ধাপ", markAs: "চিহ্নিত করুন", orderDetail: "অর্ডার", printInvoice: "ইনভয়েস প্রিন্ট", printLabel: "শিপিং লেবেল প্রিন্ট", sendAgain: "আবার SMS পাঠান",
    shipDialog: "অর্ডারটি পাঠান", chooseCourier: "কুরিয়ার", bookSteadfast: "স্টেডফাস্টে অটোমেটিক বুক করুন", orEnterTracking: "অথবা কুরিয়ারের ট্র্যাকিং আইডি লিখুন",
    notifyCustomer: "গ্রাহককে SMS পাঠান", note: "নোট (ঐচ্ছিক)", refund: "রিফান্ড রেকর্ড করুন", refundAmount: "রিফান্ডের পরিমাণ (৳)", refundReason: "কারণ",
    markPaid: "পেমেন্ট পেয়েছি", paymentRef: "পেমেন্ট রেফারেন্স / TrxID", adminNotes: "স্টাফ নোট (গ্রাহক দেখবেন না)", history: "ইতিহাস", messages: "পাঠানো মেসেজ",
    customerHistory: "এই গ্রাহক: {n}টি অর্ডার, {f}টি বাতিল/ফেরত", deliverTo: "ডেলিভারির ঠিকানা", subtotal: "পণ্যের দাম", discount: "ছাড়", deliveryFee: "ডেলিভারি",
    bulkSelected: "{n}টি নির্বাচিত", bulkConfirm: "নির্বাচিতগুলো কনফার্ম করুন", bulkPack: "নির্বাচিতগুলো প্যাকড করুন",
    exportCsv: "CSV এক্সপোর্ট", importCsv: "CSV ইমপোর্ট", importHelp: "প্রতি সাইজ/রঙের জন্য একটি সারি। আবশ্যক কলাম: slug, name_en, name_bn, category_slug, price, size, color, stock।", importDone: "{n}টি পণ্য ইমপোর্ট হয়েছে।",
    duplicate: "কপি করুন", images: "ছবি", uploadImage: "ছবি যোগ করুন", uploading: "আপলোড হচ্ছে…", firstIsCover: "প্রথম ছবিটি কভার হিসেবে দেখাবে।",
    variants: "সাইজ, রং ও স্টক", addVariant: "সাইজ/রং যোগ করুন", basics: "মূল তথ্য", descriptions: "বিবরণ", pricing: "দাম", seo: "সার্চ ইঞ্জিন (SEO)",
    aiWrite: "AI দিয়ে লিখুন", aiWorking: "লেখা হচ্ছে…",
    adjustStock: "স্টক পরিবর্তন", setTo: "নির্দিষ্ট করুন", addQty: "যোগ", removeQty: "বাদ", reason: "কারণ", restock: "নতুন স্টক এসেছে", adjustment: "সংশোধন", returnR: "গ্রাহক ফেরত",
    stockLog: "স্টকের ইতিহাস", lowOnly: "স্টক কম", outOnly: "স্টক শেষ",
    dragHint: "ক্রম বদলাতে ⋮⋮ টেনে আনুন। অন্য ক্যাটাগরির উপর ছাড়লে সেটির সাব-ক্যাটাগরি হবে।", saveOrder: "ক্রম সংরক্ষণ", addSub: "সাব-ক্যাটাগরি যোগ",
    from: "শুরু", to: "শেষ", groupBy: "ভাগ করুন", byDay: "দিন", byMonth: "মাস", byCategory: "ক্যাটাগরি", byProduct: "পণ্য", byPayment: "পেমেন্ট পদ্ধতি", byZone: "ডেলিভারি জোন",
    salesReport: "বিক্রি", bestCustomers: "সেরা গ্রাহক", courierPerf: "কুরিয়ারের পারফরম্যান্স", orders_: "অর্ডার", revenue: "আয়", avgOrder: "গড় অর্ডার",
    storeInfo: "দোকানের তথ্য", paymentsSettings: "পেমেন্ট পদ্ধতি", notifSettings: "গ্রাহককে মেসেজ", smsTemplates: "মেসেজের টেমপ্লেট", seoDefaults: "SEO", integrations: "সংযুক্ত সার্ভিস",
    connected: "সংযুক্ত", notConnected: "সংযুক্ত নয়", secretsNote: "API কী নিরাপদে Cloudflare secret হিসেবে রাখা হয় (ডেভেলপারকে বলুন)। এখানে কখনো দেখানো হয় না।",
    manual: "ম্যানুয়াল (গ্রাহক টাকা পাঠিয়ে TrxID দেবেন)", api: "অটোমেটিক (API)", number: "টাকা গ্রহণের নম্বর", accountType: "অ্যাকাউন্টের ধরন",
    templatesHelp: "ব্যবহার করতে পারেন: {name}, {order_no}, {invoice_no}, {total}, {courier}, {tracking}, {store}",
    signInTitle: "স্টাফ সাইন ইন", email: "ইমেইল", loginId: "ইউজারনেম বা ইমেইল", password: "পাসওয়ার্ড", signIn: "সাইন ইন", signingIn: "সাইন ইন হচ্ছে…",
    currentPassword: "বর্তমান পাসওয়ার্ড", newPassword: "নতুন পাসওয়ার্ড (কমপক্ষে ১০ অক্ষর)", roleMatrix: "কোন রোল কী করতে পারে",
    saved: "সংরক্ষণ হয়েছে।", deleted: "ট্র্যাশে পাঠানো হয়েছে।", restored: "ফিরিয়ে আনা হয়েছে।", forbidden: "এই কাজের অনুমতি আপনার নেই।",
    helpIntro: "প্রতিদিনের কাজের ছোট গাইড। প্রশ্নে চাপ দিয়ে খুলুন।",
    yesNo_1: "হ্যাঁ", yesNo_0: "না",
  },
};

let current = (() => { try { return localStorage.getItem("lks_admin_lang") || "bn"; } catch { return "bn"; } })();
export const lang = () => current;
export function setLang(l) {
  current = l === "en" ? "en" : "bn";
  try { localStorage.setItem("lks_admin_lang", current); } catch { /* ignore */ }
  document.documentElement.lang = current;
}
export function t(key, vars) {
  let s = dict[current][key] ?? dict.en[key] ?? key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
  return s;
}
/** Bilingual literal: tt({ en: "…", bn: "…" }) */
export const tt = (o) => (o ? o[current] ?? o.en ?? "" : "");
const nf = { bn: new Intl.NumberFormat("bn-BD"), en: new Intl.NumberFormat("en-IN") };
export const num = (n) => nf[current].format(n ?? 0);
export const money = (n) => `৳${num(n)}`;
export const dt = (iso, time = false) =>
  iso ? new Date(iso).toLocaleString(current === "bn" ? "bn-BD" : "en-GB", { day: "numeric", month: "short", year: "numeric", ...(time ? { hour: "2-digit", minute: "2-digit" } : {}) }) : "—";
