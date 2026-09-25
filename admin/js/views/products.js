// Products: list with stock health, CSV import/export, and a full editor with photos, bilingual copy,
// per-variant stock and SEO. Opening #/products/new or #/products/:id shows the editor.
import { t, num, money, dt, lang } from "../i18n.js";
import { html, raw, icon, api, $, $$, can, toast, msg, errMsg, listTable, slideOver, pill, confirmDialog, debounce, showErrors, uploadImage, downloadBlob } from "../core.js";
import { categoryOptions } from "../resources.js";

export default async function products(view, { id, query }) {
  const state = { q: "", status: "", category_id: "", stock: query.get("stock") ?? "", sort: "newest", page: 1, trash: "" };
  const cats = await categoryOptions().catch(() => []);
  view.innerHTML = String(html`
    <div class="page-head"><h1>${t("products")}</h1>
      ${can("products.read") ? html`<button class="btn" id="export">${icon("download")} ${t("exportCsv")}</button>` : ""}
      ${can("products.write") ? html`<label class="btn">${icon("upload")} ${t("importCsv")}<input type="file" accept=".csv,text/csv" id="import" hidden></label><a class="btn primary" href="#/products/new">${icon("plus")} ${t("add")}</a>` : ""}</div>
    <div class="card">
      <div class="toolbar">
        <input class="input" id="pq" type="search" placeholder="${lang() === "bn" ? "নাম, SKU, ট্যাগ…" : "Name, SKU, tag…"}" aria-label="${t("searchPlaceholder")}">
        <select class="input" id="pcat" aria-label="${t("categories")}"><option value="">${t("categories")}: ${t("all")}</option>${cats.map(([v, l]) => html`<option value="${v}">${l}</option>`)}</select>
        <select class="input" id="pstatus" aria-label="${t("status")}"><option value="">${t("status")}: ${t("all")}</option><option value="active">Active</option><option value="draft">Draft</option><option value="archived">Archived</option></select>
        <select class="input" id="pstock" aria-label="Stock"><option value="">Stock: ${t("all")}</option><option value="low" ${state.stock === "low" ? "selected" : ""}>${t("lowOnly")}</option><option value="out" ${state.stock === "out" ? "selected" : ""}>${t("outOnly")}</option></select>
        <select class="input" id="psort" aria-label="Sort"><option value="newest">Newest</option><option value="name">A–Z</option><option value="sold">Best selling</option><option value="stock">Lowest stock</option><option value="price_asc">Price ↑</option><option value="price_desc">Price ↓</option></select>
        ${can("products.delete") ? html`<button class="chip" id="ptrash" aria-pressed="false">${icon("trash")} ${t("trash")}</button>` : ""}
      </div>
      <div id="list"></div>
    </div>`);

  let rows = [];
  const table = listTable($("#list", view), {
    columns: [
      { label: { en: "Photo", bn: "ছবি" }, render: (p) => (p.image ? html`<img class="thumb" src="${p.image}" alt="" loading="lazy">` : "—") },
      { label: { en: "Product", bn: "পণ্য" }, render: (p) => html`<b>${lang() === "bn" ? p.name_bn : p.name_en}</b>${p.is_featured ? " ★" : ""}<br><span class="muted small">${p.sku ?? p.slug} · ${lang() === "bn" ? p.category_name_bn ?? "" : p.category_name ?? ""}</span>` },
      { label: { en: "Price", bn: "দাম" }, render: (p) => html`<b>${money(p.sale_price ?? p.price)}</b>${p.sale_price ? html`<br><s class="muted small">${money(p.price)}</s>` : ""}` },
      { label: { en: "Stock", bn: "স্টক" }, render: (p) => html`${p.stock <= 0 ? pill("failed", lang() === "bn" ? "শেষ" : "Out") : p.low_variants ? pill("pending", `${num(p.stock)} · ${num(p.low_variants)} ${lang() === "bn" ? "কম" : "low"}`) : pill("active", num(p.stock))}<br><span class="muted small">${num(p.variant_count)} ${lang() === "bn" ? "ভ্যারিয়েন্ট" : "variants"}</span>` },
      { label: { en: "Sold", bn: "বিক্রি" }, render: (p) => num(p.sold_count) },
      { label: { en: "Status", bn: "অবস্থা" }, render: (p) => pill(p.status) },
    ],
    rowAttrs: (p) => `class="clickable" data-open="${p.id}"`,
    actions: (p) => state.trash
      ? html`<button class="btn sm" data-restore="${p.id}">${icon("restore")} ${t("restore")}</button>${can("trash.purge") ? html` <button class="btn sm" data-purge="${p.id}">${t("deleteForever")}</button>` : ""}`
      : html`${can("products.write") ? html`<button class="btn sm" data-dup="${p.id}" aria-label="${t("duplicate")}" title="${t("duplicate")}">${icon("copy")}</button> ` : ""}<a class="btn sm" href="/product/${p.slug}" target="_blank" rel="noopener" aria-label="View" title="View">${icon("external")}</a> ${can("products.delete") ? html`<button class="btn sm" data-del="${p.id}" aria-label="${t("delete")}">${icon("trash")}</button>` : ""}`,
  });
  async function load() {
    table.loading();
    const qs = new URLSearchParams(Object.entries({ ...state, limit: "20" }).filter(([, v]) => v !== ""));
    try { const res = await api(`/products?${qs}`); rows = res.items; table.render(res, { onPage: (p) => { state.page = p; load(); } }); }
    catch (e) { table.error(e, load); }
  }
  view.addEventListener("click", async (e) => {
    const el = e.target.closest("[data-del],[data-dup],[data-restore],[data-purge],[data-open]");
    if (!el || e.target.closest("a")) return;
    e.stopPropagation();
    const row = rows.find((r) => r.id === Number(el.dataset.del ?? el.dataset.dup ?? el.dataset.restore ?? el.dataset.purge ?? el.dataset.open));
    try {
      if (el.dataset.del) { if (!(await confirmDialog(t("confirmDelete", { name: row.name_en })))) return; toast(msg(await api(`/products/${row.id}`, { method: "DELETE" }))); return load(); }
      if (el.dataset.dup) { const r = await api(`/products/${row.id}/duplicate`, { method: "POST" }); toast(msg(r)); location.hash = `#/products/${r.id}`; return; }
      if (el.dataset.restore) { toast(msg(await api(`/products/${row.id}/restore`, { method: "POST" }))); return load(); }
      if (el.dataset.purge) { if (!(await confirmDialog(t("confirmPurge", { name: row.name_en })))) return; toast(msg(await api(`/products/${row.id}?purge=1`, { method: "DELETE" }))); return load(); }
      if (el.dataset.open && !state.trash) location.hash = `#/products/${row.id}`;
    } catch (err) { toast(errMsg(err), "err"); }
  });
  $("#pq", view).addEventListener("input", debounce((e) => { state.q = e.target.value.trim(); state.page = 1; load(); }));
  for (const [sel, key] of [["#pcat", "category_id"], ["#pstatus", "status"], ["#pstock", "stock"], ["#psort", "sort"]]) $(sel, view).onchange = (e) => { state[key] = e.target.value; state.page = 1; load(); };
  $("#ptrash", view)?.addEventListener("click", (e) => { state.trash = state.trash ? "" : "1"; e.currentTarget.setAttribute("aria-pressed", String(Boolean(state.trash))); load(); });
  $("#export", view)?.addEventListener("click", async () => { try { downloadBlob(await api("/products/export.csv"), `products-${new Date().toISOString().slice(0, 10)}.csv`); } catch (err) { toast(errMsg(err), "err"); } });
  $("#import", view)?.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!(await confirmDialog(`${t("importCsv")}: ${file.name}\n\n${t("importHelp")}`, { danger: false }))) return;
    try { const r = await api("/products/import", { method: "POST", raw: await file.text(), headers: { "content-type": "text/csv" } }); toast(t("importDone", { n: num(r.imported) })); load(); }
    catch (err) {
      toast(errMsg(err), "err");
      for (const x of err.data?.errors?.slice(0, 5) ?? []) toast(`Row ${x.row}: ${x[lang()] ?? x.en}`, "err");
    }
    e.target.value = "";
  });

  await load();
  if (id) editor(id === "new" ? null : Number(id), cats, load);
}

