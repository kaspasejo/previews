/* ============================================================
   HomeReady - storefront configuration
   ------------------------------------------------------------
   SAM: this is the ONLY file you need to touch to go live.

   1. Create your three products in the Stripe dashboard
      (test mode first) and copy each product's Price ID
      (starts with price_...) into PRICE_IDS below.
   2. Paste your publishable key (pk_test_... / pk_live_...)
      into STRIPE_PUBLISHABLE_KEY.
   3. Put your SECRET key (sk_test_... / sk_live_...) in the
      server environment as STRIPE_SECRET_KEY - see
      .env.example. NEVER put the secret key in this file.
   4. Set MOCK_CHECKOUT to false.
   ============================================================ */

window.HOMEREADY_CONFIG = {
  STRIPE_PUBLISHABLE_KEY: "pk_test_REPLACE_ME",

  PRICE_IDS: {
    essential: "price_1UERy9EwbhTbUC282iQwLC8S",
    complete:  "price_1UERyuEwbhTbUC285699WnhQ",
    family:    "price_1UERzUEwbhTbUC28IlCXVP51"
  },

  /* Stripe Payment Links (LIVE mode).
     When a pack has a link here, the Buy button redirects
     straight to Stripe's hosted checkout for that pack.
     Live-mode payment links. */
  PAYMENT_LINKS: {
    essential: "https://buy.stripe.com/3cI8wPbZRbxN8xegqRfIs00",
    complete:  "https://buy.stripe.com/14A4gzaVNfO33cU7UlfIs02",
    family:    "https://buy.stripe.com/00waEX1ld9pFeVCa2tfIs01"
  },

  /* MOCK_CHECKOUT is false: Buy buttons go straight to the
     live Stripe Payment Links above. */
  MOCK_CHECKOUT: false,

  /* Endpoint that creates the Stripe Checkout Session.
     api/create-checkout-session.js is a drop-in Vercel
     serverless function; deploy and it answers at this path. */
  CHECKOUT_ENDPOINT: "/api/create-checkout-session",

  CURRENCY: "gbp"
};
