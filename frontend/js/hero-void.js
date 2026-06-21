"use strict";

/* ───────────────────────────────────────────────────────────────────────────
   VoltCore — animation 3D du hero : « snow / void ».

   De la neige douce qui descend lentement dans le vide noir : flocons fins au
   loin, gros flocons flous (bokeh) en avant-plan pour la profondeur, léger
   balancement, vent qui suit la souris, et un halo central très discret qui
   ancre le vide sans le dominer.

   Palette : noir profond, gris froid, cyan très discret, blanc doux.
   Aucun texte, aucun label dans la scène 3D.

   Groupes : snowGroup (les flocons), coreGroup (halo / lueur du vide).

   Signature : initVoltVoidModel(stage, canvas[, opts]) → fonction de démontage.
   opts.reducedMotion = true → une seule image figée (accessibilité).
─────────────────────────────────────────────────────────────────────────── */

(() => {
  window.initVoltVoidModel = function initVoltVoidModel(stage, canvas, opts = {}) {
    if (!stage || !canvas || typeof THREE === "undefined") return null;

    const reduced =
      opts.reducedMotion ||
      (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        powerPreference: "high-performance",
        preserveDrawingBuffer: !!opts.capture, // capture vidéo éventuelle
      });
    } catch {
      return null;
    }

    const DPR = Math.min(window.devicePixelRatio || 1, 1.75);
    renderer.setPixelRatio(DPR);
    renderer.setClearColor(0x000000, 0);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.02;

    const FOV = 32;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
    camera.position.set(0, 0, 9.0);
    camera.lookAt(0, 0, 0);

    /* ── Hiérarchie ───────────────────────────────────────────────────────── */
    const root = new THREE.Group();
    scene.add(root);
    const coreGroup = new THREE.Group(); // halo / lueur du vide (derrière)
    const snowGroup = new THREE.Group(); // les flocons
    root.add(coreGroup, snowGroup);

    /* ── Texture douce (flocon rond) ────────────────────────────────────────── */
    function radialTexture(stops) {
      const s = 128;
      const cv = document.createElement("canvas");
      cv.width = cv.height = s;
      const ctx = cv.getContext("2d");
      const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      stops.forEach(([o, c]) => g.addColorStop(o, c));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
      const tex = new THREE.CanvasTexture(cv);
      tex.needsUpdate = true;
      return tex;
    }
    const glowTex = radialTexture([
      [0, "rgba(255,255,255,1)"],
      [0.3, "rgba(222,240,255,0.5)"],
      [0.65, "rgba(150,196,214,0.14)"],
      [1, "rgba(0,0,0,0)"],
    ]);

    /* ════ coreGroup : lueur du vide (halo central très doux) ═══════════════ */
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: 0x4a606e, transparent: true, opacity: 0.42,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
    }));
    halo.scale.set(11, 8, 1);
    halo.position.set(0, 0.6, -2);
    coreGroup.add(halo);

    const coreGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: 0x7fb6cc, transparent: true, opacity: 0.3,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
    }));
    coreGlow.scale.set(4.5, 4.5, 1);
    coreGlow.position.set(0.2, 0.9, -1);
    coreGroup.add(coreGlow);

    /* ════ snowGroup : champ de flocons (shader doux + bokeh) ═══════════════ */
    const initW = Math.max(1, canvas.getBoundingClientRect().width);
    const N = initW < 520 ? 1500 : initW < 900 ? 2000 : 2500;

    const TOP = 5.4, BOT = -5.4;
    const SPAN_X = 7.5;

    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    const siz = new Float32Array(N);
    const alp = new Float32Array(N);
    const sof = new Float32Array(N);
    // données dynamiques
    const fall = new Float32Array(N);   // vitesse de chute
    const swA = new Float32Array(N);    // amplitude du balancement
    const swS = new Float32Array(N);    // vitesse du balancement
    const swP = new Float32Array(N);    // phase
    const drift = new Float32Array(N);  // sensibilité au vent (souris)

    function spawn(i, atTop) {
      const depth = Math.random();              // 0 = loin, 1 = proche
      const bokeh = Math.random() < 0.07;       // gros flocons flous d'avant-plan
      const z = -2.5 + depth * 6.5;             // proche = plus gros (perspective)
      pos[i * 3] = (Math.random() - 0.5) * 2 * SPAN_X;
      pos[i * 3 + 1] = atTop ? TOP + Math.random() * 0.6 : BOT + Math.random() * (TOP - BOT);
      pos[i * 3 + 2] = z;

      fall[i] = 0.16 + depth * 0.34 + Math.random() * 0.1; // proche tombe + vite
      swA[i] = 0.12 + Math.random() * 0.4;
      swS[i] = 0.3 + Math.random() * 0.6;
      swP[i] = Math.random() * Math.PI * 2;
      drift[i] = 0.3 + depth * 1.1;

      // blanc doux légèrement cyan
      const b = 0.86 + Math.random() * 0.14;
      col[i * 3] = 0.86 * b;
      col[i * 3 + 1] = 0.93 * b;
      col[i * 3 + 2] = 1.0 * b;

      if (bokeh) {
        siz[i] = 0.13 + Math.random() * 0.12;
        alp[i] = 0.1 + Math.random() * 0.14;   // flou et discret
        sof[i] = 1.0;
      } else {
        siz[i] = 0.014 + depth * 0.04 + Math.random() * 0.012;
        alp[i] = 0.32 + depth * 0.5 + Math.random() * 0.12;
        sof[i] = 0.15 + Math.random() * 0.25;
      }
    }
    for (let i = 0; i < N; i++) spawn(i, false);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
    geo.setAttribute("aSize", new THREE.BufferAttribute(siz, 1));
    geo.setAttribute("aAlpha", new THREE.BufferAttribute(alp, 1));
    geo.setAttribute("aSoft", new THREE.BufferAttribute(sof, 1));

    const uniforms = { uScale: { value: 700 } };
    const snowMat = new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute float aSize;
        attribute float aAlpha;
        attribute float aSoft;
        attribute vec3 aColor;
        uniform float uScale;
        varying vec3 vC;
        varying float vA;
        varying float vSoft;
        void main() {
          vC = aColor;
          vA = aAlpha;
          vSoft = aSoft;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = clamp(aSize * uScale / max(0.05, -mv.z), 0.0, 140.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        precision mediump float;
        varying vec3 vC;
        varying float vA;
        varying float vSoft;
        void main() {
          float d = length(gl_PointCoord - vec2(0.5));
          float a = smoothstep(0.5, 0.0, d);
          a = pow(a, mix(2.2, 0.6, vSoft)); // net pour les fins, flou pour les bokeh
          gl_FragColor = vec4(vC, a * vA);
        }`,
    });
    const snow = new THREE.Points(geo, snowMat);
    snow.frustumCulled = false;
    snowGroup.add(snow);

    /* ── Avance d'une image (vent = position lissée de la souris) ────────────── */
    function stepSnow(t, dt, wind) {
      for (let i = 0; i < N; i++) {
        pos[i * 3 + 1] -= fall[i] * dt;
        pos[i * 3] += (Math.sin(t * swS[i] + swP[i]) * swA[i] + wind * drift[i]) * dt;
        if (pos[i * 3 + 1] < BOT) {
          spawn(i, true);
        } else if (pos[i * 3] > SPAN_X + 1) {
          pos[i * 3] = -SPAN_X - 1;
        } else if (pos[i * 3] < -SPAN_X - 1) {
          pos[i * 3] = SPAN_X + 1;
        }
      }
      geo.attributes.position.needsUpdate = true;
    }

    /* ── Interaction souris : vent très léger, lissé ────────────────────────── */
    const pointer = { x: 0, tx: 0, y: 0, ty: 0 };
    const onMove = (event) => {
      const r = stage.getBoundingClientRect();
      pointer.tx = ((event.clientX - r.left) / (r.width || 1) - 0.5) * 2;
      pointer.ty = ((event.clientY - r.top) / (r.height || 1) - 0.5) * 2;
    };
    const onLeave = () => { pointer.tx = 0; pointer.ty = 0; };
    if (!reduced) {
      stage.addEventListener("pointermove", onMove, { passive: true });
      stage.addEventListener("pointerleave", onLeave);
    }

    /* ── Redimensionnement + cadrage responsive ─────────────────────────────── */
    let w = 0, h = 0, baseScale = 1;
    const tanHalf = Math.tan((FOV * Math.PI) / 180 / 2);
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const nw = Math.max(1, Math.floor(rect.width));
      const nh = Math.max(1, Math.floor(rect.height));
      baseScale = nw < 430 ? 0.82 : nw < 620 ? 0.9 : 1.0;
      if (nw === w && nh === h) return;
      w = nw; h = nh;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      uniforms.uScale.value = (h * DPR) / (2 * tanHalf);
    };
    resize();
    window.addEventListener("resize", resize, { passive: true });

    const renderFrame = () => {
      root.scale.setScalar(baseScale);
      renderer.render(scene, camera);
    };

    /* ── Accessibilité : une seule image figée ──────────────────────────────── */
    if (reduced) {
      stepSnow(0, 0, 0);
      renderFrame();
      return () => {
        window.removeEventListener("resize", resize);
        disposeAll();
      };
    }

    /* ── Boucle d'animation ─────────────────────────────────────────────────── */
    const clock = new THREE.Clock();
    let raf = 0;
    const loop = () => {
      if (!canvas.isConnected) return;
      raf = requestAnimationFrame(loop);
      resize();

      const t = clock.getElapsedTime();
      const dt = Math.min(0.05, clock.getDelta());
      const scroll = Number.parseFloat(stage.style.getPropertyValue("--void-scroll")) || 0;

      pointer.x += (pointer.tx - pointer.x) * 0.04;
      pointer.y += (pointer.ty - pointer.y) * 0.04;

      stepSnow(t, dt, pointer.x * 0.6);

      // Très léger flottement de la scène + parallaxe au scroll.
      root.rotation.y = pointer.x * 0.05 + Math.sin(t * 0.12) * 0.02;
      root.position.y = -scroll * 0.12 + Math.sin(t * 0.3) * 0.04;

      // Respiration du halo du vide.
      coreGlow.material.opacity = 0.26 + Math.sin(t * 0.7) * 0.07;
      halo.material.opacity = 0.4 + Math.sin(t * 0.5) * 0.05;

      renderFrame();
    };
    loop();

    /* ── Nettoyage complet au démontage ─────────────────────────────────────── */
    function disposeAll() {
      renderer.dispose();
      glowTex.dispose();
      scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        const m = obj.material;
        if (m) {
          if (Array.isArray(m)) m.forEach((x) => x.dispose && x.dispose());
          else m.dispose && m.dispose();
        }
      });
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      stage.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerleave", onLeave);
      disposeAll();
    };
  };
})();
