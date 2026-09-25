import { html, icon, api, $, errMsg, normalizePhone } from "../core.js";
import { t, money, num, date, lang } from "../i18n.js";

const FLOW = ["pending", "confirmed", "packed", "shipped", "delivered"];

export default async function order(main, { params, query, navigate }) {
  const orderNo = params.orderNo ?? query.get("order");
  let token = query.get("token");
  try { token ||= sessionStorage.getItem(`lks_order_${orderNo}`); } catch { /* ignore */ }
  const phone = query.get("phone");

  if (!orderNo || (!token && !phone)) return trackForm(main, navigate, orderNo);
  main.innerHTML = String(html`<div class="container section"><div class="skeleton" style="height:320px"></div></div>`);
  let data;
  try {
    data = await api(`/orders/track?order=${encodeURIComponent(orderNo)}${token ? `&token=${encodeURIComponent(token)}` : ""}${phone ? `&phone=${encodeURIComponent(phone)}` : ""}`);
  } catch (e) {
    return trackForm(main, navigate, orderNo, errMsg(e));
  }
  const { order: o, items, history } = data;
  document.title = `${t("orderNumber")} ${o.order_no}`;
  const isNew = query.get("new") === "1";
  const pay = query.get("payment");
  const bad = o.status === "cancelled" || o.status === "returned";
  const steps = bad ? [...FLOW.slice(0, FLOW.indexOf(history.filter((h) => FLOW.includes(h.status)).at(-1)?.status ?? "pending") + 1), o.status] : FLOW;
  const reached = new Map(history.map((h) => [h.status, h.created_at]));
  const idx = steps.indexOf(o.status);

  main.innerHTML = String(html`<div class="container section" style="max-width:860px">
    ${isNew || pay ? html`<div class="confirm-hero"><div class="seal">${icon("check", "icon")}</div><h1 style="font-size:clamp(1.6rem,4vw,2.4rem)">${t("thankYou")}</h1>
      <p class="muted">${t("confirmCall", { phone: o.customer_phone })}</p></div>` : html`<h1>${t("trackYourOrder")}</h1>`}
    ${pay === "paid" ? html`<p class="zone-note">${t("paymentPaid")}</p>` : pay && pay !== "paid" ? html`<p class="error-box">${t("paymentFailed")}</p>` : ""}
    <div class="panel"><div class="section-head" style="margin:0"><div><span class="muted small">${t("orderNumber")}</span><h2 style="margin:0;font-family:var(--font-body);font-weight:700;letter-spacing:.04em">${o.order_no}</h2>${o.invoice_no ? html`<div class="small">${t("invoiceNo")}: <b>${o.invoice_no}</b></div>` : ""}</div><span class="muted small">${date(o.created_at)}</span></div>
      <ol class="timeline">${steps.map((s, i) => {
        const cls = i < idx ? "done" : i === idx ? (bad ? "bad current" : "done current") : "";
        return html`<li class="${cls}"><span class="dot">${i <= idx ? "✓" : num(i + 1)}</span><div><b>${t(`status_${s}`)}</b>${reached.get(s) ? html`<div class="muted small">${date(reached.get(s))}</div>` : ""}
          ${s === "shipped" && o.tracking_id ? html`<div class="small">${o.courier_partner} · ${o.tracking_id} ${o.tracking_url ? html`· <a href="${o.tracking_url}" target="_blank" rel="noopener" style="text-decoration:underline">${t("trackParcel", { courier: o.courier_partner })}</a>` : ""}</div>` : ""}</div></li>`;
      })}</ol></div>
    <div class="panel"><h2>${t("itemsInOrder")}</h2>
      ${items.map((i) => html`<div class="line"><img src="${i.image}" alt="" width="72" height="96" loading="lazy"><div><b>${lang() === "bn" ? i.name_bn : i.name_en}</b><div class="meta">${i.size} · ${i.color} · ×${num(i.quantity)}${i.sku ? ` · SKU ${i.sku}` : ""}</div></div><b>${money(i.line_total)}</b></div>`)}
      <div class="totals"><div><span>${t("subtotal")}</span><b>${money(o.subtotal)}</b></div>
        ${o.discount ? html`<div><span>${t("discount")}</span><b>−${money(o.discount)}</b></div>` : ""}
        <div><span>${t("delivery")}</span><b>${o.delivery_fee ? money(o.delivery_fee) : t("free")}</b></div>
        <div class="grand"><span>${t("total")} · ${o.payment_method}</span><span>${money(o.total)}</span></div></div>
      <p class="muted small">${o.customer_name} · ${o.customer_phone} · ${o.address}</p></div>
    <p style="text-align:center"><a class="btn ghost" href="/shop">${t("continueShopping")}</a></p></div>`);
}

function trackForm(main, navigate, orderNo = "", error = "") {
  document.title = t("trackYourOrder");
  main.innerHTML = String(html`<div class="container section"><div class="panel auth-card"><h1 style="font-size:2rem">${t("trackYourOrder")}</h1><p class="muted">${t("trackSub")}</p>
    ${error ? html`<p class="error-box">${error}</p>` : ""}
    <form id="track" novalidate>
      <label class="field"><span>${t("orderNumber")}</span><input class="input" name="order" required value="${orderNo}" placeholder="LKS-260101-ABCD" autocapitalize="characters"></label>
      <label class="field"><span>${t("mobile")}</span><input class="input" name="phone" required inputmode="tel" placeholder="01XXXXXXXXX"></label>
      <button class="btn block">${t("trackBtn")}</button></form></div></div>`);
  $("#track").addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const phone = normalizePhone(fd.get("phone"));
    const no = String(fd.get("order")).trim().toUpperCase();
    if (!no || !phone) return;
    navigate(`/order/${encodeURIComponent(no)}?phone=${phone}`);
  });
}
