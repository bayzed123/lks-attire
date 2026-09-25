// Admin shell: sign-in, three-pane layout, hash router, notification bell, staff presence, global search.
import { t, lang, setLang, num, money, dt, tt } from "./i18n.js";
import { html, icon, api, $, $$, session, can, toast, errMsg, msg, debounce, showErrors } from "./core.js";

const NAV = [
  { group: null, items: [
    ["dashboard", "dashboard", "dashboard.view"],
    ["orders", "orders", "orders.read"],
    ["products", "products", "products.read"],
    ["reports", "reports", "reports.view"],
    ["settings", "settings", "settings.read"],
  ] },
  { group: "catalog", items: [
    ["categories", "categories", "categories.read"],
    ["inventory", "inventory", "inventory.read"],
    ["customers", "customers", "customers.read"],
    ["coupons", "coupons", "coupons.read"],
    ["banners", "banners", "banners.read"],
    ["reviews", "reviews", "reviews.read"],
    ["zones", "zones", "zones.read"],
  ] },
  { group: "system", items: [
    ["staff", "staff", "staff.read"],
    ["audit", "audit", "audit.view"],
    ["help", "help", null],
  ] },
];

const VIEWS = {
  dashboard: () => import("./views/dashboard.js"),
  orders: () => import("./views/orders.js"),
  products: () => import("./views/products.js"),
  categories: () => import("./views/categories.js"),
  inventory: () => import("./views/inventory.js"),
  reports: () => import("./views/reports.js"),
  settings: () => import("./views/settings.js"),
  help: () => import("./views/help.js"),
  profile: () => import("./views/profile.js"),
  customers: () => import("./views/resource.js"),
  coupons: () => import("./views/resource.js"),
  banners: () => import("./views/resource.js"),
  reviews: () => import("./views/resource.js"),
  zones: () => import("./views/resource.js"),
  staff: () => import("./views/resource.js"),
  audit: () => import("./views/audit.js"),
};

let brand = { name: { en: "Store", bn: "Store" }, logo: { monogram: "S" } };
let lastSeen = new Date(Date.now() - 86400_000).toISOString();

async function boot() {
  setLang(lang());
  brand = await fetch("/brand.json").then((r) => r.json()).catch(() => brand);
  try {
    const me = await api("/auth/me");
    session.admin = me.admin;
    session.perms = new Set(me.permissions);
  } catch {
    return loginScreen();
  }
  shell();
  window.addEventListener("hashchange", route);
  route();
  heartbeat();
  setInterval(heartbeat, 60_000);
  setInterval(loadBell, 60_000);
}

function loginScreen(error) {
  document.title = `${t("signInTitle")} — ${brand.name.en}`;
  $("#root").innerHTML = String(html`<div class="login-wrap"><form class="card login-card" id="login" novalidate>
    <div class="brand" style="padding:0 0 18px"><span class="brand-mark">${brand.logo.image ? html`<img src="${brand.logo.image}" alt="" style="width:100%;height:100%;border-radius:14px;object-fit:cover">` : brand.logo.monogram}</span><span><b>${brand.name[lang()] ?? brand.name.en}</b><small class="muted">${t("signInTitle")}</small></span></div>
    <label class="field"><span>${t("loginId")}</span><input class="input" name="email" type="text" autocapitalize="none" autocorrect="off" spellcheck="false" autocomplete="username" required></label>
    <label class="field"><span>${t("password")}</span><input class="input" name="password" type="password" autocomplete="current-password" required></label>
    ${error ? html`<p class="error-box">${error}</p>` : ""}
    <button class="btn primary" style="width:100%">${t("signIn")}</button>
    <p style="text-align:center;margin-top:14px"><button type="button" class="btn ghost sm" id="lang">${lang() === "bn" ? "English" : "বাংলা"}</button></p></form></div>`);
  $("#lang").onclick = () => { setLang(lang() === "bn" ? "en" : "bn"); loginScreen(); };
  $("#login").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const btn = e.target.querySelector("button.primary");
    btn.disabled = true; btn.textContent = t("signingIn");
    try {
      const r = await api("/auth/login", { method: "POST", body: { email: fd.get("email"), password: fd.get("password") } });
      session.admin = r.admin; session.perms = new Set(r.permissions);
      if (location.hash === "#/login" || !location.hash) location.hash = "#/dashboard";
      shell(); route(); heartbeat();
      window.addEventListener("hashchange", route);
    } catch (err) {
      showErrors(e.target, err);
      loginScreen(errMsg(err));
    }
  });
}

