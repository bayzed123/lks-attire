// Orders: status tabs, filters, bulk actions, and a detail panel with the delivery pipeline,
// courier booking, payments, refunds, notes, history and printable invoice / shipping label.
import { t, num, money, dt, lang } from "../i18n.js";
import { html, raw, icon, api, $, $$, can, toast, msg, errMsg, listTable, slideOver, pill, confirmDialog, debounce, showErrors } from "../core.js";

const STATUSES = ["pending", "confirmed", "packed", "shipped", "delivered", "returned", "cancelled"];
const FLOW = ["pending", "confirmed", "packed", "shipped", "delivered"];
let brand;

export default async function orders(view, { id, query, refreshBell }) {
  brand ??= await fetch("/brand.json").then((r) => r.json()).catch(() => ({ name: { en: "Store" }, contact: {}, location: { street: {}, city: {} } }));
  const state = { status: query.get("status") ?? "", q: "", payment_method: "", from: "", to: "", page: 1, trash: "" };
  const selected = new Set();

  view.innerHTML = String(html`
    <div class="page-head"><h1>${t("orders")}</h1></div>
    <div class="chips" id="tabs" style="margin-bottom:18px"></div>
    <div class="card">
      <div class="toolbar">
        <label class="sr-only" for="oq">${t("searchPlaceholder")}</label><input class="input" id="oq" type="search" placeholder="${lang() === "bn" ? "ইনভয়েস/অর্ডার নং, নাম, ফোন, TrxID, SKU…" : "Invoice/order no, name, phone, TrxID, SKU…"}">
        <select class="input" id="opm" aria-label="${t("payment")}"><option value="">${t("payment")}: ${t("all")}</option>${["COD", "bKash", "Nagad", "Rocket", "Card"].map((m) => html`<option>${m}</option>`)}</select>
        <input class="input" type="date" id="ofrom" aria-label="${lang() === "bn" ? "শুরুর তারিখ" : "From date"}" style="flex:0 1 160px">
        <input class="input" type="date" id="oto" aria-label="${lang() === "bn" ? "শেষ তারিখ" : "To date"}" style="flex:0 1 160px">
        ${can("orders.delete") ? html`<button class="chip" id="otrash" aria-pressed="false">${icon("trash")} ${t("trash")}</button>` : ""}
      </div>
      <div id="bulk" class="toolbar" hidden><b id="bulk-n"></b>${can("orders.update") ? html`<button class="btn sm" data-bulk="confirmed">${t("bulkConfirm")}</button><button class="btn sm" data-bulk="packed">${t("bulkPack")}</button>` : ""}</div>
      <div id="list"></div>
    </div>`);

  const table = listTable($("#list", view), {
    columns: [
      { label: { en: "", bn: "" }, render: (o) => raw(`<input type="checkbox" data-sel="${o.id}" aria-label="select" ${selected.has(o.id) ? "checked" : ""} style="width:22px;height:22px">`) },
      { label: { en: "Order", bn: "অর্ডার" }, render: (o) => html`<b>${o.invoice_no ?? o.order_no}</b><br><span class="muted small">${o.order_no} · ${dt(o.created_at, true)}</span>` },
      { label: { en: "Customer", bn: "গ্রাহক" }, render: (o) => html`${o.customer_name}<br><a href="tel:${o.customer_phone}" class="small">${o.customer_phone}</a>` },
      { label: { en: "Area", bn: "এলাকা" }, render: (o) => html`${o.upazila}, ${o.district}` },
      { label: { en: "Total", bn: "মোট" }, render: (o) => html`<b>${money(o.total)}</b><br><span class="muted small">${num(o.item_count)} ${t("items")}</span>` },
      { label: { en: "Payment", bn: "পেমেন্ট" }, render: (o) => html`${o.payment_method}<br>${pill(o.payment_status)}` },
      { label: { en: "Status", bn: "অবস্থা" }, render: (o) => html`${pill(o.status, t(`s_${o.status}`))}${o.tracking_id ? html`<br><span class="muted small">${o.courier_partner} · ${o.tracking_id}</span>` : ""}` },
    ],
    rowAttrs: (o) => `class="clickable" data-open="${o.id}"`,
    actions: (o) => (state.trash ? html`<button class="btn sm" data-restore="${o.id}">${icon("restore")} ${t("restore")}</button>` : html`<button class="btn sm" data-open="${o.id}">${t("edit")}</button>`),
  });

  async function load() {
    table.loading();
    const qs = new URLSearchParams(Object.entries({ ...state, limit: "20" }).filter(([, v]) => v !== ""));
    try {
      const res = await api(`/orders?${qs}`);
      table.render(res, { onPage: (p) => { state.page = p; load(); } });
      const counts = res.statusCounts ?? {};
      const all = Object.values(counts).reduce((a, b) => a + b, 0);
      $("#tabs", view).innerHTML = String(html`<button class="chip" data-status="" aria-pressed="${!state.status}">${t("all")} <span class="n">${num(all)}</span></button>${STATUSES.map((s) => html`<button class="chip" data-status="${s}" aria-pressed="${state.status === s}">${t(`s_${s}`)} <span class="n">${num(counts[s] ?? 0)}</span></button>`)}`);
    } catch (e) { table.error(e, load); }
  }
  const updateBulk = () => { $("#bulk", view).hidden = selected.size === 0; $("#bulk-n", view).textContent = t("bulkSelected", { n: num(selected.size) }); };

  view.addEventListener("click", async (e) => {
    const sel = e.target.closest("[data-sel]");
    if (sel) { e.stopPropagation(); sel.checked ? selected.add(Number(sel.dataset.sel)) : selected.delete(Number(sel.dataset.sel)); return updateBulk(); }
    const tab = e.target.closest("[data-status]");
    if (tab) { state.status = tab.dataset.status; state.page = 1; return load(); }
    const bulk = e.target.closest("[data-bulk]");
    if (bulk) {
      if (!(await confirmDialog(`${t("markAs")} "${t(`s_${bulk.dataset.bulk}`)}" — ${t("bulkSelected", { n: num(selected.size) })}?`, { danger: false }))) return;
      try { const r = await api("/orders/bulk-status", { method: "POST", body: { ids: [...selected], status: bulk.dataset.bulk } }); toast(msg(r)); for (const f of r.failed) toast(`#${f.id}: ${f.reason}`, "err"); selected.clear(); updateBulk(); load(); }
      catch (err) { toast(errMsg(err), "err"); }
      return;
    }
    const rs = e.target.closest("[data-restore]");
    if (rs) { e.stopPropagation(); await api(`/orders/${rs.dataset.restore}/restore`, { method: "POST" }); toast(t("restored")); return load(); }
    const open = e.target.closest("[data-open]");
    if (open && !e.target.closest("a")) location.hash = `#/orders/${open.dataset.open}`;
  });
  $("#oq", view).addEventListener("input", debounce((e) => { state.q = e.target.value.trim(); state.page = 1; load(); }));
  $("#opm", view).onchange = (e) => { state.payment_method = e.target.value; state.page = 1; load(); };
  $("#ofrom", view).onchange = (e) => { state.from = e.target.value; load(); };
  $("#oto", view).onchange = (e) => { state.to = e.target.value; load(); };
  $("#otrash", view)?.addEventListener("click", (e) => { state.trash = state.trash ? "" : "1"; e.currentTarget.setAttribute("aria-pressed", String(Boolean(state.trash))); load(); });

  await load();
  if (id) openOrder(Number(id), () => { load(); refreshBell?.(); });
}

