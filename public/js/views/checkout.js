import { html, raw, icon, api, config, cart, toast, $, $$, errMsg, bindGeo, bindAreaSearch, me, normalizePhone, showFieldErrors, turnstile, debounce } from "../core.js";
import { t, money, num, lang, L } from "../i18n.js";
import { emptyState } from "../components.js";

export default async function checkoutView(main, ctx) {
  return ctx.variant === "cart" ? cartPage(main, ctx) : checkoutPage(main, ctx);
}

const lineName = (i) => (lang() === "bn" ? i.name_bn : i.name_en);

async function quoteCart(address, coupon) {
  const items = cart.items().map((i) => ({ variantId: i.variantId, quantity: i.quantity }));
  return api("/cart/quote", { method: "POST", body: { items, address: address ? { district_id: address.district_id, upazila_id: address.upazila_id } : undefined, couponCode: coupon || undefined } });
}

function totalsHtml(q, { showDelivery = true } = {}) {
  return html`<div class="totals">
    <div><span>${t("subtotal")}</span><b>${money(q.subtotal)}</b></div>
    ${q.discount ? html`<div style="color:var(--c-success)"><span>${t("discount")} (${q.couponCode})</span><b>−${money(q.discount)}</b></div>` : ""}
    ${showDelivery ? html`<div><span>${t("delivery")}</span><b>${q.deliveryFee === 0 ? t("free") : money(q.deliveryFee)}</b></div>` : html`<div class="muted"><span>${t("delivery")}</span><span>${t("deliveryCalc")}</span></div>`}
    <div class="grand"><span>${t("total")}</span><span>${money(showDelivery ? q.total : q.subtotal - q.discount)}</span></div></div>`;
}

// Reconcile local cart with server prices/stock (e.g. a price changed or an item sold out).
function reconcile(q) {
  for (const l of q.lines) {
    const local = cart.items().find((i) => i.variantId === l.variantId);
    if (local && local.unitPrice !== l.unitPrice) {
      const items = cart.items().map((i) => (i.variantId === l.variantId ? { ...i, unitPrice: l.unitPrice } : i));
      localStorage.setItem("lks_cart_v1", JSON.stringify(items));
    }
  }
}

async function cartPage(main) {
  document.title = t("yourCart");
  const render = async () => {
    const items = cart.items();
    if (!items.length) {
      main.innerHTML = String(html`<div class="container">${emptyState(t("cartEmpty"), t("cartEmptySub"), html`<a class="btn" href="/shop">${t("continueShopping")}</a>`)}</div>`);
      return;
    }
    main.innerHTML = String(html`<div class="container section"><h1>${t("yourCart")}</h1><div class="two-col">
      <div class="panel">${items.map((i) => html`<div class="line">
        <a href="/product/${i.slug}"><img src="${i.image}" alt="" width="72" height="96" loading="lazy"></a>
        <div><a href="/product/${i.slug}"><b>${lineName(i)}</b></a><div class="meta">${i.size} · ${i.color}</div>
          <div style="display:flex;gap:12px;align-items:center;margin-top:8px"><div class="qty"><button type="button" data-dec="${i.variantId}" aria-label="-">−</button><span>${num(i.quantity)}</span><button type="button" data-inc="${i.variantId}" aria-label="+">+</button></div>
          <button class="remove" type="button" data-remove="${i.variantId}">${t("remove")}</button></div></div>
        <b>${money(i.unitPrice * i.quantity)}</b></div>`)}</div>
      <aside class="panel summary"><h2>${t("orderSummary")}</h2>
        <form id="coupon" style="display:flex;gap:8px;margin-bottom:8px"><label class="sr-only" for="cc">${t("couponCode")}</label><input class="input" id="cc" name="code" placeholder="${t("couponCode")}" value="${cart.coupon()}" autocapitalize="characters"><button class="btn soft">${t("applyCoupon")}</button></form>
        <div id="totals"><div class="skeleton sk-line"></div></div>
        <a class="btn block" href="/checkout">${t("proceedCheckout")}</a>
        <a class="btn ghost block" href="/shop" style="margin-top:8px">${t("continueShopping")}</a></aside></div></div>`);
    try {
      const q = await quoteCart(null, cart.coupon());
      reconcile(q);
      $("#totals").innerHTML = String(totalsHtml(q, { showDelivery: false }));
    } catch (e) {
      if (e.data?.code === "coupon") { cart.setCoupon(""); toast(errMsg(e), "error"); return render(); }
      $("#totals").innerHTML = String(html`<p class="error-box">${errMsg(e)}</p>`);
    }
  };
  main.onclick = (e) => {
    const inc = e.target.closest("[data-inc]"), dec = e.target.closest("[data-dec]"), rm = e.target.closest("[data-remove]");
    const find = (id) => cart.items().find((i) => i.variantId === Number(id));
    if (inc) cart.setQty(Number(inc.dataset.inc), find(inc.dataset.inc).quantity + 1);
    if (dec) cart.setQty(Number(dec.dataset.dec), find(dec.dataset.dec).quantity - 1);
    if (rm) cart.remove(Number(rm.dataset.remove));
    if (inc || dec || rm) render();
  };
  main.onsubmit = (e) => {
    if (e.target.id !== "coupon") return;
    e.preventDefault();
    cart.setCoupon(new FormData(e.target).get("code").trim().toUpperCase());
    render().then(() => cart.coupon() && toast(t("couponApplied")));
  };
  await render();
}