function shell() {
  const collapsed = localStorage.getItem("lks_admin_collapsed") === "1";
  $("#root").innerHTML = String(html`<div class="shell ${collapsed ? "collapsed" : ""}" id="shell">
    <aside class="side" id="side" aria-label="Menu">
      <div class="brand"><span class="brand-mark">${brand.logo.image ? html`<img src="${brand.logo.image}" alt="" style="width:100%;height:100%;border-radius:14px;object-fit:cover">` : brand.logo.monogram}</span><span class="brand-text"><b>${brand.name[lang()] ?? brand.name.en}</b><small>Admin</small></span></div>
      <nav class="nav" id="nav">${NAV.map((g) => html`${g.group ? html`<div class="nav-group">${t(g.group)}</div>` : ""}${g.items.filter(([, , p]) => !p || can(p)).map(([key, ico]) => html`<a href="#/${key}" data-key="${key}" title="${t(key)}">${icon(ico)}<span class="label">${t(key)}</span>${key === "orders" ? html`<span class="count" id="pending-count" hidden></span>` : ""}</a>`)}`)}</nav>
      <div class="side-foot"><button class="collapse-btn" id="collapse" type="button">${icon("chevrons")}<span class="label">${t("collapse")}</span></button></div>
    </aside>
    <main class="work" id="work">
      <div class="topbar"><button class="icon-btn menu-btn" id="menu" aria-label="Menu">${icon("menu")}</button><span class="title" id="page-title"></span>
        <button class="icon-btn only-narrow" id="rail-btn" aria-label="${t("notifications")}">${icon("bell")}<span class="dot" id="bell-dot-2" hidden></span></button></div>
      <div id="view"></div>
    </main>
    <aside class="rail" id="rail" aria-label="${t("notifications")}"></aside>
  </div>`);
  renderRail();
  $("#collapse").onclick = () => {
    const s = $("#shell");
    s.classList.toggle("collapsed");
    localStorage.setItem("lks_admin_collapsed", s.classList.contains("collapsed") ? "1" : "0");
  };
  const side = $("#side");
  const closeSide = () => { side.classList.remove("open"); $(".scrim")?.remove(); };
  $("#menu").onclick = () => {
    side.classList.add("open");
    const s = document.createElement("div"); s.className = "scrim"; s.onclick = closeSide; document.body.append(s);
  };
  $("#nav").addEventListener("click", () => closeSide());
  $("#rail-btn").onclick = () => {
    const rail = $("#rail");
    rail.classList.toggle("drawer");
    if (rail.classList.contains("drawer")) {
      const s = document.createElement("div"); s.className = "scrim"; s.onclick = () => { rail.classList.remove("drawer"); s.remove(); }; document.body.append(s);
    } else $(".scrim")?.remove();
  };
  loadBell();
}

function renderRail() {
  const a = session.admin;
  const initials = a.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  $("#rail").innerHTML = String(html`
    <div class="search-box"><label class="sr-only" for="gsearch">${t("search")}</label>${icon("search")}<input class="input" id="gsearch" type="search" placeholder="${t("search")}" autocomplete="off"><div class="search-results" id="gresults"></div></div>
    <div class="card" style="padding:14px">
      <div class="profile"><span class="avatar">${initials}</span><div style="min-width:0;flex:1"><b style="display:block;overflow:hidden;text-overflow:ellipsis">${a.name}</b><span class="muted small">${a.role.replace("_", " ")}</span></div>
        <div class="menu"><button class="icon-btn" id="pm" aria-haspopup="true" aria-expanded="false" aria-label="${t("profile")}">${icon("user")}</button>
          <div class="menu-list" id="pm-list" hidden><a href="#/profile">${icon("settings")} ${t("profile")}</a><button type="button" id="lang-sw">🌐 ${lang() === "bn" ? "English" : "বাংলা"}</button><button type="button" id="logout">${icon("logout")} ${t("signOut")}</button></div></div>
      </div></div>
    <div class="card" style="padding:14px"><div class="card-title"><h3 style="margin:0">${t("notifications")}</h3><span class="icon-btn" style="width:40px;height:40px">${icon("bell")}<span class="dot" id="bell-dot" hidden></span></span></div><div class="notif" id="bell"></div></div>
    <div class="card" style="padding:14px"><h3>${t("onlineNow")}</h3><div class="online" id="online"><span class="muted small">…</span></div></div>`);
  $("#pm").onclick = () => { const l = $("#pm-list"); l.hidden = !l.hidden; $("#pm").setAttribute("aria-expanded", String(!l.hidden)); };
  $("#logout").onclick = async () => { await api("/auth/logout", { method: "POST" }).catch(() => {}); location.hash = ""; location.reload(); };
  $("#lang-sw").onclick = () => { setLang(lang() === "bn" ? "en" : "bn"); shell(); route(); };
  const search = debounce(async (q) => {
    const box = $("#gresults");
    if (q.length < 2) { box.innerHTML = ""; return; }
    try {
      const r = await api(`/search?q=${encodeURIComponent(q)}`);
      const none = !r.orders.length && !r.products.length && !r.customers.length;
      box.innerHTML = String(html`${r.orders.map((o) => html`<a href="#/orders/${o.id}">🧾 <b>${o.invoice_no ?? o.order_no}</b> · ${o.customer_name} · ${money(o.total)}<span class="sr-meta">${o.order_no} · ${o.customer_phone} · ${t(`s_${o.status}`)}</span></a>`)}
        ${r.customers.map((c) => html`<a href="#/customers?id=${c.id}">👤 <b>${c.name}</b> · ${c.phone}<span class="sr-meta">${c.email ?? ""} ${num(c.order_count)} ${lang() === "bn" ? "অর্ডার" : "orders"}</span></a>`)}
        ${r.products.map((p) => html`<a href="#/products/${p.id}">👗 ${lang() === "bn" ? p.name_bn : p.name_en} · ${money(p.sale_price ?? p.price)}<span class="sr-meta">SKU ${p.variant_sku ?? p.sku ?? "—"}</span></a>`)}
        ${none ? html`<span class="muted small" style="padding:8px 12px;display:block">${lang() === "bn" ? "কিছু পাওয়া যায়নি" : "No matches"}</span>` : ""}`);
    } catch { box.innerHTML = ""; }
  }, 250);
  $("#gsearch").addEventListener("input", (e) => search(e.target.value.trim()));
  document.addEventListener("click", (e) => { if (!e.target.closest(".menu")) $("#pm-list")?.setAttribute("hidden", ""); });
}

