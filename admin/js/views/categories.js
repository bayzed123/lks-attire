// Categories: nested tree with drag-to-reorder (drop on the top edge = before, middle = make sub-category).
import { t, tt, num, lang } from "../i18n.js";
import { html, icon, api, $, $$, can, toast, msg, errMsg, slideOver, fieldHtml, readForm, showErrors, confirmDialog, skeleton, errorState, bindUploads, emptyState } from "../core.js";

const fields = (parents) => [
  { name: "name_en", label: { en: "Name (English)", bn: "নাম (ইংরেজি)" }, required: true },
  { name: "name_bn", label: { en: "Name (Bangla)", bn: "নাম (বাংলা)" }, required: true },
  { name: "slug", label: { en: "Web address (slug)", bn: "ওয়েব ঠিকানা (slug)" }, required: true, hint: { en: "e.g. cotton-saree", bn: "যেমন cotton-saree" } },
  { name: "parent_id", label: { en: "Parent category", bn: "মূল ক্যাটাগরি" }, type: "select", numeric: true, allowEmpty: true, options: parents },
  { name: "description_en", label: { en: "Description (English)", bn: "বিবরণ (ইংরেজি)" }, type: "textarea", rows: 2 },
  { name: "description_bn", label: { en: "Description (Bangla)", bn: "বিবরণ (বাংলা)" }, type: "textarea", rows: 2 },
  { name: "image_url", label: { en: "Tile image (optional — otherwise a product photo is used)", bn: "টাইলের ছবি (ঐচ্ছিক)" }, type: "image", span: 2 },
  { name: "sort_order", label: { en: "Order", bn: "ক্রম" }, type: "number", default: 0 },
  { name: "is_active", label: { en: "Show in shop", bn: "দোকানে দেখাবে" }, type: "checkbox", default: 1 },
];

