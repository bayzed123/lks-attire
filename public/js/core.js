// Shared storefront helpers: safe HTML templating, API client, cart, wishlist, overlays, BD geo data.
import { t, lang } from "./i18n.js";

// ---------- Safe templating (auto-escapes every interpolated value) ----------
const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ESC[c]);
class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Raw(String(s));
export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((v, i) => {
    out += Array.isArray(v) ? v.map((x) => (x instanceof Raw ? x.s : esc(x))).join("") : v instanceof Raw ? v.s : v === false || v == null ? "" : esc(v);
    out += strings[i + 1];
  });
  return new Raw(out);
}
export const icon = (name, cls = "icon") => raw(`<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`);
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ---------- API ----------
export class ApiErr extends Error {
  constructor(status, data) {
    super(data?.[lang()] || data?.en || `HTTP ${status}`);
    this.status = status;
    this.data = data;
  }
}
export async function api(path, { method = "GET", body, signal } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    signal,
    credentials: "same-origin",
    headers: { "x-requested-with": "fetch", ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiErr(res.status, data);
  return data;
}
export const errMsg = (e) => (e instanceof ApiErr ? e.message : t("somethingWrong"));

// ---------- Store config (brand + settings), cached for the session ----------
let configPromise;
export const config = () => (configPromise ??= api("/config"));

// ---------- Cart (localStorage; prices are always re-checked by the server) ----------
const CART_KEY = "lks_cart_v1";
const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };
export const cart = {
  items: () => read(CART_KEY, []),
  count: () => cart.items().reduce((s, i) => s + i.quantity, 0),
  add(item, qty = 1) {
    const items = cart.items();
    const found = items.find((i) => i.variantId === item.variantId);
    if (found) found.quantity = Math.min(20, found.quantity + qty);
    else items.push({ ...item, quantity: Math.min(20, qty) });
    write(CART_KEY, items);
    emit();
  },
  setQty(variantId, qty) {
    const items = cart.items().map((i) => (i.variantId === variantId ? { ...i, quantity: Math.max(1, Math.min(20, qty)) } : i));
    write(CART_KEY, items);
    emit();
  },
  remove(variantId) { write(CART_KEY, cart.items().filter((i) => i.variantId !== variantId)); emit(); },
  clear() { write(CART_KEY, []); emit(); },
  coupon: () => read("lks_coupon", ""),
  setCoupon: (c) => { write("lks_coupon", c || ""); },
};
function emit() { document.dispatchEvent(new CustomEvent("cart:change")); }

// ---------- Customer session + wishlist ----------
let mePromise;
export const me = (refresh = false) => {
  if (refresh || !mePromise) mePromise = api("/session").then((r) => r.customer).catch(() => null);
  return mePromise;
};
const WL_KEY = "lks_wishlist";
export const wishlist = {
  ids: () => new Set(read(WL_KEY, [])),
  async toggle(productId) {
    const ids = wishlist.ids();
    const on = !ids.has(productId);
    on ? ids.add(productId) : ids.delete(productId);
    write(WL_KEY, [...ids]);
    if (await me()) await api(`/me/wishlist/${productId}`, { method: on ? "POST" : "DELETE" }).catch(() => {});
    return on;
  },
  async sync() {
    const c = await me();
    if (!c) return;
    const local = read(WL_KEY, []);
    const r = await api("/me/wishlist").catch(() => ({ items: [] }));
    const merged = new Set([...local, ...r.items.map((p) => p.id)]);
    for (const id of local) if (!r.items.some((p) => p.id === id)) api(`/me/wishlist/${id}`, { method: "POST" }).catch(() => {});
    write(WL_KEY, [...merged]);
  },
};

// ---------- Toasts ----------
export function toast(message, type = "success", ms = 3200) {
  const box = document.getElementById("toasts");
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  box.append(el);
  setTimeout(() => el.remove(), ms);
}