async function loadBell() {
  if (!can("dashboard.view") || !$("#bell")) return;
  try {
    const r = await api(`/notifications?since=${encodeURIComponent(lastSeen)}`);
    const n = r.newOrders.length + r.pendingReviews.length + (r.lowStock.length ? 1 : 0);
    ["#bell-dot", "#bell-dot-2"].forEach((id) => { const d = $(id); if (d) { d.hidden = n === 0; d.textContent = num(n); } });
    $("#bell").innerHTML = n === 0 ? String(html`<span class="muted small">${t("nothingNew")}</span>`) : String(html`
      ${r.newOrders.map((o) => html`<a href="#/orders/${o.id}"><span class="ico" style="background:var(--k1)">${icon("orders")}</span><span><b>${t("newOrders")}: ${o.order_no}</b><br>${o.customer_name} · ${money(o.total)}</span></a>`)}
      ${r.lowStock.length ? html`<a href="#/inventory?stock=low"><span class="ico" style="background:var(--k3)">${icon("alert")}</span><span><b>${t("lowStock")}</b><br>${r.lowStock.slice(0, 3).map((v) => `${lang() === "bn" ? v.name_bn : v.name_en} (${v.size}/${v.color}): ${v.stock}`).join(", ")}</span></a>` : ""}
      ${r.pendingReviews.map((rv) => html`<a href="#/reviews?status=pending"><span class="ico" style="background:var(--k2)">${icon("reviews")}</span><span><b>${t("pendingReviews")}</b><br>${rv.name} · ${"★".repeat(rv.rating)} · ${rv.name_en}</span></a>`)}`);
  } catch { /* offline — try again next minute */ }
  if (can("orders.read")) {
    api("/orders?status=pending&limit=1").then((r) => { const c = $("#pending-count"); if (c) { c.hidden = !r.total; c.textContent = num(r.total); } }).catch(() => {});
  }
}

async function heartbeat() {
  try {
    const r = await api(`/presence?page=${encodeURIComponent(location.hash)}`, { method: "POST" });
    const others = r.online.filter((o) => o.id !== session.admin.id);
    $("#online").innerHTML = others.length
      ? String(html`${others.map((o) => html`<div><span class="avatar">${o.name.slice(0, 1)}</span><span><b>${o.name}</b><br><span class="muted small">${o.role.replace("_", " ")} · ${o.page.replace("#/", "") || "dashboard"}</span></span></div>`)}`)
      : String(html`<span class="muted small">${t("onlyYou")}</span>`);
  } catch { /* ignore */ }
}

async function route() {
  if (!session.admin) return;
  const [path, qs] = location.hash.replace(/^#\/?/, "").split("?");
  const [key = "dashboard", id] = (path || "dashboard").split("/");
  if (key === "login") { location.hash = "#/dashboard"; return; }
  const loader = VIEWS[key];
  $$("#nav a").forEach((a) => (a.dataset.key === key ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
  const view = $("#view");
  const title = t(key);
  $("#page-title").textContent = title;
  document.title = `${title} — ${brand.name.en} Admin`;
  if (!loader) { view.innerHTML = String(html`<div class="card state">404</div>`); return; }
  try {
    const mod = await loader();
    await mod.default(view, { key, id, query: new URLSearchParams(qs ?? ""), refreshBell: loadBell });
  } catch (e) {
    console.error(e);
    view.innerHTML = String(html`<div class="card"><p class="error-box">${errMsg(e)}</p></div>`);
  }
  $("#work")?.scrollTo?.(0, 0);
  window.scrollTo(0, 0);
}

// Expose tiny helpers for views that need them.
export { toast, msg, tt, dt };
boot();