export default async function categories(view) {
  view.innerHTML = String(html`<div class="page-head"><h1>${t("categories")}</h1>${can("categories.write") ? html`<button class="btn primary" id="add">${icon("plus")} ${t("add")}</button>` : ""}</div>
    <div class="card"><p class="muted small">${t("dragHint")}</p><div id="tree">${skeleton(5)}</div>${can("categories.write") ? html`<div style="margin-top:16px;text-align:right"><button class="btn primary" id="save-order" hidden>${t("saveOrder")}</button></div>` : ""}</div>`);
  let items = [];
  const load = async () => {
    try { items = (await api("/categories?limit=200&sort=sort_order")).items; draw(); }
    catch (e) { $("#tree", view).innerHTML = String(errorState(errMsg(e))); $("[data-retry]", view).onclick = load; }
  };
  const name = (c) => (lang() === "bn" ? c.name_bn : c.name_en);
  const draw = () => {
    if (!items.length) { $("#tree", view).innerHTML = String(emptyState()); return; }
    const kids = (pid) => items.filter((c) => (c.parent_id ?? null) === pid).sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
    const branch = (pid) => html`<ul class="tree">${kids(pid).map((c) => html`<li class="tree-item" data-id="${c.id}" draggable="${can("categories.write")}">
      <div class="row"><button type="button" class="handle" aria-label="Drag">${icon("grip")}</button><b style="flex:1">${name(c)}</b>
        <span class="muted small">${num(c.product_count)} ${lang() === "bn" ? "পণ্য" : "products"}</span>${c.is_active ? "" : html`<span class="pill inactive">off</span>`}
        ${can("categories.write") ? html`<button class="btn sm" data-add-sub="${c.id}" aria-label="${t("addSub")}" title="${t("addSub")}">${icon("plus")}</button><button class="btn sm" data-edit="${c.id}" aria-label="${t("edit")}">${icon("edit")}</button>` : ""}
        ${can("categories.delete") ? html`<button class="btn sm" data-del="${c.id}" aria-label="${t("delete")}">${icon("trash")}</button>` : ""}</div>
      ${kids(c.id).length ? branch(c.id) : ""}</li>`)}</ul>`;
    $("#tree", view).innerHTML = String(branch(null));
    bindDrag();
  };

  let dragId = null;
  const bindDrag = () => {
    $$(".tree-item", view).forEach((li) => {
      li.addEventListener("dragstart", (e) => { e.stopPropagation(); dragId = Number(li.dataset.id); li.classList.add("dragging"); e.dataTransfer.effectAllowed = "move"; });
      li.addEventListener("dragend", () => { li.classList.remove("dragging"); $$(".drop-before,.drop-inside", view).forEach((x) => x.classList.remove("drop-before", "drop-inside")); });
      const row = li.querySelector(".row");
      row.addEventListener("dragover", (e) => {
        e.preventDefault();
        const r = row.getBoundingClientRect();
        const inside = e.clientY - r.top > r.height * 0.4;
        li.classList.toggle("drop-inside", inside);
        li.classList.toggle("drop-before", !inside);
      });
      row.addEventListener("dragleave", () => li.classList.remove("drop-before", "drop-inside"));
      row.addEventListener("drop", (e) => {
        e.preventDefault(); e.stopPropagation();
        const targetId = Number(li.dataset.id);
        const inside = li.classList.contains("drop-inside");
        li.classList.remove("drop-before", "drop-inside");
        if (!dragId || dragId === targetId) return;
        // Prevent dropping a category into its own descendant.
        let p = items.find((c) => c.id === targetId);
        while (p) { if (p.id === dragId) return toast(lang() === "bn" ? "নিজের ভেতরে রাখা যাবে না।" : "Can't move a category inside itself.", "err"); p = items.find((c) => c.id === p.parent_id); }
        const moving = items.find((c) => c.id === dragId);
        const target = items.find((c) => c.id === targetId);
        if (inside) { moving.parent_id = target.id; moving.sort_order = 9999; }
        else { moving.parent_id = target.parent_id ?? null; moving.sort_order = target.sort_order - 0.5; }
        // Normalise sort orders within each sibling group.
        const groups = new Map();
        for (const c of items) { const k = c.parent_id ?? 0; groups.set(k, [...(groups.get(k) ?? []), c]); }
        for (const g of groups.values()) g.sort((a, b) => a.sort_order - b.sort_order).forEach((c, i) => (c.sort_order = i));
        draw();
        $("#save-order", view).hidden = false;
      });
    });
  };

  const openForm = async (id, parentId = null) => {
    const item = id ? items.find((c) => c.id === id) : { parent_id: parentId };
    const parents = items.filter((c) => c.id !== id).map((c) => [c.id, name(c)]);
    const F = fields(parents);
    const { panel, close, body } = slideOver({
      title: id ? `${t("edit")}: ${name(item)}` : t("add"),
      body: html`<form id="cf" class="grid2" novalidate>${F.map((f) => fieldHtml(f, item[f.name] ?? (id ? undefined : f.default)))}</form>`,
      footer: html`<button class="btn" data-close>${t("cancel")}</button><button class="btn primary" type="submit" form="cf">${t("save")}</button>`,
    });
    bindUploads(body);
    const form = $("#cf", panel);
    if (!id) form.name_en.addEventListener("input", () => (form.slug.value = form.name_en.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")));
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      try { toast(msg(await api(id ? `/categories/${id}` : "/categories", { method: id ? "PUT" : "POST", body: readForm(form, F) }))); close(); load(); }
      catch (err) { showErrors(form, err); toast(errMsg(err), "err"); }
    });
  };

  view.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-edit],[data-del],[data-add-sub],#add,#save-order");
    if (!b) return;
    try {
      if (b.id === "add") return openForm(null);
      if (b.dataset.addSub) return openForm(null, Number(b.dataset.addSub));
      if (b.dataset.edit) return openForm(Number(b.dataset.edit));
      if (b.dataset.del) {
        const c = items.find((x) => x.id === Number(b.dataset.del));
        if (!(await confirmDialog(t("confirmDelete", { name: name(c) })))) return;
        toast(msg(await api(`/categories/${c.id}`, { method: "DELETE" }))); return load();
      }
      if (b.id === "save-order") {
        toast(msg(await api("/categories/reorder", { method: "PUT", body: { items: items.map((c) => ({ id: c.id, parent_id: c.parent_id ?? null, sort_order: c.sort_order })) } })));
        b.hidden = true; load();
      }
    } catch (err) { toast(errMsg(err), "err"); }
  });
  await load();
  void tt;
}
