"use strict";

/* ───────────────────────────────────────────────────────────────────────────
   VoltCore — animation 3D du hero : « le vortex du vide ».

   Des milliers de particules froides spiralent et se font aspirer vers un cœur
   noir, bordé d'un fin anneau lumineux. Rotation différentielle (le centre tourne
   plus vite), accélération vers le vide, halo doux et poussières en avant-plan.
   Rendu hypnotique, premium, calme — pensé pour capter le regard.

   Palette : noir profond, gris froid, cyan très discret, reflets blancs doux.
   Aucun texte, aucun label dans la scène 3D.

   Groupes : vortexGroup (disque de particules + anneau), coreGroup (halo + trou),
   dustGroup (poussières d'avant-plan).

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
      });
    } catch {
      return null;
    }

    // DPR plafonné : netteté correcte sans surcharger le GPU.
    const DPR = Math.min(window.devicePixelRatio || 1, 1.75);
    renderer.setPixelRatio(DPR);
    renderer.setClearColor(0x000000, 0);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.02; // calme : on ne brûle jamais l'image

    const FOV = 32;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
    camera.position.set(0, 0, 9.0);
    camera.lookAt(0, 0, 0);

    /* ── Hiérarchie ───────────────────────────────────────────────────────── */
    const root = new THREE.Group();
    scene.add(root);
    const vortexGroup = new THREE.Group(); // disque incliné : particules + anneau
    const coreGroup = new THREE.Group();   // face caméra : halo, glow, trou noir
    const dustGroup = new THREE.Group();   // poussières lentes en avant-plan
    root.add(coreGroup, vortexGroup, dustGroup);
    vortexGroup.rotation.x = -1.12;        // disque vu en perspective (≈ -64°)

    const sstep = (e0, e1, x) => {
      let t = (x - e0) / (e1 - e0);
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      return t * t * (3 - 2 * t);
    };

    /* ── Textures douces (dégradés radiaux générés au vol) ──────────────────── */
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
      [0.25, "rgba(214,244,255,0.62)"],
      [0.6, "rgba(150,196,214,0.16)"],
      [1, "rgba(0,0,0,0)"],
    ]);
    const voidTex = radialTexture([
      [0, "rgba(1,3,8,0.96)"],
      [0.55, "rgba(2,5,11,0.80)"],
      [0.82, "rgba(3,7,14,0.30)"],
      [1, "rgba(0,0,0,0)"],
    ]);

    const rMin = 0.5;   // bord du vide
    const rMax = 2.85;  // bord externe du disque
    const arms = 2;     // bras de la spirale

    /* ════ vortexGroup : champ de particules en spirale ═════════════════════ */
    const initW = Math.max(1, canvas.getBoundingClientRect().width);
    const N = initW < 520 ? 2600 : initW < 900 ? 3300 : 3900;

    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    const siz = new Float32Array(N);
    const alp = new Float32Array(N);
    // Données dynamiques par particule
    const rad = new Float32Array(N);
    const ang = new Float32Array(N);
    const inv = new Float32Array(N); // facteur individuel d'aspiration
    const zN = new Float32Array(N);  // hauteur normalisée hors du plan [-1,1]
    const aB = new Float32Array(N);  // alpha de base

    const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;

    function spawn(i, atEdge) {
      const r = atEdge
        ? rMax - Math.random() * 0.22
        : rMin + (rMax - rMin) * Math.pow(Math.random(), 0.72);
      rad[i] = r;
      const arm = i % arms;
      ang[i] = arm * ((Math.PI * 2) / arms) + r * 1.15 + (Math.random() - 0.5) * 0.6;
      inv[i] = 0.85 + Math.random() * 0.5;
      zN[i] = gauss();
      aB[i] = 0.5 + Math.random() * 0.45;

      // Couleur froide, avec quelques éclats blanc-cyan pour la vie.
      const k = Math.random();
      let cr, cg, cb;
      if (k < 0.16) { cr = 0.82; cg = 0.95; cb = 1.0; }
      else if (k < 0.5) { cr = 0.5; cg = 0.74; cb = 0.86; }
      else { cr = 0.34; cg = 0.5; cb = 0.62; }
      const b = 0.8 + Math.random() * 0.3;
      col[i * 3] = cr * b;
      col[i * 3 + 1] = cg * b;
      col[i * 3 + 2] = cb * b;

      let sz = 0.018 + Math.random() * 0.028;
      if (k < 0.16) sz += 0.018;
      if (Math.random() < 0.05) sz += 0.04; // rares éclats plus marqués
      siz[i] = sz;
    }
    for (let i = 0; i < N; i++) spawn(i, false);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
    geo.setAttribute("aSize", new THREE.BufferAttribute(siz, 1));
    geo.setAttribute("aAlpha", new THREE.BufferAttribute(alp, 1));

    const uniforms = { uScale: { value: 700 } };
    const particleMat = new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute float aSize;
        attribute float aAlpha;
        attribute vec3 aColor;
        uniform float uScale;
        varying vec3 vC;
        varying float vA;
        void main() {
          vC = aColor;
          vA = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = clamp(aSize * uScale / max(0.05, -mv.z), 0.0, 80.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        precision mediump float;
        varying vec3 vC;
        varying float vA;
        void main() {
          float d = length(gl_PointCoord - vec2(0.5));
          float a = smoothstep(0.5, 0.0, d);
          a *= a;
          gl_FragColor = vec4(vC, a * vA);
        }`,
    });
    const points = new THREE.Points(geo, particleMat);
    points.frustumCulled = false;
    points.renderOrder = 2;
    vortexGroup.add(points);

    // Anneau lumineux au bord du vide (dans le plan du disque).
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xbfeeff, transparent: true, opacity: 0.46,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(rMin * 0.8, rMin * 1.04, 128), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.renderOrder = 1;
    vortexGroup.add(ring);

    /* ════ coreGroup : halo, glow d'horizon, trou noir (face caméra) ════════ */
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: 0x46606e, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
    }));
    halo.scale.set(9, 9, 1);
    halo.position.z = -2;
    halo.renderOrder = -1;
    coreGroup.add(halo);

    const coreGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: 0x8fd8ee, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
    }));
    coreGlow.scale.set(rMin * 4.4, rMin * 4.4, 1);
    coreGlow.renderOrder = 0;
    coreGroup.add(coreGlow);

    const voidSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: voidTex, transparent: true, opacity: 1,
      depthWrite: false, depthTest: false,
    }));
    voidSprite.scale.set(rMin * 2.8, rMin * 2.8, 1);
    voidSprite.renderOrder = 0.5;
    coreGroup.add(voidSprite);

    /* ════ dustGroup : poussières lentes en avant-plan (profondeur) ═════════ */
    const dustN = 70;
    const dPos = new Float32Array(dustN * 3);
    const dVel = [];
    for (let i = 0; i < dustN; i++) {
      dPos[i * 3] = (Math.random() - 0.5) * 10;
      dPos[i * 3 + 1] = (Math.random() - 0.5) * 6.5;
      dPos[i * 3 + 2] = 1 + Math.random() * 3.2;
      dVel.push([
        (Math.random() - 0.5) * 0.05,
        0.02 + Math.random() * 0.05,
        (Math.random() - 0.5) * 0.02,
      ]);
    }
    const dGeo = new THREE.BufferGeometry();
    dGeo.setAttribute("position", new THREE.BufferAttribute(dPos, 3));
    const dustMat = new THREE.PointsMaterial({
      map: glowTex, color: 0x9fc2d2, size: 0.14, sizeAttenuation: true,
      transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending,
      depthWrite: false, depthTest: false,
    });
    const dust = new THREE.Points(dGeo, dustMat);
    dust.frustumCulled = false;
    dust.renderOrder = 3;
    dustGroup.add(dust);

    /* ── Calcul d'une image : (avance les particules si dt>0) puis maj buffers ─ */
    function stepParticles(dt) {
      for (let i = 0; i < N; i++) {
        if (dt > 0) {
          rad[i] -= (0.085 + 0.15 / (rad[i] + 0.5)) * inv[i] * dt; // aspiration accélérée
          ang[i] += (0.75 / (rad[i] + 0.45)) * dt;                 // rotation différentielle
          if (rad[i] <= rMin) spawn(i, true);
        }
        const r = rad[i];
        const a = ang[i];
        const y = zN[i] * (0.12 + 0.3 * sstep(2.2, 0.3, r)); // renflement vers le centre
        pos[i * 3] = Math.cos(a) * r;
        pos[i * 3 + 1] = y;
        pos[i * 3 + 2] = Math.sin(a) * r;

        const fadeIn = sstep(rMax, rMax - 0.7, r);     // apparition douce au bord
        const fadeCore = sstep(rMin - 0.02, rMin + 0.5, r); // disparition dans le vide
        const bright = 1 + 0.7 * sstep(1.6, 0.5, r);   // plus lumineux près du cœur
        alp[i] = Math.min(1.15, aB[i] * fadeIn * fadeCore * bright);
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.aAlpha.needsUpdate = true;
    }

    /* ── Interaction souris : très légère, lissée ───────────────────────────── */
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
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
      baseScale = nw < 430 ? 0.78 : nw < 620 ? 0.86 : nw < 900 ? 0.95 : 1.0;
      if (nw === w && nh === h) return;
      w = nw; h = nh;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      // Taille des points en pixels = aSize * (hauteur_buffer / 2tan(fov/2)) / -z
      uniforms.uScale.value = (h * DPR) / (2 * tanHalf);
    };
    resize();
    window.addEventListener("resize", resize, { passive: true });

    const renderFrame = () => {
      root.scale.setScalar(baseScale);
      renderer.render(scene, camera);
    };

    /* ── Accessibilité : une seule image figée, aucune boucle ───────────────── */
    if (reduced) {
      stepParticles(0);
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

      pointer.x += (pointer.tx - pointer.x) * 0.05;
      pointer.y += (pointer.ty - pointer.y) * 0.05;

      stepParticles(dt);

      // Précession lente du disque + réaction douce à la souris.
      vortexGroup.rotation.z += dt * 0.015;
      vortexGroup.rotation.x = -1.12 + pointer.y * 0.12 + Math.sin(t * 0.1) * 0.02;
      root.rotation.y = pointer.x * 0.22 + Math.sin(t * 0.12) * 0.03;
      root.position.y = -scroll * 0.1 + Math.sin(t * 0.4) * 0.05;

      // Respiration de l'anneau et du halo.
      ringMat.opacity = 0.4 + Math.sin(t * 1.1) * 0.12;
      coreGlow.material.opacity = 0.42 + Math.sin(t * 0.9) * 0.1;

      // Poussières d'avant-plan : dérive lente + léger parallaxe souris.
      for (let i = 0; i < dustN; i++) {
        dPos[i * 3] += dVel[i][0] * dt;
        dPos[i * 3 + 1] += dVel[i][1] * dt;
        dPos[i * 3 + 2] += dVel[i][2] * dt;
        if (dPos[i * 3 + 1] > 3.4) {
          dPos[i * 3] = (Math.random() - 0.5) * 10;
          dPos[i * 3 + 1] = -3.4;
          dPos[i * 3 + 2] = 1 + Math.random() * 3.2;
        }
      }
      dGeo.attributes.position.needsUpdate = true;
      dustGroup.rotation.y = pointer.x * 0.06;
      dustGroup.rotation.x = pointer.y * 0.04;

      renderFrame();
    };
    loop();

    /* ── Nettoyage complet au démontage ─────────────────────────────────────── */
    function disposeAll() {
      renderer.dispose();
      glowTex.dispose();
      voidTex.dispose();
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
