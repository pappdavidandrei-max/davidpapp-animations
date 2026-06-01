/* ============================================================
   davidpapp.ro — Animații GSAP, custom code pentru Webflow
   ------------------------------------------------------------
   Filozofie: o singură curbă, o singură durată, o singură
   distanță. Apple style = restraint + coerență.

   Convenții data-attributes (de pus în Webflow Designer →
   Element Settings → Custom Attributes):

   data-anim="reveal"          → element care intră fade + y:40
   data-anim="timeline-reveal" → timeline card, declanșat la mijloc
   data-anim="reveal-title"    → titlu mare (intră mai sus în viewport)
   data-anim="reveal-image"    → imagine (scale 0.95 → 1.0 + fade)
   data-anim="reveal-group"    → wrapper care declanșează stagger
   data-anim="hero-intro"      → element din hero, animat la load
                                 (subtitle, title, logos, cards)
   data-anim="spotlight"       → glow mov urmărește cursorul pe hover
   data-anim-scope="hero"      → marker secțiune hero 100vh
   data-anim-order="N"         → ordinea în secvența hero-intro

   Bara mov din timeline (.timeline10_line) e CSS sticky nativ. NU
   o atingem.

   Suport mobile: animațiile rulează pe toate breakpoint-urile, dar
   parallax-ul e doar pe ≥1024px.
============================================================ */

