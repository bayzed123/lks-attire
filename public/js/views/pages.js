import { html, icon, config } from "../core.js";
import { t, lang } from "../i18n.js";
import { sizeChart, emptyState } from "../components.js";

const POLICIES = {
  returns: {
    en: [["Exchange within 3 days", "If the size doesn't fit, tell us within 3 days of delivery. Keep the item unworn with tags attached. You pay only the delivery charge for the exchange."],
      ["Damaged or wrong item", "Check the parcel in front of the delivery person. If something is wrong, don't accept it — or send us a photo on WhatsApp within 24 hours and we'll replace it free."],
      ["Refunds", "Approved refunds are sent to your bKash/Nagad number or bank within 7 working days."],
      ["Not returnable", "Unstitched fabric that has been cut, and innerwear/accessories for hygiene reasons."]],
    bn: [["৩ দিনের মধ্যে এক্সচেঞ্জ", "সাইজ না মিললে ডেলিভারির ৩ দিনের মধ্যে জানান। পণ্যটি না পরে ট্যাগসহ রাখুন। এক্সচেঞ্জের জন্য শুধু ডেলিভারি চার্জ দিতে হবে।"],
      ["ত্রুটিপূর্ণ বা ভুল পণ্য", "ডেলিভারি ম্যানের সামনে পার্সেল খুলে দেখুন। সমস্যা থাকলে গ্রহণ করবেন না — অথবা ২৪ ঘণ্টার মধ্যে হোয়াটসঅ্যাপে ছবি পাঠান, আমরা বিনামূল্যে বদলে দেব।"],
      ["রিফান্ড", "অনুমোদিত রিফান্ড ৭ কর্মদিবসের মধ্যে আপনার বিকাশ/নগদ নম্বর বা ব্যাংকে পাঠানো হয়।"],
      ["ফেরতযোগ্য নয়", "কেটে ফেলা আনস্টিচড কাপড় এবং স্বাস্থ্যগত কারণে অন্তর্বাস/এক্সেসরিজ।"]],
  },
  delivery: {
    en: [["Where we deliver", "All 64 districts of Bangladesh through Steadfast, Pathao and RedX couriers."],
      ["Delivery time", "Tangail town: same or next day. Dhaka: 2–3 days. Rest of Bangladesh: 3–5 days. Festive seasons may take a day longer."],
      ["Delivery charge", "Shown live at checkout once you choose your upazila. Orders above the free-delivery amount for your area ship free."],
      ["Order confirmation", "We call every Cash on Delivery order before sending it. Please keep your phone reachable."]],
    bn: [["কোথায় ডেলিভারি দিই", "স্টেডফাস্ট, পাঠাও ও রেডএক্স কুরিয়ারের মাধ্যমে বাংলাদেশের ৬৪ জেলায়।"],
      ["ডেলিভারির সময়", "টাঙ্গাইল শহর: একই দিন বা পরের দিন। ঢাকা: ২–৩ দিন। দেশের অন্যান্য জায়গা: ৩–৫ দিন। উৎসবের সময় এক দিন বেশি লাগতে পারে।"],
      ["ডেলিভারি চার্জ", "চেকআউটে উপজেলা বেছে নিলেই চার্জ দেখা যাবে। আপনার এলাকার নির্দিষ্ট পরিমাণের বেশি অর্ডারে ডেলিভারি ফ্রি।"],
      ["অর্ডার কনফার্মেশন", "প্রতিটি ক্যাশ অন ডেলিভারি অর্ডার পাঠানোর আগে আমরা কল করি। ফোন চালু রাখুন।"]],
  },
  privacy: {
    en: [["What we collect", "Your name, mobile number, delivery address, optional email and your order history — only what we need to deliver your order."],
      ["How we use it", "To deliver orders, send order updates by SMS/WhatsApp/email, and (only if you sign up) tell you about new arrivals."],
      ["Who we share it with", "Only the courier delivering your parcel and the payment provider you choose. We never sell your data."],
      ["Payments", "Card and bKash payments happen on the provider's secure page. We never see or store your card number or PIN."],
      ["Your choices", "Ask us any time to see, correct or delete your information: call or WhatsApp us."]],
    bn: [["আমরা কী তথ্য নিই", "আপনার নাম, মোবাইল নম্বর, ডেলিভারির ঠিকানা, ঐচ্ছিক ইমেইল ও অর্ডারের ইতিহাস — শুধু অর্ডার পৌঁছাতে যা দরকার।"],
      ["কীভাবে ব্যবহার করি", "অর্ডার ডেলিভারি, SMS/হোয়াটসঅ্যাপ/ইমেইলে আপডেট পাঠাতে, এবং (আপনি চাইলে) নতুন কালেকশনের খবর দিতে।"],
      ["কার সাথে শেয়ার করি", "শুধু পার্সেল পৌঁছানো কুরিয়ার এবং আপনার বেছে নেওয়া পেমেন্ট প্রতিষ্ঠানের সাথে। আমরা কখনো তথ্য বিক্রি করি না।"],
      ["পেমেন্ট", "কার্ড ও বিকাশ পেমেন্ট হয় তাদের নিরাপদ পেজে। আপনার কার্ড নম্বর বা পিন আমরা দেখি না, রাখিও না।"],
      ["আপনার অধিকার", "যেকোনো সময় আপনার তথ্য দেখতে, ঠিক করতে বা মুছে ফেলতে বলুন: কল বা হোয়াটসঅ্যাপ করুন।"]],
  },
};

