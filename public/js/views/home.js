import { html, raw, esc, icon, api, config, $, $$, toast, errMsg } from "../core.js";

// Banner titles may use <em>word</em> for the gold accent; everything else stays escaped.
const emphasis = (s) => raw(esc(s).replace(/&lt;em&gt;/g, "<em>").replace(/&lt;\/em&gt;/g, "</em>"));
import { t, L, lang, num } from "../i18n.js";
import { productCard, skeletonCards, bindFavs } from "../components.js";

export default async function home(main) {
  document.title = await config().then((c) => `${lang() === "bn" ? c.brand.name.bn : c.brand.name.en} — ${lang() === "bn" ? c.brand.tagline.bn : c.brand.tagline.en}`).catch(() => document.title);
  main.innerHTML = String(html`
    <section class="hero jamdani-bg" id="hero" aria-roledescription="carousel"><div class="container"><div class="hero-track"><div class="hero-slide active"><div class="hero-copy"><span class="eyebrow">&nbsp;</span><h1>${t("heroFallbackTitle")}</h1><p>${t("heroFallbackSub")}</p></div><div class="hero-art"><div class="frame skeleton"></div></div></div></div></div></section>
    <div id="promo"></div>
    <div class="trust">
      <div>${icon("cash")}<span><b>${t("trustCod")}</b><span class="muted small">${t("trustCodSub")}</span></span></div>
      <div>${icon("truck")}<span><b>${t("trustDelivery")}</b><span class="muted small">${t("trustDeliverySub")}</span></span></div>
      <div>${icon("swap")}<span><b>${t("trustExchange")}</b><span class="muted small">${t("trustExchangeSub")}</span></span></div>
      <div>${icon("loom")}<span><b>${t("trustLoom")}</b><span class="muted small">${t("trustLoomSub")}</span></span></div>
    </div>
    <section class="section container"><div class="section-head"><div><span class="eyebrow">${t("explore")}</span><h2>${t("shopByCategory")}</h2></div></div><div class="cat-grid" id="cats"></div></section>
    <section class="section container"><div class="section-head"><div><span class="eyebrow">${t("newIn")}</span><h2>${t("newArrivals")}</h2><p class="muted">${t("newArrivalsSub")}</p></div><a class="btn ghost sm" href="/shop?sort=newest">${t("viewAll")}</a></div><div class="rail" id="new">${skeletonCards(4)}</div></section>
    <section class="container" id="festive"></section>
    <section class="section container"><div class="section-head"><div><span class="eyebrow">★</span><h2>${t("bestSellers")}</h2><p class="muted">${t("bestSellersSub")}</p></div><a class="btn ghost sm" href="/shop?sort=popular">${t("viewAll")}</a></div><div class="product-grid" id="best">${skeletonCards(8)}</div></section>
    <section class="section jamdani-bg"><div class="container"><div class="section-head"><h2>${t("lovedBy")}</h2></div><div class="quotes" id="quotes"></div></div></section>
    <section class="section container"><div class="section-head"><div><h2>${t("followUs")}</h2><p class="muted">${t("followSub")}</p></div><a class="btn ghost sm" id="ig-link" target="_blank" rel="noopener"></a></div><div class="insta" id="insta"></div></section>
    <section class="container"><div class="signup jamdani-bg"><span class="eyebrow">WhatsApp</span><h2>${t("signupTitle")}</h2><p class="muted">${t("signupSub")}</p>
      <form id="signup"><label class="sr-only" for="signup-contact">${t("signupPlaceholder")}</label><input class="input" id="signup-contact" name="contact" required minlength="5" placeholder="${t("signupPlaceholder")}"><button class="btn" type="submit">${t("signupBtn")}</button></form></div></section>
  `);
  bindFavs(main);

  const [cfg, banners, cats, fresh, best, quotes] = await Promise.allSettled([
    config(),
    api("/banners"),
    api("/categories"),
    api("/products?sort=newest&limit=8"),
    api("/products?sort=popular&limit=8"),
    api("/testimonials"),
  ]);
  const B = banners.status === "fulfilled" ? banners.value.banners : [];

  // Hero slider
  const heroes = B.filter((b) => b.placement === "hero");
  if (heroes.length) {
    $("#hero .hero-track").innerHTML = String(html`${heroes.map(
      (b, i) => html`<div class="hero-slide${i === 0 ? " active" : ""}" role="group" aria-roledescription="slide" aria-label="${i + 1} / ${heroes.length}">
        <div class="hero-copy"><span class="eyebrow script">${cfg.value?.brand ? (lang() === "bn" ? cfg.value.brand.tagline.bn : cfg.value.brand.tagline.en) : ""}</span><h1>${emphasis(L(b, "title"))}</h1><p>${L(b, "subtitle")}</p>
          <div class="hero-actions">${b.link_url ? html`<a class="btn" href="${b.link_url}">${L(b, "cta") || t("shopNow")}</a>` : ""}<a class="btn ghost" href="/shop">${t("viewAll")}</a></div></div>
        <div class="hero-art"><div class="frame"><img src="${b.image_url}" alt="" width="600" height="750" ${i === 0 ? "fetchpriority=high" : "loading=lazy"}></div>
          <div class="hero-stamp">${icon("cash")}<span><b>${t("trustCod")}</b><span class="muted">${t("trustDelivery")}</span></span></div></div></div>`,
    )}`);
    if (heroes.length > 1) {
      const dots = document.createElement("div");
      dots.className = "hero-dots";
      dots.innerHTML = heroes.map((_, i) => `<button type="button" aria-label="${i + 1}" aria-current="${i === 0}"></button>`).join("");
      $("#hero .container").append(dots);
      let idx = 0;
      const show = (n) => {
        idx = (n + heroes.length) % heroes.length;
        $$("#hero .hero-slide").forEach((s, i) => s.classList.toggle("active", i === idx));
        $$("#hero .hero-dots button").forEach((d, i) => d.setAttribute("aria-current", String(i === idx)));
      };
      $$("button", dots).forEach((d, i) => d.addEventListener("click", () => { show(i); clearInterval(timer); }));
      const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
      const timer = reduce ? 0 : setInterval(() => (document.contains(dots) ? show(idx + 1) : clearInterval(timer)), 6000);
    }
  } else {
    $("#hero .frame")?.classList.remove("skeleton");
  }

  // Categories (top level, arch tiles using a product image from each)
  if (cats.status === "fulfilled") {
    const top = cats.value.categories.filter((c) => !c.parent_id);
    $("#cats").innerHTML = String(html`${top.map(
      (c) => html`<a class="cat-tile" href="/shop/${c.slug}"><div class="arch">${c.image_url ? html`<img src="${c.image_url}" alt="" loading="lazy" width="300" height="400">` : ""}</div><b>${L(c, "name")}</b></a>`,
    )}`);
  }
  const fill = (id, res) => ($(id).innerHTML = res.status === "fulfilled" ? String(html`${res.value.items.map((p, i) => productCard(p, { eager: i < 2 && id === "#new" }))}`) : "");
  fill("#new", fresh);
  fill("#best", best);

  // Festive campaign banner
  const f = B.find((b) => b.placement === "festive");
  if (f) {
    $("#festive").innerHTML = String(html`<div class="festive"><div class="copy"><span class="eyebrow" style="color:var(--c-gold)">${t("festive")}</span><h2>${L(f, "title")}</h2><p>${L(f, "subtitle")}</p>${f.link_url ? html`<a class="btn" href="${f.link_url}">${L(f, "cta") || t("explore")}</a>` : ""}</div><div class="art" style="background-image:url('${f.image_url}')" role="img" aria-label=""></div><div class="paar" aria-hidden="true"></div></div>`);
  }

  // Offer / promo strips (Admin → Banners → Promo). Several rotate as a marquee on small screens.
  const promos = B.filter((b) => b.placement === "promo");
  if (promos.length) {
    $("#promo").innerHTML = String(html`<div class="promo-strip" role="region" aria-label="${t("offers")}"><div class="promo-track">${[...promos, ...promos].map((b, i) => html`<a href="${b.link_url || "/shop"}" ${i >= promos.length ? raw('aria-hidden="true" tabindex="-1"') : ""}><b>${L(b, "title")}</b>${L(b, "subtitle") ? html`<span>${L(b, "subtitle")}</span>` : ""}</a>`)}</div></div>`);
  }

  // Testimonials
  if (quotes.status === "fulfilled" && quotes.value.testimonials.length) {
    $("#quotes").innerHTML = String(html`${quotes.value.testimonials.slice(0, 3).map(
      (q) => html`<blockquote class="quote"><div class="stars">${"★".repeat(q.rating)}</div><p>${q.body}</p><footer>— ${q.name} · <a href="/product/${q.slug}">${L(q, "product")}</a></footer></blockquote>`,
    )}`);
  } else $("#quotes").closest("section").remove();

  // Instagram strip: links to the profile with product imagery (swap for an official embed/feed when the account is connected).
  const st = cfg.value?.store ?? {}, so = cfg.value?.brand?.social ?? {};
  const igUrl = st.instagram_url || so.instagram, fbUrl = st.facebook_url || so.facebook;
  const socialUrl = igUrl || fbUrl;
  if (socialUrl && best.status === "fulfilled") {
    $("#ig-link").href = socialUrl;
    $("#ig-link").innerHTML = String(html`${icon(igUrl ? "instagram" : "facebook")} ${igUrl ? "Instagram" : "Facebook"}`);
    $("#insta").innerHTML = String(html`${best.value.items.slice(0, 6).map((p) => html`<a href="${socialUrl}" target="_blank" rel="noopener" aria-label="${igUrl ? "Instagram" : "Facebook"}"><img src="${p.images[1] ?? p.images[0]}" alt="" loading="lazy" width="300" height="300"></a>`)}`);
  } else $("#insta").closest("section").remove();

  $("#signup").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await api("/subscribe", { method: "POST", body: { contact: fd.get("contact") } });
      toast(t("signupDone"));
      e.target.reset();
    } catch (err) {
      toast(errMsg(err), "error");
    }
  });
  void num;
}