async function openOrder(id, onChange) {
  let d;
  try { d = await api(`/orders/${id}`); } catch (e) { return toast(errMsg(e), "err"); }
  const o = d.order;
  const bad = o.status === "cancelled" || o.status === "returned";
  const reachedIdx = FLOW.indexOf(bad ? d.history.filter((h) => FLOW.includes(h.status)).at(-1)?.status ?? "pending" : o.status);
  const canUpdate = can("orders.update");
  const waText = encodeURIComponent(lang() === "bn" ? `আসসালামু আলাইকুম ${o.customer_name}, ${brand.name.bn ?? brand.name.en} থেকে বলছি। আপনার অর্ডার ${o.order_no} (৳${o.total}) কনফার্ম করতে চাই।` : `Hello ${o.customer_name}, this is ${brand.name.en}. Calling to confirm your order ${o.order_no} (৳${o.total}).`);
  const risk = d.customerStats && d.customerStats.failed > 0;

  const { panel, close, body } = slideOver({
    wide: true,
    title: `${t("orderDetail")} ${o.invoice_no ?? o.order_no}`,
    body: html`
      <div class="pipeline">${FLOW.map((s, i) => html`<span class="${i <= reachedIdx ? "done" : ""}">${t(`s_${s}`)}</span>`)}${bad ? html`<span class="bad">${t(`s_${o.status}`)}</span>` : ""}</div>
      ${canUpdate && d.nextStatuses.length && !o.deleted_at ? html`<div class="chips" style="margin-bottom:18px">${d.nextStatuses.map((s) => html`<button class="btn ${["cancelled", "returned"].includes(s) ? "" : "primary"}" data-next="${s}">${["cancelled", "returned"].includes(s) ? "" : "→ "}${t(`s_${s}`)}</button>`)}</div>` : ""}
      <div class="grid2">
        <div class="card"><h3>${t("customer")}</h3>
          <dl class="kv"><dt>${t("invoiceNo")}</dt><dd><b>${o.invoice_no ?? "—"}</b></dd><dt>${t("orderNo")}</dt><dd>${o.order_no}</dd><dt>${lang() === "bn" ? "নাম" : "Name"}</dt><dd>${o.customer_name}</dd><dt>${t("phone")}</dt><dd><a href="tel:${o.customer_phone}">${o.customer_phone}</a></dd>${o.customer_email ? html`<dt>Email</dt><dd>${o.customer_email}</dd>` : ""}
          <dt>${t("deliverTo")}</dt><dd>${o.area}, ${o.upazila}, ${o.district}, ${o.division}</dd><dt>Zone</dt><dd>${o.zone_code}</dd></dl>
          ${d.customerStats ? html`<p class="small ${risk ? "error-box" : "muted"}" style="margin-top:10px">${t("customerHistory", { n: num(d.customerStats.orders), f: num(d.customerStats.failed ?? 0) })}</p>` : ""}
          <div class="chips" style="margin-top:10px"><a class="btn sm" href="tel:${o.customer_phone}">${icon("phone")} ${lang() === "bn" ? "কল" : "Call"}</a><a class="btn sm" target="_blank" rel="noopener" href="https://wa.me/88${o.customer_phone}?text=${waText}">WhatsApp</a></div>
          ${o.customer_note ? html`<p class="small" style="margin-top:10px"><b>${lang() === "bn" ? "গ্রাহকের নোট" : "Customer note"}:</b> ${o.customer_note}</p>` : ""}
        </div>
        <div class="card" style="margin-top:0"><h3>${t("payment")}</h3>
          <dl class="kv"><dt>${lang() === "bn" ? "পদ্ধতি" : "Method"}</dt><dd>${o.payment_method}</dd><dt>${t("status")}</dt><dd>${pill(o.payment_status)}</dd>${o.payment_ref ? html`<dt>Ref / TrxID</dt><dd>${o.payment_ref}</dd>` : ""}
          ${o.courier_partner ? html`<dt>${t("courier")}</dt><dd>${o.courier_partner}</dd><dt>${t("tracking")}</dt><dd>${o.tracking_url ? html`<a href="${o.tracking_url}" target="_blank" rel="noopener">${o.tracking_id}</a>` : o.tracking_id ?? "—"}</dd>` : ""}
          ${o.refund_amount ? html`<dt>Refund</dt><dd>${money(o.refund_amount)} — ${o.refund_note ?? ""}</dd>` : ""}</dl>
          <div class="chips" style="margin-top:12px">
            ${canUpdate && o.payment_status !== "paid" ? html`<button class="btn sm" id="mark-paid">✓ ${t("markPaid")}</button>` : ""}
            ${can("orders.refund") && ["paid", "partially_refunded"].includes(o.payment_status) ? html`<button class="btn sm" id="refund">${t("refund")}</button>` : ""}
          </div>
        </div>
      </div>
      <div class="card"><h3>${t("items")}</h3>
        ${d.items.map((i) => html`<div class="item-row">${i.image ? html`<img class="thumb" src="${i.image}" alt="">` : html`<span></span>`}<span><b>${lang() === "bn" ? i.name_bn : i.name_en}</b><br><span class="muted small">${i.sku ? html`SKU ${i.sku} · ` : ""}${i.size} · ${i.color} · ${num(i.quantity)} × ${money(i.unit_price)}</span></span><b>${money(i.line_total)}</b></div>`)}
        <dl class="kv" style="margin-top:10px;justify-content:end"><dt>${t("subtotal")}</dt><dd>${money(o.subtotal)}</dd>${o.discount ? html`<dt>${t("discount")} (${o.coupon_code})</dt><dd>−${money(o.discount)}</dd>` : ""}<dt>${t("deliveryFee")}</dt><dd>${money(o.delivery_fee)}</dd><dt><b>${t("total")}</b></dt><dd style="font-size:1.2rem">${money(o.total)}</dd></dl>
      </div>
      <div class="card"><h3>${t("adminNotes")}</h3><form id="notes"><textarea class="input" name="admin_notes" ${canUpdate ? "" : raw("disabled")}>${o.admin_notes ?? ""}</textarea>${canUpdate ? html`<button class="btn sm" style="margin-top:10px">${t("save")}</button>` : ""}</form></div>
      <div class="grid2">
        <div class="card"><h3>${t("history")}</h3><ul class="history">${d.history.map((h) => html`<li><span><b>${t(`s_${h.status}`)}</b> · ${dt(h.created_at, true)} · <span class="muted">${h.actor}</span>${h.note ? html`<br><span class="small">${h.note}</span>` : ""}</span></li>`)}</ul></div>
        <div class="card" style="margin-top:0"><h3>${t("messages")}</h3>${d.notifications.length ? html`<ul class="history">${d.notifications.map((n) => html`<li><span>${n.channel.toUpperCase()} · ${n.template} · ${pill(n.status === "sent" ? "delivered" : n.status === "failed" ? "failed" : "draft", n.status)}<br><span class="muted small">${dt(n.created_at, true)}${n.error ? ` — ${n.error}` : ""}</span></span></li>`)}</ul>` : html`<p class="muted">—</p>`}</div>
      </div>`,
    footer: html`<button class="btn" id="print-inv">${icon("print")} ${t("printInvoice")}</button><button class="btn" id="print-lbl">${icon("print")} ${t("printLabel")}</button>${canUpdate ? html`<button class="btn" id="resend">${t("sendAgain")}</button>` : ""}${can("orders.delete") && ["cancelled", "returned", "delivered"].includes(o.status) ? html`<button class="btn" id="del">${icon("trash")} ${t("delete")}</button>` : ""}`,
  });
  const onClose = () => { if (location.hash.startsWith("#/orders/")) history.replaceState(null, "", "#/orders"); };
  const done = async (r) => { toast(msg(r) || t("saved")); close(); onClose(); onChange(); };

  $$("[data-next]", panel).forEach((b) => b.addEventListener("click", async () => {
    const next = b.dataset.next;
    if (next === "shipped") return shipDialog(o, done);
    if (!(await confirmDialog(`${t("moveTo")}: "${t(`s_${next}`)}"?`, { danger: ["cancelled", "returned"].includes(next) }))) return;
    try { await done(await api(`/orders/${o.id}/status`, { method: "POST", body: { status: next, notify: true } })); } catch (err) { toast(errMsg(err), "err"); }
  }));
  $("#mark-paid", panel)?.addEventListener("click", async () => {
    const ref = prompt(t("paymentRef"), o.payment_ref ?? "");
    if (ref === null) return;
    try { await done(await api(`/orders/${o.id}`, { method: "PUT", body: { payment_status: "paid", payment_ref: ref } })); } catch (err) { toast(errMsg(err), "err"); }
  });
  $("#refund", panel)?.addEventListener("click", () => refundDialog(o, done));
  $("#notes", panel).addEventListener("submit", async (e) => {
    e.preventDefault();
    try { toast(msg(await api(`/orders/${o.id}`, { method: "PUT", body: { admin_notes: new FormData(e.target).get("admin_notes") } }))); } catch (err) { toast(errMsg(err), "err"); }
  });
  $("#resend", panel)?.addEventListener("click", async () => { try { toast(msg(await api(`/orders/${o.id}/notify`, { method: "POST" }))); } catch (err) { toast(errMsg(err), "err"); } });
  $("#del", panel)?.addEventListener("click", async () => {
    if (!(await confirmDialog(t("confirmDelete", { name: o.order_no })))) return;
    try { await done(await api(`/orders/${o.id}`, { method: "DELETE" })); } catch (err) { toast(errMsg(err), "err"); }
  });
  $("#print-inv", panel).addEventListener("click", () => printDoc(invoiceHtml(d)));
  $("#print-lbl", panel).addEventListener("click", () => printDoc(labelHtml(d)));
  panel.querySelector("[data-close]").addEventListener("click", onClose);
  void body;
}

