import { html, raw, icon, api, config, cart, overlay, toast, $, $$, errMsg, wishlist, showFieldErrors } from "../core.js";
import { t, L, money, num, date, lang } from "../i18n.js";
import { productCard, bindFavs, stars, sizeChart, emptyState } from "../components.js";
import { openCartDrawer } from "../app.js";

export default async function product(main, { params, navigate }) {
  main.innerHTML = String(html`<div class="container"><div class="pdp" style="margin-top:20px"><div class="skeleton" style="aspect-ratio:3/4"></div><div><div class="skeleton sk-line" style="height:40px;width:80%"></div><div class="skeleton sk-line" style="width:40%"></div><div class="skeleton sk-line" style="height:120px"></div></div></div></div>`);
  let data;
  try {
    data = await api(`/products/${params.slug}`);
  } catch (e) {
    main.innerHTML = String(html`<div class="container">${emptyState(t("notFound"), e.status === 404 ? t("notFoundSub") : errMsg(e), html`<a class="btn" href="/shop">${t("continueShopping")}</a>`)}</div>`);
    return;
  }
  const cfg = await config();
  const { product: p, variants, reviews, related, breadcrumbs } = data;
  const name = L(p, "name");
  document.title = `${name} — ${money(p.sale_price ?? p.price)} | ${lang() === "bn" ? cfg.brand.name.bn : cfg.brand.name.en}`;

  const colours = [...new Map(variants.map((v) => [v.color, v.color_hex])).entries()];
  const sizes = [...new Set(variants.map((v) => v.size))];
  const sel = { color: colours.length === 1 ? colours[0][0] : null, size: sizes.length === 1 ? sizes[0] : null, qty: 1 };
  const variantFor = () => variants.find((v) => v.color === sel.color && v.size === sel.size);
  const unitPrice = (v) => (v?.price_override > 0 ? v.price_override : p.sale_price ?? p.price);
  const url = location.origin + location.pathname;
  const waNumber = cfg.store.whatsapp;
  const fav = wishlist.ids().has(p.id);

  main.innerHTML = String(html`<div class="container">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="/">${t("home")}</a>${breadcrumbs.map((b) => html`<span>/</span><a href="/shop/${b.slug}">${L(b, "name")}</a>`)}</nav>
    <div class="pdp">
      <div class="gallery">
        <div class="main" id="main-img" role="button" tabindex="0" aria-label="Zoom"><img src="${p.images[0] ?? ""}" alt="${name}" width="600" height="800" fetchpriority="high"></div>
        <div class="thumbs" role="list">${p.images.map((src, i) => html`<button type="button" role="listitem" data-img="${src}" aria-current="${i === 0}" aria-label="${i + 1}"><img src="${src}" alt="" width="70" height="93" loading="lazy"></button>`)}</div>
      </div>
      <div class="pdp-info">
        ${p.rating_count ? html`<a href="#reviews" class="stars" data-tab-link="reviews">${stars(p.rating_avg)} <span class="muted small">${num(p.rating_avg.toFixed(1))} · ${num(p.rating_count)} ${t("reviews")}</span></a>` : ""}
        <h1>${name}</h1>
        <div class="pdp-price" id="price"></div>
        <div class="pdp-offer">${p.delivery_mode === "free" ? html`<span>🚚 ${t("freeDelivery")}</span>` : p.delivery_mode === "fixed" ? html`<span>🚚 ${t("deliveryCharge")}: ${money(p.delivery_charge ?? 0)}</span>` : ""}${p.sku ? html`<span class="muted small">SKU: ${p.sku}</span>` : ""}</div>
        <div class="opt-label"><span>${t("selectColour")}: <span class="muted" id="colour-name">${sel.color ?? ""}</span></span></div>
        <div class="colour-opts" role="radiogroup" aria-label="${t("selectColour")}">${colours.map(([c, hex]) => html`<button type="button" role="radio" data-color="${c}" aria-pressed="${sel.color === c}" aria-checked="${sel.color === c}" aria-label="${c}" title="${c}"><span style="background:${hex || "#ccc"}"></span></button>`)}</div>
        <div class="opt-label"><span>${t("selectSize")}</span><button type="button" id="size-guide">${icon("ruler", "icon")} ${t("sizeGuide")}</button></div>
        <div class="size-opts" role="radiogroup" aria-label="${t("selectSize")}" id="sizes"></div>
        <p class="stock-note" id="stock" aria-live="polite"></p>
        <div class="buy-row">
          <div class="qty" aria-label="${t("quantity")}"><button type="button" data-q="-1" aria-label="-">−</button><output id="qty">${num(1)}</output><button type="button" data-q="1" aria-label="+">+</button></div>
          <button class="btn" type="button" id="add">${icon("bag")} ${t("addToCart")}</button>
          <button class="btn ghost full" type="button" id="buy">${t("buyNow")}</button>
        </div>
        <a class="btn wa block" target="_blank" rel="noopener" href="https://wa.me/${waNumber}?text=${encodeURIComponent(`${lang() === "bn" ? "এই পণ্যটি সম্পর্কে জানতে চাই" : "I'd like to know about this product"}: ${p.name_en} — ${url}`)}">${icon("whatsapp")} ${t("askWhatsApp")}</a>
        <div class="share">
          <span class="muted small">${t("share")}:</span>
          <a class="icon-btn" target="_blank" rel="noopener" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}" aria-label="Facebook">${icon("facebook")}</a>
          <a class="icon-btn" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(`${name} ${url}`)}" aria-label="WhatsApp">${icon("whatsapp")}</a>
          <button class="icon-btn" type="button" id="copy" aria-label="${t("copyLink")}">${icon("link")}</button>
          ${navigator.share ? html`<button class="icon-btn" type="button" id="native-share" aria-label="${t("share")}">${icon("share")}</button>` : ""}
          <button class="icon-btn" type="button" data-fav="${p.id}" aria-pressed="${fav}" aria-label="${fav ? t("removeFromWishlist") : t("addToWishlist")}" style="margin-left:auto">${icon("heart")}</button>
        </div>
        <ul class="perks"><li>${icon("cash")}${t("perkCod")}</li><li>${icon("truck")}${t("perkDelivery")}</li><li>${icon("swap")}${t("perkExchange")}</li></ul>
      </div>
    </div>
    <div class="tabs" role="tablist">
      <button role="tab" aria-selected="true" data-tab="desc">${t("description")}</button>
      <button role="tab" aria-selected="false" data-tab="fabric">${t("fabricCare")}</button>
      <button role="tab" aria-selected="false" data-tab="delivery">${t("deliveryReturns")}</button>
      <button role="tab" aria-selected="false" data-tab="reviews" id="reviews">${t("reviews")} (${num(reviews.length)})</button>
    </div>
    <div class="tab-panel prose" role="tabpanel" data-panel="desc"><p>${L(p, "description")}</p></div>
    <div class="tab-panel prose" role="tabpanel" data-panel="fabric" hidden><p><b>${t("fabric")}:</b> ${L(p, "fabric")}</p><p>${L(p, "care")}</p></div>
    <div class="tab-panel prose" role="tabpanel" data-panel="delivery" hidden><p>${t("deliveryText")}</p><p>${t("returnsText")}</p><p><a href="/policy/returns">${t("returnsPolicy")} →</a></p></div>
    <div class="tab-panel" role="tabpanel" data-panel="reviews" hidden>
      ${reviews.length ? reviews.map((r) => html`<div class="review"><div class="stars">${stars(r.rating)}</div><b>${r.name}</b> <span class="muted small">· ${date(r.created_at)}</span><p style="margin:.3em 0 0">${r.body}</p>${r.reply ? html`<div class="reply"><b>${lang() === "bn" ? cfg.brand.name.bn : cfg.brand.name.en}:</b> ${r.reply}</div>` : ""}</div>`) : html`<p class="muted">${t("noReviews")}</p>`}
      <details style="margin-top:16px"><summary class="btn soft sm">${t("writeReview")}</summary>
        <form id="review-form" class="panel" style="margin-top:12px;max-width:560px" novalidate>
          <label class="field"><span>${t("yourName")}</span><input class="input" name="name" required maxlength="60" autocomplete="name"></label>
          <label class="field"><span>${t("rating")}</span><select class="input" name="rating">${[5, 4, 3, 2, 1].map((n) => html`<option value="${n}">${"★".repeat(n)}</option>`)}</select></label>
          <label class="field"><span>${t("yourReview")}</span><textarea class="input" name="body" required minlength="5" maxlength="1000"></textarea></label>
          <button class="btn">${t("submitReview")}</button>
        </form></details>
    </div>
    ${related.length ? html`<section class="section"><h2>${t("youMayLike")}</h2><div class="rail">${related.map((r) => productCard(r))}</div></section>` : ""}
  </div>
  <div class="sticky-buy" id="sticky"><div><b id="sticky-price"></b></div><button class="btn" type="button" id="sticky-add">${t("stickyAdd")}</button></div>`);
  bindFavs(main);

  // ---- Variant state ----
  const renderState = () => {
    const v = variantFor();
    const price = unitPrice(v);
    $("#price").innerHTML = String(html`<b>${money(price)}</b>${p.sale_price && !(v?.price_override > 0) ? html`<s>${money(p.price)}</s><span class="save">-${num(p.discount_percent)}% ${t("off")}</span>` : ""}`);
    $("#sticky-price").textContent = money(price);
    $("#colour-name").textContent = sel.color ?? "";
    $$("[data-color]").forEach((b) => { b.setAttribute("aria-pressed", String(b.dataset.color === sel.color)); b.setAttribute("aria-checked", String(b.dataset.color === sel.color)); });
    $("#sizes").innerHTML = String(html`${sizes.map((s) => {
      const sv = variants.find((x) => x.size === s && (!sel.color || x.color === sel.color));
      const out = !sv || sv.stock <= 0;
      return html`<button type="button" role="radio" data-size="${s}" aria-pressed="${sel.size === s}" aria-checked="${sel.size === s}" ${out ? raw("disabled") : ""}>${s}</button>`;
    })}`);
    const st = $("#stock");
    if (!v) { st.className = "stock-note low"; st.textContent = t("chooseOptions"); }
    else if (v.stock <= 0) { st.className = "stock-note out"; st.textContent = t("outOfStock"); }
    else if (v.stock <= 3) { st.className = "stock-note low"; st.textContent = t("onlyLeft", { n: num(v.stock) }); }
    else { st.className = "stock-note"; st.textContent = t("inStock"); }
    if (v && sel.qty > v.stock) sel.qty = Math.max(1, v.stock);
    $("#qty").textContent = num(sel.qty);
    const disabled = !v || v.stock <= 0;
    ["#add", "#buy", "#sticky-add"].forEach((id) => ($(id).disabled = disabled && Boolean(v)));
  };
  renderState();

  main.addEventListener("click", (e) => {
    const c = e.target.closest("[data-color]");
    if (c) { sel.color = c.dataset.color; if (!variantFor() || variantFor().stock <= 0) sel.size = variants.find((x) => x.color === sel.color && x.stock > 0)?.size ?? sel.size; renderState(); }
    const s = e.target.closest("[data-size]");
    if (s && !s.disabled) { sel.size = s.dataset.size; renderState(); }
    const q = e.target.closest("[data-q]");
    if (q) { const max = variantFor()?.stock ?? 20; sel.qty = Math.max(1, Math.min(Math.min(20, max), sel.qty + Number(q.dataset.q))); $("#qty").textContent = num(sel.qty); }
    const th = e.target.closest("[data-img]");
    if (th) { $("#main-img img").src = th.dataset.img; $$("[data-img]").forEach((b) => b.setAttribute("aria-current", String(b === th))); }
    const tab = e.target.closest("[data-tab], [data-tab-link]");
    if (tab) {
      const name = tab.dataset.tab ?? tab.dataset.tabLink;
      $$("[data-tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === name)));
      $$("[data-panel]").forEach((pnl) => (pnl.hidden = pnl.dataset.panel !== name));
    }
  });

  // Zoom: tap/click to toggle 2× zoom; the zoom follows the pointer.
  const mi = $("#main-img");
  const toggleZoom = () => mi.classList.toggle("zoom");
  mi.addEventListener("click", toggleZoom);
  mi.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleZoom(); } });
  mi.addEventListener("pointermove", (e) => {
    if (!mi.classList.contains("zoom")) return;
    const r = mi.getBoundingClientRect();
    mi.querySelector("img").style.transformOrigin = `${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`;
  });

  const add = (goCheckout) => {
    const v = variantFor();
    if (!v) { toast(t("chooseOptions"), "error"); $("#sizes").scrollIntoView({ block: "center", behavior: "smooth" }); return; }
    if (v.stock <= 0) return;
    cart.add({ variantId: v.id, productId: p.id, slug: p.slug, name_en: p.name_en, name_bn: p.name_bn, size: v.size, color: v.color, image: p.images[0], unitPrice: unitPrice(v) }, sel.qty);
    if (goCheckout) navigate("/checkout");
    else { toast(t("addedToCart")); openCartDrawer(); }
  };
  $("#add").addEventListener("click", () => add(false));
  $("#sticky-add").addEventListener("click", () => add(false));
  $("#buy").addEventListener("click", () => add(true));
  $("#size-guide").addEventListener("click", () => overlay("modal", { title: t("sizeGuide"), body: sizeChart() }));
  $("#copy").addEventListener("click", async () => { try { await navigator.clipboard.writeText(url); toast(t("linkCopied")); } catch { /* ignore */ } });
  $("#native-share")?.addEventListener("click", () => navigator.share({ title: name, url }).catch(() => {}));

  // Sticky add-to-cart bar on mobile once the main button scrolls away.
  const io = new IntersectionObserver(([en]) => $("#sticky")?.classList.toggle("show", !en.isIntersecting && en.boundingClientRect.top < 0));
  io.observe($("#add"));

  $("#review-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const r = await api("/reviews", { method: "POST", body: { productId: p.id, name: fd.get("name"), rating: Number(fd.get("rating")), body: fd.get("body") } });
      toast(r[lang()] ?? r.en);
      e.target.reset();
      e.target.closest("details").open = false;
    } catch (err) {
      showFieldErrors(e.target, err);
      toast(errMsg(err), "error");
    }
  });
}
