// Bilingual copy for the storefront. Plain, friendly language; Bangla is the default.
// Add a key in BOTH languages. Data from the API (product names etc.) carries its own _en/_bn fields.

export const dict = {
  en: {
    skipToContent: "Skip to content",
    offers: "Offers",
    findArea: "Quick fill: type your postcode or area",
    findAreaHint: "e.g. 1900, Mirzapur, Dhanmondi — then pick from the list",
    noAreaMatch: "No match — choose Division, District and Upazila below.",
    postOffice: "Post office",

    home: "Home", shop: "Shop", newIn: "New in", festive: "Festive", about: "About", contact: "Contact", track: "Track order",
    search: "Search", searchPlaceholder: "Search sarees, kurtis, abayas…", account: "Account", wishlist: "Wishlist", cart: "Cart",
    chatWhatsApp: "Chat on WhatsApp",
    heroFallbackTitle: "Handwoven in Tangail", heroFallbackSub: "Sarees, three-pieces and festive wear, delivered to your door.",
    shopNow: "Shop now", viewAll: "View all", explore: "Explore",
    trustCod: "Cash on Delivery", trustCodSub: "Pay when it arrives",
    trustDelivery: "All 64 districts", trustDeliverySub: "Fast courier delivery",
    trustExchange: "3-day exchange", trustExchangeSub: "Wrong size? We'll swap it",
    trustLoom: "Picked in Tangail", trustLoomSub: "Straight from local looms",
    shopByCategory: "Shop by category", newArrivals: "New arrivals", newArrivalsSub: "Fresh from the loom this week",
    bestSellers: "Best sellers", bestSellersSub: "What our customers love most",
    lovedBy: "Loved by our customers", followUs: "Follow our latest drops", followSub: "Styling ideas, new drops and behind-the-loom stories.",
    signupTitle: "Get new arrivals on WhatsApp", signupSub: "One message a week. No spam — unsubscribe any time.",
    signupPlaceholder: "Your WhatsApp number or email", signupBtn: "Keep me posted", signupDone: "Thank you! You're on the list.",
    items: "items", item: "item", results: "results",
    filters: "Filters", clearAll: "Clear all", apply: "Show results", category: "Category", size: "Size", colour: "Colour",
    price: "Price", min: "Min", max: "Max", fabric: "Fabric", availability: "Availability", inStockOnly: "In stock only", onSale: "On sale",
    sortBy: "Sort by", sortNewest: "Newest", sortPopular: "Most popular", sortPriceAsc: "Price: low to high", sortPriceDesc: "Price: high to low", sortDiscount: "Biggest discount", sortRating: "Top rated",
    gridView: "Grid view", listView: "List view", loadMore: "Load more", noResults: "Nothing found", noResultsSub: "Try a different word or remove some filters.",
    off: "off", soldOut: "Sold out", addToWishlist: "Save to wishlist", removeFromWishlist: "Remove from wishlist",
    selectColour: "Colour", selectSize: "Size", sizeGuide: "Size guide", quantity: "Quantity",
    inStock: "In stock — ready to ship", onlyLeft: "Hurry, only {n} left", outOfStock: "Out of stock in this size/colour",
    chooseOptions: "Please choose a size and colour", addToCart: "Add to cart", buyNow: "Buy now", addedToCart: "Added to your cart",
    askWhatsApp: "Ask about this on WhatsApp", share: "Share", copyLink: "Copy link", linkCopied: "Link copied",
    description: "Description", fabricCare: "Fabric & care", deliveryReturns: "Delivery & returns", reviews: "Reviews",
    perkCod: "Cash on Delivery available", perkDelivery: "Delivery in 1–5 days across Bangladesh", perkExchange: "Easy 3-day size exchange",
    deliveryText: "Inside Tangail town we usually deliver the same or next day. Dhaka takes 2–3 days and the rest of Bangladesh 3–5 days. You can open and check the parcel in front of the delivery person.",
    returnsText: "If the size doesn't fit or the item is damaged, tell us within 3 days of delivery. Keep the tags on and we'll arrange an exchange or refund.",
    noReviews: "No reviews yet — be the first!", writeReview: "Write a review", yourName: "Your name", rating: "Rating", yourReview: "Your review", submitReview: "Submit review",
    youMayLike: "You may also like", home_: "Home",
    yourCart: "Your cart", cartEmpty: "Your cart is empty", cartEmptySub: "Let's find something you'll love.", continueShopping: "Continue shopping",
    remove: "Remove", subtotal: "Subtotal", discount: "Discount", delivery: "Delivery", deliveryCalc: "Calculated at checkout", total: "Total",
    free: "Free", freeDelivery: "Free delivery", deliveryCharge: "Delivery charge", couponCode: "Coupon code", applyCoupon: "Apply", couponApplied: "Coupon applied", removeCoupon: "Remove coupon",
    checkout: "Checkout", proceedCheckout: "Proceed to checkout", viewCart: "View cart",
    contactDetails: "Your details", fullName: "Full name", mobile: "Mobile number", mobileHint: "We'll call this number to confirm your order.", emailOptional: "Email (optional)",
    deliveryAddress: "Delivery address", division: "Division", district: "District", upazila: "Upazila / Thana", area: "Area, road, house / village",
    areaHint: "e.g. Akurtakur Para, Road 3, House 12 — near the mosque", choose: "Choose…", savedAddresses: "Saved addresses", useThis: "Use this",
    deliveringTo: "Delivering to: {zone} · {eta}", freeDeliveryOver: "Free delivery on orders over {amount}",
    payment: "Payment", payCod: "Cash on Delivery", payCodSub: "Pay in cash when the parcel arrives.",
    payBkash: "bKash", payNagad: "Nagad", payRocket: "Rocket", payCard: "Card / Mobile banking", payCardSub: "Visa, Mastercard, AmEx via a secure payment page.",
    payMfsSub: "Send money first, then enter the Transaction ID.", payBkashApiSub: "You'll be taken to bKash to pay securely.",
    mfsStep1: "Open your {method} app and choose \"Send Money\".", mfsStep2: "Send {amount} to {number} ({type}).", mfsStep3: "Copy the Transaction ID (TrxID) from the SMS and paste it below.",
    trxId: "Transaction ID (TrxID)", orderNote: "Note for us (optional)", orderNoteHint: "Delivery time preference, gift message…",
    placeOrder: "Place order", placingOrder: "Placing your order…", orderSummary: "Order summary", agreeText: "By placing the order you agree to our delivery & return policy.",
    thankYou: "Thank you! Your order is placed.", orderNumber: "Order number", invoiceNo: "Invoice no", confirmCall: "We'll call you on {phone} to confirm. Keep your phone nearby.",
    paymentPaid: "Payment received. Thank you!", paymentFailed: "The payment didn't go through. Don't worry — your order is saved. We'll call you, or you can pay on delivery.",
    trackYourOrder: "Track your order", trackSub: "Enter your order number and the mobile number used at checkout.", trackBtn: "Track",
    status_pending: "Order placed", status_confirmed: "Confirmed", status_packed: "Packed", status_shipped: "On the way", status_delivered: "Delivered", status_cancelled: "Cancelled", status_returned: "Returned",
    trackParcel: "Track parcel with {courier}", itemsInOrder: "Items",
    signIn: "Sign in", register: "Create account", signOut: "Sign out", password: "Password", passwordHint: "At least 8 characters.",
    forgotPassword: "Forgot password?", resetPassword: "Reset password", sendCode: "Send code", smsCode: "6-digit code from SMS", newPassword: "New password",
    myOrders: "My orders", myWishlist: "Wishlist", myAddresses: "Addresses", myProfile: "Profile", noOrders: "You haven't ordered yet.",
    addAddress: "Add address", editAddress: "Edit address", label: "Label (Home, Office…)", recipient: "Recipient name", makeDefault: "Use as default address",
    save: "Save", saved: "Saved", cancel: "Cancel", delete: "Delete", edit: "Edit", default: "Default", confirmDelete: "Delete this address?",
    currentPassword: "Current password", changePassword: "Change password (optional)",
    ourStory: "Our story", storyText: "Every piece is hand-picked from trusted weavers and makers, checked by our own team, and sent to you with Cash on Delivery anywhere in Bangladesh.",
    visitUs: "Visit our shop", callUs: "Call us", openHours: "Opening hours", faq: "Questions we're often asked",
    faqQ1: "How long does delivery take?", faqA1: "Tangail town: same/next day. Dhaka: 2–3 days. Rest of Bangladesh: 3–5 days.",
    faqQ2: "Can I check the product before paying?", faqA2: "Yes. With Cash on Delivery you can open the parcel in front of the delivery person before paying.",
    faqQ3: "What if the size doesn't fit?", faqA3: "Tell us within 3 days. Keep the tags on and we'll exchange it — just pay the delivery charge.",
    policies: "Policies", returnsPolicy: "Returns & exchange", deliveryPolicy: "Delivery policy", privacyPolicy: "Privacy policy", sizeGuidePage: "Size guide",
    footerAbout: "Hand-picked women's clothing from Tangail. Cash on Delivery across all 64 districts.", weAccept: "We accept",
    notFound: "Page not found", notFoundSub: "The page you're looking for has moved or doesn't exist.", goHome: "Go to home page",
    somethingWrong: "Something went wrong. Please check your internet and try again.", retry: "Try again", loading: "Loading…",
    required: "This field is required.", invalidPhone: "Enter a valid mobile number (01XXXXXXXXX).",
    stickyAdd: "Add to cart",
    sizeGuideIntro: "Measure over your clothes and compare with the chart (in inches). If you're between sizes, choose the bigger one.",
    bust: "Bust", waist: "Waist", hip: "Hip", length: "Length",
  },
  bn: {
    skipToContent: "মূল অংশে যান",
    offers: "অফার",
    findArea: "দ্রুত পূরণ: পোস্টকোড বা এলাকার নাম লিখুন",
    findAreaHint: "যেমন ১৯০০, মির্জাপুর, ধানমন্ডি — তারপর তালিকা থেকে বেছে নিন",
    noAreaMatch: "মিল পাওয়া যায়নি — নিচে বিভাগ, জেলা ও উপজেলা বেছে নিন।",
    postOffice: "পোস্ট অফিস",

    home: "হোম", shop: "শপ", newIn: "নতুন", festive: "উৎসব", about: "আমাদের কথা", contact: "যোগাযোগ", track: "অর্ডার ট্র্যাক",
    search: "খুঁজুন", searchPlaceholder: "শাড়ি, কুর্তি, আবায়া খুঁজুন…", account: "অ্যাকাউন্ট", wishlist: "পছন্দের তালিকা", cart: "কার্ট",
    chatWhatsApp: "হোয়াটসঅ্যাপে কথা বলুন",
    heroFallbackTitle: "টাঙ্গাইলের হাতে বোনা", heroFallbackSub: "শাড়ি, থ্রি-পিস আর উৎসবের পোশাক — পৌঁছে যাবে আপনার দরজায়।",
    shopNow: "এখনই কিনুন", viewAll: "সব দেখুন", explore: "দেখুন",
    trustCod: "ক্যাশ অন ডেলিভারি", trustCodSub: "হাতে পেয়ে টাকা দিন",
    trustDelivery: "৬৪ জেলায় ডেলিভারি", trustDeliverySub: "দ্রুত কুরিয়ার সার্ভিস",
    trustExchange: "৩ দিনে এক্সচেঞ্জ", trustExchangeSub: "সাইজ না মিললে বদলে দেব",
    trustLoom: "টাঙ্গাইল থেকে বাছাই", trustLoomSub: "সরাসরি স্থানীয় তাঁত থেকে",
    shopByCategory: "ক্যাটাগরি অনুযায়ী দেখুন", newArrivals: "নতুন এসেছে", newArrivalsSub: "এই সপ্তাহে তাঁত থেকে সরাসরি",
    bestSellers: "সবচেয়ে জনপ্রিয়", bestSellersSub: "গ্রাহকদের সবচেয়ে পছন্দের",
    lovedBy: "গ্রাহকদের ভালোবাসা", followUs: "আমাদের নতুন কালেকশন ফলো করুন", followSub: "স্টাইলিং আইডিয়া, নতুন কালেকশন আর তাঁতের গল্প।",
    signupTitle: "নতুন কালেকশনের খবর হোয়াটসঅ্যাপে পান", signupSub: "সপ্তাহে একটি মেসেজ। কোনো স্প্যাম নয় — যখন খুশি বন্ধ করতে পারবেন।",
    signupPlaceholder: "আপনার হোয়াটসঅ্যাপ নম্বর বা ইমেইল", signupBtn: "আমাকে জানাবেন", signupDone: "ধন্যবাদ! আপনাকে তালিকায় যোগ করা হয়েছে।",
    items: "টি পণ্য", item: "টি পণ্য", results: "টি ফলাফল",
    filters: "ফিল্টার", clearAll: "সব মুছুন", apply: "ফলাফল দেখুন", category: "ক্যাটাগরি", size: "সাইজ", colour: "রং",
    price: "দাম", min: "সর্বনিম্ন", max: "সর্বোচ্চ", fabric: "কাপড়", availability: "স্টক", inStockOnly: "শুধু স্টকে আছে", onSale: "ছাড়ে আছে",
    sortBy: "সাজান", sortNewest: "নতুন আগে", sortPopular: "জনপ্রিয়", sortPriceAsc: "দাম: কম থেকে বেশি", sortPriceDesc: "দাম: বেশি থেকে কম", sortDiscount: "বেশি ছাড়", sortRating: "সেরা রেটিং",
    gridView: "গ্রিড ভিউ", listView: "লিস্ট ভিউ", loadMore: "আরও দেখুন", noResults: "কিছু পাওয়া যায়নি", noResultsSub: "অন্য শব্দ দিয়ে খুঁজুন বা কিছু ফিল্টার সরান।",
    off: "ছাড়", soldOut: "স্টক শেষ", addToWishlist: "পছন্দের তালিকায় রাখুন", removeFromWishlist: "পছন্দের তালিকা থেকে সরান",
    selectColour: "রং", selectSize: "সাইজ", sizeGuide: "সাইজ গাইড", quantity: "পরিমাণ",
    inStock: "স্টকে আছে — দ্রুত পাঠানো হবে", onlyLeft: "তাড়াতাড়ি করুন, মাত্র {n}টি বাকি", outOfStock: "এই সাইজ/রঙে স্টক নেই",
    chooseOptions: "সাইজ ও রং বেছে নিন", addToCart: "কার্টে যোগ করুন", buyNow: "এখনই কিনুন", addedToCart: "কার্টে যোগ হয়েছে",
    askWhatsApp: "হোয়াটসঅ্যাপে এই পণ্য সম্পর্কে জিজ্ঞেস করুন", share: "শেয়ার", copyLink: "লিংক কপি", linkCopied: "লিংক কপি হয়েছে",
    description: "বিবরণ", fabricCare: "কাপড় ও যত্ন", deliveryReturns: "ডেলিভারি ও রিটার্ন", reviews: "রিভিউ",
    perkCod: "ক্যাশ অন ডেলিভারি আছে", perkDelivery: "সারা বাংলাদেশে ১–৫ দিনে ডেলিভারি", perkExchange: "৩ দিনের মধ্যে সহজ সাইজ এক্সচেঞ্জ",
    deliveryText: "টাঙ্গাইল শহরে সাধারণত একই দিন বা পরের দিন ডেলিভারি হয়। ঢাকায় ২–৩ দিন এবং দেশের অন্যান্য জায়গায় ৩–৫ দিন লাগে। ডেলিভারি ম্যানের সামনে পার্সেল খুলে দেখে নিতে পারবেন।",
    returnsText: "সাইজ না মিললে বা পণ্যে সমস্যা থাকলে ডেলিভারির ৩ দিনের মধ্যে আমাদের জানান। ট্যাগ খুলবেন না — আমরা এক্সচেঞ্জ বা রিফান্ডের ব্যবস্থা করব।",
    noReviews: "এখনো কোনো রিভিউ নেই — প্রথম রিভিউটি আপনিই দিন!", writeReview: "রিভিউ লিখুন", yourName: "আপনার নাম", rating: "রেটিং", yourReview: "আপনার মতামত", submitReview: "রিভিউ দিন",
    youMayLike: "আপনার পছন্দ হতে পারে", home_: "হোম",
    yourCart: "আপনার কার্ট", cartEmpty: "আপনার কার্ট খালি", cartEmptySub: "চলুন, পছন্দের কিছু খুঁজে দেখি।", continueShopping: "কেনাকাটা চালিয়ে যান",
    remove: "সরান", subtotal: "পণ্যের দাম", discount: "ছাড়", delivery: "ডেলিভারি চার্জ", deliveryCalc: "চেকআউটে হিসাব হবে", total: "মোট",
    free: "ফ্রি", freeDelivery: "ফ্রি ডেলিভারি", deliveryCharge: "ডেলিভারি চার্জ", couponCode: "কুপন কোড", applyCoupon: "প্রয়োগ করুন", couponApplied: "কুপন প্রয়োগ হয়েছে", removeCoupon: "কুপন সরান",
    checkout: "চেকআউট", proceedCheckout: "চেকআউট করুন", viewCart: "কার্ট দেখুন",
    contactDetails: "আপনার তথ্য", fullName: "পুরো নাম", mobile: "মোবাইল নম্বর", mobileHint: "অর্ডার কনফার্ম করতে আমরা এই নম্বরে কল করব।", emailOptional: "ইমেইল (ঐচ্ছিক)",
    deliveryAddress: "ডেলিভারির ঠিকানা", division: "বিভাগ", district: "জেলা", upazila: "উপজেলা / থানা", area: "এলাকা, রোড, বাসা / গ্রাম",
    areaHint: "যেমন: আকুরটাকুর পাড়া, রোড ৩, বাসা ১২ — মসজিদের পাশে", choose: "বেছে নিন…", savedAddresses: "সংরক্ষিত ঠিকানা", useThis: "এটি ব্যবহার করুন",
    deliveringTo: "ডেলিভারি এলাকা: {zone} · {eta}", freeDeliveryOver: "{amount} এর বেশি অর্ডারে ফ্রি ডেলিভারি",
    payment: "পেমেন্ট", payCod: "ক্যাশ অন ডেলিভারি", payCodSub: "পার্সেল হাতে পেয়ে নগদ টাকা দিন।",
    payBkash: "বিকাশ", payNagad: "নগদ", payRocket: "রকেট", payCard: "কার্ড / মোবাইল ব্যাংকিং", payCardSub: "নিরাপদ পেমেন্ট পেজে ভিসা, মাস্টারকার্ড, অ্যামেক্স।",
    payMfsSub: "আগে সেন্ড মানি করুন, তারপর ট্রানজেকশন আইডি দিন।", payBkashApiSub: "নিরাপদে পেমেন্ট করতে আপনাকে বিকাশে নিয়ে যাওয়া হবে।",
    mfsStep1: "আপনার {method} অ্যাপ খুলে \"সেন্ড মানি\" বেছে নিন।", mfsStep2: "{number} ({type}) নম্বরে {amount} পাঠান।", mfsStep3: "SMS থেকে ট্রানজেকশন আইডি (TrxID) কপি করে নিচে দিন।",
    trxId: "ট্রানজেকশন আইডি (TrxID)", orderNote: "আমাদের জন্য নোট (ঐচ্ছিক)", orderNoteHint: "ডেলিভারির সময়, উপহারের বার্তা…",
    placeOrder: "অর্ডার করুন", placingOrder: "অর্ডার করা হচ্ছে…", orderSummary: "অর্ডারের সারাংশ", agreeText: "অর্ডার করার মাধ্যমে আপনি আমাদের ডেলিভারি ও রিটার্ন নীতিতে সম্মত হচ্ছেন।",
    thankYou: "ধন্যবাদ! আপনার অর্ডার সম্পন্ন হয়েছে।", orderNumber: "অর্ডার নম্বর", invoiceNo: "ইনভয়েস নং", confirmCall: "কনফার্ম করতে আমরা {phone} নম্বরে কল করব। ফোনটি কাছে রাখুন।",
    paymentPaid: "পেমেন্ট পেয়েছি। ধন্যবাদ!", paymentFailed: "পেমেন্ট সম্পন্ন হয়নি। চিন্তা করবেন না — অর্ডারটি সংরক্ষিত আছে। আমরা কল করব, অথবা ডেলিভারির সময় টাকা দিতে পারবেন।",
    trackYourOrder: "অর্ডার ট্র্যাক করুন", trackSub: "অর্ডার নম্বর এবং চেকআউটে দেওয়া মোবাইল নম্বর লিখুন।", trackBtn: "ট্র্যাক করুন",
    status_pending: "অর্ডার হয়েছে", status_confirmed: "কনফার্ম হয়েছে", status_packed: "প্যাক হয়েছে", status_shipped: "পথে আছে", status_delivered: "ডেলিভারি হয়েছে", status_cancelled: "বাতিল", status_returned: "ফেরত এসেছে",
    trackParcel: "{courier} এ পার্সেল ট্র্যাক করুন", itemsInOrder: "পণ্যসমূহ",
    signIn: "সাইন ইন", register: "অ্যাকাউন্ট খুলুন", signOut: "সাইন আউট", password: "পাসওয়ার্ড", passwordHint: "কমপক্ষে ৮ অক্ষর।",
    forgotPassword: "পাসওয়ার্ড ভুলে গেছেন?", resetPassword: "পাসওয়ার্ড রিসেট", sendCode: "কোড পাঠান", smsCode: "SMS এ পাওয়া ৬ সংখ্যার কোড", newPassword: "নতুন পাসওয়ার্ড",
    myOrders: "আমার অর্ডার", myWishlist: "পছন্দের তালিকা", myAddresses: "ঠিকানা", myProfile: "প্রোফাইল", noOrders: "আপনি এখনো কোনো অর্ডার করেননি।",
    addAddress: "ঠিকানা যোগ করুন", editAddress: "ঠিকানা সম্পাদনা", label: "লেবেল (বাসা, অফিস…)", recipient: "প্রাপকের নাম", makeDefault: "ডিফল্ট ঠিকানা হিসেবে রাখুন",
    save: "সংরক্ষণ করুন", saved: "সংরক্ষিত", cancel: "বাতিল", delete: "মুছুন", edit: "সম্পাদনা", default: "ডিফল্ট", confirmDelete: "এই ঠিকানা মুছে ফেলবেন?",
    currentPassword: "বর্তমান পাসওয়ার্ড", changePassword: "পাসওয়ার্ড পরিবর্তন (ঐচ্ছিক)",
    ourStory: "আমাদের গল্প", storyText: "বিশ্বস্ত তাঁতি ও কারিগরদের কাছ থেকে প্রতিটি পণ্য আমরা নিজে বাছাই ও যাচাই করি, তারপর ক্যাশ অন ডেলিভারিতে বাংলাদেশের যেকোনো জায়গায় পৌঁছে দিই।",
    visitUs: "আমাদের দোকানে আসুন", callUs: "কল করুন", openHours: "খোলার সময়", faq: "প্রায়ই জিজ্ঞাসিত প্রশ্ন",
    faqQ1: "ডেলিভারিতে কতদিন লাগে?", faqA1: "টাঙ্গাইল শহর: একই দিন/পরের দিন। ঢাকা: ২–৩ দিন। দেশের অন্যান্য জায়গা: ৩–৫ দিন।",
    faqQ2: "টাকা দেওয়ার আগে পণ্য দেখে নিতে পারব?", faqA2: "হ্যাঁ। ক্যাশ অন ডেলিভারিতে ডেলিভারি ম্যানের সামনে পার্সেল খুলে দেখে তারপর টাকা দিতে পারবেন।",
    faqQ3: "সাইজ না মিললে কী করব?", faqA3: "৩ দিনের মধ্যে জানান। ট্যাগ না খুলে রাখুন, আমরা বদলে দেব — শুধু ডেলিভারি চার্জ দিতে হবে।",
    policies: "নীতিমালা", returnsPolicy: "রিটার্ন ও এক্সচেঞ্জ", deliveryPolicy: "ডেলিভারি নীতি", privacyPolicy: "গোপনীয়তা নীতি", sizeGuidePage: "সাইজ গাইড",
    footerAbout: "টাঙ্গাইল থেকে বাছাই করা নারীদের পোশাক। ৬৪ জেলায় ক্যাশ অন ডেলিভারি।", weAccept: "আমরা গ্রহণ করি",
    notFound: "পেজটি পাওয়া যায়নি", notFoundSub: "যে পেজটি খুঁজছেন সেটি সরানো হয়েছে বা নেই।", goHome: "হোম পেজে যান",
    somethingWrong: "একটি সমস্যা হয়েছে। ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।", retry: "আবার চেষ্টা করুন", loading: "লোড হচ্ছে…",
    required: "এই ঘরটি পূরণ করা আবশ্যক।", invalidPhone: "সঠিক মোবাইল নম্বর দিন (01XXXXXXXXX)।",
    stickyAdd: "কার্টে যোগ করুন",
    sizeGuideIntro: "কাপড়ের উপর দিয়ে মাপ নিন এবং চার্টের সাথে মিলিয়ে দেখুন (ইঞ্চিতে)। দুই সাইজের মাঝামাঝি হলে বড়টি নিন।",
    bust: "বুক", waist: "কোমর", hip: "হিপ", length: "লম্বা",
  },
};

