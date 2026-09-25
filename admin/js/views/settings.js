// System settings: store info, payment methods, customer messages, SEO defaults, analytics, integration status.
import { t, lang } from "../i18n.js";
import { html, raw, icon, api, $, $$, can, toast, msg, errMsg, skeleton, errorState, pill, uploadImage } from "../core.js";

export default async function settings(view) {
  view.innerHTML = String(html`<div class="page-head"><h1>${t("settings")}</h1></div>${skeleton(6)}`);
  let data;
  try { data = await api("/settings"); } catch (e) { view.innerHTML = String(errorState(errMsg(e))); $("[data-retry]", view).onclick = () => settings(view); return; }
  const s = data.settings;
  const ro = !can("settings.manage");
  const dis = ro ? raw("disabled") : "";
  const inp = (sec, key, label, attrs = "") => html`<label class="field"><span>${label}</span><input class="input" data-sec="${sec}" data-key="${key}" value="${s[sec]?.[key] ?? ""}" ${raw(attrs)} ${dis}></label>`;
  const area = (sec, key, label) => html`<label class="field" style="grid-column:1/-1"><span>${label}</span><textarea class="input" rows="2" data-sec="${sec}" data-key="${key}" ${dis}>${s[sec]?.[key] ?? ""}</textarea></label>`;
  const pm = s.payments ?? {};
  const mfs = (k, label) => html`<div class="card" style="padding:16px"><label class="check"><input type="checkbox" data-pay="${k}" data-f="enabled" ${pm[k]?.enabled ? raw("checked") : ""} ${dis}> <b>${label}</b></label>
    ${k === "bkash" ? html`<label class="field"><span>${lang() === "bn" ? "পদ্ধতি" : "Mode"}</span><select class="input" data-pay="${k}" data-f="mode" ${dis}><option value="manual" ${pm[k]?.mode !== "api" ? raw("selected") : ""}>${t("manual")}</option><option value="api" ${pm[k]?.mode === "api" ? raw("selected") : ""}>${t("api")}</option></select></label>` : ""}
    <div class="grid2"><label class="field"><span>${t("number")}</span><input class="input" data-pay="${k}" data-f="manualNumber" value="${pm[k]?.manualNumber ?? ""}" inputmode="tel" ${dis}></label>
    <label class="field"><span>${t("accountType")}</span><select class="input" data-pay="${k}" data-f="accountType" ${dis}>${["Personal", "Agent", "Merchant"].map((x) => html`<option ${pm[k]?.accountType === x ? raw("selected") : ""}>${x}</option>`)}</select></label></div></div>`;
  const I = data.integrations;
  const stat = (ok) => (ok ? pill("active", t("connected")) : pill("inactive", t("notConnected")));

  view.innerHTML = String(html`
    <div class="page-head"><h1>${t("settings")}</h1>${!ro ? html`<button class="btn primary" id="save-all">${t("save")}</button>` : ""}</div>
    <div class="card"><h2>${t("storeInfo")}</h2><div class="grid2">
      ${inp("store", "name_en", "Store name (English)")}${inp("store", "name_bn", "দোকানের নাম (বাংলা)")}
      ${inp("store", "tagline_en", "Tagline (English)")}${inp("store", "tagline_bn", "ট্যাগলাইন (বাংলা)")}
      ${inp("store", "phone", t("phone"), 'inputmode="tel"')}${inp("store", "whatsapp", "WhatsApp (8801XXXXXXXXX)", 'inputmode="tel"')}
      ${inp("store", "email", "Email", 'type="email"')}${inp("store", "hours_en", "Opening hours (English)")}
      ${inp("store", "hours_bn", "খোলার সময় (বাংলা)")}${inp("store", "address_en", "Address (English)")}
      ${inp("store", "address_bn", "ঠিকানা (বাংলা)")}
      ${area("store", "announcement_en", lang() === "bn" ? "ঘোষণা বার (ইংরেজি)" : "Announcement bar (English)")}${area("store", "announcement_bn", lang() === "bn" ? "ঘোষণা বার (বাংলা)" : "Announcement bar (Bangla)")}
    </div></div>
    <div class="card"><h2>${lang() === "bn" ? "ব্র্যান্ডিং ও সোশ্যাল" : "Branding & social"}</h2>
      <p class="muted small">${lang() === "bn" ? "লোগো বদলালে সাথে সাথে পুরো ওয়েবসাইটে দেখাবে। ব্যানার ও অফার বদলাতে: হোমপেজ ব্যানার ও কুপন মেনু।" : "A new logo shows across the website immediately. Change hero/offer banners in Homepage banners and offers in Coupons."}</p>
      <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap;margin-bottom:12px">
        <img id="logo-preview" src="${s.store?.logo_url || ""}" alt="" style="width:88px;height:88px;border-radius:50%;background:#000;object-fit:cover;${s.store?.logo_url ? "" : "display:none"}">
        ${!ro ? html`<label class="btn">${icon("upload")} ${lang() === "bn" ? "লোগো আপলোড" : "Upload logo"}<input type="file" accept="image/*" id="logo-file" hidden></label>` : ""}
      </div>
      <div class="grid2">${inp("store", "logo_url", lang() === "bn" ? "লোগোর লিংক" : "Logo URL")}${inp("store", "facebook_url", "Facebook page URL", 'type="url"')}${inp("store", "instagram_url", "Instagram URL", 'type="url"')}${inp("store", "tiktok_url", "TikTok URL", 'type="url"')}</div>
    </div>
    <div class="card"><h2>${t("paymentsSettings")}</h2>
      <label class="check"><input type="checkbox" data-pay="cod" data-f="enabled" ${pm.cod?.enabled ? raw("checked") : ""} ${dis}> <b>Cash on Delivery</b></label>
      <div class="grid2">${mfs("bkash", "bKash")}${mfs("nagad", "Nagad")}${mfs("rocket", "Rocket")}
        <div class="card" style="padding:16px"><label class="check"><input type="checkbox" data-pay="card" data-f="enabled" ${pm.card?.enabled ? raw("checked") : ""} ${dis}> <b>Card (SSLCommerz)</b></label><p class="small muted">${stat(I.sslcommerz)}</p></div></div>
    </div>
    <div class="card"><h2>${t("notifSettings")}</h2>
      <div class="chips">${["sms", "whatsapp", "email"].map((k) => html`<label class="check" style="margin-right:16px"><input type="checkbox" data-sec="notifications" data-key="${k}" data-bool="1" ${s.notifications?.[k] ? raw("checked") : ""} ${dis}> ${k.toUpperCase()}</label>`)}</div>
      ${inp("notifications", "ownerPhone", lang() === "bn" ? "মালিকের ফোন (নিরাপত্তা সতর্কতার জন্য)" : "Owner phone (for security alerts)")}
      <h3 style="margin-top:12px">${t("smsTemplates")}</h3><p class="muted small">${t("templatesHelp")}</p>
      <div class="grid2">${Object.keys(s.sms_templates ?? {}).map((k) => html`<label class="field"><span>${k} — English</span><textarea class="input" rows="2" data-tpl="${k}" data-lang="en" ${dis}>${s.sms_templates[k].en}</textarea></label><label class="field"><span>${k} — বাংলা</span><textarea class="input" rows="2" data-tpl="${k}" data-lang="bn" ${dis}>${s.sms_templates[k].bn}</textarea></label>`)}</div>
    </div>
    <div class="card"><h2>${t("seoDefaults")}</h2><div class="grid2">${inp("seo", "title_en", "Title (English)")}${inp("seo", "title_bn", "শিরোনাম (বাংলা)")}${area("seo", "description_en", "Description (English)")}${area("seo", "description_bn", "বিবরণ (বাংলা)")}</div></div>
    <div class="card"><h2>Analytics</h2><div class="grid3">${inp("integrations", "ga4", "Google Analytics 4 ID", 'placeholder="G-XXXXXXX"')}${inp("integrations", "metaPixel", "Meta Pixel ID")}${inp("integrations", "cfBeacon", "Cloudflare Web Analytics token")}</div></div>
    <div class="card"><h2>${t("integrations")}</h2><p class="muted small">${t("secretsNote")}</p>
      <table class="table"><tbody>${[["bKash API", I.bkashApi], ["Nagad API", I.nagadApi], ["SSLCommerz (cards)", I.sslcommerz], ["Steadfast courier", I.steadfast], ["SMS gateway", I.sms], ["WhatsApp Cloud API", I.whatsapp], ["Email (Resend)", I.email], ["Turnstile bot protection", I.turnstile], ["R2 image storage", I.r2], ["Workers AI", I.ai]].map(([n, ok]) => html`<tr><td data-label="">${n}</td><td data-label="">${stat(ok)}</td></tr>`)}</tbody></table></div>`);

  $("#logo-file", view)?.addEventListener("change", async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      toast(t("uploading"));
      const r = await uploadImage(f, "branding");
      const inputEl = view.querySelector('[data-sec="store"][data-key="logo_url"]');
      inputEl.value = r.url;
      const img = $("#logo-preview", view);
      img.src = r.url; img.style.display = "";
      toast(lang() === "bn" ? "আপলোড হয়েছে — সংরক্ষণ করুন চাপুন।" : "Uploaded — press Save to publish.");
    } catch (err) { toast(errMsg(err), "err"); }
  });
  $("#save-all", view)?.addEventListener("click", async () => {
    const next = structuredClone(s);
    $$("[data-sec]", view).forEach((el) => { next[el.dataset.sec] ??= {}; next[el.dataset.sec][el.dataset.key] = el.dataset.bool ? el.checked : el.value.trim(); });
    $$("[data-pay]", view).forEach((el) => { next.payments[el.dataset.pay] ??= {}; next.payments[el.dataset.pay][el.dataset.f] = el.type === "checkbox" ? el.checked : el.value.trim(); });
    $$("[data-tpl]", view).forEach((el) => { next.sms_templates[el.dataset.tpl][el.dataset.lang] = el.value; });
    try {
      for (const key of ["store", "payments", "notifications", "sms_templates", "seo", "integrations"]) {
        if (JSON.stringify(next[key]) !== JSON.stringify(s[key])) await api(`/settings/${key}`, { method: "PUT", body: next[key] });
      }
      toast(t("saved"));
      Object.assign(s, next);
    } catch (err) { toast(errMsg(err), "err"); }
  });
  void msg;
}
