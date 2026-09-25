// Activity / audit log — who changed what and when (read-only).
import { t, dt, lang } from "../i18n.js";
import { html, api, $, listTable, pill, debounce } from "../core.js";

export default async function audit(view) {
  const state = { q: "", entity: "", action: "", page: 1 };
  view.innerHTML = String(html`<div class="page-head"><h1>${t("audit")}</h1></div>
    <div class="card"><div class="toolbar">
      <input class="input" id="aq" type="search" placeholder="${t("searchPlaceholder")}" aria-label="${t("searchPlaceholder")}">
      <select class="input" id="aent" aria-label="Entity"><option value="">${lang() === "bn" ? "সব বিষয়" : "All items"}</option>${["order", "product", "category", "customer", "coupon", "banner", "review", "staff", "settings", "inventory", "admin", "delivery_zone", "media", "report"].map((e) => html`<option>${e}</option>`)}</select>
      <select class="input" id="aact" aria-label="Action"><option value="">${lang() === "bn" ? "সব কাজ" : "All actions"}</option>${["create", "update", "delete", "restore", "purge", "status", "refund", "login", "login_failed", "stock_adjust", "import", "export"].map((e) => html`<option>${e}</option>`)}</select>
    </div><div id="list"></div></div>`);
  const table = listTable($("#list", view), {
    columns: [
      { label: { en: "When", bn: "কখন" }, render: (r) => dt(r.created_at, true) },
      { label: { en: "Who", bn: "কে" }, render: (r) => html`<b>${r.admin_name}</b><br><span class="muted small">${r.ip ?? ""}</span>` },
      { label: { en: "Action", bn: "কাজ" }, render: (r) => pill(r.action.includes("fail") ? "failed" : r.action === "delete" || r.action === "purge" ? "cancelled" : "confirmed", r.action) },
      { label: { en: "Item", bn: "বিষয়" }, render: (r) => html`${r.entity} ${r.entity_id ? html`#${r.entity_id}` : ""}` },
      { label: { en: "Details", bn: "বিস্তারিত" }, render: (r) => html`<code class="small" style="word-break:break-all">${(r.details ?? "").slice(0, 220)}</code>` },
    ],
  });
  const load = async () => {
    table.loading();
    const qs = new URLSearchParams(Object.entries({ ...state, limit: "30" }).filter(([, v]) => v !== ""));
    try { table.render(await api(`/audit?${qs}`), { onPage: (p) => { state.page = p; load(); } }); } catch (e) { table.error(e, load); }
  };
  $("#aq", view).addEventListener("input", debounce((e) => { state.q = e.target.value.trim(); state.page = 1; load(); }));
  $("#aent", view).onchange = (e) => { state.entity = e.target.value; state.page = 1; load(); };
  $("#aact", view).onchange = (e) => { state.action = e.target.value; state.page = 1; load(); };
  await load();
}