function shipDialog(o, done) {
  const { panel } = slideOver({
    title: `${t("shipDialog")} — ${o.order_no}`,
    body: html`<form id="ship" novalidate>
      <label class="field"><span>${t("chooseCourier")} *</span><select class="input" name="courier"><option>Steadfast</option><option>Pathao</option><option>RedX</option></select></label>
      <label class="check"><input type="checkbox" name="createConsignment" checked> ${t("bookSteadfast")}</label>
      <label class="field"><span>${t("orEnterTracking")}</span><input class="input" name="trackingId" autocomplete="off"></label>
      <label class="field"><span>${t("note")}</span><input class="input" name="note"></label>
      <label class="check"><input type="checkbox" name="notify" checked> ${t("notifyCustomer")}</label></form>`,
    footer: html`<button class="btn" data-close>${t("cancel")}</button><button class="btn primary" type="submit" form="ship">→ ${t("s_shipped")}</button>`,
  });
  const form = $("#ship", panel);
  const sync = () => { const sf = form.courier.value === "Steadfast"; form.createConsignment.closest("label").hidden = !sf; if (!sf) form.createConsignment.checked = false; };
  form.courier.onchange = sync;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    try {
      await done(await api(`/orders/${o.id}/status`, { method: "POST", body: { status: "shipped", courier: fd.get("courier"), trackingId: fd.get("trackingId") || undefined, createConsignment: Boolean(fd.get("createConsignment")) && !fd.get("trackingId"), note: fd.get("note") || undefined, notify: Boolean(fd.get("notify")) } }));
      panel.querySelector("[data-close]").click();
    } catch (err) { showErrors(form, err); toast(errMsg(err), "err"); }
  });
}

