// Generic list + create/edit/delete/restore screen driven by admin/js/resources.js.
import { t, tt } from "../i18n.js";
import { html, icon, api, $, $$, can, toast, msg, errMsg, listTable, slideOver, fieldHtml, readForm, showErrors, confirmDialog, debounce, bindUploads } from "../core.js";
import { RESOURCES } from "../resources.js";

export default async function resourceView(view, { key, query }) {
  const R = RESOURCES[key];
  const writePerm = R.writePerm ?? `${R.perm}.write`;
  const deletePerm = R.deletePerm ?? `${R.perm}.delete`;
  const state = { q: "", page: 1, trash: query.get("trash") === "1" ? "1" : "", ...Object.fromEntries(R.filters.map((f) => [f.name, query.get(f.name) ?? ""])) };

  view.innerHTML = String(html`
    <div class="page-head"><h1>${tt(R.title)}</h1>${!R.noCreate && can(writePerm) ? html`<button class="btn primary" id="add">${icon("plus")} ${t("add")}</button>` : ""}</div>
    ${R.intro ? html`<p class="muted">${tt(R.intro)}</p>` : ""}
    <div class="card">
      <div class="toolbar">
        <label class="sr-only" for="q">${t("searchPlaceholder")}</label><input class="input" id="q" type="search" placeholder="${t("searchPlaceholder")}">
        ${R.filters.map((f) => html`<label class="sr-only" for="f-${f.name}">${tt(f.label)}</label><select class="input" id="f-${f.name}" data-filter="${f.name}">${f.options.map(([v, l]) => html`<option value="${v}" ${state[f.name] === v ? "selected" : ""}>${typeof l === "object" ? tt(l) : l}</option>`)}</select>`)}
        <div class="chips"><button class="chip" data-trash="" aria-pressed="${!state.trash}">${t("active")}</button>${can(deletePerm) ? html`<button class="chip" data-trash="1" aria-pressed="${Boolean(state.trash)}">${icon("trash")} ${t("trash")}</button>` : ""}</div>
      </div>
      <div id="list"></div>
    </div>
    <div id="extra"></div>`);

  const table = listTable($("#list", view), {
    columns: R.columns,
    rowAttrs: (r) => `class="clickable" data-id="${r.id}"`,
    actions: (r) =>
      state.trash
        ? html`<button class="btn sm" data-restore="${r.id}">${icon("restore")} ${t("restore")}</button>${can("trash.purge") ? html` <button class="btn sm" data-purge="${r.id}">${t("deleteForever")}</button>` : ""}`
        : html`${R.rowActions && can(writePerm) ? R.rowActions(r) : ""} ${can(writePerm) ? html`<button class="btn sm" data-edit="${r.id}" aria-label="${t("edit")}">${icon("edit")}</button>` : ""} ${can(deletePerm) ? html`<button class="btn sm" data-del="${r.id}" aria-label="${t("delete")}">${icon("trash")}</button>` : ""}`,
  });
  let rows = [];
  async function load() {
    table.loading();
    const qs = new URLSearchParams(Object.entries({ ...state, limit: "20" }).filter(([, v]) => v !== ""));
    try {
      const res = await api(`${R.endpoint}?${qs}`);
      rows = res.items;
      table.render(res, { onPage: (p) => { state.page = p; load(); } });
    } catch (e) { table.error(e, load); }
  }

  async function openForm(id) {
    let item = {};
    if (id) {
      try { item = (await api(`${R.endpoint}/${id}`)).item; } catch (e) { return toast(errMsg(e), "err"); }
    }
    const fields = await R.fields();
    const readOnly = !can(writePerm);
    const { panel, close, body } = slideOver({
      title: `${tt(R.title)} — ${id ? R.nameOf(item) : t("add")}`,
      body: html`<form id="rf" class="grid2" novalidate><fieldset ${readOnly ? "disabled" : ""} style="border:0;padding:0;margin:0;display:contents">${fields.map((f) => fieldHtml(f, item[f.name] ?? (id ? undefined : f.default)))}</fieldset></form>${id && R.detail ? html`<div style="margin-top:16px">${R.detail(item)}</div>` : ""}`,
      footer: readOnly ? html`<button class="btn" data-close>${t("close")}</button>` : html`<button class="btn" type="button" data-close>${t("cancel")}</button><button class="btn primary" type="submit" form="rf">${t("save")}</button>`,
    });
    bindUploads(body);
    const form = $("#rf", panel);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = $("button[type=submit]", panel);
      btn.disabled = true; btn.textContent = t("saving");
      try {
        const r = await api(id ? `${R.endpoint}/${id}` : R.endpoint, { method: id ? "PUT" : "POST", body: readForm(form, fields) });
        toast(msg(r) || t("saved"));
        close(); load();
      } catch (err) {
        showErrors(form, err); toast(errMsg(err), "err");
        btn.disabled = false; btn.textContent = t("save");
      }
    });
  }

  view.addEventListener("click", async (e) => {
    const find = (id) => rows.find((r) => r.id === Number(id));
    const el = e.target.closest("[data-edit],[data-del],[data-restore],[data-purge],[data-act],[data-trash],tr[data-id]");
    if (!el) return;
    if (el.matches("[data-trash]")) { state.trash = el.dataset.trash; state.page = 1; $$("[data-trash]", view).forEach((b) => b.setAttribute("aria-pressed", String(b === el))); return load(); }
    e.stopPropagation();
    try {
      if (el.dataset.edit) return openForm(Number(el.dataset.edit));
      if (el.dataset.del) {
        const r = find(el.dataset.del);
        if (!(await confirmDialog(t("confirmDelete", { name: R.nameOf(r) })))) return;
        toast(msg(await api(`${R.endpoint}/${r.id}`, { method: "DELETE" })) || t("deleted"));
        return load();
      }
      if (el.dataset.restore) { toast(msg(await api(`${R.endpoint}/${el.dataset.restore}/restore`, { method: "POST" })) || t("restored")); return load(); }
      if (el.dataset.purge) {
        const r = find(el.dataset.purge);
        if (!(await confirmDialog(t("confirmPurge", { name: R.nameOf(r) })))) return;
        toast(msg(await api(`${R.endpoint}/${r.id}?purge=1`, { method: "DELETE" })));
        return load();
      }
      if (el.dataset.act) { await R.onAction(el.dataset.act, find(el.closest("tr").dataset.id)); toast(t("saved")); return load(); }
      if (el.matches("tr[data-id]") && !state.trash) return openForm(Number(el.dataset.id));
    } catch (err) { toast(errMsg(err), "err"); }
  });
  $("#add", view)?.addEventListener("click", () => openForm(null));
  $("#q", view).addEventListener("input", debounce((e) => { state.q = e.target.value.trim(); state.page = 1; load(); }));
  $$("[data-filter]", view).forEach((s) => s.addEventListener("change", () => { state[s.dataset.filter] = s.value; state.page = 1; load(); }));
  await load();
  if (query.get("id")) openForm(Number(query.get("id")));
  if (R.extra) R.extra().then((x) => ($("#extra", view).innerHTML = String(x))).catch(() => {});
}
