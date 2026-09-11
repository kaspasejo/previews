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

  // Checkout: local simulation until Stripe values are supplied; then POST
  // the chosen pack to the serverless function and follow the returned URL.
  const overlay = document.getElementById("mockOverlay");
  const mockLine = document.getElementById("mockLine");
  let selectedPack = null;

  async function startCheckout(pack, button) {
    if (!prices[pack]) return;
    selectedPack = pack;
    if (config.MOCK_CHECKOUT) {
      mockLine.textContent = `${names[pack]} pack - £${prices[pack]} including free delivery`;
      overlay.hidden = false;
      document.getElementById("mockPay").focus();
      return;
    }
    const old = button.textContent;
    button.disabled = true;
    button.textContent = "Opening secure checkout...";
    try {
      const response = await fetch(config.CHECKOUT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pack })
      });
      const data = await response.json();
      if (!response.ok || !data.url) throw new Error(data.error || "Checkout unavailable");
      window.location.assign(data.url);
    } catch (err) {
      alert("Checkout could not open. Please try again or email hello@readyhomekit.com.");
      button.disabled = false;
      button.textContent = old;
    }
  }

  document.querySelectorAll(".buy").forEach(button => {
    button.addEventListener("click", () => startCheckout(button.dataset.pack, button));
  });
  document.getElementById("mockCancel").addEventListener("click", () => overlay.hidden = true);
  document.getElementById("mockPay").addEventListener("click", () => {
    location.href = `success.html?mock=1&pack=${encodeURIComponent(selectedPack)}`;
  });
  overlay.addEventListener("click", e => { if (e.target === overlay) overlay.hidden = true; });
  document.addEventListener("keydown", e => { if (e.key === "Escape") overlay.hidden = true; });
})();
