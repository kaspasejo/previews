(() => {
  const config = window.HOMEREADY_CONFIG || {};
  const prices = { essential: 149, complete: 399, family: 499 };
  const names = { essential: "Essential", complete: "Complete", family: "Family" };
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Gentle entrance motion with stagger support via --d. Content remains
  // visible without JS via the fallback timer and honours reduced-motion.
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: .12, rootMargin: "0px 0px -40px" });
  document.querySelectorAll(".reveal").forEach(el => observer.observe(el));
  const forceNear = () => document.querySelectorAll(".reveal:not(.is-visible)").forEach(el => {
    if (el.getBoundingClientRect().top < innerHeight * 1.15) el.classList.add("is-visible");
  });
  setTimeout(forceNear, 300);
  setTimeout(forceNear, 1500);

  // Animate stats once, only when in view.
  const countObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el = entry.target, to = Number(el.dataset.to), decimals = Number(el.dataset.decimals || 0);
      const start = performance.now(), duration = 900;
      const tick = now => {
        const p = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = (to * eased).toFixed(decimals);
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      countObserver.unobserve(el);
    });
  }, { threshold: .7 });
  document.querySelectorAll(".count").forEach(el => countObserver.observe(el));

  // Story progress bar tracks scroll through the 72-hour narrative.
  const story = document.querySelector(".story");
  const storyBar = document.querySelector(".story-bar");
  if (story && storyBar) {
    const updateBar = () => {
      const r = story.getBoundingClientRect();
      const total = r.height - innerHeight;
      const done = Math.min(Math.max(-r.top, 0), Math.max(total, 1));
      storyBar.style.width = `${Math.round(done / Math.max(total, 1) * 100)}%`;
    };
    addEventListener("scroll", updateBar, { passive: true });
    updateBar();
  }

  // Subtle hero parallax; skipped under reduced motion.
  const heroVideo = document.querySelector(".hero-video");
  if (heroVideo && !reduced) {
    const drift = () => {
      const y = Math.min(scrollY, innerHeight);
      heroVideo.style.transform = `scale(1.04) translateY(${y * 0.12}px)`;
    };
    addEventListener("scroll", drift, { passive: true });
  }

  // Respect reduced motion for the hero video.
  if (reduced && heroVideo) {
    heroVideo.pause();
    heroVideo.removeAttribute("autoplay");
  }

  // Pack contents tabs.
  const tabs = document.querySelectorAll(".tab");
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(t => {
        const on = t === tab;
        t.classList.toggle("is-active", on);
        t.setAttribute("aria-selected", on);
        const panel = document.getElementById(`panel-${t.dataset.tab}`);
        if (panel) { panel.hidden = !on; panel.classList.toggle("is-active", on); }
      });
    });
  });

  // Embedded checkout: Buy buttons open a modal and mount Stripe
  // Embedded Checkout. The Cloudflare Worker at CHECKOUT_ENDPOINT creates
  // the Checkout Session and returns its client secret.
  const coOverlay = document.getElementById("coOverlay");
  const coMount = document.getElementById("coMount");
  const coClose = document.getElementById("coClose");
  const coTitle = document.getElementById("coTitle");
  let coCheckout = null;

  function closeCheckout() {
    if (coCheckout) { try { coCheckout.destroy(); } catch (e) {} coCheckout = null; }
    coOverlay.hidden = true;
    document.body.style.overflow = "";
  }
  if (coClose) coClose.addEventListener("click", closeCheckout);
  if (coOverlay) coOverlay.addEventListener("click", e => { if (e.target === coOverlay) closeCheckout(); });
  addEventListener("keydown", e => { if (e.key === "Escape" && coOverlay && !coOverlay.hidden) closeCheckout(); });

  let stripePromise = null;
  function loadStripe() {
    if (!stripePromise) {
      stripePromise = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "https://js.stripe.com/v3";
        s.onload = () => resolve(window.Stripe(config.STRIPE_PUBLISHABLE_KEY));
        s.onerror = () => reject(new Error("Stripe.js failed to load"));
        document.head.appendChild(s);
      });
    }
    return stripePromise;
  }

  async function startCheckout(pack, button) {
    if (!prices[pack]) return;
    const old = button.textContent;
    button.disabled = true;
    button.textContent = "Opening secure checkout...";
    coTitle.textContent = names[pack] + " pack - \u00A3" + prices[pack];
    coMount.innerHTML = '<div class="co-status"><span class="spin"></span><br>Loading secure checkout...</div>';
    coOverlay.hidden = false;
    document.body.style.overflow = "hidden";
    try {
      const returnUrl = new URL("success.html?session_id={CHECKOUT_SESSION_ID}", location.href).href;
      const [stripe, resp] = await Promise.all([
        loadStripe(),
        fetch(config.CHECKOUT_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pack, return_url: returnUrl })
        }).then(r => r.json().then(d => ({ ok: r.ok, d })))
      ]);
      if (!resp.ok || !resp.d.client_secret) throw new Error(resp.d.error || "Checkout unavailable");
      coMount.innerHTML = "";
      coCheckout = await stripe.initEmbeddedCheckout({ clientSecret: resp.d.client_secret });
      coCheckout.mount("#coMount");
    } catch (err) {
      const link = (config.PAYMENT_LINKS || {})[pack];
      coMount.innerHTML = '<div class="co-status"><p class="co-err">Checkout could not open here. ' +
        (link ? '<a href="' + link + '">Continue to our secure Stripe page instead</a>, or email' : 'Please email') +
        ' hello@readyhomekit.com.</p></div>';
    } finally {
      button.disabled = false;
      button.textContent = old;
    }
  }

  // v4: sticky mobile buy bar - show after the hero, hide while packs are on screen
  const mbuy = document.getElementById("mbuy");
  if (mbuy && "IntersectionObserver" in window) {
    let pastHero = false, packsVisible = false;
    const update = () => {
      const show = pastHero && !packsVisible;
      mbuy.classList.toggle("show", show);
      mbuy.setAttribute("aria-hidden", show ? "false" : "true");
    };
    new IntersectionObserver(e => { pastHero = !e[0].isIntersecting; update(); }).observe(document.querySelector(".hero"));
    new IntersectionObserver(e => { packsVisible = e[0].isIntersecting; update(); }).observe(document.getElementById("packs"));
  }

  // v5: reviews carousel - renders from js/reviews-data.js (SAMPLE data)
  const revTrack = document.getElementById("revTrack");
  if (revTrack && window.HOMEREADY_REVIEWS) {
    const star = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 1.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8L10 14.9l-5.3 2.7 1-5.8L1.5 7.7l5.9-.9z" fill="#e8b400"/></svg>';
    revTrack.innerHTML = window.HOMEREADY_REVIEWS.map(r => {
      const text = r.text.length > 150 ? r.text.slice(0, r.text.lastIndexOf(" ", 147)) + "…" : r.text;
      return `<article class="rev-card">
        <div class="rev-stars" aria-label="Rated 5 out of 5 stars">${star.repeat(5)}</div>
        <p class="rev-text">${text}</p>
        <p class="rev-meta"><b>${r.name}</b> · ${r.place} · <span>${r.pack} pack</span></p>
      </article>`;
    }).join("");
    const step = () => revTrack.querySelector(".rev-card").offsetWidth + 16;
    document.getElementById("revPrev").addEventListener("click", () => revTrack.scrollBy({ left: -step(), behavior: "smooth" }));
    document.getElementById("revNext").addEventListener("click", () => revTrack.scrollBy({ left: step(), behavior: "smooth" }));
  }

  document.querySelectorAll(".buy").forEach(button => {
    button.addEventListener("click", () => startCheckout(button.dataset.pack, button));
  });
})();
