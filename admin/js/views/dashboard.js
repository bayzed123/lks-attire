import { t, num, money, dt, lang } from "../i18n.js";
import { html, icon, api, pill, errorState, skeleton, errMsg, raw } from "../core.js";

let chartLib;
const loadChart = () =>
  (chartLib ??= new Promise((res, rej) => {
    if (window.Chart) return res(window.Chart);
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js";
    s.onload = () => res(window.Chart);
    s.onerror = rej;
    document.head.append(s);
  }));

export default async function dashboard(view) {
  view.innerHTML = String(html`<div class="page-head"><h1>${t("dashboard")}</h1></div><div class="kpis">${skeleton(6)}</div>`);
  let d;
  try {
    d = await api("/dashboard");
  } catch (e) {
    view.innerHTML = String(errorState(errMsg(e)));
    view.querySelector("[data-retry]").onclick = () => dashboard(view);
    return;
  }
  const k = d.kpis;
  const delta = (c, label) => html`<span class="delta ${c >= 0 ? "up" : "down"}">${c >= 0 ? "▲" : "▼"} ${num(Math.abs(c))}% ${label}</span>`;
  const bar = (v, max) => raw(`<div class="bar"><i style="width:${Math.max(4, Math.min(100, max ? (v / max) * 100 : 0))}%"></i></div>`);
  const hi = new Date().getHours() < 12 ? (lang() === "bn" ? "শুভ সকাল" : "Good morning") : lang() === "bn" ? "শুভেচ্ছা" : "Hello";

  view.innerHTML = String(html`
    <div class="page-head"><h1>${hi} 👋</h1><a class="btn primary" href="#/orders?status=pending">${icon("orders")} ${t("pendingCod")}: ${num(k.pendingConfirmations.value)}</a></div>
    <div class="kpis">
      <a class="card kpi" href="#/orders" style="--c:var(--k1);text-decoration:none;color:inherit"><div class="ico">${icon("orders")}</div><div class="label">${t("todayOrders")}</div><div class="value">${num(k.todayOrders.value)}</div>${bar(k.todayOrders.value, Math.max(10, k.todayOrders.value))}${delta(k.todayOrders.change, t("vsYesterday"))}</a>
      <div class="card kpi" style="--c:var(--k2)"><div class="ico">${icon("money")}</div><div class="label">${t("todayRevenue")}</div><div class="value">${money(k.todayRevenue.value)}</div>${bar(k.todayRevenue.value, Math.max(k.monthRevenue.value / 10, 1))}${delta(k.todayRevenue.change, t("vsYesterday"))}</div>
      <div class="card kpi" style="--c:var(--k6)"><div class="ico">${icon("reports")}</div><div class="label">${t("monthRevenue")}</div><div class="value">${money(k.monthRevenue.value)}</div>${bar(new Date().getDate(), 30)}${delta(k.monthRevenue.change, t("vsLastMonth"))}</div>
      <a class="card kpi" href="#/orders?status=pending" style="--c:var(--k3);text-decoration:none;color:inherit"><div class="ico">${icon("phone")}</div><div class="label">${t("pendingCod")}</div><div class="value">${num(k.pendingConfirmations.value)}</div>${bar(k.pendingConfirmations.value, Math.max(10, k.pendingConfirmations.value))}<span class="delta muted">${t("codCount", { n: num(k.pendingConfirmations.cod) })}</span></a>
      <a class="card kpi" href="#/inventory?stock=low" style="--c:var(--k5);text-decoration:none;color:inherit"><div class="ico">${icon("alert")}</div><div class="label">${t("lowStockItems")}</div><div class="value">${num(k.lowStock.value)}</div>${bar(k.lowStock.value, k.lowStock.total)}<span class="delta muted">${t("ofVariants", { n: num(k.lowStock.total) })}</span></a>
      <a class="card kpi" href="#/customers" style="--c:var(--k4);text-decoration:none;color:inherit"><div class="ico">${icon("customers")}</div><div class="label">${t("newCustomers")}</div><div class="value">${num(k.newCustomers.value)}</div>${bar(k.newCustomers.value, Math.max(10, k.newCustomers.value))}${delta(k.newCustomers.change, t("vsLastWeek"))}</a>
    </div>
    <div class="dash-grid">
      <div class="card"><div class="card-title"><h2>${t("salesChart")}</h2><a class="btn sm" href="#/reports">${t("reports")}</a></div><div class="chart-box"><canvas id="sales" aria-label="${t("salesChart")}" role="img"></canvas></div></div>
      <div class="card"><div class="card-title"><h2>${t("topProducts")}</h2></div>
        ${d.topProducts.length ? d.topProducts.map((p) => html`<a class="top-item" href="#/products/${p.product_id}" style="color:inherit;text-decoration:none">${p.image ? html`<img src="${p.image}" alt="" loading="lazy">` : html`<span></span>`}<span><b>${lang() === "bn" ? p.name_bn : p.name_en}</b><br><span class="muted small">${num(p.qty)} × · ${money(p.revenue)}</span></span><span class="pill active">${num(p.qty)}</span></a>`) : html`<p class="muted">${t("noItems")}</p>`}
      </div>
    </div>
    <div class="card" style="margin-top:20px"><div class="card-title"><h2>${t("recentOrders")}</h2><a class="btn sm" href="#/orders">${t("viewAll")}</a></div>
      <table class="table"><thead><tr><th>#</th><th>${t("customer")}</th><th>${t("total")}</th><th>${t("payment")}</th><th>${t("status")}</th><th>${t("date")}</th></tr></thead>
      <tbody>${d.recentOrders.map((o) => html`<tr class="clickable" data-href="#/orders/${o.id}"><td data-label="#"><b>${o.order_no}</b></td><td data-label="${t("customer")}">${o.customer_name}<br><span class="muted small">${o.district}</span></td><td data-label="${t("total")}">${money(o.total)}</td><td data-label="${t("payment")}">${o.payment_method} ${pill(o.payment_status)}</td><td data-label="${t("status")}">${pill(o.status, t(`s_${o.status}`))}</td><td data-label="${t("date")}">${dt(o.created_at, true)}</td></tr>`)}</tbody></table>
    </div>`);
  view.querySelectorAll("tr[data-href]").forEach((tr) => tr.addEventListener("click", () => (location.hash = tr.dataset.href)));

  try {
    const Chart = await loadChart();
    const cs = getComputedStyle(document.documentElement);
    const primary = cs.getPropertyValue("--a-primary").trim() || "#6D3FC0";
    const pink = cs.getPropertyValue("--a-pink").trim() || "#E75A9B";
    const canvas = document.getElementById("sales");
    if (!canvas) return; // user navigated away while the library loaded
    const ctx = canvas.getContext("2d");
    const grad = ctx.createLinearGradient(0, 0, 0, 260);
    grad.addColorStop(0, pink + "55");
    grad.addColorStop(1, pink + "00");
    new Chart(ctx, {
      type: "line",
      data: {
        labels: d.salesChart.map((m) => new Date(m.month + "-01").toLocaleDateString(lang() === "bn" ? "bn-BD" : "en-GB", { month: "short" })),
        datasets: [
          { label: t("revenue"), data: d.salesChart.map((m) => m.revenue), borderColor: primary, backgroundColor: grad, fill: true, tension: 0.4, pointRadius: 3, pointBackgroundColor: pink, yAxisID: "y" },
          { label: t("orders_"), data: d.salesChart.map((m) => m.orders), borderColor: pink, borderDash: [6, 4], tension: 0.4, pointRadius: 0, yAxisID: "y1" },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false },
        plugins: { legend: { position: "bottom", labels: { usePointStyle: true } }, tooltip: { callbacks: { label: (c) => (c.datasetIndex === 0 ? `${t("revenue")}: ${money(c.raw)}` : `${t("orders_")}: ${num(c.raw)}`) } } },
        scales: { y: { beginAtZero: true, grid: { color: "#e6dff3" }, ticks: { callback: (v) => money(v) } }, y1: { beginAtZero: true, position: "right", grid: { display: false } }, x: { grid: { display: false } } },
      },
    });
  } catch {
    // Chart library unavailable (offline/CDN blocked): show the numbers instead.
    document.getElementById("sales")?.replaceWith(Object.assign(document.createElement("div"), { innerHTML: String(html`<table class="table">${d.salesChart.map((m) => html`<tr><td>${m.month}</td><td>${money(m.revenue)}</td><td>${num(m.orders)}</td></tr>`)}</table>`) }));
  }
}
