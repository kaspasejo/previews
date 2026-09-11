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
    essential: "price_1UERBcEwbhTbUC28NAzK0TDw",
    complete:  "price_1UERCJEwbhTbUC28wxew9eHQ",
    family:    "price_1UERCuEwbhTbUC28WL1zTTPN"
  },

  /* Stripe Payment Links (TEST mode - buy.stripe.com/test_...).
     When a pack has a link here, the Buy button redirects
     straight to Stripe's hosted checkout for that pack.
     Replace with the live-mode links when going live. */
  PAYMENT_LINKS: {
    essential: "https://buy.stripe.com/test_3cI8wPbZRbxN8xegqRfIs00",
    complete:  "https://buy.stripe.com/test_14A4gzaVNfO33cU7UlfIs02",
    family:    "https://buy.stripe.com/test_00waEX1ld9pFeVCa2tfIs01"
  },

  /* While MOCK_CHECKOUT is true the site runs a fully local
     simulated checkout (no network, no keys needed) so the
     flow can be tested end to end before Stripe is wired up.
     Set to false once the real endpoint is deployed. */
  MOCK_CHECKOUT: true,

  /* Endpoint that creates the Stripe Checkout Session.
     api/create-checkout-session.js is a drop-in Vercel
     serverless function; deploy and it answers at this path. */
  CHECKOUT_ENDPOINT: "/api/create-checkout-session",

  CURRENCY: "gbp"
};
