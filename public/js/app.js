// Storefront entry: layout chrome, client-side router, cart drawer, language switching.
import { t, lang, setLang, applyStatic, L, money } from "./i18n.js";
import { $, $$, html, icon, cart, config, overlay, api, wishlist } from "./core.js";

const routes = [
  [/^\/$/, () => import("./views/home.js")],
  [/^\/shop(?:\/(?<category>[a-z0-9-]+))?$/, () => import("./views/shop.js")],
  [/^\/search$/, () => import("./views/shop.js")],
  [/^\/product\/(?<slug>[a-z0-9-]+)$/, () => import("./views/product.js")],
  [/^\/cart$/, () => import("./views/checkout.js"), "cart"],
  [/^\/checkout$/, () => import("./views/checkout.js"), "checkout"],
  [/^\/order\/(?<orderNo>[A-Z0-9-]+)$/, () => import("./views/order.js")],
  [/^\/track$/, () => import("./views/order.js")],
  [/^\/account(?:\/(?<tab>[a-z]+))?$/, () => import("./views/account.js")],
  [/^\/(?<page>about|contact|size-guide)$/, () => import("./views/pages.js")],
  [/^\/policy\/(?<policy>returns|delivery|privacy)$/, () => import("./views/pages.js")],
];

const main = document.getElementById("main");
let navToken = 0;

export function navigate(url, { replace = false } = {}) {
  const u = new URL(url, location.origin);
  if (u.origin !== location.origin) return (location.href = u.href);
  replace ? history.replaceState({}, "", u) : history.pushState({}, "", u);
  render();
}

async function render() {
  const token = ++navToken;
  const path = location.pathname.replace(/\/+$/, "") || "/";
  const q = new URL(location.href).searchParams;
  let match = null, loader = null, variant;
  for (const [re, load, v] of routes) {
    const m = path.match(re);
    if (m) { match = m; loader = load; variant = v; break; }
  }
  updateNavState(path);
  try {
    const mod = loader ? await loader() : await import("./views/pages.js");
    if (token !== navToken) return;
    main.classList.remove("page-enter");
    void main.offsetWidth;
    main.classList.add("page-enter");
    await mod.default(main, { params: match?.groups ?? {}, query: q, variant, notFound: !loader, navigate });
  } catch (e) {
    console.error(e);
    main.innerHTML = String(html`<div class="container section"><p class="error-box">${t("somethingWrong")}</p></div>`);
  }
  if (!location.hash) window.scrollTo({ top: 0 });
}

// ---------- Chrome ----------
function buildNav(cats) {
  const top = cats.filter((c) => !c.parent_id).slice(0, 3);
  $("#main-nav").innerHTML = String(html`
    <a href="/shop">${t("shop")}</a>
    ${top.map((c) => html`<a href="/shop/${c.slug}">${L(c, "name")}</a>`)}
    <a href="/about">${t("about")}</a>`);
  $("#bottom-nav").innerHTML = String(html`
    <a href="/">${icon("home")}<span>${t("home")}</span></a>
    <a href="/shop">${icon("grid")}<span>${t("shop")}</span></a>
    <a href="/search">${icon("search")}<span>${t("search")}</span></a>
    <a href="/account/wishlist">${icon("heart")}<span>${t("wishlist")}</span></a>
    <a href="/account">${icon("user")}<span>${t("account")}</span></a>`);
}

function buildFooter(cfg) {
  const b = cfg.brand, s = cfg.store;
  // Logo & social links are editable in Admin → Settings → Branding (fall back to brand.json).
  const logo = s.logo_url || b.logo.image;
  const mark = logo ? html`<img src="${logo}" alt="" width="46" height="46" decoding="async">` : b.logo.monogram;
  $("#logo-mark").innerHTML = String(mark);
  const fb = s.facebook_url || b.social.facebook, ig = s.instagram_url || b.social.instagram, tk = s.tiktok_url || b.social.tiktok;
  const addr = lang() === "bn" ? s.address_bn : s.address_en;
  $("#footer").innerHTML = String(html`
    <div class="paar" aria-hidden="true"></div>
    <div class="container footer-grid">
      <div>
        <div class="logo" style="margin-bottom:12px"><span class="logo-mark">${mark}</span><span class="logo-text"><b>${lang() === "bn" ? b.name.bn : b.name.en}</b><small class="script">${lang() === "bn" ? b.tagline.bn : b.tagline.en}</small></span></div>
        <p class="small">${t("footerAbout")}</p>
        <div style="display:flex;gap:6px">
          ${fb ? html`<a class="icon-btn" href="${fb}" target="_blank" rel="noopener" aria-label="Facebook">${icon("facebook")}</a>` : ""}
          ${ig ? html`<a class="icon-btn" href="${ig}" target="_blank" rel="noopener" aria-label="Instagram">${icon("instagram")}</a>` : ""}
          ${tk ? html`<a class="icon-btn" href="${tk}" target="_blank" rel="noopener" aria-label="TikTok">♪</a>` : ""}
          <a class="icon-btn" href="https://wa.me/${s.whatsapp}" target="_blank" rel="noopener" aria-label="WhatsApp">${icon("whatsapp")}</a>
        </div>
      </div>
      <div><h4>${t("shop")}</h4><ul>
        <li><a href="/shop?sort=newest">${t("newArrivals")}</a></li><li><a href="/shop?sort=popular">${t("bestSellers")}</a></li>
        <li><a href="/shop?on_sale=1">${t("onSale")}</a></li><li><a href="/track">${t("track")}</a></li></ul></div>
      <div><h4>${t("policies")}</h4><ul>
        <li><a href="/policy/returns">${t("returnsPolicy")}</a></li><li><a href="/policy/delivery">${t("deliveryPolicy")}</a></li>
        <li><a href="/policy/privacy">${t("privacyPolicy")}</a></li><li><a href="/size-guide">${t("sizeGuidePage")}</a></li></ul></div>
      <div><h4>${t("visitUs")}</h4>
        <ul class="info-list small">
          <li>${icon("pin")}<span>${addr}, ${lang() === "bn" ? "বাংলাদেশ" : "Bangladesh"}</span></li>
          <li>${icon("phone")}<a href="tel:${s.phone}">${s.phone}</a></li>
          <li>${icon("clock")}<span>${lang() === "bn" ? s.hours_bn : s.hours_en}</span></li>
        </ul>
        <div class="pay-badges" aria-label="${t("weAccept")}"><span>COD</span><span>bKash</span><span>Nagad</span><span>Rocket</span><span>VISA</span></div>
      </div>
    </div>
    <div class="container footer-bottom"><span>© ${new Date().getFullYear()} ${b.name.en}</span><span>${lang() === "bn" ? b.location.city.bn : b.location.city.en}, ${lang() === "bn" ? "বাংলাদেশ" : "Bangladesh"}</span></div>`);
  const ann = $("#announce");
  const text = lang() === "bn" ? s.announcement_bn : s.announcement_en;
  ann.hidden = !text;
  ann.textContent = text ?? "";
  const wa = $("#wa-float");
  wa.href = `https://wa.me/${s.whatsapp}?text=${encodeURIComponent(lang() === "bn" ? "আসসালামু আলাইকুম, আমি একটি পণ্য সম্পর্কে জানতে চাই।" : "Hi! I have a question about a product.")}`;
}