// ---------- Drawer & modal (focus-trapped, Esc to close) ----------
export function overlay(kind, { title, body, footer, onClose } = {}) {
  const root = document.getElementById("overlay-root");
  const scrim = document.createElement("div");
  scrim.className = "scrim";
  const panel = document.createElement(kind === "drawer" ? "aside" : "div");
  panel.className = kind;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-label", title);
  panel.innerHTML = String(html`<header><h3>${title}</h3><button class="icon-btn" data-close aria-label="${t("cancel")}">${icon("close")}</button></header><div class="content">${body ?? ""}</div>${footer ? html`<footer>${footer}</footer>` : ""}`);
  const prevFocus = document.activeElement;
  const close = () => {
    scrim.classList.remove("show");
    panel.classList.remove("show");
    document.removeEventListener("keydown", onKey);
    setTimeout(() => { scrim.remove(); panel.remove(); }, 250);
    document.body.style.overflow = "";
    prevFocus?.focus?.();
    onClose?.();
  };
  const onKey = (e) => {
    if (e.key === "Escape") close();
    if (e.key === "Tab") {
      const f = $$("a[href], button:not([disabled]), input, select, textarea", panel).filter((x) => x.offsetParent);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f.at(-1).focus(); }
      else if (!e.shiftKey && document.activeElement === f.at(-1)) { e.preventDefault(); f[0].focus(); }
    }
  };
  scrim.addEventListener("click", close);
  panel.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) close(); });
  document.addEventListener("keydown", onKey);
  root.append(scrim, panel);
  document.body.style.overflow = "hidden";
  requestAnimationFrame(() => { scrim.classList.add("show"); panel.classList.add("show"); panel.querySelector("[data-close]")?.focus(); });
  return { panel, close };
}

// ---------- Bangladesh Division → District → Upazila data ----------
let geoPromise;
export const geo = () =>
  (geoPromise ??= fetch("/data/bd-geo.json").then((r) => r.json()).then((d) => ({
    divisions: d.divisions.map(([id, en, bn]) => ({ id, en, bn })),
    districts: d.districts.map(([id, div, en, bn]) => ({ id, div, en, bn })),
    upazilas: d.upazilas.map(([id, dist, en, bn]) => ({ id, dist, en, bn })),
  })));

/** Wires three <select>s into a dependent cascade and calls onChange with the full selection. */
export async function bindGeo(form, initial = {}, onChange = () => {}) {
  const g = await geo();
  const div = form.elements.division_id, dis = form.elements.district_id, upa = form.elements.upazila_id;
  const L = (x) => (lang() === "bn" ? x.bn : x.en);
  const opts = (list, sel) => `<option value="">${esc(t("choose"))}</option>` + list.map((x) => `<option value="${x.id}"${x.id === sel ? " selected" : ""}>${esc(L(x))}</option>`).join("");
  const sortBy = (a, b) => L(a).localeCompare(L(b), lang() === "bn" ? "bn" : "en");
  div.innerHTML = opts([...g.divisions].sort(sortBy), initial.division_id);
  const fillDistricts = (sel) => { dis.innerHTML = opts(g.districts.filter((d) => d.div === +div.value).sort(sortBy), sel); dis.disabled = !div.value; };
  const fillUpazilas = (sel) => { upa.innerHTML = opts(g.upazilas.filter((u) => u.dist === +dis.value).sort(sortBy), sel); upa.disabled = !dis.value; };
  fillDistricts(initial.district_id);
  fillUpazilas(initial.upazila_id);
  const current = () => {
    const d1 = g.divisions.find((x) => x.id === +div.value), d2 = g.districts.find((x) => x.id === +dis.value), d3 = g.upazilas.find((x) => x.id === +upa.value);
    return d1 && d2 && d3 ? { division_id: d1.id, district_id: d2.id, upazila_id: d3.id, division: d1.en, district: d2.en, upazila: d3.en } : null;
  };
  div.addEventListener("change", () => { fillDistricts(); fillUpazilas(); onChange(null); });
  dis.addEventListener("change", () => { fillUpazilas(); onChange(null); });
  upa.addEventListener("change", () => onChange(current()));
  if (initial.upazila_id) onChange(current());
  return { current, set: (a) => { div.value = a.division_id; fillDistricts(a.district_id); fillUpazilas(a.upazila_id); onChange(current()); } };
}

export const normalizePhone = (v) => {
  const d = String(v).replace(/[^\d]/g, "").replace(/^(?:00)?880/, "0");
  return /^01[3-9]\d{8}$/.test(d) ? d : null;
};

/** Shows server-side field errors next to inputs. */
export function showFieldErrors(form, e) {
  $$(".field-error", form).forEach((x) => x.remove());
  $$(".invalid", form).forEach((x) => x.classList.remove("invalid"));
  const fields = e?.data?.fields ?? [];
  for (const f of fields) {
    const name = f.field.split(".").at(-1);
    const input = form.querySelector(`[name="${CSS.escape(name)}"]`);
    if (!input) continue;
    input.classList.add("invalid");
    input.setAttribute("aria-invalid", "true");
    const s = document.createElement("span");
    s.className = "field-error";
    s.textContent = f[lang()] || f.en;
    input.after(s);
  }
  (form.querySelector(".invalid") ?? null)?.focus();
}

export function debounce(fn, ms = 300) {
  let h;
  return (...a) => { clearTimeout(h); h = setTimeout(() => fn(...a), ms); };
}

