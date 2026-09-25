// Reports: sales by day/month/category/product/payment/zone, best customers, courier performance — all exportable to CSV.
import { t, num, money, lang } from "../i18n.js";
import { html, icon, api, $, $$, toast, errMsg, skeleton, errorState, emptyState, downloadBlob } from "../core.js";

const MONEY_COLS = ["merchandise", "discounts", "delivery", "revenue", "collected", "spent"];

export default async function reports(view) {
  const today = new Date(Date.now() + 6 * 3600_000).toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 29 * 86400_000).toISOString().slice(0, 10);
  const state = { report: "sales", group: "day", from: monthAgo, to: today };
  view.innerHTML = String(html`
    <div class="page-head"><h1>${t("reports")}</h1><button class="btn" id="csv">${icon("download")} ${t("exportCsv")}</button></div>
    <div class="chips" style="margin-bottom:18px">${[["sales", t("salesReport")], ["customers", t("bestCustomers")], ["couriers", t("courierPerf")]].map(([k, l]) => html`<button class="chip" data-report="${k}" aria-pressed="${k === "sales"}">${l}</button>`)}</div>
    <div class="card"><div class="toolbar">
      <label class="field" style="margin:0;flex:0 1 180px"><span class="small">${t("from")}</span><input class="input" type="date" id="from" value="${state.from}"></label>
      <label class="field" style="margin:0;flex:0 1 180px"><span class="small">${t("to")}</span><input class="input" type="date" id="to" value="${state.to}"></label>
      <label class="field" style="margin:0;flex:0 1 200px" id="group-wrap"><span class="small">${t("groupBy")}</span><select class="input" id="group">${[["day", "byDay"], ["month", "byMonth"], ["category", "byCategory"], ["product", "byProduct"], ["payment", "byPayment"], ["zone", "byZone"]].map(([v, k]) => html`<option value="${v}">${t(k)}</option>`)}</select></label>
    </div>
    <div class="kpis" id="totals" style="margin-top:8px"></div><div id="out"></div></div>`);

  const url = (format = "json") => {
    const qs = new URLSearchParams({ from: state.from, to: state.to, format, ...(state.report === "sales" ? { group: state.group } : {}) });
    return `/reports/${state.report}?${qs}`;
  };
  const cell = (k, v) => (MONEY_COLS.includes(k) ? money(v) : typeof v === "number" ? num(v) : v ?? "—");
  const load = async () => {
    $("#out", view).innerHTML = String(skeleton(5));
    $("#group-wrap", view).hidden = state.report !== "sales";
    try {
      const r = await api(url());
      $("#totals", view).innerHTML = r.totals
        ? String(html`<div class="card kpi" style="--c:var(--k1)"><div class="label">${t("orders_")}</div><div class="value">${num(r.totals.orders)}</div></div><div class="card kpi" style="--c:var(--k2)"><div class="label">${t("revenue")}</div><div class="value">${money(r.totals.revenue)}</div></div><div class="card kpi" style="--c:var(--k4)"><div class="label">${t("avgOrder")}</div><div class="value">${money(Math.round(r.totals.aov))}</div></div>`)
        : "";
      if (!r.rows.length) { $("#out", view).innerHTML = String(emptyState()); return; }
      const cols = Object.keys(r.rows[0]);
      const max = Math.max(...r.rows.map((x) => Number(x.revenue ?? x.spent ?? x.shipped ?? 0)));
      $("#out", view).innerHTML = String(html`<table class="table"><thead><tr>${cols.map((c) => html`<th>${c.replace(/_/g, " ")}</th>`)}<th></th></tr></thead><tbody>${r.rows.map((row) => html`<tr>${cols.map((c) => html`<td data-label="${c.replace(/_/g, " ")}">${cell(c, row[c])}</td>`)}<td data-label="" style="min-width:120px"><div class="bar" style="height:8px;border-radius:8px;box-shadow:var(--inset);overflow:hidden"><i style="display:block;height:100%;width:${max ? (Number(row.revenue ?? row.spent ?? row.shipped ?? 0) / max) * 100 : 0}%;background:var(--grad)"></i></div></td></tr>`)}</tbody></table>`);
    } catch (e) { $("#out", view).innerHTML = String(errorState(errMsg(e))); $("[data-retry]", view).onclick = load; }
  };
  view.addEventListener("click", (e) => {
    const r = e.target.closest("[data-report]");
    if (r) { state.report = r.dataset.report; $$("[data-report]", view).forEach((b) => b.setAttribute("aria-pressed", String(b === r))); load(); }
  });
  $("#from", view).onchange = (e) => { state.from = e.target.value; load(); };
  $("#to", view).onchange = (e) => { state.to = e.target.value; load(); };
  $("#group", view).onchange = (e) => { state.group = e.target.value; load(); };
  $("#csv", view).onclick = async () => { try { downloadBlob(await api(url("csv")), `${state.report}-${state.from}-${state.to}.csv`); } catch (err) { toast(errMsg(err), "err"); } };
  await load();
  void lang;
}