const blankVariant = () => ({ size: "Free Size", color: "", color_hex: "#8E3B52", stock: 0, low_stock_threshold: 3 });
const slugify = (s) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);

async function editor(id, cats, reload) {
  let p = { status: "draft", images: [], variants: [blankVariant()], tags: "", is_featured: 0 };
  if (id) { try { p = (await api(`/products/${id}`)).item; } catch (e) { return toast(errMsg(e), "err"); } }
  const images = [...p.images];
  const variants = p.variants.map((v) => ({ ...v }));
  const ro = !can("products.write");
  const F = (name, label, attrs = "", tag = "input") =>
    tag === "textarea"
      ? html`<label class="field" style="grid-column:1/-1"><span>${label}</span><textarea class="input" name="${name}" rows="4" ${raw(attrs)}>${p[name] ?? ""}</textarea></label>`
      : html`<label class="field"><span>${label}</span><input class="input" name="${name}" value="${p[name] ?? ""}" ${raw(attrs)}></label>`;

  const { panel, close } = slideOver({
    wide: true,
    title: id ? `${t("edit")}: ${p.name_en}` : `${t("add")} — ${t("products")}`,
    body: html`<form id="pf" novalidate><fieldset style="border:0;padding:0;margin:0" ${ro ? raw("disabled") : ""}>
      <div class="card"><h3>${t("basics")}</h3><div class="grid2">
        ${F("name_en", "Name (English) *", 'required maxlength="160"')}${F("name_bn", "নাম (বাংলা) *", 'required maxlength="160"')}
        ${F("slug", lang() === "bn" ? "ওয়েব ঠিকানা (slug) *" : "Web address (slug) *", 'required pattern="[a-z0-9-]+"')}${F("sku", "SKU")}
        <label class="field"><span>${t("categories")} *</span><select class="input" name="category_id" required><option value="">—</option>${cats.map(([v, l]) => html`<option value="${v}" ${p.category_id === v ? raw("selected") : ""}>${l}</option>`)}</select></label>
        <label class="field"><span>${t("status")}</span><select class="input" name="status">${[["active", lang() === "bn" ? "চালু — দোকানে দেখাবে" : "Active — visible in shop"], ["draft", lang() === "bn" ? "ড্রাফট — লুকানো" : "Draft — hidden"], ["archived", lang() === "bn" ? "আর্কাইভ" : "Archived"]].map(([v, l]) => html`<option value="${v}" ${p.status === v ? raw("selected") : ""}>${l}</option>`)}</select></label>
        ${F("tags", lang() === "bn" ? "ট্যাগ (কমা দিয়ে)" : "Tags (comma separated)")}
        <label class="check"><input type="checkbox" name="is_featured" ${p.is_featured ? raw("checked") : ""}> ${lang() === "bn" ? "হোমপেজে ফিচার করুন" : "Feature on home page"}</label>
      </div></div>
      <div class="card"><h3>${t("pricing")}</h3><div class="grid2">
        ${F("price", lang() === "bn" ? "আসল দাম (৳) *" : "Regular price (৳) *", 'type="number" min="1" required inputmode="numeric"')}
        ${F("sale_price", lang() === "bn" ? "ছাড়ের দাম (৳, ঐচ্ছিক)" : "Sale price (৳, optional)", 'type="number" min="0" inputmode="numeric"')}
      </div></div>
      <div class="card"><h3>${t("images")}</h3><p class="muted small">${t("firstIsCover")}</p><div class="images" id="imgs"></div></div>
      <div class="card"><div class="card-title"><h3 style="margin:0">${t("variants")}</h3><button type="button" class="btn sm" id="add-var">${icon("plus")} ${t("addVariant")}</button></div><div class="variants" id="vars"></div></div>
      <div class="card"><div class="card-title"><h3 style="margin:0">${t("descriptions")}</h3>${!ro ? html`<button type="button" class="btn sm" id="ai">${icon("sparkle")} ${t("aiWrite")}</button>` : ""}</div><div class="grid2">
        ${F("description_en", "Description (English)", "", "textarea")}${F("description_bn", "বিবরণ (বাংলা)", "", "textarea")}
        ${F("fabric_en", "Fabric (English)")}${F("fabric_bn", "কাপড় (বাংলা)")}
        ${F("care_en", "Care (English)")}${F("care_bn", "যত্ন (বাংলা)")}
      </div></div>
      <div class="card"><h3>${t("seo")}</h3><div class="grid2">${F("meta_title", "Meta title", 'maxlength="160"')}${F("meta_description", "Meta description", 'maxlength="320"')}</div></div>
    </fieldset></form>`,
    footer: ro ? html`<button class="btn" data-close>${t("close")}</button>` : html`<button class="btn" type="button" data-close>${t("cancel")}</button><button class="btn primary" type="submit" form="pf">${t("save")}</button>`,
  });
  const form = $("#pf", panel);
  const back = () => { if (location.hash.startsWith("#/products/")) history.replaceState(null, "", "#/products"); };
  panel.querySelector("[data-close]").addEventListener("click", back);
  if (!id) form.name_en.addEventListener("input", () => { if (!form.slug.dataset.touched) form.slug.value = slugify(form.name_en.value); });
  form.slug.addEventListener("input", () => (form.slug.dataset.touched = "1"));

  const drawImages = () => {
    $("#imgs", panel).innerHTML = String(html`${images.map((src, i) => html`<figure>${i === 0 ? html`<span class="first">Cover</span>` : ""}<img src="${src}" alt="">${!ro ? html`<button type="button" data-rm-img="${i}" aria-label="${t("delete")}">×</button>` : ""}${i > 0 && !ro ? html`<button type="button" data-cover="${i}" style="top:auto;bottom:4px;right:4px;width:auto;padding:0 6px;border-radius:6px;font-size:10px">★</button>` : ""}</figure>`)}
      ${!ro && images.length < 12 ? html`<label class="upload">${icon("upload")}<span>${t("uploadImage")}</span><input type="file" accept="image/*" multiple id="img-in" hidden></label>` : ""}`);
    $("#img-in", panel)?.addEventListener("change", async (e) => {
      for (const f of [...e.target.files].slice(0, 12 - images.length)) {
        try { toast(t("uploading")); images.push((await uploadImage(f)).url); drawImages(); } catch (err) { toast(errMsg(err), "err"); }
      }
    });
  };
  const drawVariants = () => {
    $("#vars", panel).innerHTML = String(html`${variants.map((v, i) => html`<div class="variant" data-i="${i}">
      <label class="field"><span class="small">${lang() === "bn" ? "সাইজ" : "Size"}</span><input class="input" data-k="size" value="${v.size}" required></label>
      <label class="field"><span class="small">${lang() === "bn" ? "রং" : "Colour"}</span><input class="input" data-k="color" value="${v.color}" required></label>
      <label class="field"><span class="small">Hex</span><input class="input" type="color" data-k="color_hex" value="${v.color_hex || "#cccccc"}"></label>
      <label class="field"><span class="small">${lang() === "bn" ? "স্টক" : "Stock"}</span><input class="input" type="number" min="0" data-k="stock" value="${v.stock}" inputmode="numeric"></label>
      <label class="field"><span class="small">${lang() === "bn" ? "কম-স্টক সতর্কতা" : "Low alert at"}</span><input class="input" type="number" min="0" data-k="low_stock_threshold" value="${v.low_stock_threshold ?? 3}"></label>
      ${!ro && variants.length > 1 ? html`<button type="button" class="icon-btn" data-rm-var="${i}" aria-label="${t("delete")}">${icon("trash")}</button>` : html`<span></span>`}</div>`)}`);
  };
  drawImages();
  drawVariants();
  panel.addEventListener("input", (e) => {
    const inp = e.target.closest("[data-k]");
    if (!inp) return;
    const i = Number(inp.closest("[data-i]").dataset.i);
    variants[i][inp.dataset.k] = ["stock", "low_stock_threshold"].includes(inp.dataset.k) ? Number(inp.value) : inp.value;
  });
  panel.addEventListener("click", async (e) => {
    const rmImg = e.target.closest("[data-rm-img]"), cover = e.target.closest("[data-cover]"), rmVar = e.target.closest("[data-rm-var]");
    if (rmImg) { images.splice(Number(rmImg.dataset.rmImg), 1); drawImages(); }
    if (cover) { const [x] = images.splice(Number(cover.dataset.cover), 1); images.unshift(x); drawImages(); }
    if (rmVar) { variants.splice(Number(rmVar.dataset.rmVar), 1); drawVariants(); }
    if (e.target.closest("#add-var")) { const last = variants.at(-1); variants.push({ ...blankVariant(), size: last?.size ?? "Free Size", color: "", color_hex: last?.color_hex }); delete variants.at(-1).id; drawVariants(); }
    if (e.target.closest("#ai")) {
      const btn = e.target.closest("#ai");
      btn.disabled = true; btn.textContent = t("aiWorking");
      try {
        const r = await api("/ai/describe", { method: "POST", body: { name: form.name_en.value || form.name_bn.value, fabric: form.fabric_en.value, category: form.category_id.selectedOptions[0]?.textContent } });
        if (r.en) form.description_en.value = r.en;
        if (r.bn) form.description_bn.value = r.bn;
      } catch (err) { toast(errMsg(err), "err"); }
      btn.disabled = false; btn.innerHTML = String(html`${icon("sparkle")} ${t("aiWrite")}`);
    }
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const body = {
      ...Object.fromEntries(["slug", "sku", "name_en", "name_bn", "description_en", "description_bn", "fabric_en", "fabric_bn", "care_en", "care_bn", "tags", "status", "meta_title", "meta_description"].map((k) => [k, String(fd.get(k) ?? "").trim()])),
      category_id: Number(fd.get("category_id")) || null,
      price: Number(fd.get("price")) || 0,
      sale_price: fd.get("sale_price") ? Number(fd.get("sale_price")) : null,
      is_featured: fd.get("is_featured") ? 1 : 0,
      images,
      variants: variants.map((v) => ({ ...v, sku: v.sku ?? null })),
    };
    const btn = $("button[type=submit]", panel);
    btn.disabled = true; btn.textContent = t("saving");
    try {
      const r = await api(id ? `/products/${id}` : "/products", { method: id ? "PUT" : "POST", body });
      toast(msg(r)); close(); back(); reload();
    } catch (err) {
      showErrors(form, err);
      // Variant errors come back as variants.N.field — highlight the right row.
      for (const f of err.data?.fields ?? []) {
        const m = /^variants\.(\d+)\.(\w+)/.exec(f.field);
        if (m) { const el = panel.querySelector(`[data-i="${m[1]}"] [data-k="${m[2]}"]`); el?.classList.add("invalid"); }
      }
      toast(errMsg(err), "err");
      btn.disabled = false; btn.textContent = t("save");
    }
  });
  void dt;
}