/** Loads Cloudflare Turnstile only if a site key is configured. Returns a function that yields a token. */
export async function turnstile(container) {
  const cfg = await config();
  if (!cfg.turnstileSiteKey) return async () => undefined;
  if (!window.turnstile) {
    await new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.onload = res; s.onerror = rej;
      document.head.append(s);
    });
  }
  const id = window.turnstile.render(container, { sitekey: cfg.turnstileSiteKey, language: lang() });
  return async () => window.turnstile.getResponse(id);
}

// ---------- Quick area search (postcode or place name → Division/District/Upazila) ----------
// Data: public/data/bd-geo.json + bd-postcodes.json, built from github.com/bayeziddev/Bangladesh-geocode (MIT).
let postcodePromise;
const postcodes = () => (postcodePromise ??= fetch("/data/bd-postcodes.json").then((r) => r.json()).catch(() => ({})));
const BN_DIGITS = "০১২৩৪৫৬৭৮৯";
const latinDigits = (s) => s.replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)));

export function bindAreaSearch(input, box, geoCtl) {
  // Listeners attach immediately; the (small, cached) datasets load in the background.
  let g, pc, byDist, byDiv, byUpa;
  const ready = Promise.all([geo(), postcodes()]).then(([G, P]) => {
    g = G; pc = P;
    byDist = new Map(g.districts.map((d) => [d.id, d]));
    byDiv = new Map(g.divisions.map((d) => [d.id, d]));
    byUpa = new Map(g.upazilas.map((u) => [u.id, u]));
  });
  const Ln = (x) => (lang() === "bn" ? x.bn : x.en);
  let items = [], active = -1;
  const close = () => { box.hidden = true; active = -1; input.setAttribute("aria-expanded", "false"); };
  const pick = (it) => {
    const d = byDist.get(it.district_id);
    geoCtl.set({ division_id: d.div, district_id: d.id, upazila_id: it.upazila_id || 0 });
    input.value = it.label;
    close();
    if (!it.upazila_id) input.form?.elements.upazila_id?.focus();
    else input.form?.elements.area?.focus();
  };
  const render = async () => {
    await ready;
    const q = latinDigits(input.value.trim()).toLowerCase();
    items = [];
    if (q.length >= 2) {
      if (/^\d{2,4}$/.test(q)) {
        for (const [code, [dist, upa, office]] of Object.entries(pc)) {
          if (!code.startsWith(q)) continue;
          const d = byDist.get(dist), u = byUpa.get(upa);
          items.push({ district_id: dist, upazila_id: upa, label: `${code} · ${office}`, sub: [u && Ln(u), d && Ln(d)].filter(Boolean).join(", ") });
          if (items.length >= 8) break;
        }
      } else {
        for (const u of g.upazilas) {
          if (u.en.toLowerCase().includes(q) || u.bn.includes(q)) {
            const d = byDist.get(u.dist);
            items.push({ district_id: u.dist, upazila_id: u.id, label: `${Ln(u)}, ${Ln(d)}`, sub: Ln(byDiv.get(d.div)) });
          }
          if (items.length >= 8) break;
        }
        for (const d of g.districts) {
          if (items.length >= 8) break;
          if ((d.en.toLowerCase().includes(q) || d.bn.includes(q)) && !items.some((i) => i.district_id === d.id && !i.upazila_id)) {
            items.push({ district_id: d.id, upazila_id: 0, label: Ln(d), sub: `${t("district")} · ${Ln(byDiv.get(d.div))}` });
          }
        }
      }
    }
    box.hidden = q.length < 2;
    input.setAttribute("aria-expanded", String(!box.hidden));
    box.innerHTML = items.length
      ? items.map((it, i) => `<button type="button" role="option" data-i="${i}" aria-selected="${i === active}">${esc(it.label)}<small>${esc(it.sub)}</small></button>`).join("")
      : `<p class="muted small" style="padding:8px 12px;margin:0">${esc(t("noAreaMatch"))}</p>`;
  };
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  let closeTimer;
  input.addEventListener("input", () => { clearTimeout(closeTimer); active = -1; render(); });
  input.addEventListener("focus", () => clearTimeout(closeTimer));
  input.addEventListener("keydown", (e) => {
    if (box.hidden || !items.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); active = (active + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length; render(); }
    if (e.key === "Enter" && active >= 0) { e.preventDefault(); pick(items[active]); }
    if (e.key === "Escape") close();
  });
  box.addEventListener("mousedown", (e) => { const b = e.target.closest("[data-i]"); if (b) { e.preventDefault(); pick(items[Number(b.dataset.i)]); } });
  input.addEventListener("blur", () => { closeTimer = setTimeout(close, 150); });
  if (input.value.trim() && document.activeElement === input) render(); // typed before we were ready
}
