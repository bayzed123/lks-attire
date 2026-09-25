import { html, icon, api, $, $$, errMsg } from "../core.js";
import { t, L, num, money, lang } from "../i18n.js";
import { productCard, skeletonCards, emptyState, errorState, bindFavs } from "../components.js";

const SORTS = [["newest", "sortNewest"], ["popular", "sortPopular"], ["price_asc", "sortPriceAsc"], ["price_desc", "sortPriceDesc"], ["discount", "sortDiscount"], ["rating", "sortRating"]];

export default async function shop(main, { params, query, navigate }) {
  const category = params.category ?? query.get("category") ?? "";
  const isSearch = location.pathname === "/search";
  const state = Object.fromEntries(query.entries());
  if (category) state.category = category;
  let view = localStorage.getItem("lks_view") || "grid";
  let page = 1;

  const { categories } = await api("/categories").catch(() => ({ categories: [] }));
  const cat = categories.find((c) => c.slug === category);
  const children = cat ? categories.filter((c) => c.parent_id === cat.id) : categories.filter((c) => !c.parent_id);
  const parent = cat?.parent_id ? categories.find((c) => c.id === cat.parent_id) : null;
  const title = isSearch ? (state.q ? `“${state.q}”` : t("search")) : cat ? L(cat, "name") : t("shop");
  document.title = `${title} | ${document.querySelector(".logo-text b")?.textContent ?? ""}`;

  main.innerHTML = String(html`<div class="container">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="/">${t("home")}</a><span>/</span><a href="/shop">${t("shop")}</a>${parent ? html`<span>/</span><a href="/shop/${parent.slug}">${L(parent, "name")}</a>` : ""}${cat ? html`<span>/</span><span aria-current="page">${L(cat, "name")}</span>` : ""}</nav>
    <h1 style="font-size:clamp(1.8rem,5vw,2.8rem)">${title}</h1>
    ${isSearch ? html`<form id="big-search" role="search" style="margin:8px 0 18px"><input class="input" type="search" name="q" value="${state.q ?? ""}" placeholder="${t("searchPlaceholder")}" aria-label="${t("search")}"></form>` : ""}
    ${children.length ? html`<div class="chips" style="margin:6px 0 20px">${children.map((c) => html`<a class="chip" href="/shop/${c.slug}">${L(c, "name")}</a>`)}</div>` : ""}
    <div class="shop-layout">
      <aside class="filters" id="filters" aria-label="${t("filters")}"></aside>
      <div>
        <div class="toolbar">
          <span class="count" id="count" aria-live="polite"></span>
          <button class="btn soft sm" type="button" id="open-filters" style="display:var(--show-f, inline-flex)">${icon("filter")} ${t("filters")}</button>
          <label class="sr-only" for="sort">${t("sortBy")}</label>
          <select class="input" id="sort">${SORTS.map(([v, k]) => html`<option value="${v}" ${(state.sort ?? "newest") === v ? "selected" : ""}>${t(k)}</option>`)}</select>
          <div class="view-toggle" role="group"><button type="button" data-view="grid" aria-label="${t("gridView")}">${icon("grid")}</button><button type="button" data-view="list" aria-label="${t("listView")}">${icon("list")}</button></div>
        </div>
        <div class="product-grid" id="grid">${skeletonCards(8)}</div>
        <div style="text-align:center;margin:28px 0" id="more-wrap"></div>
      </div>
    </div></div>`);
  bindFavs(main);
  if (matchMedia("(min-width:1000px)").matches) $("#open-filters").style.display = "none";

  const setView = (v) => {
    view = v;
    localStorage.setItem("lks_view", v);
    $("#grid").classList.toggle("list", v === "list");
    $$(".view-toggle button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.view === v)));
  };
  setView(view);
  $$(".view-toggle button").forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));

  const sync = () => {
    const q = new URLSearchParams(Object.entries(state).filter(([k, v]) => v && k !== "category"));
    const path = isSearch ? "/search" : category ? `/shop/${category}` : "/shop";
    history.replaceState({}, "", `${path}${q.toString() ? "?" + q : ""}`);
  };

  async function load(append = false) {
    const grid = $("#grid");
    if (!append) grid.innerHTML = String(skeletonCards(8));
    const q = new URLSearchParams(Object.entries({ ...state, page: String(page), limit: "12" }).filter(([, v]) => v));
    try {
      const r = await api(`/products?${q}`);
      const cards = String(html`${r.items.map((p) => productCard(p))}`);
      if (append) grid.insertAdjacentHTML("beforeend", cards);
      else grid.innerHTML = r.items.length ? cards : "";
      if (!r.items.length && !append) grid.innerHTML = String(emptyState(t("noResults"), t("noResultsSub"), html`<a class="btn" href="/shop">${t("clearAll")}</a>`));
      $("#count").textContent = `${num(r.total)} ${t("results")}`;
      $("#more-wrap").innerHTML = page < r.pages ? String(html`<button class="btn ghost" id="more">${t("loadMore")}</button>`) : "";
      $("#more")?.addEventListener("click", () => { page++; load(true); });
    } catch (e) {
      grid.innerHTML = String(errorState(errMsg(e)));
      grid.querySelector("[data-retry]")?.addEventListener("click", () => load(append));
    }
  }

  $("#sort").addEventListener("change", (e) => { state.sort = e.target.value; page = 1; sync(); load(); });
  $("#big-search")?.addEventListener("submit", (e) => { e.preventDefault(); state.q = new FormData(e.target).get("q"); page = 1; navigate(`/search?q=${encodeURIComponent(state.q)}`, { replace: true }); });

  // ---- Filters ----
  const facets = await api(`/facets${category ? `?category=${category}` : ""}`).catch(() => ({ sizes: [], colors: [], fabrics: [], price: { min: 0, max: 0 } }));
  const renderFilters = () => {
    const pressed = (k, v) => String(state[k] === v);
    $("#filters").innerHTML = String(html`
      <div class="section-head" style="margin:0"><h3 style="margin:0">${t("filters")}</h3><button class="btn ghost sm" type="button" id="clear-f">${t("clearAll")}</button></div>
      ${facets.sizes.length ? html`<div class="filter-group"><h4>${t("size")}</h4><div class="chips">${facets.sizes.map((s) => html`<button type="button" class="chip" data-f="size" data-v="${s}" aria-pressed="${pressed("size", s)}">${s}</button>`)}</div></div>` : ""}
      ${facets.colors.length ? html`<div class="filter-group"><h4>${t("colour")}</h4><div class="chips">${facets.colors.map((c) => html`<button type="button" class="chip" data-f="color" data-v="${c.color}" aria-pressed="${pressed("color", c.color)}"><span class="sw" style="background:${c.hex ?? "#ccc"}"></span>${c.color}</button>`)}</div></div>` : ""}
      <div class="filter-group"><h4>${t("price")}</h4><form id="price-f" class="grid-2" style="grid-template-columns:1fr 1fr">
        <label class="field"><span class="small">${t("min")}</span><input class="input" name="min" type="number" inputmode="numeric" min="0" placeholder="${money(facets.price.min ?? 0)}" value="${state.min ?? ""}"></label>
        <label class="field"><span class="small">${t("max")}</span><input class="input" name="max" type="number" inputmode="numeric" min="0" placeholder="${money(facets.price.max ?? 0)}" value="${state.max ?? ""}"></label>
        <button class="btn soft sm" style="grid-column:1/-1">${t("apply")}</button></form></div>
      ${facets.fabrics.length ? html`<div class="filter-group"><h4>${t("fabric")}</h4><div class="chips">${facets.fabrics.map((f) => html`<button type="button" class="chip" data-f="fabric" data-v="${f}" aria-pressed="${pressed("fabric", f)}">${f}</button>`)}</div></div>` : ""}
      <div class="filter-group"><h4>${t("availability")}</h4><div class="chips">
        <button type="button" class="chip" data-f="in_stock" data-v="1" aria-pressed="${pressed("in_stock", "1")}">${t("inStockOnly")}</button>
        <button type="button" class="chip" data-f="on_sale" data-v="1" aria-pressed="${pressed("on_sale", "1")}">${t("onSale")}</button></div></div>
      <button class="btn block" type="button" id="close-f" style="margin-top:16px">${t("apply")}</button>`);
    $("#close-f").style.display = $("#filters").classList.contains("open") ? "" : "none";
  };
  renderFilters();
  $("#filters").addEventListener("click", (e) => {
    const chip = e.target.closest("[data-f]");
    if (chip) {
      const { f, v } = chip.dataset;
      state[f] = state[f] === v ? "" : v;
      page = 1; sync(); renderFilters(); load();
    }
    if (e.target.id === "clear-f") {
      for (const k of ["size", "color", "fabric", "min", "max", "in_stock", "on_sale"]) delete state[k];
      page = 1; sync(); renderFilters(); load();
    }
    if (e.target.id === "close-f") $("#filters").classList.remove("open");
  });
  $("#filters").addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    state.min = fd.get("min"); state.max = fd.get("max");
    page = 1; sync(); load();
  });
  $("#open-filters").addEventListener("click", () => { $("#filters").classList.add("open"); renderFilters(); });

  await load();
  void lang;
}
