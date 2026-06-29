"use strict";

/* ───────────────────────────────────────────────────────────────────────────
  VoltCore — Hero « void / ice » piloté par GSAP.

  Chorégraphie d'entrée (timeline) + interactions (CTA magnétiques, lampe au
  curseur qui révèle la grille blueprint, parallaxe douce de la neige) +
  sortie au scroll (ScrollTrigger). Tout est encapsulé dans gsap.matchMedia :
  la branche « prefers-reduced-motion » fige l'état final sans aucun mouvement.

  Progressive enhancement : le markup reste lisible/peint sans GSAP. La copie
  est masquée par la classe .gsap-pending UNIQUEMENT le temps que GSAP prenne
  la main (un fallback CSS/JS la révèle si le CDN est bloqué).

  Suppose gsap + ScrollTrigger + SplitText chargés et enregistrés.
  Signature : window.initVoltHeroGSAP(hero) → fonction de démontage.
─────────────────────────────────────────────────────────────────────────── */
(() => {
  window.initVoltHeroGSAP = function initVoltHeroGSAP(hero) {
    if (!hero || typeof gsap === "undefined") return null;

    const q = (sel) => hero.querySelector(sel);
    const qa = (sel) => Array.from(hero.querySelectorAll(sel));
    const copy = q(".void-copy");
    const eyebrow = q(".void-eyebrow");
    const h1 = q(".void-h1");
    const para = q(".void-copy p");
    const actions = qa(".void-actions .void-btn");
    const readoutDivs = qa(".void-readout > div");
    const stage = q(".void-stage");

    // Compteurs animés (ex. « 280+ », « 4 »).
    const runCounters = (immediate) => {
      readoutDivs.forEach((d) => {
        const el = d.querySelector("strong");
        if (!el) return;
        const m = el.textContent.match(/^(\D*)(\d+)(.*)$/);
        if (!m) return;
        const [, pre, num, suf] = m;
        const target = +num;
        if (!target) return;
        if (immediate) { el.textContent = pre + target + suf; return; }
        const o = { v: 0 };
        gsap.to(o, {
          v: target, duration: 1.2, ease: "power2.out",
          onUpdate: () => { el.textContent = pre + Math.round(o.v) + suf; },
        });
      });
    };

    const reveal = () => copy && copy.classList.remove("gsap-pending");
    hero.classList.add("gsap-hero");

    const mm = gsap.matchMedia();

    // Deux conditions complémentaires → le handler s'exécute TOUJOURS (l'une
    // des deux matche), et se ré-exécute si l'utilisateur bascule sa préférence.
    mm.add(
      {
        motionOk: "(prefers-reduced-motion: no-preference)",
        reduce: "(prefers-reduced-motion: reduce)",
      },
      (ctx) => {
        const reduce = ctx.conditions.reduce;
        const local = [];        // nettoyages spécifiques (listeners, split)
        let split = null;

        /* ── Accessibilité : état final figé, zéro mouvement ── */
        if (reduce) {
          reveal();
          gsap.set([eyebrow, h1, para, ...actions, ...readoutDivs], { clearProps: "all", autoAlpha: 1 });
          runCounters(true);
          return () => local.forEach((fn) => fn());
        }

        /* ── 1 · Intro chorégraphiée ──────────────────────────────────── */
        // Le titre se compose caractère par caractère (SplitText + masque :
        // chaque lettre « monte » de derrière une ligne invisible).
        if (typeof SplitText !== "undefined") {
          split = SplitText.create(h1, { type: "chars,words", mask: "chars", charsClass: "vh-char" });
          local.push(() => { if (split) split.revert(); });
        }

        const tl = gsap.timeline({ defaults: { ease: "power3.out" }, onComplete: reveal });
        hero.__introTL = tl; // exposé pour vérification (inoffensif)
        // from() applique immédiatement l'état de départ (immediateRender) → on
        // peut retirer .gsap-pending sans flash : les éléments sont déjà cachés.
        tl.from(eyebrow, { autoAlpha: 0, y: 16, duration: 0.55 }, 0.05);
        if (split && split.chars.length) {
          tl.from(split.chars, {
            yPercent: 115, duration: 0.9, ease: "power4.out",
            stagger: { amount: 0.5, from: "start" },
          }, 0.12);
        } else {
          tl.from(h1, { autoAlpha: 0, yPercent: 18, duration: 0.8 }, 0.12);
        }
        tl.from(para, { autoAlpha: 0, y: 18, duration: 0.6 }, "-=0.55");
        tl.from(actions, { autoAlpha: 0, y: 18, scale: 0.95, stagger: 0.09, duration: 0.5, ease: "back.out(1.7)" }, "-=0.4");
        tl.from(readoutDivs, { autoAlpha: 0, y: 14, stagger: 0.12, duration: 0.5 }, "-=0.3");
        tl.add(() => runCounters(false), "-=0.45");
        // L'état de départ est posé : on révèle le conteneur (aucun flash).
        reveal();
        local.push(() => tl.kill());

        /* ── 2 · CTA magnétiques (quickTo = un seul tween réutilisé) ──── */
        const clamp = gsap.utils.clamp(-14, 14);
        actions.forEach((btn) => {
          const xTo = gsap.quickTo(btn, "x", { duration: 0.5, ease: "power3" });
          const yTo = gsap.quickTo(btn, "y", { duration: 0.5, ease: "power3" });
          const move = (e) => {
            const r = btn.getBoundingClientRect();
            xTo(clamp((e.clientX - (r.left + r.width / 2)) * 0.4));
            yTo(clamp((e.clientY - (r.top + r.height / 2)) * 0.55));
          };
          const leave = () => { xTo(0); yTo(0); };
          btn.addEventListener("pointermove", move, { passive: true });
          btn.addEventListener("pointerleave", leave);
          local.push(() => { btn.removeEventListener("pointermove", move); btn.removeEventListener("pointerleave", leave); });
        });

        /* ── 3 · Lampe au curseur : révèle la grille blueprint + parallaxe
              douce de la neige. quickTo sur un proxy → on écrit les variables
              CSS --lx/--ly (en %) avec inertie. ───────────────────────── */
        const lamp = { x: 50, y: 38 };
        const writeVars = () => {
          hero.style.setProperty("--lx", lamp.x.toFixed(2) + "%");
          hero.style.setProperty("--ly", lamp.y.toFixed(2) + "%");
        };
        const lxTo = gsap.quickTo(lamp, "x", { duration: 0.5, ease: "power2", onUpdate: writeVars });
        const lyTo = gsap.quickTo(lamp, "y", { duration: 0.5, ease: "power2", onUpdate: writeVars });
        const snowX = stage ? gsap.quickTo(stage, "x", { duration: 0.9, ease: "power2" }) : null;
        const snowY = stage ? gsap.quickTo(stage, "y", { duration: 0.9, ease: "power2" }) : null;

        const onMove = (e) => {
          const r = hero.getBoundingClientRect();
          const px = (e.clientX - r.left) / (r.width || 1);
          const py = (e.clientY - r.top) / (r.height || 1);
          lxTo(gsap.utils.clamp(0, 100, px * 100));
          lyTo(gsap.utils.clamp(0, 100, py * 100));
          if (snowX) { snowX((px - 0.5) * -18); snowY((py - 0.5) * -12); }
        };
        const onEnter = () => hero.classList.add("is-lit");
        const onLeave = () => { hero.classList.remove("is-lit"); if (snowX) { snowX(0); snowY(0); } };
        hero.addEventListener("pointermove", onMove, { passive: true });
        hero.addEventListener("pointerenter", onEnter);
        hero.addEventListener("pointerleave", onLeave);
        local.push(() => {
          hero.removeEventListener("pointermove", onMove);
          hero.removeEventListener("pointerenter", onEnter);
          hero.removeEventListener("pointerleave", onLeave);
          hero.classList.remove("is-lit");
        });

        /* ── 4 · Sortie cinématique au scroll (ScrollTrigger, scrub) ──── */
        if (copy && typeof ScrollTrigger !== "undefined") {
          const exit = gsap.to(copy, {
            yPercent: -14, autoAlpha: 0.25, ease: "none",
            scrollTrigger: { trigger: hero, start: "top top", end: "bottom top", scrub: true },
          });
          local.push(() => { if (exit.scrollTrigger) exit.scrollTrigger.kill(); exit.kill(); });
        }

        return () => local.forEach((fn) => fn());
      }
    );

    return () => { mm.revert(); };
  };
})();