async function checkoutPage(main, { navigate, query }) {
  document.title = t("checkout");
  if (!cart.items().length) {
    main.innerHTML = String(html`<div class="container">${emptyState(t("cartEmpty"), t("cartEmptySub"), html`<a class="btn" href="/shop">${t("continueShopping")}</a>`)}</div>`);
    return;
  }
  const [cfg, customer] = await Promise.all([config(), me()]);
  const saved = customer ? await api("/me/addresses").then((r) => r.addresses).catch(() => []) : [];
  const pm = cfg.payments;
  const methods = [
    ["COD", "payCod", "payCodSub", "cod"],
    ["bKash", "payBkash", pm.bKash.mode === "api" ? "payBkashApiSub" : "payMfsSub", "bkash"],
    ["Nagad", "payNagad", "payMfsSub", "nagad"],
    ["Rocket", "payRocket", "payMfsSub", "rocket"],
    ["Card", "payCard", "payCardSub", "card"],
  ].filter(([k]) => pm[k]?.enabled);
  let address = null;
  let quote = null;

  main.innerHTML = String(html`<div class="container section"><h1>${t("checkout")}</h1>
    ${query.get("payment") === "failed" ? html`<p class="error-box">${t("paymentFailed")}</p>` : ""}
    <form id="co" class="two-col" novalidate>
      <div>
        <section class="panel"><h2><span class="step-num">${num(1)}</span>${t("contactDetails")}</h2>
          <div class="grid-2">
            <label class="field"><span>${t("fullName")} *</span><input class="input" name="name" required maxlength="80" autocomplete="name" value="${customer?.name ?? ""}"></label>
            <label class="field"><span>${t("mobile")} *</span><input class="input" name="phone" required inputmode="tel" autocomplete="tel" placeholder="01XXXXXXXXX" value="${customer?.phone ?? ""}"><small class="muted">${t("mobileHint")}</small></label>
          </div>
          <label class="field"><span>${t("emailOptional")}</span><input class="input" name="email" type="email" autocomplete="email" value="${customer?.email ?? ""}"></label>
        </section>
        <section class="panel"><h2><span class="step-num">${num(2)}</span>${t("deliveryAddress")}</h2>
          ${saved.length ? html`<div class="chips" style="margin-bottom:14px" aria-label="${t("savedAddresses")}">${saved.map((a, i) => html`<button type="button" class="chip" data-saved="${i}">${a.label}: ${a.area.slice(0, 24)}…</button>`)}</div>` : ""}
          <div class="area-search"><label class="field" style="margin:0"><span>${t("findArea")}</span><input class="input" id="area-q" type="search" autocomplete="off" inputmode="search" placeholder="${t("findAreaHint")}" aria-controls="area-results"></label><div class="area-results" id="area-results" role="listbox" hidden></div></div>
          <div class="grid-2">
            <label class="field"><span>${t("division")} *</span><select class="input" name="division_id" required></select></label>
            <label class="field"><span>${t("district")} *</span><select class="input" name="district_id" required disabled></select></label>
          </div>
          <label class="field"><span>${t("upazila")} *</span><select class="input" name="upazila_id" required disabled></select></label>
          <div class="zone-note" id="zone" hidden></div>
          <label class="field"><span>${t("area")} *</span><textarea class="input" name="area" required maxlength="300" placeholder="${t("areaHint")}" autocomplete="street-address"></textarea></label>
        </section>
        <section class="panel"><h2><span class="step-num">${num(3)}</span>${t("payment")}</h2>
          <div class="pay-opts">${methods.map(([k, label, sub, cls], i) => html`<label class="pay-opt"><input type="radio" name="paymentMethod" value="${k}" ${i === 0 ? raw("checked") : ""}><span><b>${t(label)}</b><span class="muted small">${t(sub)}</span></span><span class="pay-logo ${cls}">${k === "COD" ? "COD" : k}</span></label>`)}</div>
          <div id="mfs"></div>
          <label class="field" style="margin-top:14px"><span>${t("orderNote")}</span><textarea class="input" name="note" maxlength="500" placeholder="${t("orderNoteHint")}"></textarea></label>
          <div id="ts"></div>
        </section>
      </div>
      <aside class="panel summary"><h2>${t("orderSummary")}</h2>
        <div id="lines">${cart.items().map((i) => html`<div class="line"><img src="${i.image}" alt="" width="72" height="96" loading="lazy"><div><b>${lineName(i)}</b><div class="meta">${i.size} · ${i.color} · ×${num(i.quantity)}</div></div><b>${money(i.unitPrice * i.quantity)}</b></div>`)}</div>
        <div style="display:flex;gap:8px;margin-top:12px"><label class="sr-only" for="cc2">${t("couponCode")}</label><input class="input" id="cc2" name="couponCode" placeholder="${t("couponCode")}" value="${cart.coupon()}" autocapitalize="characters"><button class="btn soft" type="button" id="apply-coupon">${t("applyCoupon")}</button></div>
        <div id="totals"><div class="skeleton sk-line"></div></div>
        <button class="btn block" id="place" type="submit">${t("placeOrder")}</button>
        <p class="muted small" style="margin-top:10px">${t("agreeText")} <a href="/policy/returns" style="text-decoration:underline">${t("returnsPolicy")}</a></p>
      </aside>
    </form></div>`);

  const form = $("#co");
  const refresh = async () => {
    try {
      quote = await quoteCart(address, cart.coupon());
      reconcile(quote);
      $("#totals").innerHTML = String(totalsHtml(quote, { showDelivery: Boolean(address) }));
      if (address) {
        const z = cfg.zones.find((x) => x.code === quote.zone.code);
        $("#zone").hidden = false;
        $("#zone").textContent = t("deliveringTo", { zone: L(quote.zone, "name"), eta: L(quote.zone, "eta") }) + (z?.free_shipping_min ? ` · ${t("freeDeliveryOver", { amount: money(z.free_shipping_min) })}` : "");
      }
      renderMfs();
    } catch (e) {
      if (e.data?.code === "coupon") { cart.setCoupon(""); $("#cc2").value = ""; toast(errMsg(e), "error"); return refresh(); }
      $("#totals").innerHTML = String(html`<p class="error-box">${errMsg(e)}</p>`);
    }
  };
  const geoCtl = await bindGeo(form, {}, (a) => { address = a; refresh(); });
  bindAreaSearch($("#area-q"), $("#area-results"), geoCtl);
  $$("[data-saved]").forEach((b) => b.addEventListener("click", () => {
    const a = saved[Number(b.dataset.saved)];
    form.elements.area.value = a.area;
    form.elements.name.value ||= a.recipient_name;
    form.elements.phone.value ||= a.phone;
    geoCtl.set(a);
  }));
  const def = saved.find((a) => a.is_default);
  if (def) { form.elements.area.value = def.area; geoCtl.set(def); }

  function renderMfs() {
    const m = form.elements.paymentMethod.value;
    const info = pm[m];
    const box = $("#mfs");
    if (["bKash", "Nagad", "Rocket"].includes(m) && info.mode === "manual") {
      const amount = quote ? money(address ? quote.total : quote.subtotal - quote.discount) : "";
      box.innerHTML = String(html`<div class="mfs-box"><ol>
        <li>${t("mfsStep1", { method: t({ bKash: "payBkash", Nagad: "payNagad", Rocket: "payRocket" }[m]) })}</li>
        <li>${t("mfsStep2", { amount, number: info.number, type: info.accountType })}</li>
        <li>${t("mfsStep3")}</li></ol>
        <label class="field" style="margin:0"><span>${t("trxId")} *</span><input class="input" name="paymentRef" required maxlength="60" autocomplete="off" style="text-transform:uppercase"></label></div>`);
    } else box.innerHTML = "";
  }
  form.addEventListener("change", (e) => { if (e.target.name === "paymentMethod") renderMfs(); });
  $("#apply-coupon").addEventListener("click", () => { cart.setCoupon($("#cc2").value.trim().toUpperCase()); refresh().then(() => cart.coupon() && toast(t("couponApplied"))); });
  const getToken = await turnstile($("#ts")).catch(() => async () => undefined);
  await refresh();

  form.addEventListener("input", debounce((e) => e.target.classList?.remove("invalid"), 50));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    // Client-side checks for instant feedback; the server validates everything again.
    const errs = [];
    if (!String(fd.get("name")).trim()) errs.push({ field: "name", en: t("required"), bn: t("required") });
    if (!normalizePhone(fd.get("phone"))) errs.push({ field: "phone", en: t("invalidPhone"), bn: t("invalidPhone") });
    if (!address) errs.push({ field: "upazila_id", en: t("required"), bn: t("required") });
    if (!String(fd.get("area")).trim()) errs.push({ field: "area", en: t("required"), bn: t("required") });
    if (form.elements.paymentRef && !String(fd.get("paymentRef")).trim()) errs.push({ field: "paymentRef", en: t("required"), bn: t("required") });
    if (errs.length) return showFieldErrors(form, { data: { fields: errs } });

    const btn = $("#place");
    btn.disabled = true;
    btn.innerHTML = String(html`<span class="spinner"></span> ${t("placingOrder")}`);
    try {
      const r = await api("/orders", {
        method: "POST",
        body: {
          customer: { name: fd.get("name"), phone: normalizePhone(fd.get("phone")), email: fd.get("email") || "" },
          address: { ...address, area: String(fd.get("area")).trim() },
          items: cart.items().map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
          couponCode: cart.coupon() || undefined,
          paymentMethod: fd.get("paymentMethod"),
          paymentRef: fd.get("paymentRef") ? String(fd.get("paymentRef")).trim().toUpperCase() : undefined,
          note: fd.get("note") || undefined,
          lang: lang(),
          turnstileToken: await getToken(),
        },
      });
      cart.clear();
      cart.setCoupon("");
      try { sessionStorage.setItem(`lks_order_${r.orderNo}`, r.token); } catch { /* ignore */ }
      if (r.redirectUrl) location.href = r.redirectUrl;
      else navigate(`/order/${r.orderNo}?token=${encodeURIComponent(r.token)}&new=1`);
    } catch (err) {
      showFieldErrors(form, err);
      toast(errMsg(err), "error", 6000);
      btn.disabled = false;
      btn.textContent = t("placeOrder");
    }
  });
  void icon;
}
