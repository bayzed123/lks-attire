import { html, raw, icon, wishlist, esc } from "./core.js";
import { t, L, money, num } from "./i18n.js";

export function productCard(p, { eager = false } = {}) {
  const fav = wishlist.ids().has(p.id);
  const [img1, img2] = p.images ?? [];
  const name = L(p, "name");
  return html`<article class="card">
    <a href="/product/${p.slug}" class="media" aria-label="${name}">
      ${img1 ? html`<img src="${img1}" alt="${name}" width="600" height="800" loading="${eager ? "eager" : "lazy"}" decoding="async">` : ""}
      ${img2 ? html`<img class="alt" src="${img2}" alt="" width="600" height="800" loading="lazy" decoding="async">` : ""}
      <span class="tags">${p.in_stock && p.delivery_mode === "free" ? html`<span class="tag free">${t("freeDelivery")}</span>` : ""}${!p.in_stock ? html`<span class="tag out">${t("soldOut")}</span>` : p.discount_percent ? html`<span class="tag">-${num(p.discount_percent)}% ${t("off")}</span>` : ""}</span>
    </a>
    <button class="icon-btn fav" type="button" data-fav="${p.id}" aria-pressed="${fav}" aria-label="${fav ? t("removeFromWishlist") : t("addToWishlist")}">${icon("heart")}</button>
    <div class="body">
      <a href="/product/${p.slug}"><h3>${name}</h3></a>
      <div class="price"><b>${money(p.sale_price ?? p.price)}</b>${p.sale_price ? html`<s>${money(p.price)}</s>` : ""}</div>
      ${p.rating_count ? html`<div class="stars" aria-label="${p.rating_avg} / 5">${stars(p.rating_avg)} <span class="muted small">(${num(p.rating_count)})</span></div>` : ""}
      ${p.color_hexes?.length > 1 ? html`<div class="swatches" aria-hidden="true">${p.color_hexes.slice(0, 5).map((c) => raw(`<i style="background:${esc(c)}"></i>`))}</div>` : ""}
    </div>
  </article>`;
}

export const stars = (r) => "★★★★★".slice(0, Math.round(r)) + "☆☆☆☆☆".slice(0, 5 - Math.round(r));

export const skeletonCards = (n = 8) =>
  html`${Array.from({ length: n }, () => raw(`<div class="sk-card" aria-hidden="true"><div class="media skeleton"></div><div class="sk-line skeleton" style="width:80%"></div><div class="sk-line skeleton" style="width:40%"></div></div>`))}`;

export const emptyState = (title, sub, cta) =>
  html`<div class="empty"><div class="arch-illus">${icon("bag", "icon")}</div><h2>${title}</h2><p class="muted">${sub}</p>${cta ?? ""}</div>`;

export const errorState = (msg) => html`<div class="empty"><p class="error-box">${msg}</p><button class="btn ghost" type="button" data-retry>${t("retry")}</button></div>`;

/** Handles wishlist hearts anywhere inside `root`. */
export function bindFavs(root) {
  root.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-fav]");
    if (!b) return;
    e.preventDefault();
    const on = await wishlist.toggle(Number(b.dataset.fav));
    b.setAttribute("aria-pressed", String(on));
    b.setAttribute("aria-label", on ? t("removeFromWishlist") : t("addToWishlist"));
  });
}

export const sizeChart = () => html`<p>${t("sizeGuideIntro")}</p>
  <table class="size-table"><thead><tr><th>${t("size")}</th><th>${t("bust")}</th><th>${t("waist")}</th><th>${t("hip")}</th><th>${t("length")}</th></tr></thead>
  <tbody>${[["S", 36, 30, 38, 42], ["M", 38, 32, 40, 43], ["L", 40, 34, 42, 44], ["XL", 42, 36, 44, 45], ["XXL", 44, 38, 46, 46]].map(
    (r) => html`<tr>${r.map((c) => html`<td>${typeof c === "number" ? num(c) : c}</td>`)}</tr>`,
  )}</tbody></table>
  <p class="muted small" style="margin-top:12px">Abaya: 52 = 5'0"–5'2", 54 = 5'3"–5'5", 56 = 5'6"–5'8"</p>`;
