import { html, raw, api, me, toast, $, $$, errMsg, showFieldErrors, bindGeo, overlay, wishlist, normalizePhone, turnstile } from "../core.js";
import { t, money, num, date, lang } from "../i18n.js";
import { productCard, bindFavs, emptyState } from "../components.js";

const TABS = [["orders", "myOrders"], ["wishlist", "myWishlist"], ["addresses", "myAddresses"], ["profile", "myProfile"]];

export default async function account(main, { params, navigate }) {
  const tab = params.tab ?? "orders";
  const customer = await me();

  // Guests can still see their locally saved wishlist.
  if (!customer && tab === "wishlist") return guestWishlist(main);
  if (!customer) return authForms(main, navigate, tab === "reset" ? "reset" : "login");

  document.title = t("account");
  main.innerHTML = String(html`<div class="container section">
    <div class="section-head"><div><span class="eyebrow">${t("account")}</span><h1 style="font-size:clamp(1.8rem,5vw,2.6rem)">${customer.name}</h1><p class="muted">${customer.phone}</p></div>
      <button class="btn ghost sm" id="logout">${t("signOut")}</button></div>
    <nav class="acct-tabs">${TABS.map(([k, label]) => html`<a class="chip" href="/account/${k}" aria-pressed="${k === tab}">${t(label)}</a>`)}</nav>
    <div id="tab" class="panel"><div class="skeleton" style="height:120px"></div></div></div>`);
  $("#logout").addEventListener("click", async () => { await api("/auth/logout", { method: "POST" }); await me(true); navigate("/"); });
  const box = $("#tab");
  bindFavs(box);

  if (tab === "orders") {
    const { orders } = await api("/me/orders");
    box.innerHTML = orders.length
      ? String(html`${orders.map((o) => html`<a class="order-row" href="/order/${o.order_no}?token=${o.public_token}">
          ${o.image ? html`<img src="${o.image}" alt="" width="56" height="56" loading="lazy">` : html`<span></span>`}
          <div><b>${o.order_no}</b><div class="muted small">${date(o.created_at)} · ${num(o.item_count)} ${t("items")} · ${o.payment_method}</div></div>
          <div style="text-align:right"><b>${money(o.total)}</b><br><span class="status-pill ${o.status}">${t(`status_${o.status}`)}</span></div></a>`)}`)
      : String(emptyState(t("noOrders"), "", html`<a class="btn" href="/shop">${t("continueShopping")}</a>`));
  }

  if (tab === "wishlist") {
    const { items } = await api("/me/wishlist");
    box.classList.remove("panel");
    box.innerHTML = items.length ? String(html`<div class="product-grid">${items.map((p) => productCard(p))}</div>`) : String(emptyState(t("myWishlist"), t("cartEmptySub"), html`<a class="btn" href="/shop">${t("continueShopping")}</a>`));
  }

  if (tab === "addresses") {
    const load = async () => {
      const { addresses } = await api("/me/addresses");
      box.innerHTML = String(html`${addresses.map((a) => html`<div class="address-card"><b>${a.label}</b> ${a.is_default ? html`<span class="status-pill">${t("default")}</span>` : ""}
        <p style="margin:.3em 0" class="small">${a.recipient_name} · ${a.phone}<br>${a.area}, ${a.upazila}, ${a.district}</p>
        <button class="btn ghost sm" data-edit="${a.id}">${t("edit")}</button> <button class="btn ghost sm" data-del="${a.id}">${t("delete")}</button></div>`)}
        <button class="btn" id="add-addr">${t("addAddress")}</button>`);
      $("#add-addr").onclick = () => addressForm(null, load);
      $$("[data-edit]", box).forEach((b) => (b.onclick = () => addressForm(addresses.find((a) => a.id === Number(b.dataset.edit)), load)));
      $$("[data-del]", box).forEach((b) => (b.onclick = async () => {
        if (!confirm(t("confirmDelete"))) return;
        await api(`/me/addresses/${b.dataset.del}`, { method: "DELETE" });
        toast(t("saved")); load();
      }));
    };
    await load();
  }

  if (tab === "profile") {
    box.innerHTML = String(html`<form id="profile" style="max-width:520px" novalidate>
      <label class="field"><span>${t("fullName")}</span><input class="input" name="name" required value="${customer.name}"></label>
      <label class="field"><span>${t("emailOptional")}</span><input class="input" type="email" name="email" value="${customer.email ?? ""}"></label>
      <fieldset style="border:1px solid var(--c-line);border-radius:12px;padding:12px 14px 0;margin:0 0 14px"><legend class="small">${t("changePassword")}</legend>
        <label class="field"><span>${t("currentPassword")}</span><input class="input" type="password" name="currentPassword" autocomplete="current-password"></label>
        <label class="field"><span>${t("newPassword")}</span><input class="input" type="password" name="newPassword" minlength="8" autocomplete="new-password"></label></fieldset>
      <button class="btn">${t("save")}</button></form>`);
    $("#profile").addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await api("/me", { method: "PUT", body: { name: fd.get("name"), email: fd.get("email"), currentPassword: fd.get("currentPassword") || undefined, newPassword: fd.get("newPassword") || undefined } });
        toast(t("saved")); await me(true);
      } catch (err) { showFieldErrors(e.target, err); toast(errMsg(err), "error"); }
    });
  }
}

