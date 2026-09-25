// Help center — short, plain-language guides for everyday tasks.
import { t, lang } from "../i18n.js";
import { html } from "../core.js";

const GUIDES = [
  { en: ["A new Cash on Delivery order came in — what do I do?", "Open Orders → Pending. Call the customer (tap Call) to confirm the order and address. If they confirm, press → Confirmed. The customer gets an SMS automatically."],
    bn: ["নতুন ক্যাশ অন ডেলিভারি অর্ডার এসেছে — কী করব?", "অর্ডার → অপেক্ষমাণ খুলুন। গ্রাহককে কল করে (Call চাপুন) অর্ডার ও ঠিকানা নিশ্চিত করুন। নিশ্চিত হলে → কনফার্মড চাপুন। গ্রাহক নিজে থেকেই SMS পাবেন।"] },
  { en: ["How do I send a parcel with Steadfast?", "Pack the order and press → Packed. Then press → Shipped, choose Steadfast and keep \"Book with Steadfast automatically\" ticked. The tracking ID is saved and sent to the customer. For Pathao or RedX, create the parcel in their panel and type the tracking ID."],
    bn: ["স্টেডফাস্টে কীভাবে পার্সেল পাঠাব?", "অর্ডার প্যাক করে → প্যাকড চাপুন। তারপর → পাঠানো হয়েছে চাপুন, স্টেডফাস্ট বেছে নিন এবং \"অটোমেটিক বুক করুন\" টিক রাখুন। ট্র্যাকিং আইডি সংরক্ষণ হবে ও গ্রাহককে পাঠানো হবে। পাঠাও বা রেডএক্সের জন্য তাদের প্যানেলে পার্সেল তৈরি করে ট্র্যাকিং আইডি লিখুন।"] },
  { en: ["A customer paid by bKash and sent a TrxID", "Open the order. Check the TrxID in your bKash app statement. If the amount matches, press \"Mark as paid\"."],
    bn: ["গ্রাহক বিকাশে টাকা পাঠিয়ে TrxID দিয়েছেন", "অর্ডারটি খুলুন। আপনার বিকাশ অ্যাপের স্টেটমেন্টে TrxID মিলিয়ে দেখুন। টাকার পরিমাণ মিললে \"পেমেন্ট পেয়েছি\" চাপুন।"] },
  { en: ["How do I add a new product?", "Products → Add new. Fill the name in both languages, choose a category and price, add photos (the first photo is the cover), then add one row per size and colour with its stock. Set status to Active to show it in the shop."],
    bn: ["নতুন পণ্য কীভাবে যোগ করব?", "পণ্য → নতুন যোগ করুন। দুই ভাষায় নাম লিখুন, ক্যাটাগরি ও দাম দিন, ছবি যোগ করুন (প্রথম ছবি কভার), তারপর প্রতি সাইজ ও রঙের জন্য একটি সারিতে স্টক লিখুন। দোকানে দেখাতে অবস্থা 'চালু' করুন।"] },
  { en: ["New stock arrived", "Inventory → type the new total in \"New stock\" for each item, choose \"New stock arrived\" as the reason, then press Save. Every change is recorded in Stock history."],
    bn: ["নতুন স্টক এসেছে", "ইনভেন্টরি → প্রতিটি আইটেমের \"নতুন স্টক\" ঘরে মোট সংখ্যা লিখুন, কারণ হিসেবে \"নতুন স্টক এসেছে\" বেছে নিন, তারপর সংরক্ষণ করুন। প্রতিটি পরিবর্তন স্টকের ইতিহাসে থাকে।"] },
  { en: ["A customer wants to cancel or return", "Before shipping: press Cancelled. After delivery: press Returned. Stock goes back automatically. If they had paid, use \"Record a refund\" and send the money."],
    bn: ["গ্রাহক বাতিল বা ফেরত দিতে চান", "পাঠানোর আগে: বাতিল চাপুন। ডেলিভারির পরে: ফেরত চাপুন। স্টক নিজে থেকেই ফিরে যাবে। টাকা দিয়ে থাকলে \"রিফান্ড রেকর্ড করুন\" ব্যবহার করে টাকা পাঠান।"] },
  { en: ["How do I run an Eid campaign?", "Coupons → Add new (e.g. EID10, 10%, with an expiry date). Banners → Add new with placement \"Festive campaign\" and set start/stop dates — it appears and disappears on its own."],
    bn: ["ঈদ ক্যাম্পেইন কীভাবে চালাব?", "কুপন → নতুন যোগ করুন (যেমন EID10, ১০%, মেয়াদসহ)। ব্যানার → নতুন যোগ করুন, অবস্থান \"উৎসব ক্যাম্পেইন\" দিন এবং শুরু/শেষের তারিখ দিন — নিজে থেকেই দেখাবে ও বন্ধ হবে।"] },
  { en: ["I deleted something by mistake", "Most things go to Trash first. Open the same page, tap Trash, and press Restore."],
    bn: ["ভুল করে কিছু মুছে ফেলেছি", "বেশিরভাগ জিনিস প্রথমে ট্র্যাশে যায়। একই পেজে ট্র্যাশ চাপুন, তারপর ফিরিয়ে আনুন চাপুন।"] },
  { en: ["Something looks wrong or a staff member left", "Staff & roles → turn off \"Can sign in\" for that person. Check Activity log to see who changed what. Call your developer if payment or courier keys may be exposed — they will rotate them."],
    bn: ["কিছু ভুল মনে হচ্ছে বা কোনো স্টাফ চলে গেছেন", "স্টাফ ও রোল → সেই ব্যক্তির \"সাইন ইন করতে পারবেন\" বন্ধ করুন। কে কী পরিবর্তন করেছে তা কার্যক্রমের লগে দেখুন। পেমেন্ট বা কুরিয়ারের কী ফাঁস হতে পারে মনে হলে ডেভেলপারকে কল করুন।"] },
];

export default function help(view) {
  view.innerHTML = String(html`<div class="page-head"><h1>${t("help")}</h1></div><p class="muted">${t("helpIntro")}</p>
    ${GUIDES.map((g) => { const [q, a] = g[lang()] ?? g.en; return html`<details class="card" style="padding:16px 20px"><summary style="font-weight:700;cursor:pointer;min-height:32px">${q}</summary><p style="margin:.6em 0 0">${a}</p></details>`; })}`);
}