(() => {
  'use strict';

  // CRITICAL: previne browser-ul să restaureze scroll position după refresh.
  // Fără asta, dacă userul dă F5 din mijlocul paginii, ScrollTrigger
  // calculează pozițiile pe layout-ul incomplet (imagini neîncărcate)
  // și triggerele se aprind la valori greșite.
  if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
  }

  // FAIL-SAFE: face vizibile toate elementele ascunse de anti-FOUC (CSS din
  // Head Code). Folosit când GSAP nu se încarcă (CDN blocat) sau pe
  // prefers-reduced-motion — altfel navbar/conținut rămân invizibile permanent.
  const REVEAL_SELECTOR = [
    '[data-anim]',
    '[data-anim] > *',
    '.navbar14_container-desktop .nav-logo-full',
    '.navbar14_container-desktop .navbar14_link',
    '.navbar14_container-desktop .button-purple',
    '.main-wrapper .layout141_image-wrapper',
    '.main-wrapper .layout141_project-shadow',
    '.main-wrapper .layout141_project-shadow-desktop',
    '.main-wrapper .layout141_project-shadow-mobile',
    '.main-wrapper .rezultat_component',
  ].join(',');

  function revealAll() {
    document.querySelectorAll(REVEAL_SELECTOR).forEach((el) => {
      el.style.opacity = '1';
      el.style.transform = 'none';
      el.style.visibility = 'visible';
    });
  }

  if (typeof gsap === 'undefined') {
    console.warn('[anim] GSAP nu este încărcat — animations.js nu rulează');
    revealAll(); // fail-safe: nu lăsa conținutul ascuns de anti-FOUC
    return;
  }

  if (typeof ScrollTrigger === 'undefined') {
    console.warn('[anim] ScrollTrigger nu este încărcat — scroll animations dezactivate');
  } else {
    gsap.registerPlugin(ScrollTrigger);
  }

  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const IS_DESKTOP = window.matchMedia('(min-width: 1024px)').matches;

  /* ---------- Helpers ---------- */
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  // Filtrează elemente layout-vizibile. Critic pentru Webflow care
  // duplică secțiuni desktop/mobile — ambele sunt în DOM simultan.
  const visible = (els) =>
    els.filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });

  /* ---------- Defaults stil Apple ---------- */
  const EASE = 'expo.out';
  const PREMIUM_EASE = 'power3.out';
  const DURATION = 1.0;
  const STAGGER = 0.08;

  const sortByVisualPosition = (els) =>
    [...els].sort((a, b) => {
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      if (Math.abs(ar.top - br.top) > 8) return ar.top - br.top;
      return ar.left - br.left;
    });

  const CASE_TITLE_THRESHOLD = 0.78;
  const CASE_TEXT_THRESHOLD = 0.74;
  const CASE_VISUAL_THRESHOLD = 0.75;
  const CASE_RESULT_THRESHOLD = 0.76;

  const setupScrollTriggerRefreshGuards = () => {
    if (typeof ScrollTrigger === 'undefined') return;

    let refreshRaf;
    const refresh = () => {
      if (refreshRaf) cancelAnimationFrame(refreshRaf);
      refreshRaf = requestAnimationFrame(() => {
        ScrollTrigger.refresh();
      });
    };

    let settledTimeouts = [];
    const refreshAfterLayoutSettles = () => {
      refresh();

      settledTimeouts.forEach(clearTimeout);
      settledTimeouts = [250, 750, 1500].map((delay) =>
        setTimeout(() => {
          refresh();
        }, delay)
      );
    };

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(refreshAfterLayoutSettles);
    }

    window.addEventListener('load', refreshAfterLayoutSettles, { once: true });
    // pageshow cu persisted=true înseamnă revenire din bfcache (iOS Safari).
    // Refresh-ul pe bfcache cauzează scroll jump pe iPhone — îl ignorăm.
    window.addEventListener('pageshow', (e) => {
      if (e.persisted) return;
      refreshAfterLayoutSettles();
    });

    $$('img, video').forEach((media) => {
      const isImageLoaded = media.tagName.toLowerCase() === 'img' && media.complete;
      const isVideoReady = media.tagName.toLowerCase() === 'video' && media.readyState >= 1;
      if (isImageLoaded || isVideoReady) return;

      media.addEventListener('load', refreshAfterLayoutSettles, { once: true });
      media.addEventListener('loadedmetadata', refreshAfterLayoutSettles, { once: true });
      media.addEventListener('error', refreshAfterLayoutSettles, { once: true });
    });

    let resizeRaf;
    let lastResizeWidth = window.innerWidth;
    window.addEventListener('resize', () => {
      const currentWidth = window.innerWidth;
      // Pe mobil, bara browser-ului retrasă declanșează resize doar pe înălțime.
      // Ignorăm aceste resize-uri ca să evităm ScrollTrigger.refresh() care
      // cauzează jump de scroll și reveal brusc al navbar-ului.
      if (currentWidth === lastResizeWidth && !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
      lastResizeWidth = currentWidth;
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(refreshAfterLayoutSettles);
    });

  };

  const enterWatchers = [];
  let enterWatchInterval = null;

  const runEnterWatchers = () => {
    for (let i = enterWatchers.length - 1; i >= 0; i -= 1) {
      enterWatchers[i].check();
    }
  };

  const addEnterWatcher = (watcher) => {
    enterWatchers.push(watcher);
    if (!enterWatchInterval) {
      enterWatchInterval = setInterval(runEnterWatchers, 250);
    }
  };

  const removeEnterWatcher = (watcher) => {
    const index = enterWatchers.indexOf(watcher);
    if (index !== -1) enterWatchers.splice(index, 1);
    if (!enterWatchers.length && enterWatchInterval) {
      clearInterval(enterWatchInterval);
      enterWatchInterval = null;
    }
  };

  const observeEnterOnce = (el, onEnter, thresholdRatio = CASE_VISUAL_THRESHOLD) => {
    let played = false;
    let observer = null;
    let raf = null;
    let watcher = null;

    const cleanup = () => {
      if (observer) observer.disconnect();
      if (watcher) removeEnterWatcher(watcher);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };

    const play = () => {
      if (played) return;
      played = true;
      cleanup();
      onEnter();
    };

    const isPastThreshold = () => {
      const r = el.getBoundingClientRect();
      return r.top < window.innerHeight * thresholdRatio && r.bottom > 0;
    };

    const check = () => {
      if (played || !isPastThreshold()) return;
      play();
    };

    function onScroll() {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        check();
      });
    }

    if (isPastThreshold()) {
      requestAnimationFrame(play);
      return;
    }

    if ('IntersectionObserver' in window) {
      observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting && !isPastThreshold()) return;
          play();
        });
      }, {
        root: null,
        rootMargin: `0px 0px -${Math.round((1 - thresholdRatio) * 100)}% 0px`,
        threshold: 0,
      });

      observer.observe(el);
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    setTimeout(check, 250);
    setTimeout(check, 1000);
    watcher = { check };
    addEnterWatcher(watcher);
    if ('IntersectionObserver' in window) return;

    if (typeof ScrollTrigger !== 'undefined') {
      ScrollTrigger.create({
        trigger: el,
        start: `top ${thresholdRatio * 100}%`,
        once: true,
        invalidateOnRefresh: true,
        onEnter: play,
      });
    }
  };

  if (REDUCED) {
    revealAll();        // fără animații: tot conținutul + navbarul vizibile instant
    initLiveDot();      // injectează ring-urile (CSS le oprește pe reduced-motion)
    initSpotlight();    // glow-ul cursor e non-motion, îl păstrăm
    return;             // NU pornim Lenis (smooth scroll) — accesibilitate
  }

  /* ============================================================
     0. NAVBAR INTRO — desktop și mobile tratate separat.
        Desktop: logo → links → contact.
        Mobile: logo + hamburger la load, linkurile când se deschide meniul.
  ============================================================ */
  function initNavbarIntro() {
    const nav = document.querySelector('.nav_motion');
    if (!nav) return;

    const desktop = nav.querySelector('.navbar14_container-desktop');
    const mobile = nav.querySelector('.navbar14_container-mobil');

    if (desktop) {
      // v2 are 2 logo-uri (full + icon) pentru switch la scroll.
      // Animăm DOAR opacity (nu y) pe logo-uri ca să nu interferăm cu
      // display:none/flex-ul gestionat de CSS la scroll. Folosim doar
      // logo-ul vizibil (full) pentru animația de intrare; iconul rămâne
      // la opacity:1 ca să apară corect când CSS-ul îl activează la scroll.
      const logos = Array.from(desktop.querySelectorAll('.navbar14_logo-link'));
      const logoFull = desktop.querySelector('.nav-logo-full') || logos[0];
      const links = Array.from(desktop.querySelectorAll('.navbar14_link'));
      const contactBtn = desktop.querySelector('.navbar14_button-wrapper') || desktop.querySelector('.button-purple');

      // Logo-icon: asigură-te că NU rămâne ascuns de GSAP (CSS îl controlează la scroll)
      logos.forEach((l) => {
        if (l !== logoFull) gsap.set(l, { clearProps: 'all' });
      });

      const animItems = [logoFull, ...links, contactBtn].filter(Boolean);
      if (animItems.length) {
        gsap.set(animItems, { autoAlpha: 0, y: -32 });

        const tl = gsap.timeline({ delay: 0.2, defaults: { ease: EASE } });

        if (logoFull) {
          tl.to(logoFull, { autoAlpha: 1, y: 0, duration: 0.5 }, 0);
        }

        if (links.length) {
          // Stagger mai strâns ca să fie cascadă seamless cu contactul
          tl.to(links, {
            autoAlpha: 1,
            y: 0,
            duration: 0.5,
            stagger: 0.08,
          }, 0.1);
        }

        // Contact intră imediat după ultimul link — cascadă continuă, nu cu pauză.
        if (contactBtn) {
          tl.to(contactBtn, { autoAlpha: 1, y: 0, duration: 0.5 }, 0.1 + links.length * 0.08);
        }
      }
    }

    if (!mobile) return;

    const mobileLogo = mobile.querySelector('.navbar14_logo-link');
    const menuButton = mobile.querySelector('.navbar14_menu-button');
    const menu = mobile.querySelector('[data-mobile-menu="main"]');
    const menuLinks = menu
      ? Array.from(menu.querySelectorAll('.navbar14_link, .link-button'))
      : [];

    const mobileIntroItems = [mobileLogo, menuButton].filter(Boolean);
    if (mobileIntroItems.length) {
      gsap.set(mobileIntroItems, { autoAlpha: 0, y: -24 });
      gsap.to(mobileIntroItems, {
        autoAlpha: 1,
        y: 0,
        duration: 0.55,
        ease: EASE,
        stagger: 0.08,
        delay: 0.18,
      });
    }

    if (!menuButton || !menuLinks.length) return;

    gsap.set(menuLinks, { autoAlpha: 0, y: -18 });

    let menuWasOpen = false;
    menuButton.addEventListener('click', () => {
      requestAnimationFrame(() => {
        const isOpen = menuButton.classList.contains('w--open');
        if (!isOpen || menuWasOpen) {
          menuWasOpen = isOpen;
          return;
        }

        menuWasOpen = true;
        gsap.killTweensOf(menuLinks);
        gsap.fromTo(
          menuLinks,
          { autoAlpha: 0, y: -18 },
          {
            autoAlpha: 1,
            y: 0,
            duration: 0.5,
            ease: EASE,
            stagger: 0.08,
            delay: 0.05,
          }
        );
      });
    });
  }

  /* ============================================================
     0a. HERO BLOCK REVEAL — case study pages
         data-anim="block-reveal" pe container (ex .header_component)
           → fade + y:30, 1.0s la load, intră ca un bloc.
         data-anim="block-stagger" data-anim-order="N" pe sub-elemente
           → fade + y:24, 0.8s, stagger 0.10s, sortate după order.
         Cele două sunt cuplate într-un singur timeline: block-reveal
         pornește la load, apoi stagger-ul intră imediat după.
         NU forțează niciun layout (display, position) — atributul e
         pur semantic, doar JS-ul îl folosește.
  ============================================================ */
  function initHeroBlockReveal() {
    const block = document.querySelector('[data-anim="block-reveal"]');
    const staggerItems = $$('[data-anim="block-stagger"]');
    if (!block && !staggerItems.length) return;

    if (staggerItems.length) {
      staggerItems.sort((a, b) => {
        const oa = parseInt(a.dataset.animOrder || '0', 10);
        const ob = parseInt(b.dataset.animOrder || '0', 10);
        return oa - ob;
      });
      gsap.set(staggerItems, { autoAlpha: 0, y: 24 });
    }

    // Imaginea hero (case study) — animație proprie: scale subtil + fade,
    // pornește odată cu block-reveal-ul pentru un efect mai bogat.
    const heroImage = block ? block.querySelector('.header26_image-wrapper') : null;
    const heroImg = heroImage ? heroImage.querySelector('img') : null;

    const tl = gsap.timeline({ delay: 0.2, defaults: { ease: EASE } });

    if (block) {
      gsap.set(block, { autoAlpha: 0, y: 30 });
      tl.to(block, { autoAlpha: 1, y: 0, duration: 1.0 }, 0);
    }

    if (heroImage) {
      gsap.set(heroImage, { autoAlpha: 0, scale: 0.97, transformOrigin: 'center center' });
      if (heroImg) gsap.set(heroImg, { scale: 1.06, transformOrigin: 'center center' });
      tl.to(heroImage, { autoAlpha: 1, scale: 1, duration: 1.3, ease: PREMIUM_EASE }, 0.1);
      if (heroImg) tl.to(heroImg, { scale: 1, duration: 1.6, ease: PREMIUM_EASE }, 0.1);
    }

    if (staggerItems.length) {
      tl.to(staggerItems, {
        autoAlpha: 1,
        y: 0,
        duration: 0.8,
        stagger: 0.10,
      }, block ? '>-0.45' : 0);
    }

    return tl;
  }

  /* ============================================================
     0d. CASE STUDY PATTERNS — Flaviu Studio
         Cinci patterns simple, independente, fără nesting:
         - tilt-card: hover 3D pe imagini cu chenar / shadow
         - fade-up-mockup: mockup-uri device fade + y:24
         - fade-up-title: titluri secțiune fade + y:24
         - fade-up-text: paragrafe + sub-titluri fade + y:16
         - fade-up-list: liste cu bullets stagger pe <li>
         REGULI:
         - data-anim DOAR pe tag-uri pure (h2, p, ul, li) sau pe
           wrappere care n-au stilare conflictuală
         - fiecare element are propriul ScrollTrigger
         - invalidateOnRefresh pe toate
         - once: true ca să nu se repete
  ============================================================ */

  // A. TILT CARD — hover 3D subtle
  function initTiltCard() {
    if (!window.matchMedia('(hover: hover)').matches) return;

    const cards = visible($$('[data-anim="tilt-card"]'));
    cards.forEach((card) => {
      // quickSetter pentru performanță 60fps fără tween-uri noi
      const setRotY = gsap.quickSetter(card, 'rotationY', 'deg');
      const setRotX = gsap.quickSetter(card, 'rotationX', 'deg');
      const setZ = gsap.quickSetter(card, 'translateZ', 'px');

      card.addEventListener('mousemove', (e) => {
        const r = card.getBoundingClientRect();
        const cx = (e.clientX - r.left) / r.width - 0.5;  // -0.5..+0.5
        const cy = (e.clientY - r.top) / r.height - 0.5;
        setRotY(cx * 12);   // ±6°
        setRotX(-cy * 8);   // ±4° (inversat ca să se înclinte natural)
        setZ(8);
      });

      card.addEventListener('mouseleave', () => {
        gsap.to(card, {
          rotationY: 0, rotationX: 0, translateZ: 0,
          duration: 0.6, ease: 'power3.out', overwrite: 'auto',
        });
      });
    });
  }

  // B. FADE UP MOCKUP — pe mockup-uri device
  // NU folosim visible() filter aici — la DOMContentLoaded, imaginile
  // încă se încarcă și getBoundingClientRect() poate returna 0 pe
  // unele elemente. Pentru mockup-uri responsive (desktop/mobile),
  // CSS-ul Webflow le ascunde cu display:none — verificăm asta explicit.
  function initFadeUpMockup() {
    if (!('IntersectionObserver' in window) && typeof ScrollTrigger === 'undefined') return;

    $$('[data-anim="fade-up-mockup"]').filter(el => {
      return getComputedStyle(el).display !== 'none';
    }).forEach((el) => {
      const image = el.querySelector('img');
      gsap.set(el, { autoAlpha: 0, y: 24, scale: 0.994, transformOrigin: 'center center', overwrite: 'auto' });
      if (image) gsap.set(image, { scale: 1.02, transformOrigin: 'center center', overwrite: 'auto' });
      observeEnterOnce(el, () => {
        const tl = gsap.timeline({ defaults: { ease: PREMIUM_EASE, overwrite: 'auto' } });
        tl.to(el, { autoAlpha: 1, y: 0, scale: 1, duration: 1.2 }, 0);
        if (image) tl.to(image, { scale: 1, duration: 1.5 }, 0.03);
      });
    });
  }

  // B2. VISUAL ASSET REVEAL — imagini / carduri vizuale non-hero.
  // Păstrăm un limbaj comun: fade + y + scale foarte mic pe wrapper,
  // cu imaginea care se așază subtil în interior. Fără efecte grele.
  function initVisualAssetReveals() {
    const selectors = [
      '.main-wrapper .layout141_image-wrapper',
      '.main-wrapper .layout141_image-wrapper-border',
      '.main-wrapper .layout141_project-shadow',
      '.main-wrapper .layout141_project-shadow-desktop',
      '.main-wrapper .layout141_project-shadow-mobile',
    ].join(',');

    const allBlocks = Array.from(new Set($$(selectors)))
      .filter((el) => !el.closest('.section_header26'))
      .filter((el) => !el.closest('.section_rezultat'))
      .filter((el) => el.querySelector('img, video, .w-background-video'))
      .filter((el) => getComputedStyle(el).display !== 'none')
      // NU anima wrappere care sunt copii ai altora deja prinse de noi
      // (ex: image-wrapper-border copil al project-shadow în Design System)
      .filter((el, _, all) => !all.some((other) => other !== el && other.contains(el)))
      // NU anima wrappere care sunt deja preluate de cascade-images
      .filter((el) => !el.closest('[data-anim="cascade-images"]'))
      // NU anima wrappere care au data-anim="fade-up-mockup" sau sunt sub unul
      // (initFadeUpMockup le gestionează — altfel dublă animație ascunde imaginea)
      .filter((el) => !el.closest('[data-anim="fade-up-mockup"]'));

    const uikitBlocks = sortByVisualPosition(
      allBlocks.filter((el) => el.closest('.section_uikit'))
    );
    const regularBlocks = allBlocks.filter((el) => !el.closest('.section_uikit'));

    const setVisualPrestate = (blocks) => {
      blocks.forEach((block) => {
        const image = block.querySelector('img');
        gsap.set(block, {
          autoAlpha: 0,
          y: 22,
          scale: 0.994,
          transformOrigin: 'center center',
          willChange: 'transform, opacity',
          overwrite: 'auto',
        });
        if (image) {
          gsap.set(image, {
            scale: 1.01,
            transformOrigin: 'center center',
            willChange: 'transform',
            overwrite: 'auto',
          });
        }
      });
    };

    setVisualPrestate(regularBlocks);
    setVisualPrestate(uikitBlocks);

    regularBlocks.forEach((block) => {
      const image = block.querySelector('img');
      observeEnterOnce(block, () => {
        const tl = gsap.timeline({ defaults: { ease: PREMIUM_EASE, overwrite: 'auto' } });
        tl.to(block, {
          autoAlpha: 1,
          y: 0,
          scale: 1,
          duration: 1.42,
          onComplete: () => gsap.set(block, { willChange: 'auto' }),
        }, 0);
        if (image) {
          tl.to(image, {
            scale: 1,
            duration: 1.68,
            onComplete: () => gsap.set(image, { willChange: 'auto' }),
          }, 0.03);
        }
      }, CASE_VISUAL_THRESHOLD);
    });

    if (uikitBlocks.length) {
      observeEnterOnce(uikitBlocks[0], () => {
        const tl = gsap.timeline({ defaults: { ease: PREMIUM_EASE, overwrite: 'auto' } });
        tl.to(uikitBlocks, {
          autoAlpha: 1,
          y: 0,
          scale: 1,
          duration: 1.36,
          stagger: 0.16,
          onComplete: () => gsap.set(uikitBlocks, { willChange: 'auto' }),
        }, 0);
        tl.to(uikitBlocks.map((block) => block.querySelector('img')).filter(Boolean), {
          scale: 1,
          duration: 1.62,
          stagger: 0.16,
          onComplete: () => {
            gsap.set(uikitBlocks.map((block) => block.querySelector('img')).filter(Boolean), { willChange: 'auto' });
          },
        }, 0.03);
      }, CASE_VISUAL_THRESHOLD);
    }
  }

  // C. FADE UP TEXT — gestionează titluri, paragrafe/sub-titluri,
  // și liste cu stagger pe <li>. Trei sub-patterns, o singură trecere.
  // NU folosim visible() filter — la DOMContentLoaded, layout-ul nu e
  // finalizat (imagini lazy, fonturi) și getBoundingClientRect()
  // returnează 0 pe multe elemente, ele NU ar primi ScrollTrigger.
  // Pentru text nu există duplicate desktop/mobile, nu avem nevoie de filtru.
  function initFadeUpText() {
    if (!('IntersectionObserver' in window) && typeof ScrollTrigger === 'undefined') return;

    // C1. Titluri mari de secțiune
    $$('[data-anim="fade-up-title"]').forEach((el) => {
      if (el.closest('.section_rezultat')) return;
      if (el.getAttribute('data-anim-handled') === 'true') return;
      gsap.set(el, { autoAlpha: 0, y: 20, willChange: 'transform, opacity', overwrite: 'auto' });
      observeEnterOnce(el, () => {
        gsap.to(el, {
          autoAlpha: 1, y: 0,
          duration: 0.95, ease: EASE,
          overwrite: 'auto',
          onComplete: () => gsap.set(el, { willChange: 'auto' }),
        });
      }, CASE_TITLE_THRESHOLD);
    });

    // C2. Paragrafe + sub-titluri
    $$('[data-anim="fade-up-text"]').forEach((el) => {
      if (el.closest('.section_rezultat')) return;
      if (el.getAttribute('data-anim-handled') === 'true') return;
      gsap.set(el, { autoAlpha: 0, y: 14, willChange: 'transform, opacity', overwrite: 'auto' });
      observeEnterOnce(el, () => {
        gsap.to(el, {
          autoAlpha: 1, y: 0,
          duration: 0.78, ease: EASE,
          overwrite: 'auto',
          onComplete: () => gsap.set(el, { willChange: 'auto' }),
        });
      }, CASE_TEXT_THRESHOLD);
    });

    // C3. Liste cu bullets — stagger pe <li> copii direcți
    $$('[data-anim="fade-up-list"]').forEach((ul) => {
      if (ul.getAttribute('data-anim-handled') === 'true') return;
      const items = Array.from(ul.children);
      if (!items.length) return;

      gsap.set(items, { autoAlpha: 0, y: 10, willChange: 'transform, opacity', overwrite: 'auto' });
      observeEnterOnce(ul, () => {
        gsap.to(items, {
          autoAlpha: 1, y: 0,
          duration: 0.6, ease: EASE,
          stagger: 0.08,
          overwrite: 'auto',
          onComplete: () => gsap.set(items, { willChange: 'auto' }),
        });
      }, CASE_TEXT_THRESHOLD);
    });
  }

  // C2b. FADE LEFT LIST — listă cu items separați prin divider, fiecare
  // intră de la stânga (x:-24 → 0) + fade. Divider-ele își întind line-ul
  // de la stânga la dreapta (scaleX 0 → 1 din origine left). Pattern
  // narativ pentru liste lungi cu separatoare vizibile.
  function initFadeLeftList() {
    $$('[data-anim="fade-left-list"]').forEach((wrap) => {
      // Identific items (regular-text) și dividers (.divider-horizontal)
      // — copii direcți, în ordinea vizuală a DOM-ului
      const allChildren = Array.from(wrap.children).filter((c) => {
        return c.classList.contains('layout141_regular-text')
            || c.classList.contains('divider-horizontal');
      });
      if (!allChildren.length) return;

      // Pre-state — items intră din stânga, dividers cresc din stânga
      allChildren.forEach((c) => {
        if (c.classList.contains('divider-horizontal')) {
          gsap.set(c, {
            scaleX: 0,
            transformOrigin: 'left center',
            willChange: 'transform',
            overwrite: 'auto',
          });
        } else {
          gsap.set(c, {
            autoAlpha: 0,
            x: -24,
            willChange: 'transform, opacity',
            overwrite: 'auto',
          });
        }
      });

      observeEnterOnce(wrap, () => {
        const tl = gsap.timeline({ defaults: { ease: EASE, overwrite: 'auto' } });
        // Stagger pe TOATE items + dividers, în ordinea naturală.
        // Items: fade + slide-in. Dividers: scaleX growth.
        allChildren.forEach((c, idx) => {
          const t = idx * 0.08;
          if (c.classList.contains('divider-horizontal')) {
            tl.to(c, {
              scaleX: 1,
              duration: 0.5,
              onComplete: () => gsap.set(c, { willChange: 'auto' }),
            }, t);
          } else {
            tl.to(c, {
              autoAlpha: 1, x: 0,
              duration: 0.65,
              onComplete: () => gsap.set(c, { willChange: 'auto' }),
            }, t);
          }
        });
      }, CASE_TEXT_THRESHOLD);
    });
  }

  // E0. MISFIT NARRATIVE BLOCK — cascadă coordonată tag → titlu → conținut
  // pentru wrapperele `.misfit-title_heading`. Construiește un timeline
  // unic per secțiune cu pacing cinematic lent:
  //   t=0       — tagline ("01 • Context") apare
  //   t=0.35s   — titlul mare apare
  //   t=0.75s   — paragrafele + sub-titluri + listele din același bloc text
  //                intră cu stagger
  // Elementele preluate sunt marcate cu data-anim-handled="true" ca să
  // sară triggerele individuale (fade-up-tag, fade-up-title, fade-up-text,
  // fade-up-list) care altfel le-ar declanșa în paralel.
  function initMisfitNarrativeBlock() {
    gsap.utils.toArray('.misfit-title_heading').forEach((heading) => {
      // Skip Reflection (cardul Rezultat) — gestionat de initResultReveal
      if (heading.classList.contains('is-reflection')) return;
      if (heading.closest('.section_rezultat')) return;
      const tag = heading.querySelector('[data-anim="fade-up-tag"]');
      const title = heading.querySelector('[data-anim="fade-up-title"]');
      // Restul conținutului semantic e fratele lui .misfit-title_heading
      // în interiorul .layout141_text-wrapper sau .layout141_component.
      const semanticParent = heading.closest('.layout141_text-wrapper, .layout141_component');
      if (!semanticParent) return;

      // Caut paragrafe, sub-titluri, liste ȘI quote din PARENT, dar NU din
      // interiorul heading-ului (acelea sunt tag-ul + titlul deja).
      // Important: includem `fade-up-quote` ca să intre la finalul cascadei,
      // după paragrafe (citatul vine ca un "punch line" la final).
      const texts = gsap.utils.toArray(
        semanticParent.querySelectorAll(
          '[data-anim="fade-up-text"], [data-anim="fade-up-list"], [data-anim="fade-up-quote"]'
        )
      ).filter((el) => !heading.contains(el));

      const allTargets = [tag, title, ...texts].filter(Boolean);
      if (!allTargets.length) return;

      // Marchez ca handled — triggerele individuale le vor sări
      allTargets.forEach((el) => el.setAttribute('data-anim-handled', 'true'));

      // Pre-state
      if (tag) gsap.set(tag, { autoAlpha: 0, y: 12, willChange: 'transform, opacity', overwrite: 'auto' });
      if (title) gsap.set(title, { autoAlpha: 0, y: 24, willChange: 'transform, opacity', overwrite: 'auto' });
      texts.forEach((el) => {
        const attr = el.getAttribute('data-anim');
        if (attr === 'fade-up-list') {
          const items = Array.from(el.children);
          gsap.set(items, { autoAlpha: 0, y: 12, willChange: 'transform, opacity', overwrite: 'auto' });
        } else if (attr === 'fade-up-quote') {
          // Quote: card + background, ca în initFadeUpQuote
          const background = el.querySelector('.context_background, .context-bg, [class*="background"]');
          gsap.set(el, {
            autoAlpha: 0, y: 22, scale: 0.99,
            transformOrigin: 'center center',
            willChange: 'transform, opacity', overwrite: 'auto',
          });
          if (background) {
            gsap.set(background, {
              autoAlpha: 0, scale: 1.03,
              transformOrigin: 'center center', overwrite: 'auto',
            });
          }
        } else {
          gsap.set(el, { autoAlpha: 0, y: 16, willChange: 'transform, opacity', overwrite: 'auto' });
        }
      });

      // Trigger pe heading wrapper, dar timeline-ul animează tot blocul semantic
      observeEnterOnce(heading, () => {
        const tl = gsap.timeline({ defaults: { ease: EASE, overwrite: 'auto' } });

        // t=0 — tagline
        if (tag) {
          tl.to(tag, {
            autoAlpha: 1, y: 0,
            duration: 0.7,
            onComplete: () => gsap.set(tag, { willChange: 'auto' }),
          }, 0);
        }

        // t=0.35 — titlu
        if (title) {
          tl.to(title, {
            autoAlpha: 1, y: 0,
            duration: 0.9,
            onComplete: () => gsap.set(title, { willChange: 'auto' }),
          }, 0.35);
        }

        // t=0.75 — conținut (paragrafe + sub-titluri + liste + quote) cu mini-stagger
        // Quote vine la final cu un offset mai mare (ca un "punch line")
        if (texts.length) {
          let textOffset = 0;
          texts.forEach((el) => {
            const attr = el.getAttribute('data-anim');
            if (attr === 'fade-up-list') {
              const items = Array.from(el.children);
              tl.to(items, {
                autoAlpha: 1, y: 0,
                duration: 0.6,
                stagger: 0.08,
                onComplete: () => gsap.set(items, { willChange: 'auto' }),
              }, 0.75 + textOffset);
              textOffset += 0.15;
            } else if (attr === 'fade-up-quote') {
              // Quote intră ca un block: card + background coordonate
              const background = el.querySelector('.context_background, .context-bg, [class*="background"]');
              tl.to(el, {
                autoAlpha: 1, y: 0, scale: 1,
                duration: 0.9,
                ease: PREMIUM_EASE,
                onComplete: () => gsap.set(el, { willChange: 'auto' }),
              }, 0.75 + textOffset + 0.1);  // mic offset extra ca quote să vină după paragrafe
              if (background) {
                tl.to(background, {
                  autoAlpha: 1, scale: 1,
                  duration: 1.05,
                  ease: PREMIUM_EASE,
                }, 0.75 + textOffset + 0.18);
              }
              textOffset += 0.2;
            } else {
              tl.to(el, {
                autoAlpha: 1, y: 0,
                duration: 0.75,
                onComplete: () => gsap.set(el, { willChange: 'auto' }),
              }, 0.75 + textOffset);
              textOffset += 0.1;
            }
          });
        }
      }, CASE_TITLE_THRESHOLD);
    });
  }

  // E. FADE UP TAG — eticheta numerotată de deasupra titlului
  // (ex: "01 • Context"). Intră ÎNAINTE de titlu, mai sus în viewport,
  // pentru a sublinia ierarhia narativă a paginii.
  function initFadeUpTag() {
    gsap.utils.toArray('[data-anim="fade-up-tag"]').forEach((el) => {
      if (el.getAttribute('data-anim-handled') === 'true') return;
      gsap.set(el, { autoAlpha: 0, y: 12, willChange: 'transform, opacity', overwrite: 'auto' });
      observeEnterOnce(el, () => {
        gsap.to(el, {
          autoAlpha: 1, y: 0,
          duration: 0.7, ease: EASE,
          overwrite: 'auto',
          onComplete: () => gsap.set(el, { willChange: 'auto' }),
        });
      }, CASE_TITLE_THRESHOLD);
    });
  }

  // F. FADE UP QUOTE — cardul cu citat (`.context_border` în Misfit).
  // Componenta întreagă (border + background + text) apare ca un bloc,
  // apoi background-ul își crește scale-ul subtil pentru efect de
  // "așezare". Folosește gsap.timeline pentru a coordona cele 2 layere.
  function initFadeUpQuote() {
    gsap.utils.toArray('[data-anim="fade-up-quote"]').forEach((card) => {
      if (card.getAttribute('data-anim-handled') === 'true') return;
      const background = card.querySelector('.context_background, .context-bg, [class*="background"]');

      gsap.set(card, {
        autoAlpha: 0,
        y: 26,
        scale: 0.99,
        transformOrigin: 'center center',
        willChange: 'transform, opacity',
        overwrite: 'auto',
      });
      if (background) {
        gsap.set(background, {
          autoAlpha: 0,
          scale: 1.03,
          transformOrigin: 'center center',
          overwrite: 'auto',
        });
      }

      observeEnterOnce(card, () => {
        const tl = gsap.timeline({ defaults: { ease: PREMIUM_EASE, overwrite: 'auto' } });
        tl.to(card, {
          autoAlpha: 1, y: 0, scale: 1,
          duration: 1.05,
          onComplete: () => gsap.set(card, { willChange: 'auto' }),
        }, 0);
        if (background) {
          tl.to(background, {
            autoAlpha: 1, scale: 1,
            duration: 1.2,
          }, 0.08);
        }
      }, CASE_VISUAL_THRESHOLD);
    });
  }

  // G. STAGGER CARDS — un grup de carduri (ex: 4 decizii Misfit) care
  // intră în cascadă cu stagger 0.12s. Folosim gsap.timeline cu defaults.
  function initStaggerCards() {
    gsap.utils.toArray('[data-anim="stagger-cards"]').forEach((group) => {
      // Items sunt copii direcți cu clasă card (sau toți copiii direcți)
      const items = Array.from(group.children).filter((c) => {
        const r = c.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      if (!items.length) return;

      gsap.set(items, {
        autoAlpha: 0, y: 24, scale: 0.985,
        transformOrigin: 'center center',
        willChange: 'transform, opacity',
        overwrite: 'auto',
      });

      observeEnterOnce(group, () => {
        gsap.to(items, {
          autoAlpha: 1, y: 0, scale: 1,
          duration: 0.9, ease: PREMIUM_EASE,
          stagger: 0.12,
          overwrite: 'auto',
          onComplete: () => gsap.set(items, { willChange: 'auto' }),
        });
      }, CASE_VISUAL_THRESHOLD);
    });
  }

  // H. CASCADE IMAGES — pentru rânduri de imagini side-by-side (ex: cele
  // 3 imagini din Design System Misfit). Cascadă stânga→dreapta cu
  // stagger 0.14s pe wrapper-ele de imagine.
  function initCascadeImages() {
    gsap.utils.toArray('[data-anim="cascade-images"]').forEach((group) => {
      // Filtrăm pe display (nu pe getBoundingClientRect) — la boot, imaginile
      // lazy pot avea width/height 0 deși NU sunt display:none. Filtrul pe
      // dimensiune le-ar elimina și ar lăsa pre-state-ul CSS să le ascundă permanent.
      const items = sortByVisualPosition(
        Array.from(group.children).filter((c) => {
          return getComputedStyle(c).display !== 'none';
        })
      );
      if (!items.length) return;

      gsap.set(items, {
        autoAlpha: 0, y: 30, scale: 0.985,
        transformOrigin: 'center center',
        willChange: 'transform, opacity',
        overwrite: 'auto',
      });
      // Imaginile dinăuntrul fiecărui item pleacă cu un scale mai mare ca
      // să se așeze odată cu wrapperul (efectul "zoom inwards").
      const innerImages = items
        .map((it) => it.querySelector('img'))
        .filter(Boolean);
      if (innerImages.length) {
        gsap.set(innerImages, {
          scale: 1.04,
          transformOrigin: 'center center',
          overwrite: 'auto',
        });
      }

      observeEnterOnce(group, () => {
        const tl = gsap.timeline({ defaults: { ease: PREMIUM_EASE, overwrite: 'auto' } });
        tl.to(items, {
          autoAlpha: 1, y: 0, scale: 1,
          duration: 1.1,
          stagger: 0.14,
          onComplete: () => gsap.set(items, { willChange: 'auto' }),
        }, 0);
        if (innerImages.length) {
          tl.to(innerImages, {
            scale: 1,
            duration: 1.35,
            stagger: 0.14,
          }, 0.05);
        }
      }, CASE_VISUAL_THRESHOLD);
    });
  }

  // D. RESULT CARD — moment dedicat de final pentru cardul "Rezultat".
  // Componenta întreagă apare ca un obiect, apoi conținutul intră narativ:
  // titlu → rezumat → "Ce contează" → cele 3 concluzii din stânga.
  function initResultReveal() {
    const section = document.querySelector('.section_rezultat');
    if (!section) return;

    const component = section.querySelector('.rezultat_component');
    const card = section.querySelector('.rezultat_card');
    const background = section.querySelector('.rez_background');
    // Tagline opțional (Misfit Reflection: "11 · Reflection")
    const tag = section.querySelector('[data-anim="fade-up-tag"]');
    const title = section.querySelector('[data-anim="fade-up-title"]');
    const summary = section.querySelector('.margin-bottom.margin-small [data-anim="fade-up-text"]')
      || section.querySelector('[data-anim="fade-up-text"]');
    const finalHeading = Array.from(section.querySelectorAll('h3'))
      .find((el) => (el.textContent || '').trim().includes('Ce contează'));
    const points = Array.from(section.querySelectorAll('p.text-size-regular'))
      .filter((el) => (el.textContent || '').trim().startsWith('→'));
    // Extra paragrafe care nu sunt nici summary, nici points (ex: Misfit
    // unde cardul Rezultat are 3 paragrafe normale, fără pattern "Ce contează").
    const extraTexts = Array.from(section.querySelectorAll('[data-anim="fade-up-text"]'))
      .filter((el) => el !== summary && !points.includes(el));

    if (!component) return;

    // Marchez elementele preluate ca să nu fie animate de funcțiile individuale
    [tag, title, summary, finalHeading, ...points, ...extraTexts]
      .filter(Boolean)
      .forEach((el) => el.setAttribute('data-anim-handled', 'true'));

    gsap.set(component, {
      autoAlpha: 0,
      y: 30,
      scale: 0.992,
      transformOrigin: 'center center',
      willChange: 'transform, opacity',
      overwrite: 'auto',
    });
    if (background) gsap.set(background, { autoAlpha: 0, scale: 1.035, overwrite: 'auto' });
    if (tag) gsap.set(tag, { autoAlpha: 0, y: 12, willChange: 'transform, opacity', overwrite: 'auto' });
    if (title) gsap.set(title, { autoAlpha: 0, y: 22, willChange: 'transform, opacity', overwrite: 'auto' });
    if (summary) gsap.set(summary, { autoAlpha: 0, y: 16, willChange: 'transform, opacity', overwrite: 'auto' });
    if (finalHeading) gsap.set(finalHeading, { autoAlpha: 0, x: -22, willChange: 'transform, opacity', overwrite: 'auto' });
    if (points.length) gsap.set(points, { autoAlpha: 0, x: -24, willChange: 'transform, opacity', overwrite: 'auto' });
    if (extraTexts.length) gsap.set(extraTexts, { autoAlpha: 0, y: 14, willChange: 'transform, opacity', overwrite: 'auto' });

    observeEnterOnce(component, () => {
      const tl = gsap.timeline({ defaults: { ease: EASE, overwrite: 'auto' } });
      tl.to(component, {
        autoAlpha: 1,
        y: 0,
        scale: 1,
        duration: 1.18,
        onComplete: () => gsap.set(component, { willChange: 'auto' }),
      }, 0);

      if (background) {
        tl.to(background, {
          autoAlpha: 1,
          scale: 1,
          duration: 1.2,
        }, 0.08);
      }

      // Tagline opțional (Misfit Reflection) intră ÎNAINTE de titlu
      if (tag) tl.to(tag, { autoAlpha: 1, y: 0, duration: 0.7, onComplete: () => gsap.set(tag, { willChange: 'auto' }) }, 0.18);
      if (title) tl.to(title, { autoAlpha: 1, y: 0, duration: 0.85, onComplete: () => gsap.set(title, { willChange: 'auto' }) }, tag ? 0.45 : 0.22);
      if (summary) tl.to(summary, { autoAlpha: 1, y: 0, duration: 0.8, onComplete: () => gsap.set(summary, { willChange: 'auto' }) }, tag ? 0.62 : 0.38);
      // Paragrafele extra (Misfit) intră imediat după summary, cu stagger.
      if (extraTexts.length) {
        tl.to(extraTexts, {
          autoAlpha: 1, y: 0,
          duration: 0.75,
          stagger: 0.1,
          onComplete: () => gsap.set(extraTexts, { willChange: 'auto' }),
        }, tag ? 0.78 : 0.52);
      }
      if (finalHeading) tl.to(finalHeading, { autoAlpha: 1, x: 0, duration: 0.72, onComplete: () => gsap.set(finalHeading, { willChange: 'auto' }) }, 0.66);
      if (points.length) {
        tl.to(points, {
          autoAlpha: 1,
          x: 0,
          duration: 0.72,
          stagger: 0.12,
          onComplete: () => gsap.set(points, { willChange: 'auto' }),
        }, 0.82);
      }
    }, CASE_RESULT_THRESHOLD);
  }

  /* ============================================================
     0b. SPLIT HERO TITLE — case study pages
         data-anim="split-hero-title" pe titlul mare
         Liniile vin de jos (yPercent 110 → 0) printr-o mască.
         Folosește SplitText (gratuit, no token). Re-split auto la
         resize / font-load prin autoSplit + onSplit.
  ============================================================ */
  function initSplitHeroTitle() {
    if (typeof SplitText === 'undefined') return;
    const el = document.querySelector('[data-anim="split-hero-title"]');
    if (!el) return;

    const run = () => {
      el.style.visibility = 'visible';
      SplitText.create(el, {
        type: 'lines',
        linesClass: 'split-line',
        mask: 'lines',
        autoSplit: true,
        onSplit: (self) => {
          return gsap.from(self.lines, {
            yPercent: 110,
            duration: 1.1,
            ease: EASE,
            stagger: 0.08,
            delay: 0.15,
          });
        },
      });
    };

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(run);
    } else {
      run();
    }
  }

  /* ============================================================
     0c. HERO IMAGE ZOOM — case study pages
         data-anim-zoom="hero" pe imaginea featured din hero
         Scale 1.0 → 1.05 scrubbed pe scroll, ease none, subtle.
  ============================================================ */
  function initHeroImageZoom() {
    if (typeof ScrollTrigger === 'undefined') return;
    const img = document.querySelector('[data-anim-zoom="hero"]');
    if (!img) return;

    gsap.to(img, {
      scale: 1.05,
      ease: 'none',
      scrollTrigger: {
        trigger: img,
        start: 'top top',
        end: 'bottom top',
        scrub: 0.8,
      },
    });
  }

  /* ============================================================
     1. HERO INTRO — animație la load, secvențial
        Returnează un timeline ca initHeroParallax să se lege
        de onComplete în loc de setTimeout.
  ============================================================ */
  function initHeroIntro() {
    const scope = document.querySelector('[data-anim-scope="hero"]');
    if (!scope) return null;

    const items = $$('[data-anim="hero-intro"]', scope);
    if (!items.length) return null;

    items.sort((a, b) => {
      const oa = parseInt(a.dataset.animOrder || '0', 10);
      const ob = parseInt(b.dataset.animOrder || '0', 10);
      return oa - ob;
    });

    // introItems = subtitle (order1), H1 (order2), logo-uri (order3).
    // cardItems = cele 4 carduri grid (order >= 4).
    const introItems = items.filter((el) => parseInt(el.dataset.animOrder || '0', 10) < 4);
    const cardItems = items.filter((el) => parseInt(el.dataset.animOrder || '0', 10) >= 4)
      // sortează stânga→dreapta după poziția vizuală
      .sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);

    // Apple-minim, ușor dramatic: NU animăm containerul (header_component).
    // Doar elementele fac fade + slide, cu power3.out (decelerare elegantă,
    // "plutește" la final). Mică respirație între conținut central și carduri.
    gsap.set(introItems, { autoAlpha: 0, y: 30 });
    gsap.set(cardItems, { autoAlpha: 0, y: 36 });

    const tl = gsap.timeline({ delay: 0.15 });

    // 1. Conținut central: subtitle → H1 → logo, fade + slide, decelerare lină.
    //    Stagger mare ca fiecare să apară clar separat ("pac, pac, pac").
    tl.to(introItems, {
      autoAlpha: 1, y: 0,
      duration: 0.9, ease: PREMIUM_EASE,
      stagger: 0.28,
    }, 0);

    // 2. Cardurile grid: stânga→dreapta, după o mică respirație, stagger separat
    const cardsStart = introItems.length * 0.28 + 0.15; // respirație după text
    tl.to(cardItems, {
      autoAlpha: 1, y: 0,
      duration: 0.9, ease: PREMIUM_EASE,
      stagger: 0.2,
    }, cardsStart);

    return tl;
  }

  /* ============================================================
     1b. HERO PARALLAX — cardurile + boxul hero se mișcă pe scroll
         Pornește după ce intro-ul s-a terminat (legat de tl).
  ============================================================ */
  function initHeroParallax(introTl) {
    if (!IS_DESKTOP) return;
    if (typeof ScrollTrigger === 'undefined') return;

    const scope = document.querySelector('[data-anim-scope="hero"]');
    if (!scope) return;

    const setup = () => {
      if (scope.getBoundingClientRect().bottom <= 0) return;

      const cards = $$('[data-anim-order]', scope).filter((el) => {
        return parseInt(el.dataset.animOrder || '0', 10) >= 4;
      });

      cards.forEach((card, idx) => {
        const intensity = (idx % 2 === 0) ? 60 : 90;
        gsap.to(card, {
          y: -intensity,
          ease: 'none',
          scrollTrigger: {
            trigger: scope,
            start: 'top top',
            end: 'bottom top',
            scrub: 0.8,
          },
        });
      });

      if (window.matchMedia('(hover: hover)').matches) {
        cards.forEach((card) => {
          card.addEventListener('mouseenter', () => {
            gsap.to(card, {
              scale: 1.01,
              duration: 0.4,
              ease: EASE,
              overwrite: 'auto',
            });
          });

          card.addEventListener('mouseleave', () => {
            gsap.to(card, {
              scale: 1,
              duration: 0.45,
              ease: EASE,
              overwrite: 'auto',
            });
          });
        });
      }

      const logos = scope.querySelector('.hero-logo_wrapper-bg');
      if (logos) {
        gsap.to(logos, {
          y: -40,
          scale: 1.05,
          ease: 'none',
          scrollTrigger: {
            trigger: scope,
            start: 'top top',
            end: 'bottom top',
            scrub: 0.8,
          },
        });
      }
    };

    if (introTl) {
      introTl.eventCallback('onComplete', setup);
    } else {
      setup();
    }
  }

  /* ============================================================
     1c. HERO EASTER EGG — Spidey coboară la hover pe tagline
         Rulează complet chiar și la hover scurt.
  ============================================================ */
  function initHeroSpideyEasterEgg() {
    const scope = document.querySelector('[data-anim-scope="hero"]');
    if (!scope) return;

    const trigger = scope.querySelector('.hero-spidey-trigger');
    const egg = scope.querySelector('.hero-spidey-easter-egg');
    if (!trigger || !egg) return;

    trigger.setAttribute('tabindex', '0');
    trigger.setAttribute('role', 'button');
    trigger.setAttribute('aria-label', 'Spider easter egg');

    gsap.set(egg, {
      autoAlpha: 0,
      xPercent: -50,
      yPercent: -102,
      rotation: 0,
      x: 0,
      transformOrigin: '50% 0%',
    });

    const tl = gsap.timeline({
      paused: true,
      onStart: () => trigger.classList.add('is-spidey-active'),
      onComplete: () => trigger.classList.remove('is-spidey-active'),
    });

    tl.to(egg, {
      autoAlpha: 1,
      duration: 0.06,
      ease: 'none',
    }, 0);

    tl.to(egg, {
      yPercent: -74,
      rotation: 0,
      duration: 1.25,
      ease: 'power2.out',
    }, 0);

    tl.to({}, { duration: 2.1 });

    tl.to(egg, {
      yPercent: -102,
      rotation: 0,
      x: 0,
      duration: 1.1,
      ease: 'power2.in',
    });

    tl.to(egg, {
      autoAlpha: 0,
      duration: 0.12,
      ease: 'none',
    }, '>-0.06');

    const play = () => {
      if (tl.isActive()) return;
      tl.restart();
    };

    if (window.matchMedia('(hover: hover)').matches) {
      trigger.addEventListener('mouseenter', play);
    } else {
      trigger.addEventListener('click', play);
    }

    trigger.addEventListener('focus', play);
  }

  /* ============================================================
     2. REVEAL pe scroll — pattern universal
        data-anim="reveal"          → fade + y:40
        data-anim="timeline-reveal" → fade + y:40, start la mijloc
        data-anim="reveal-title"    → fade + y:50
        data-anim="reveal-image"    → fade + scale 0.95 → 1
  ============================================================ */
  function initReveals() {
    if (typeof ScrollTrigger === 'undefined') return;

    visible($$('[data-anim="reveal"]:not(.timeline10_item-wrapper)')).forEach((el) => {
      gsap.set(el, { autoAlpha: 0, y: 40, overwrite: 'auto' });
      gsap.to(el, {
        autoAlpha: 1, y: 0,
        duration: DURATION, ease: EASE,
        overwrite: 'auto',
        scrollTrigger: {
          trigger: el, start: 'top 92%', once: true,
          invalidateOnRefresh: true,
        },
      });
    });

    visible($$('[data-anim="timeline-reveal"], .timeline10_item-wrapper[data-anim="reveal"]')).forEach((el) => {
      gsap.set(el, { autoAlpha: 0, y: 40, overwrite: 'auto' });
      gsap.to(el, {
        autoAlpha: 1, y: 0,
        duration: 0.9, ease: EASE,
        overwrite: 'auto',
        scrollTrigger: { trigger: el, start: 'top 55%', once: true, invalidateOnRefresh: true },
      });
    });

    visible($$('[data-anim="reveal-title"]')).filter((el) => {
      return !el.closest('.timeline10_component');
    }).forEach((el) => {
      // Titlul din testimonial ("Omul din spatele structurii") e lângă galeria
      // care apare random — îl facem mai lent și-l declanșăm mai sus în viewport
      // ca animația să fie clar vizibilă, nu să treacă brusc.
      const isTestimonial = !!el.closest('.section_testimonial36');
      gsap.set(el, { autoAlpha: 0, y: isTestimonial ? 40 : 50, overwrite: 'auto' });
      gsap.to(el, {
        autoAlpha: 1, y: 0,
        duration: isTestimonial ? 1.6 : 1.2, ease: EASE,
        overwrite: 'auto',
        scrollTrigger: {
          trigger: el,
          start: isTestimonial ? 'top 80%' : 'top 92%',
          once: true, invalidateOnRefresh: true,
        },
      });
    });

    // Reveal-image: PĂSTRAT pentru homepage (.event14_list etc.) și
    // pentru ce ține alta filozofie. Pe pagina Flaviu Studio NU mai
    // există elemente cu data-anim="reveal-image" — atributele sunt
    // scoase din HTML, deci nimic nu se animează aici.
    visible($$('[data-anim="reveal-image"]')).filter((el) => {
      return !el.closest('.event14_list');
    }).forEach((el) => {
      gsap.set(el, { autoAlpha: 0, scale: 0.95, overwrite: 'auto' });
      gsap.to(el, {
        autoAlpha: 1, scale: 1,
        duration: 1.3, ease: EASE,
        overwrite: 'auto',
        scrollTrigger: { trigger: el, start: 'top 90%', once: true, invalidateOnRefresh: true },
      });
    });
  }

  /* ============================================================
     2a2. SPLIT TITLE ON SCROLL — titlu cu stagger pe cuvinte (din jos)
        data-anim="split-title" pe titlu. Cuvintele intră de jos
        (yPercent 110 → 0) printr-o mască, declanșat la viewport.
        Folosit pentru "Zonele în care aduc valoare".
  ============================================================ */
  function initSplitTitlesOnScroll() {
    if (typeof SplitText === 'undefined') return;
    if (typeof ScrollTrigger === 'undefined') return;

    visible($$('[data-anim="split-title"]')).forEach((el) => {
      const run = () => {
        el.style.visibility = 'visible';
        SplitText.create(el, {
          type: 'lines',
          linesClass: 'split-line',
          mask: 'lines',
          autoSplit: true,
          onSplit: (self) => {
            return gsap.from(self.lines, {
              yPercent: 110,
              duration: 1.0,
              ease: EASE,
              stagger: 0.1,
              scrollTrigger: {
                trigger: el,
                start: 'top 85%',
                once: true,
                invalidateOnRefresh: true,
              },
            });
          },
        });
      };
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(run);
      } else {
        run();
      }
    });
  }

  /* ============================================================
     2b. TIMELINE HEADING — titlu → subtitlu în secvență
        "Drumul meu până aici" apoi "Descoperă timeline-ul..."
  ============================================================ */
  function initTimelineHeadings() {
    if (typeof ScrollTrigger === 'undefined') return;

    visible($$('.timeline10_component .max-width-large.align-center.z-index-1')).forEach((wrap) => {
      const title = wrap.querySelector('[data-anim="reveal-title"]');
      const subtitle = wrap.querySelector('.text-timeline');
      const items = [title, subtitle].filter(Boolean);
      if (!items.length) return;

      // Titlul intră cu y mai mare și durată mai lungă (același principiu ca
      // "Descoperă studiile mele de caz" — reveal-title cu y:50, lent din spate).
      if (title) gsap.set(title, { autoAlpha: 0, y: 50 });
      if (subtitle) gsap.set(subtitle, { autoAlpha: 0, y: 28 });

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: wrap,
          start: 'top 82%',
          once: true,
        },
        defaults: { ease: EASE },
      });

      if (title) {
        tl.to(title, { autoAlpha: 1, y: 0, duration: 1.4 }, 0);
      }

      if (subtitle) {
        tl.to(subtitle, { autoAlpha: 1, y: 0, duration: 0.9 }, 0.4);
      }
    });
  }

  /* ============================================================
     3a. ZONE FADE — fade-only pe cele 3 carduri Zone
         data-anim="zone-fade" pe wrapper
  ============================================================ */
  function initZoneFade() {
    if (typeof ScrollTrigger === 'undefined') return;

    visible($$('[data-anim="zone-fade"]')).forEach((group) => {
      const children = sortByVisualPosition(Array.from(group.children).filter((c) => {
        const r = c.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      }));
      if (!children.length) return;

      gsap.set(children, { autoAlpha: 0 });
      gsap.to(children, {
        autoAlpha: 1,
        duration: 0.8, ease: EASE, stagger: 0.18,
        scrollTrigger: { trigger: group, start: 'top 85%', once: true },
      });
    });
  }

  /* ============================================================
     3b. REVEAL GROUP — stagger pe copii direcți
         data-anim="reveal-group" pe wrapper
         data-anim-grid="personal" pentru gridul cinematic random
  ============================================================ */
  function initRevealGroups() {
    if (typeof ScrollTrigger === 'undefined') return;

    visible($$('[data-anim="reveal-group"]:not(.event14_list)')).forEach((group) => {
      const children = sortByVisualPosition(Array.from(group.children).filter((c) => {
        const r = c.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      }));
      if (!children.length) return;

      const isPersonalGrid = group.dataset.animGrid === 'personal'
        || group.classList.contains('testimonial36_grid-list');

      gsap.set(children, { autoAlpha: 0, y: 40 });
      gsap.to(children, {
        autoAlpha: 1, y: 0,
        duration: isPersonalGrid ? 1.35 : DURATION,
        ease: EASE,
        stagger: isPersonalGrid
          ? { amount: 0.95, from: 'random' }
          : STAGGER,
        scrollTrigger: {
          trigger: group,
          start: isPersonalGrid ? 'top 50%' : 'top 90%',
          once: true,
        },
      });
    });
  }

  /* ============================================================
     3c. INTEGRARE CARDS — card → imagine → text
        Cardurile intră unul câte unul, în ordinea vizuală.
  ============================================================ */
  function initIntegrareCards() {
    if (typeof ScrollTrigger === 'undefined') return;

    const grid = document.querySelector('.event14_list');
    if (!grid) return;

    const cards = sortByVisualPosition(visible(Array.from(grid.querySelectorAll('.integrare_item-wrapper, .integrare_item'))));
    if (!cards.length) return;

    const cardRecords = cards.map((card) => {
      const image = card.querySelector('.integrare_image');
      const textItems = [
        card.querySelector('.integrare_card-title') || card.querySelector('.heading-style-h5'),
        card.querySelector('.integrare_paragraph'),
      ].filter(Boolean);

      return { card, image, textItems };
    });

    const images = cardRecords.map((record) => record.image).filter(Boolean);
    const textItems = cardRecords.flatMap((record) => record.textItems);

    gsap.set(cards, {
      autoAlpha: 0,
      y: 72,
      scale: 0.94,
      transformOrigin: 'center top',
    });
    // Guard: pe Misfit cardurile (.misfit-decizii_item) n-au .integrare_image,
    // deci images poate fi gol → gsap.set([]) dă "target not found".
    if (images.length) gsap.set(images, { scale: 1.08, transformOrigin: 'center center' });
    if (textItems.length) gsap.set(textItems, { autoAlpha: 0, y: 16 });

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: grid,
        start: 'top 74%',
        once: true,
      },
      defaults: { ease: EASE },
    });

    const revealCard = (record, at) => {
      tl.to(record.card, {
        autoAlpha: 1,
        y: 0,
        scale: 1,
        duration: 1.28,
      }, at);

      if (record.image) {
        tl.to(record.image, {
          scale: 1,
          duration: 1.5,
          ease: 'power3.out',
        }, at + 0.1);
      }

      if (record.textItems.length) {
        tl.to(record.textItems, {
          autoAlpha: 1,
          y: 0,
          duration: 0.82,
          stagger: 0.1,
        }, at + 0.34);
      }
    };

    const cardGap = IS_DESKTOP ? 0.38 : 0.3;
    cardRecords.forEach((record, index) => {
      revealCard(record, index * cardGap);
    });
  }

  /* ============================================================
     TIMELINE PROGRESS — CSS sticky nativ, nu atingem nimic.
  ============================================================ */

  /* ============================================================
     4. SPOTLIGHT — glow mov urmărește cursorul + intro reveal
        data-anim="spotlight" pe container
  ============================================================ */
  function initSpotlight() {
    const cards = visible($$('[data-anim="spotlight"]'));
    cards.forEach((card) => {
      // Glow-ul cursor trăiește pe .spotlight-glow (cardul interior), nu pe
      // containerul exterior — altfel ar fi acoperit de cardul opac.
      const glowEl = card.querySelector('.spotlight-glow') || card;
      glowEl.addEventListener('mousemove', (e) => {
        const rect = glowEl.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        glowEl.style.setProperty('--mx', `${x}%`);
        glowEl.style.setProperty('--my', `${y}%`);
      });

      if (REDUCED) return;
      if (typeof ScrollTrigger === 'undefined') return;

      // Cascadă cerută: titlu secțiune → carduri → titlurile cardurilor → conținut.
      // Titlul "La ce mă pricep cel mai bine?" (h3 din expert_card-content)
      const sectionTitle = card.querySelector('.expert_card-content > .text-color-dark-purple > .heading-style-h3, .expert_card-content .heading-style-h3');
      // Cardul UI (skills) și cardul Apps (tools)
      const uiCard = card.querySelector('.exp-card_list-wrapper-ui');
      const appsCard = card.querySelector('.exp-card_item-wrapper, .exp-card_item-apps');
      // Titlurile interioare ale cardurilor (h5) + paragraful tool-uri
      const uiTitle = uiCard ? uiCard.querySelector('.heading-style-h5') : null;
      const appsTitle = appsCard ? appsCard.querySelector('.heading-style-h5') : null;
      const appsPara = appsCard ? appsCard.querySelector('p') : null;
      const uiSkills = $$('.exp-card_skill-wrapper', uiCard || card);
      const apps = $$('.expert-apps_item-wrapper', appsCard || card);

      gsap.set(card, { autoAlpha: 0, y: 30 });
      if (sectionTitle) gsap.set(sectionTitle, { autoAlpha: 0, y: 24 });
      if (uiCard) gsap.set(uiCard, { autoAlpha: 0, y: 26 });
      if (appsCard) gsap.set(appsCard, { autoAlpha: 0, y: 30 });
      if (uiTitle) gsap.set(uiTitle, { autoAlpha: 0, y: 16 });
      if (appsTitle) gsap.set(appsTitle, { autoAlpha: 0, y: 16 });
      if (appsPara) gsap.set(appsPara, { autoAlpha: 0, y: 14 });
      if (uiSkills.length) gsap.set(uiSkills, { autoAlpha: 0, y: 16 });
      if (apps.length) gsap.set(apps, { autoAlpha: 0, y: 20, scale: 0.96 });

      const tl = gsap.timeline({
        // Trigger mai sus în viewport ca animația să fie vizibilă la scroll lent
        scrollTrigger: { trigger: card, start: 'top 65%', once: true },
        defaults: { ease: EASE },
      });

      // 1. Componentul mare apare
      tl.to(card, { autoAlpha: 1, y: 0, duration: 1.0 }, 0);
      // 2. Titlul secțiunii
      if (sectionTitle) tl.to(sectionTitle, { autoAlpha: 1, y: 0, duration: 0.7 }, 0.2);
      // 3. Cardurile (UI + Apps) intră
      if (uiCard) tl.to(uiCard, { autoAlpha: 1, y: 0, duration: 0.75 }, 0.42);
      if (appsCard) tl.to(appsCard, { autoAlpha: 1, y: 0, duration: 0.8 }, 0.52);
      // 4. Titlurile cardurilor
      if (uiTitle) tl.to(uiTitle, { autoAlpha: 1, y: 0, duration: 0.55 }, 0.66);
      if (appsTitle) tl.to(appsTitle, { autoAlpha: 1, y: 0, duration: 0.55 }, 0.72);
      if (appsPara) tl.to(appsPara, { autoAlpha: 1, y: 0, duration: 0.55 }, 0.8);
      // 5. Conținutul cardurilor (skills + apps) cu stagger
      if (uiSkills.length) tl.to(uiSkills, { autoAlpha: 1, y: 0, duration: 0.6, stagger: 0.06 }, 0.86);
      if (apps.length) tl.to(apps, { autoAlpha: 1, y: 0, scale: 1, duration: 0.7, stagger: 0.05 }, 0.95);
    });
  }

  /* ============================================================
     5. CTA SECTION — .cta_component intră ca un bloc,
        apoi titlu → subtitlu → buton 1 → buton 2 în cascadă.

        Structura HTML:
        .cta_component
          └── .cta_border
                └── .cta_card
                      ├── .cta_card-content
                      │     ├── h3.heading-style-h2
                      │     ├── div (subtitlu)
                      │     └── .button-group
                      │           ├── a.button-purple
                      │           └── a.button-standard
                      └── .cta_background  ← fundalul mov

        IMPORTANT: setăm pre-state O SINGURĂ DATĂ pe fiecare element.
        Nu setăm autoAlpha pe .button-group ȘI pe butoanele din el —
        cel de-al doilea gsap.set câștigă și face ca primul să fie ignorat.
  ============================================================ */
  function initCTA() {
    const component = document.querySelector('.cta_component');
    if (!component) return;

    const title = component.querySelector('.heading-style-h2');
    const subtitle = component.querySelector('[data-anim="cta-subtitle"]')
      || component.querySelector('.cta_card-content .text-align-center > div:last-child');
    const btns = Array.from(component.querySelectorAll('.button-group > a'));
    const footerTop = document.querySelector('.footer4_top-wrapper');
    const footerDivider = document.querySelector('.footer4_component .divider-horizontal');
    const footerBottom = document.querySelector('.footer4_bottom-wrapper');

    // Pre-state — fiecare element o singură dată, fără overlap
    gsap.set(component, { autoAlpha: 0, y: 60, scale: 0.97 });
    if (title) gsap.set(title, { autoAlpha: 0, y: 28 });
    if (subtitle) gsap.set(subtitle, { autoAlpha: 0, y: 22 });
    if (btns.length) gsap.set(btns, { autoAlpha: 0, y: 18 });
    if (footerTop) gsap.set(footerTop, { autoAlpha: 0, y: 18 });
    if (footerDivider) gsap.set(footerDivider, { autoAlpha: 0, scaleX: 0, transformOrigin: 'left center' });
    if (footerBottom) gsap.set(footerBottom, { autoAlpha: 0, y: 14 });

    const tl = gsap.timeline({
      paused: true,
      defaults: { ease: EASE },
    });

    // Componentul întreg (card + background mov) apare ca un bloc
    tl.to(component, { autoAlpha: 1, y: 0, scale: 1, duration: 1.1 }, 0);

    // Titlul apare după ce fundalul mov e vizibil
    if (title) tl.to(title, { autoAlpha: 1, y: 0, duration: 0.85 }, 0.35);

    // Subtitlul
    if (subtitle) tl.to(subtitle, { autoAlpha: 1, y: 0, duration: 0.7 }, 0.52);

    // Butoanele individual cu stagger
    if (btns.length) {
      tl.to(btns, {
        autoAlpha: 1, y: 0,
        duration: 0.65, stagger: 0.14,
      }, 0.68);
    }

    // Bara subtilă de navigație din footer intră după CTA buttons.
    if (footerTop) {
      tl.to(footerTop, { autoAlpha: 1, y: 0, duration: 0.65 }, '>-0.02');
    }

    if (footerDivider) {
      tl.to(footerDivider, { autoAlpha: 1, scaleX: 1, duration: 0.55 }, '>-0.18');
    }

    if (footerBottom) {
      tl.to(footerBottom, { autoAlpha: 1, y: 0, duration: 0.6 }, '>-0.12');
    }

    observeEnterOnce(component, () => tl.play(0), 0.76);
  }

  /* ============================================================
     5b. PORTFOLIO HOVER — imagine scale + săgeată slide
  ============================================================ */
  function initPortfolioHover() {
    if (!window.matchMedia('(hover: hover)').matches) return;

    const items = visible([
      document.querySelector('.portfolio1_item-1'),
      document.querySelector('.portfolio1_item-2'),
      document.querySelector('.portfolio1_item-3'),
    ].filter(Boolean));

    items.forEach((item) => {
      const imageLink = item.querySelector('.portfolio1_item-link');
      const imageWrapper = item.querySelector('.portfolio1_image-wrapper');
      const image = item.querySelector('.portfolio1_image');
      const reviewLink = item.querySelector('.button.is-link.is-icon');
      const arrow = reviewLink?.querySelector('.icon-embed-xxsmall');

      if (image && (imageWrapper || imageLink)) {
        const imageHoverTarget = imageWrapper || imageLink;

        imageHoverTarget.addEventListener('mouseenter', () => {
          gsap.to(image, {
            scale: 1.06,
            duration: 1.1,
            ease: 'power2.out',
            overwrite: 'auto',
          });
        });

        imageHoverTarget.addEventListener('mouseleave', () => {
          gsap.to(image, {
            scale: 1,
            duration: 0.9,
            ease: 'power2.out',
            overwrite: 'auto',
          });
        });
      }

      if (reviewLink && arrow) {
        reviewLink.addEventListener('mouseenter', () => {
          gsap.to(arrow, {
            x: 3,
            duration: 0.35,
            ease: EASE,
            overwrite: 'auto',
          });
        });

        reviewLink.addEventListener('mouseleave', () => {
          gsap.to(arrow, {
            x: 0,
            duration: 0.3,
            ease: EASE,
            overwrite: 'auto',
          });
        });
      }
    });
  }

  /* ============================================================
     5c. PORTFOLIO CURSOR — un singur cursor custom, refolosit
  ============================================================ */
  function initPortfolioCursor() {
    if (!window.matchMedia('(hover: hover)').matches) return;

    const imageWrappers = visible($$('.portfolio1_image-wrapper'));
    if (!imageWrappers.length) return;

    const cursorEl = document.createElement('div');
    cursorEl.className = 'portfolio-cursor';
    cursorEl.innerHTML = `<svg width="144" height="56" viewBox="0 0 144 56" fill="none" xmlns="http://www.w3.org/2000/svg">
<foreignObject x="25.9697" y="21" width="123" height="40"><div xmlns="http://www.w3.org/1999/xhtml" style="backdrop-filter:blur(2.5px);clip-path:url(#bgblur_0_8864_808_clip_path);height:100%;width:100%"></div></foreignObject><g data-figma-bg-blur-radius="5">
<path d="M30.9697 34C30.9697 29.5817 34.5514 26 38.9697 26L135.97 26C140.388 26 143.97 29.5817 143.97 34V48C143.97 52.4183 140.388 56 135.97 56L38.9697 56C34.5515 56 30.9697 52.4183 30.9697 48V34Z" fill="#681FE2" fill-opacity="0.7"/>
<path d="M38.9697 26.5L135.97 26.5C140.112 26.5 143.47 29.8579 143.47 34V48C143.47 52.1421 140.112 55.5 135.97 55.5L38.9697 55.5C34.8276 55.5 31.4697 52.1421 31.4697 48V34C31.4697 29.8579 34.8276 26.5 38.9697 26.5Z" stroke="white" stroke-opacity="0.8"/>
<path d="M43.7016 47L39.3016 35.432H40.9816L43.7976 42.824C43.9256 43.144 44.0483 43.48 44.1656 43.832C44.2829 44.1733 44.4003 44.5627 44.5176 45C44.6563 44.5413 44.7896 44.1253 44.9176 43.752C45.0456 43.3787 45.1576 43.064 45.2536 42.808L48.0536 35.432H49.6856L45.3336 47H43.7016ZM53.0431 47.192C52.2858 47.192 51.6138 47.0213 51.0271 46.68C50.4404 46.328 49.9818 45.848 49.6511 45.24C49.3204 44.6213 49.1551 43.9067 49.1551 43.096C49.1551 42.2747 49.3151 41.5547 49.6351 40.936C49.9658 40.3173 50.4138 39.832 50.9791 39.48C51.5551 39.128 52.2218 38.952 52.9791 38.952C53.7258 38.952 54.3711 39.112 54.9151 39.432C55.4698 39.752 55.8964 40.2 56.1951 40.776C56.5044 41.352 56.6591 42.0293 56.6591 42.808V43.368L49.9551 43.384L49.9871 42.376H55.1551C55.1551 41.7253 54.9578 41.2027 54.5631 40.808C54.1684 40.4133 53.6404 40.216 52.9791 40.216C52.4778 40.216 52.0458 40.328 51.6831 40.552C51.3311 40.7653 51.0591 41.0853 50.8671 41.512C50.6858 41.928 50.5951 42.4293 50.5951 43.016C50.5951 43.9547 50.8084 44.68 51.2351 45.192C51.6618 45.6933 52.2751 45.944 53.0751 45.944C53.6618 45.944 54.1418 45.8267 54.5151 45.592C54.8884 45.3573 55.1391 45.016 55.2671 44.568H56.6751C56.4831 45.4 56.0724 46.0453 55.4431 46.504C54.8138 46.9627 54.0138 47.192 53.0431 47.192ZM63.7987 47H57.7027V45.784L61.9267 40.44H57.7027V39.176H63.7987V40.408L59.5427 45.736H63.7987V47ZM65.4952 47V39.176H66.9992V47H65.4952ZM66.2312 37.32C65.9646 37.32 65.7299 37.224 65.5272 37.032C65.3352 36.8293 65.2392 36.5947 65.2392 36.328C65.2392 36.0507 65.3352 35.816 65.5272 35.624C65.7299 35.432 65.9646 35.336 66.2312 35.336C66.5086 35.336 66.7432 35.432 66.9352 35.624C67.1272 35.816 67.2232 36.0507 67.2232 36.328C67.2232 36.5947 67.1272 36.8293 66.9352 37.032C66.7432 37.224 66.5086 37.32 66.2312 37.32ZM73.5577 50.504V39.176H74.9177L75.0297 40.584C75.2857 40.04 75.6644 39.6347 76.1657 39.368C76.6777 39.0907 77.2431 38.952 77.8617 38.952C78.6084 38.952 79.2537 39.128 79.7977 39.48C80.3417 39.8213 80.7577 40.3013 81.0457 40.92C81.3444 41.528 81.4937 42.232 81.4937 43.032C81.4937 43.832 81.3497 44.5467 81.0617 45.176C80.7844 45.8053 80.3737 46.3013 79.8297 46.664C79.2964 47.0267 78.6404 47.208 77.8617 47.208C77.2324 47.208 76.6724 47.08 76.1817 46.824C75.6911 46.568 75.3177 46.2 75.0617 45.72V50.504H73.5577ZM75.0777 43.096C75.0777 43.6187 75.1737 44.0933 75.3657 44.52C75.5684 44.936 75.8511 45.2613 76.2137 45.496C76.5871 45.7307 77.0297 45.848 77.5417 45.848C78.0537 45.848 78.4911 45.7307 78.8537 45.496C79.2164 45.2507 79.4937 44.92 79.6857 44.504C79.8884 44.088 79.9897 43.6187 79.9897 43.096C79.9897 42.552 79.8884 42.072 79.6857 41.656C79.4937 41.24 79.2164 40.9147 78.8537 40.68C78.4911 40.4453 78.0537 40.328 77.5417 40.328C77.0297 40.328 76.5871 40.4453 76.2137 40.68C75.8511 40.9147 75.5684 41.24 75.3657 41.656C75.1737 42.072 75.0777 42.552 75.0777 43.096ZM87.6315 39.112V40.488H86.9595C86.2448 40.488 85.6795 40.696 85.2635 41.112C84.8581 41.5173 84.6555 42.0987 84.6555 42.856V47H83.1515V39.192H84.5595L84.6875 40.76H84.5435C84.6501 40.248 84.9061 39.832 85.3115 39.512C85.7168 39.1813 86.2235 39.016 86.8315 39.016C86.9701 39.016 87.0981 39.0267 87.2155 39.048C87.3435 39.0587 87.4821 39.08 87.6315 39.112ZM88.2489 43.08C88.2489 42.28 88.4249 41.5707 88.7769 40.952C89.1289 40.3333 89.6089 39.848 90.2169 39.496C90.8355 39.144 91.5395 38.968 92.3289 38.968C93.1182 38.968 93.8169 39.144 94.4249 39.496C95.0329 39.848 95.5129 40.3333 95.8649 40.952C96.2169 41.5707 96.3929 42.28 96.3929 43.08C96.3929 43.88 96.2169 44.5893 95.8649 45.208C95.5129 45.8267 95.0329 46.312 94.4249 46.664C93.8169 47.016 93.1182 47.192 92.3289 47.192C91.5395 47.192 90.8355 47.016 90.2169 46.664C89.6089 46.312 89.1289 45.8267 88.7769 45.208C88.4249 44.5893 88.2489 43.88 88.2489 43.08ZM89.7689 43.08C89.7689 43.624 89.8755 44.104 90.0889 44.52C90.3129 44.936 90.6169 45.2613 91.0009 45.496C91.3849 45.7307 91.8275 45.848 92.3289 45.848C92.8302 45.848 93.2729 45.7307 93.6569 45.496C94.0409 45.2613 94.3395 44.936 94.5529 44.52C94.7769 44.104 94.8889 43.624 94.8889 43.08C94.8889 42.5253 94.7769 42.0453 94.5529 41.64C94.3395 41.224 94.0409 40.8987 93.6569 40.664C93.2729 40.4293 92.8302 40.312 92.3289 40.312C91.8275 40.312 91.3849 40.4293 91.0009 40.664C90.6169 40.8987 90.3129 41.224 90.0889 41.64C89.8755 42.0453 89.7689 42.5253 89.7689 43.08ZM98.0577 47V39.176H99.5617V47H98.0577ZM98.7937 37.32C98.5271 37.32 98.2924 37.224 98.0897 37.032C97.8977 36.8293 97.8017 36.5947 97.8017 36.328C97.8017 36.0507 97.8977 35.816 98.0897 35.624C98.2924 35.432 98.5271 35.336 98.7937 35.336C99.0711 35.336 99.3057 35.432 99.4977 35.624C99.6897 35.816 99.7857 36.0507 99.7857 36.328C99.7857 36.5947 99.6897 36.8293 99.4977 37.032C99.3057 37.224 99.0711 37.32 98.7937 37.32ZM105.121 47.192C104.364 47.192 103.692 47.0213 103.105 46.68C102.519 46.328 102.06 45.848 101.729 45.24C101.399 44.6213 101.233 43.9067 101.233 43.096C101.233 42.2747 101.393 41.5547 101.713 40.936C102.044 40.3173 102.492 39.832 103.057 39.48C103.633 39.128 104.3 38.952 105.057 38.952C105.804 38.952 106.449 39.112 106.993 39.432C107.548 39.752 107.975 40.2 108.273 40.776C108.583 41.352 108.737 42.0293 108.737 42.808V43.368L102.033 43.384L102.065 42.376H107.233C107.233 41.7253 107.036 41.2027 106.641 40.808C106.247 40.4133 105.719 40.216 105.057 40.216C104.556 40.216 104.124 40.328 103.761 40.552C103.409 40.7653 103.137 41.0853 102.945 41.512C102.764 41.928 102.673 42.4293 102.673 43.016C102.673 43.9547 102.887 44.68 103.313 45.192C103.74 45.6933 104.353 45.944 105.153 45.944C105.74 45.944 106.22 45.8267 106.593 45.592C106.967 45.3573 107.217 45.016 107.345 44.568H108.753C108.561 45.4 108.151 46.0453 107.521 46.504C106.892 46.9627 106.092 47.192 105.121 47.192ZM109.905 43.096C109.905 42.2747 110.065 41.5547 110.385 40.936C110.716 40.3173 111.169 39.832 111.745 39.48C112.321 39.128 112.988 38.952 113.745 38.952C114.726 38.952 115.542 39.2133 116.193 39.736C116.844 40.2587 117.233 40.952 117.361 41.816H115.857C115.729 41.3147 115.478 40.936 115.105 40.68C114.732 40.424 114.294 40.296 113.793 40.296C113.324 40.296 112.908 40.4133 112.545 40.648C112.182 40.872 111.9 41.192 111.697 41.608C111.494 42.024 111.393 42.5147 111.393 43.08C111.393 43.6453 111.489 44.136 111.681 44.552C111.873 44.9573 112.145 45.2773 112.497 45.512C112.849 45.736 113.26 45.848 113.729 45.848C114.262 45.848 114.721 45.7147 115.105 45.448C115.489 45.1813 115.745 44.8187 115.873 44.36H117.377C117.281 44.9253 117.062 45.4213 116.721 45.848C116.39 46.264 115.964 46.5947 115.441 46.84C114.929 47.0747 114.358 47.192 113.729 47.192C112.961 47.192 112.289 47.0213 111.713 46.68C111.148 46.3387 110.705 45.864 110.385 45.256C110.065 44.6373 109.905 43.9173 109.905 43.096ZM118.132 39.176L122.708 39.176V40.44L118.132 40.44V39.176ZM121.172 47H119.668V36.728H121.172V47ZM129.466 39.176H130.954V47H129.61L129.45 45.816C129.226 46.2213 128.874 46.552 128.394 46.808C127.914 47.064 127.386 47.192 126.81 47.192C125.903 47.192 125.199 46.9093 124.698 46.344C124.207 45.768 123.962 45 123.962 44.04V39.176H125.466V43.544C125.466 44.376 125.631 44.9733 125.962 45.336C126.303 45.688 126.762 45.864 127.338 45.864C128.031 45.864 128.559 45.6507 128.922 45.224C129.284 44.7867 129.466 44.1467 129.466 43.304V39.176ZM134.672 47H133.168V35.224H134.672V47Z" fill="white"/>
</g>
<foreignObject x="-3.26514" y="-4.09326" width="40.7104" height="38.9321"><div xmlns="http://www.w3.org/1999/xhtml" style="backdrop-filter:blur(2.5px);clip-path:url(#bgblur_1_8864_808_clip_path);height:100%;width:100%"></div></foreignObject><path data-figma-bg-blur-radius="5" d="M5.00899 1.53281C3.22905 0.901717 1.60131 2.78559 2.484 4.45512L15.056 28.2341C15.9299 29.8869 18.3729 29.6291 18.8826 27.8303L21.0828 20.0645C21.2233 19.6528 21.5157 19.3103 21.9002 19.107L30.8413 14.3798C32.4372 13.5361 32.2666 11.1972 30.5651 10.5939L5.00899 1.53281Z" fill="#681FE2" fill-opacity="0.7" stroke="white" stroke-opacity="0.8"/>
<defs>
<clipPath id="bgblur_0_8864_808_clip_path" transform="translate(-25.9697 -21)"><path d="M30.9697 34C30.9697 29.5817 34.5514 26 38.9697 26L135.97 26C140.388 26 143.97 29.5817 143.97 34V48C143.97 52.4183 140.388 56 135.97 56L38.9697 56C34.5515 56 30.9697 52.4183 30.9697 48V34Z"/>
</clipPath><clipPath id="bgblur_1_8864_808_clip_path" transform="translate(3.26514 4.09326)"><path d="M5.00899 1.53281C3.22905 0.901717 1.60131 2.78559 2.484 4.45512L15.056 28.2341C15.9299 29.8869 18.3729 29.6291 18.8826 27.8303L21.0828 20.0645C21.2233 19.6528 21.5157 19.3103 21.9002 19.107L30.8413 14.3798C32.4372 13.5361 32.2666 11.1972 30.5651 10.5939L5.00899 1.53281Z"/>
</clipPath></defs>
</svg>`;
    document.body.appendChild(cursorEl);

    gsap.set(cursorEl, {
      autoAlpha: 0,
      scale: 0.75,
      xPercent: -50,
      yPercent: -50,
    });

    imageWrappers.forEach((wrapper) => {
      wrapper.addEventListener('mousemove', (e) => {
        gsap.set(cursorEl, { x: e.clientX, y: e.clientY });
      });

      wrapper.addEventListener('mouseenter', () => {
        gsap.to(cursorEl, {
          autoAlpha: 1,
          scale: 1,
          duration: 0.22,
          ease: EASE,
          overwrite: 'auto',
        });
      });

      wrapper.addEventListener('mouseleave', () => {
        gsap.to(cursorEl, {
          autoAlpha: 0,
          scale: 0.75,
          duration: 0.18,
          ease: EASE,
          overwrite: 'auto',
        });
      });
    });
  }

  /* ============================================================
     5d. BUTTON HOVER — lift subtil, fără magnetic
  ============================================================ */
  function initButtonHover() {
    if (!window.matchMedia('(hover: hover)').matches) return;

    const btns = visible($$('.button-purple, .button-standard, .navbar14_button-wrapper .button.is-small'));
    if (!btns.length) return;

    btns.forEach((btn) => {
      btn.addEventListener('mouseenter', () => {
        gsap.to(btn, {
          y: -3,
          scale: 1.015,
          duration: 0.3,
          ease: EASE,
          overwrite: 'auto',
        });
      });

      btn.addEventListener('mouseleave', () => {
        gsap.to(btn, {
          y: 0,
          scale: 1,
          duration: 0.4,
          ease: EASE,
          overwrite: 'auto',
        });
      });
    });
  }

  /* ============================================================
     5e. NAV/FOOTER LINK HOVER — lift subtil, fără styling de button
  ============================================================ */
  function initNavFooterLinkHover() {
    if (!window.matchMedia('(hover: hover)').matches) return;

    const links = visible([
      ...$$('.navbar14_link .text-size-regular'),
      ...$$('.footer4_link'),
    ]);

    if (!links.length) return;

    links.forEach((link) => {
      link.addEventListener('mouseenter', () => {
        gsap.to(link, {
          y: -2,
          duration: 0.36,
          ease: EASE,
          overwrite: 'auto',
        });
      });

      link.addEventListener('mouseleave', () => {
        gsap.to(link, {
          y: 0,
          duration: 0.44,
          ease: EASE,
          overwrite: 'auto',
        });
      });
    });
  }

  /* ============================================================
     5f. LIVE DOT — injectează cele 3 span-uri ring în orice element
         cu clasa .live-dot. Permite ca în Webflow să trebuiască doar
         să adaugi clasa pe wrapper, fără să modifici HTML-ul.
         CSS-ul din animations.css se ocupă de animație.
  ============================================================ */
  function initLiveDot() {
    document.querySelectorAll('.live-dot').forEach((dot) => {
      // Skip dacă deja există ring-uri (idempotent: poți rerun fără efect)
      if (dot.querySelector('.live-dot__ring')) return;
      // Injectează 3 span-uri la începutul wrapperului (înainte de SVG)
      for (let i = 0; i < 3; i++) {
        const ring = document.createElement('span');
        ring.className = 'live-dot__ring';
        dot.insertBefore(ring, dot.firstChild);
      }
    });
  }

  /* ============================================================
     5g. LENIS SMOOTH SCROLL — scroll lin cu inerție subtilă, sincronizat
         cu GSAP ScrollTrigger. Doar pe desktop cu mouse (NU pe touch —
         scroll-ul nativ e mai bun acolo și evită glitch pe iPad/trackpad).
         Respectă prefers-reduced-motion (nu pornește deloc).
  ============================================================ */
  function initLenis() {
    if (REDUCED) return;                          // accesibilitate: fără smooth scroll
    if (typeof Lenis === 'undefined') return;     // CDN neîncărcat → scroll nativ
    // Doar pe device-uri cu pointer fin (mouse). Pe touch (telefon, iPad,
    // trackpad Magic Keyboard) lăsăm scroll-ul nativ — e mai bun și evită glitch.
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

    const lenis = new Lenis({
      duration: 1.1,                              // inerție subtilă (nu exagerat)
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), // expoOut — coerent cu animațiile
      smoothWheel: true,
      wheelMultiplier: 1,
      touchMultiplier: 1.5,
    });

    // Sincronizare cu GSAP: Lenis avansează pe ticker-ul GSAP (un singur RAF loop)
    if (typeof ScrollTrigger !== 'undefined') {
      lenis.on('scroll', ScrollTrigger.update);
    }
    gsap.ticker.add((time) => {
      lenis.raf(time * 1000); // gsap.ticker e în secunde, Lenis vrea ms
    });
    gsap.ticker.lagSmoothing(0);

    window.lenis = lenis; // expus pentru debugging/control extern
    return lenis;
  }

  /* ============================================================
     6. BOOT
  ============================================================ */
  function boot() {
    initLenis();
    initLiveDot();
    initNavbarIntro();
    initHeroBlockReveal();
    initSplitHeroTitle();
    initSplitTitlesOnScroll();
    const introTl = initHeroIntro();
    initHeroParallax(introTl);
    initHeroSpideyEasterEgg();
    initTimelineHeadings();
    initReveals();
    initTiltCard();
    // CRITICAL: narrative block + result reveal trebuie să ruleze ÎNAINTE
    // de funcțiile individuale (fade-up-text/title/list/tag/quote) ca să
    // marcheze elementele coordonate cu data-anim-handled și ele să fie
    // sărite acolo. Altfel se vor anima de două ori.
    initResultReveal();
    initMisfitNarrativeBlock();
    initFadeUpText();
    initFadeLeftList();
    initFadeUpTag();
    initFadeUpQuote();
    initStaggerCards();
    initCascadeImages();
    initFadeUpMockup();
    initVisualAssetReveals();
    initRevealGroups();
    initIntegrareCards();
    initZoneFade();
    initSpotlight();
    initCTA();
    initPortfolioHover();
    initPortfolioCursor();
    initButtonHover();
    initNavFooterLinkHover();

    setupScrollTriggerRefreshGuards();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