function updateNavState(path) {
  $$("#main-nav a, #bottom-nav a").forEach((a) => {
    const href = a.getAttribute("href");
    const active = href === "/" ? path === "/" : path === href || path.startsWith(href + "/");
    active ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current");
  });
}

function updateCartBadge() {
  const n = cart.count();
  const b = $("#cart-count");
  b.hidden = n === 0;
  b.textContent = String(n);
}

export async function openCartDrawer() {
  const items = cart.items();
  const body = items.length
    ? html`${items.map((i) => html`<div class="line"><img src="${i.image}" alt="" width="72" height="96" loading="lazy"><div><b>${lang() === "bn" ? i.name_bn : i.name_en}</b><div class="meta">${i.size} · ${i.color} · ×${i.quantity}</div></div><b>${money(i.unitPrice * i.quantity)}</b></div>`)}`
    : html`<p class="muted" style="padding:24px 0">${t("cartEmpty")}</p>`;
  const subtotal = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const footer = items.length
    ? html`<div class="totals"><div><span>${t("subtotal")}</span><b>${money(subtotal)}</b></div></div><a class="btn block" href="/checkout" data-close>${t("proceedCheckout")}</a><a class="btn ghost block" href="/cart" data-close>${t("viewCart")}</a>`
    : html`<a class="btn block" href="/shop" data-close>${t("continueShopping")}</a>`;
  overlay("drawer", { title: t("yourCart"), body, footer });
}

async function boot() {
  setLang(lang());
  applyStatic();
  $$(".lang-toggle button").forEach((b) => {
    b.setAttribute("aria-pressed", String(b.dataset.lang === lang()));
    b.addEventListener("click", () => {
      setLang(b.dataset.lang);
      $$(".lang-toggle button").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.lang === lang())));
      applyStatic();
      chrome();
      render();
    });
  });
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[href]");
    if (!a || a.target || e.metaKey || e.ctrlKey || e.shiftKey || e.defaultPrevented) return;
    const u = new URL(a.href, location.origin);
    if (u.origin !== location.origin || /^\/(admin|api|media)\b/.test(u.pathname) || /\.[a-z]+$/.test(u.pathname)) return;
    e.preventDefault();
    navigate(u.pathname + u.search + u.hash);
  });
  window.addEventListener("popstate", render);
  $("#cart-btn").addEventListener("click", openCartDrawer);
  $("#search-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const q = $("#search-input").value.trim();
    if (q) navigate(`/search?q=${encodeURIComponent(q)}`);
  });
  document.addEventListener("cart:change", updateCartBadge);
  updateCartBadge();
  await chrome();
  render();
  wishlist.sync();
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("/sw.js").catch(() => {});
}

let catsCache;
async function chrome() {
  try {
    const [cfg, cats] = await Promise.all([config(), (catsCache ??= api("/categories"))]);
    buildNav(cats.categories);
    buildFooter(cfg);
    loadAnalytics(cfg.integrations ?? {});
  } catch (e) {
    console.warn("chrome failed", e);
  }
}

let analyticsLoaded = false;
function loadAnalytics(i) {
  if (analyticsLoaded) return;
  analyticsLoaded = true;
  const add = (src, attrs = {}) => { const s = document.createElement("script"); s.src = src; s.async = true; Object.assign(s.dataset, attrs); document.head.append(s); };
  if (i.cfBeacon) add("https://static.cloudflareinsights.com/beacon.min.js", { cfBeacon: JSON.stringify({ token: i.cfBeacon }) });
  if (i.ga4) add(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(i.ga4)}`);
}

boot();