let current = "bn";
try {
  const url = new URL(location.href).searchParams.get("lang");
  current = url === "en" || url === "bn" ? url : localStorage.getItem("lks_lang") || document.documentElement.lang || "bn";
} catch { /* storage blocked */ }
if (current !== "en" && current !== "bn") current = "bn";

export const lang = () => current;

export function setLang(l) {
  current = l === "en" ? "en" : "bn";
  try { localStorage.setItem("lks_lang", current); } catch { /* ignore */ }
  document.cookie = `lks_lang=${current}; path=/; max-age=31536000; samesite=lax`;
  document.documentElement.lang = current;
}

/** t("onlyLeft", { n: 3 }) */
export function t(key, vars) {
  let s = dict[current][key] ?? dict.en[key] ?? key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ""));
  return s;
}

/** Picks the right language field from API data: L(product, "name") → name_bn / name_en */
export function L(obj, field) {
  if (!obj) return "";
  return obj[`${field}_${current}`] || obj[`${field}_en`] || obj[`${field}_bn`] || "";
}

const nf = { bn: new Intl.NumberFormat("bn-BD"), en: new Intl.NumberFormat("en-BD") };
export const num = (n) => nf[current].format(n ?? 0);
export const money = (n) => `৳${num(n)}`;
export const date = (iso) =>
  new Date(iso).toLocaleDateString(current === "bn" ? "bn-BD" : "en-GB", { day: "numeric", month: "short", year: "numeric" });

/** Applies static translations to elements carrying data-i18n* attributes. */
export function applyStatic(root = document) {
  root.querySelectorAll("[data-i18n]").forEach((el) => (el.textContent = t(el.dataset.i18n)));
  root.querySelectorAll("[data-i18n-placeholder]").forEach((el) => (el.placeholder = t(el.dataset.i18nPlaceholder)));
  root.querySelectorAll("[data-i18n-label]").forEach((el) => {
    el.setAttribute("aria-label", t(el.dataset.i18nLabel));
    el.title = t(el.dataset.i18nLabel);
  });
}