function refundDialog(o, done) {
  const { panel, close } = slideOver({
    title: `${t("refund")} — ${o.order_no}`,
    body: html`<form id="rf" novalidate><label class="field"><span>${t("refundAmount")} *</span><input class="input" type="number" name="amount" min="1" max="${o.total - o.refund_amount}" value="${o.total - o.refund_amount}"></label>
      <label class="field"><span>${t("refundReason")} *</span><textarea class="input" name="note" required></textarea></label></form>`,
    footer: html`<button class="btn" data-close>${t("cancel")}</button><button class="btn danger" type="submit" form="rf">${t("refund")}</button>`,
  });
  $("#rf", panel).addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try { const r = await api(`/orders/${o.id}/refund`, { method: "POST", body: { amount: Number(fd.get("amount")), note: fd.get("note") } }); close(); await done(r); }
    catch (err) { showErrors(e.target, err); toast(errMsg(err), "err"); }
  });
}

function printDoc(content) {
  const area = document.getElementById("print-area");
  area.innerHTML = String(content);
  area.hidden = false;
  window.print();
  setTimeout(() => (area.innerHTML = ""), 500);
}

function invoiceHtml(d) {
  const o = d.order;
  const b = brand;
  return html`<div class="invoice">
    <div style="display:flex;justify-content:space-between;gap:20px"><div><h1 style="margin:0">${b.name.en}</h1><div>${b.location?.street?.en ?? ""}, ${b.location?.city?.en ?? ""}, Bangladesh</div><div>${b.contact?.phone ?? ""} · ${b.contact?.email ?? ""}</div></div>
      <div style="text-align:right"><h2 style="margin:0">INVOICE</h2><div><b>${o.invoice_no ?? o.order_no}</b></div><div>Order: ${o.order_no}</div><div>${new Date(o.created_at).toLocaleDateString("en-GB")}</div></div></div>
    <p style="margin-top:18px"><b>Bill / Ship to:</b><br>${o.customer_name} · ${o.customer_phone}<br>${o.area}, ${o.upazila}, ${o.district}, ${o.division}</p>
    <table><thead><tr><th>Item</th><th>SKU</th><th>Size</th><th>Colour</th><th class="right">Qty</th><th class="right">Price</th><th class="right">Total</th></tr></thead>
      <tbody>${d.items.map((i) => html`<tr><td>${i.name_en}<br><small>${i.name_bn}</small></td><td>${i.sku ?? ""}</td><td>${i.size}</td><td>${i.color}</td><td class="right">${i.quantity}</td><td class="right">৳${i.unit_price}</td><td class="right">৳${i.line_total}</td></tr>`)}</tbody></table>
    <table style="width:280px;margin-left:auto"><tr><td>Subtotal</td><td class="right">৳${o.subtotal}</td></tr>${o.discount ? html`<tr><td>Discount (${o.coupon_code})</td><td class="right">−৳${o.discount}</td></tr>` : ""}<tr><td>Delivery</td><td class="right">৳${o.delivery_fee}</td></tr><tr><td><b>Total</b></td><td class="right"><b>৳${o.total}</b></td></tr>
      <tr><td>Payment</td><td class="right">${o.payment_method} (${o.payment_status})</td></tr>${o.payment_method === "COD" && o.payment_status !== "paid" ? html`<tr><td><b>Collect (COD)</b></td><td class="right"><b>৳${o.total}</b></td></tr>` : ""}</table>
    <p style="margin-top:30px;font-size:12px">Thank you for shopping with ${b.name.en}! Exchange within 3 days of delivery with tags attached. · ধন্যবাদ!</p></div>`;
}

function labelHtml(d) {
  const o = d.order;
  const cod = o.payment_status === "paid" ? 0 : o.total;
  return html`<div class="ship-label"><div style="display:flex;justify-content:space-between"><b>${brand.name.en}</b><span>${o.courier_partner ?? ""} ${o.tracking_id ?? ""}</span></div>
    <hr><div class="big">${o.customer_name}</div><div class="big">${o.customer_phone}</div><div style="margin:6px 0">${o.area}<br>${o.upazila}, ${o.district}</div>
    <hr><div style="display:flex;justify-content:space-between"><span>${o.invoice_no ?? o.order_no}</span><span class="big">COD ৳${cod}</span></div>
    <div style="font-size:11px;margin-top:6px">From: ${brand.name.en}, ${brand.location?.street?.en ?? ""}, ${brand.location?.city?.en ?? ""} · ${brand.contact?.phone ?? ""}</div></div>`;
}