function addressForm(a, done) {
  const { panel, close } = overlay("modal", {
    title: a ? t("editAddress") : t("addAddress"),
    body: html`<form id="addr" novalidate>
      <label class="field"><span>${t("label")}</span><input class="input" name="label" value="${a?.label ?? "Home"}"></label>
      <div class="grid-2"><label class="field"><span>${t("recipient")}</span><input class="input" name="recipient_name" required value="${a?.recipient_name ?? ""}"></label>
      <label class="field"><span>${t("mobile")}</span><input class="input" name="phone" required inputmode="tel" value="${a?.phone ?? ""}"></label></div>
      <div class="grid-2"><label class="field"><span>${t("division")}</span><select class="input" name="division_id" required></select></label>
      <label class="field"><span>${t("district")}</span><select class="input" name="district_id" required></select></label></div>
      <label class="field"><span>${t("upazila")}</span><select class="input" name="upazila_id" required></select></label>
      <label class="field"><span>${t("area")}</span><textarea class="input" name="area" required>${a?.area ?? ""}</textarea></label>
      <label style="display:flex;gap:10px;align-items:center;min-height:44px"><input type="checkbox" name="is_default" ${a?.is_default ? raw("checked") : ""} style="width:20px;height:20px"> ${t("makeDefault")}</label>
      <button class="btn block" style="margin-top:10px">${t("save")}</button></form>`,
  });
  const form = $("#addr", panel);
  let sel = null;
  bindGeo(form, a ?? {}, (x) => (sel = x));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    if (!sel) return showFieldErrors(form, { data: { fields: [{ field: "upazila_id", en: t("required"), bn: t("required") }] } });
    try {
      await api(a ? `/me/addresses/${a.id}` : "/me/addresses", { method: a ? "PUT" : "POST", body: { ...sel, label: fd.get("label"), recipient_name: fd.get("recipient_name"), phone: normalizePhone(fd.get("phone")) ?? fd.get("phone"), area: fd.get("area"), is_default: fd.get("is_default") ? 1 : 0 } });
      toast(t("saved")); close(); done();
    } catch (err) { showFieldErrors(form, err); toast(errMsg(err), "error"); }
  });
}

async function guestWishlist(main) {
  const ids = [...wishlist.ids()];
  main.innerHTML = String(html`<div class="container section"><h1>${t("myWishlist")}</h1><div id="wl"></div><p class="muted small" style="margin-top:20px"><a href="/account" style="text-decoration:underline">${t("signIn")}</a> — ${lang() === "bn" ? "সব ডিভাইসে তালিকা রাখতে" : "to keep your list on every device"}</p></div>`);
  bindFavs(main);
  if (!ids.length) { $("#wl").innerHTML = String(emptyState(t("myWishlist"), t("cartEmptySub"), html`<a class="btn" href="/shop">${t("continueShopping")}</a>`)); return; }
  const r = await api(`/products?ids=${ids.join(",")}&limit=48`).catch(() => ({ items: [] }));
  $("#wl").innerHTML = String(html`<div class="product-grid">${r.items.map((p) => productCard(p))}</div>`);
}