export default async function pages(main, { params, notFound }) {
  if (notFound) {
    document.title = t("notFound");
    main.innerHTML = String(html`<div class="container">${emptyState(t("notFound"), t("notFoundSub"), html`<a class="btn" href="/">${t("goHome")}</a>`)}</div>`);
    return;
  }
  if (params.policy) {
    const p = POLICIES[params.policy][lang()];
    const title = t({ returns: "returnsPolicy", delivery: "deliveryPolicy", privacy: "privacyPolicy" }[params.policy]);
    document.title = title;
    main.innerHTML = String(html`<div class="container section prose"><span class="eyebrow">${t("policies")}</span><h1>${title}</h1>${p.map(([h, body]) => html`<h2>${h}</h2><p>${body}</p>`)}</div>`);
    return;
  }
  if (params.page === "size-guide") {
    document.title = t("sizeGuidePage");
    main.innerHTML = String(html`<div class="container section prose"><h1>${t("sizeGuidePage")}</h1>${sizeChart()}</div>`);
    return;
  }
  // About / Contact
  const cfg = await config();
  const b = cfg.brand, s = cfg.store;
  const bn = lang() === "bn";
  document.title = `${t("about")} | ${bn ? b.name.bn : b.name.en}`;
  main.innerHTML = String(html`
    <section class="section jamdani-bg"><div class="container story">
      <div><span class="eyebrow">${t("ourStory")}</span><h1>${bn ? b.tagline.bn : b.tagline.en}</h1><p style="font-size:1.1rem">${bn ? b.description.bn : b.description.en}</p><p class="muted">${t("storyText")}</p></div>
      <div class="hero-art"><div class="frame"><img src="/assets/og-default.svg" alt="" width="600" height="750" loading="lazy" style="object-fit:cover;height:100%"></div></div>
    </div></section>
    <div class="paar" aria-hidden="true"></div>
    <section class="section container story" id="contact">
      <div><h2>${t("visitUs")}</h2>
        <ul class="info-list">
          <li>${icon("pin")}<span><b>${bn ? b.name.bn : b.name.en}</b><br>${bn ? s.address_bn : s.address_en}<br>${bn ? b.location.region.bn : b.location.region.en} ${b.location.postalCode}, ${bn ? "বাংলাদেশ" : "Bangladesh"}</span></li>
          <li>${icon("phone")}<span><a href="tel:${s.phone}">${s.phone}</a></span></li>
          <li>${icon("whatsapp")}<span><a href="https://wa.me/${s.whatsapp}" target="_blank" rel="noopener">WhatsApp</a></span></li>
          <li>${icon("clock")}<span>${t("openHours")}: ${bn ? s.hours_bn : s.hours_en}</span></li>
        </ul>
        <div style="display:flex;gap:10px;flex-wrap:wrap"><a class="btn" href="tel:${s.phone}">${icon("phone")} ${t("callUs")}</a><a class="btn wa" href="https://wa.me/${s.whatsapp}" target="_blank" rel="noopener">${icon("whatsapp")} WhatsApp</a></div>
      </div>
      <iframe class="map-frame" title="${bn ? b.location.street.bn : b.location.street.en}, ${bn ? b.location.city.bn : b.location.city.en}" src="${b.location.mapEmbedUrl}" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>
    </section>
    <section class="section container faq prose"><h2>${t("faq")}</h2>
      ${[1, 2, 3].map((n) => html`<details><summary>${t(`faqQ${n}`)}</summary><p>${t(`faqA${n}`)}</p></details>`)}
    </section>`);
  if (params.page === "contact") document.getElementById("contact")?.scrollIntoView();
}
