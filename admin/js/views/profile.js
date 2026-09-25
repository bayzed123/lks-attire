import { t, lang } from "../i18n.js";
import { html, api, $, session, toast, msg, errMsg, showErrors } from "../core.js";

export default function profile(view) {
  const a = session.admin;
  view.innerHTML = String(html`<div class="page-head"><h1>${t("profile")}</h1></div>
    <form class="card" id="pf" style="max-width:560px" novalidate>
      <label class="field"><span>${lang() === "bn" ? "নাম" : "Name"}</span><input class="input" name="name" value="${a.name}" required></label>
      <label class="field"><span>${t("email")}</span><input class="input" value="${a.email}" disabled></label>
      <label class="field"><span>${t("phone")}</span><input class="input" name="phone" inputmode="tel"></label>
      <label class="field"><span>${t("currentPassword")}</span><input class="input" type="password" name="currentPassword" autocomplete="current-password"></label>
      <label class="field"><span>${t("newPassword")}</span><input class="input" type="password" name="newPassword" minlength="10" autocomplete="new-password"></label>
      <button class="btn primary">${t("save")}</button></form>`);
  $("#pf", view).addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const r = await api("/auth/me", { method: "PUT", body: { name: fd.get("name"), phone: fd.get("phone") || undefined, currentPassword: fd.get("currentPassword") || undefined, newPassword: fd.get("newPassword") || undefined } });
      session.admin.name = fd.get("name");
      toast(msg(r));
      e.target.reset();
    } catch (err) { showErrors(e.target, err); toast(errMsg(err), "err"); }
  });
}