async function authForms(main, navigate, mode) {
  document.title = t("signIn");
  main.innerHTML = String(html`<div class="container section"><div class="panel auth-card">
    <div class="acct-tabs" role="tablist"><button class="chip" data-mode="login" aria-pressed="${mode === "login"}">${t("signIn")}</button><button class="chip" data-mode="register" aria-pressed="${mode === "register"}">${t("register")}</button></div>
    <div id="auth"></div></div></div>`);
  const draw = async (m) => {
    $$("[data-mode]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === m)));
    const box = $("#auth");
    if (m === "reset") {
      box.innerHTML = String(html`<h2>${t("resetPassword")}</h2><form id="r1" novalidate><label class="field"><span>${t("mobile")}</span><input class="input" name="phone" inputmode="tel" required></label><button class="btn block">${t("sendCode")}</button></form>
        <form id="r2" hidden novalidate style="margin-top:16px"><label class="field"><span>${t("smsCode")}</span><input class="input" name="code" inputmode="numeric" maxlength="6" required autocomplete="one-time-code"></label>
        <label class="field"><span>${t("newPassword")}</span><input class="input" type="password" name="password" minlength="8" required autocomplete="new-password"></label><button class="btn block">${t("save")}</button></form>`);
      let phone = "";
      $("#r1").onsubmit = async (e) => {
        e.preventDefault();
        phone = normalizePhone(new FormData(e.target).get("phone"));
        if (!phone) return showFieldErrors(e.target, { data: { fields: [{ field: "phone", en: t("invalidPhone"), bn: t("invalidPhone") }] } });
        try { const r = await api("/auth/reset/request", { method: "POST", body: { phone } }); toast(r[lang()]); $("#r2").hidden = false; } catch (err) { toast(errMsg(err), "error"); }
      };
      $("#r2").onsubmit = async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        try { const r = await api("/auth/reset/confirm", { method: "POST", body: { phone, code: fd.get("code"), password: fd.get("password") } }); toast(r[lang()]); draw("login"); } catch (err) { showFieldErrors(e.target, err); toast(errMsg(err), "error"); }
      };
      return;
    }
    const isReg = m === "register";
    box.innerHTML = String(html`<form id="af" novalidate>
      ${isReg ? html`<label class="field"><span>${t("fullName")}</span><input class="input" name="name" required autocomplete="name"></label>` : ""}
      <label class="field"><span>${t("mobile")}</span><input class="input" name="phone" required inputmode="tel" autocomplete="tel" placeholder="01XXXXXXXXX"></label>
      ${isReg ? html`<label class="field"><span>${t("emailOptional")}</span><input class="input" type="email" name="email" autocomplete="email"></label>` : ""}
      <label class="field"><span>${t("password")}</span><input class="input" type="password" name="password" required minlength="${isReg ? 8 : 1}" autocomplete="${isReg ? "new-password" : "current-password"}">${isReg ? html`<small class="muted">${t("passwordHint")}</small>` : ""}</label>
      <div id="ts"></div>
      <button class="btn block">${isReg ? t("register") : t("signIn")}</button>
      ${!isReg ? html`<p style="text-align:center;margin-top:12px"><button type="button" class="btn ghost sm" id="forgot">${t("forgotPassword")}</button></p>` : ""}</form>`);
    const getToken = await turnstile($("#ts")).catch(() => async () => undefined);
    $("#forgot")?.addEventListener("click", () => draw("reset"));
    $("#af").onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const phone = normalizePhone(fd.get("phone"));
      if (!phone) return showFieldErrors(e.target, { data: { fields: [{ field: "phone", en: t("invalidPhone"), bn: t("invalidPhone") }] } });
      try {
        await api(isReg ? "/auth/register" : "/auth/login", { method: "POST", body: { name: fd.get("name") ?? undefined, phone, email: fd.get("email") ?? undefined, password: fd.get("password"), turnstileToken: await getToken() } });
        await me(true);
        await wishlist.sync();
        navigate("/account");
      } catch (err) { showFieldErrors(e.target, err); toast(errMsg(err), "error"); }
    };
  };
  $$("[data-mode]").forEach((b) => b.addEventListener("click", () => draw(b.dataset.mode)));
  draw(mode);
}
