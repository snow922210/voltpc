/* ════════════════════════════════════════════════════════════════
   VOLT PC — Scène WebGL du hero (Three.js, auto-hébergé)
   Une tour PC en vue éclatée s'assemble au fur et à mesure du scroll ;
   orbitable à la souris, RGB animé. Désactivée si reduced-motion ou
   si WebGL est indisponible. Expose window.initHeroGL(canvas).
   ════════════════════════════════════════════════════════════════ */
"use strict";

window.initHeroGL = function initHeroGL(canvas) {
  if (!canvas || typeof THREE === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  } catch (e) { return; }                         // pas de WebGL → on laisse le fond
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.set(0, 1.5, 20);

  // ─── Lumières ───
  scene.add(new THREE.AmbientLight(0xb9c6ff, 0.55));
  const key = new THREE.DirectionalLight(0xffffff, 1.1);
  key.position.set(6, 10, 12); scene.add(key);
  const rim = new THREE.DirectionalLight(0x6699ff, 0.7);
  rim.position.set(-10, -2, -6); scene.add(rim);
  const rgb1 = new THREE.PointLight(0x3b82f6, 1.3, 40); rgb1.position.set(-4, 4, 6); scene.add(rgb1);
  const rgb2 = new THREE.PointLight(0xa855f7, 1.1, 40); rgb2.position.set(5, -3, 5); scene.add(rgb2);

  // ─── Matières ───
  const metal = new THREE.MeshStandardMaterial({ color: 0x1e2636, metalness: 0.85, roughness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x10151f, metalness: 0.6, roughness: 0.5 });
  const board = new THREE.MeshStandardMaterial({ color: 0x16306a, metalness: 0.4, roughness: 0.6 });
  const pcb = new THREE.MeshStandardMaterial({ color: 0x1b2a4a, metalness: 0.3, roughness: 0.7 });
  const rgbMats = [];
  const rgbMat = () => { const m = new THREE.MeshStandardMaterial({ color: 0x60a5fa, emissive: 0x3b82f6, emissiveIntensity: 1.4, metalness: 0.3, roughness: 0.4 }); rgbMats.push(m); return m; };

  const group = new THREE.Group();
  scene.add(group);

  const parts = [];   // { mesh, asm:Vector3, exp:Vector3, expRot:Vector3 }
  function add(mesh, asm, expOffset, expRot) {
    mesh.position.copy(asm);
    group.add(mesh);
    parts.push({
      mesh,
      asm: asm.clone(),
      exp: asm.clone().add(expOffset),
      expRot: expRot || new THREE.Vector3(0, 0, 0),
    });
    return mesh;
  }
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const boxMesh = (w, h, d, mat) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  const fanMesh = () => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.16, 28), dark));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.07, 10, 32), rgbMat());
    ring.rotation.x = Math.PI / 2; g.add(ring);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.2, 16), metal); g.add(hub);
    g.rotation.x = Math.PI / 2;     // face vers +z
    g.userData.spin = true;
    return g;
  };

  // ─── Boîtier (arête vitrée) ───
  const caseEdges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(5, 9, 9)),
    new THREE.LineBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.5 })
  );
  add(caseEdges, V(0, 0, 0), V(0, 0, 0));
  const backPanel = boxMesh(0.2, 8.6, 8.6, metal);
  add(backPanel, V(-2.3, 0, 0), V(-9, 0, 0), V(0, 0.6, 0));

  // ─── Carte mère ───
  const mb = boxMesh(0.25, 7, 7, board);
  add(mb, V(-1.7, 0.4, 0), V(-7, 1.5, 0), V(0, 0.5, 0.3));

  // ─── CPU + ventirad ───
  const cpu = boxMesh(0.5, 1.1, 1.1, metal);
  add(cpu, V(-1.4, 2.0, 0.6), V(2, 7, 3), V(0.6, 0.6, 0));
  const cooler = new THREE.Group();
  cooler.add(boxMesh(1.4, 1.8, 1.8, dark));
  const cFan = fanMesh(); cFan.position.set(0.85, 0, 0); cFan.rotation.set(0, Math.PI / 2, 0); cFan.userData.spin = true;
  cooler.add(cFan);
  add(cooler, V(-0.9, 2.0, 0.6), V(3.5, 9, 3), V(0.4, 1.2, 0.4));

  // ─── RAM ×2 ───
  const ram1 = boxMesh(0.18, 2.4, 0.5, rgbMat());
  add(ram1, V(-1.3, 1.7, 2.1), V(0.5, 9.5, 5), V(0.3, 0, 0.8));
  const ram2 = boxMesh(0.18, 2.4, 0.5, rgbMat());
  add(ram2, V(-1.3, 1.7, 2.7), V(1.5, 9.5, 6), V(0.3, 0, 1.0));

  // ─── GPU (carte + 3 ventilos) ───
  const gpu = new THREE.Group();
  gpu.add(boxMesh(1.2, 1.6, 6.2, dark));
  for (let i = -1; i <= 1; i++) {
    const f = fanMesh(); f.position.set(0.65, -0.1, i * 2.0);
    f.rotation.set(0, Math.PI / 2, 0); f.userData.spin = true; gpu.add(f);
  }
  add(gpu, V(-0.6, -0.6, 0), V(6, -1, 7), V(0.2, 0.8, 0.2));

  // ─── Alimentation + SSD ───
  const psu = boxMesh(2.6, 1.9, 4.2, metal);
  add(psu, V(-0.4, -3.4, 0), V(0, -9, 4), V(0.4, 0.5, 0));
  const ssd = boxMesh(0.3, 1.6, 2.4, pcb);
  add(ssd, V(-1.4, -1.2, 2.4), V(3, -6, 8), V(0.5, 0.5, 0.7));

  // ─── Interaction orbite ───
  let tRotY = -0.5, tRotX = 0.05, rotY = -0.5, rotX = 0.05, dragging = false, px = 0, py = 0, idle = 0;
  const down = (e) => { dragging = true; idle = 0; px = (e.touches ? e.touches[0].clientX : e.clientX); py = (e.touches ? e.touches[0].clientY : e.clientY); };
  const move = (e) => {
    if (!dragging) return;
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    tRotY += (cx - px) * 0.008; tRotX += (cy - py) * 0.006;
    tRotX = Math.max(-0.8, Math.min(0.8, tRotX));
    px = cx; py = cy; idle = 0;
  };
  const up = () => { dragging = false; };
  canvas.addEventListener("pointerdown", down);
  window.addEventListener("pointermove", move, { passive: true });
  window.addEventListener("pointerup", up);

  // ─── Progression d'assemblage pilotée par le scroll ───
  let prog = 0;
  const readProgress = () => {
    const top = -(canvas.getBoundingClientRect().top);          // px scrollés depuis le hero
    prog = Math.max(0, Math.min(1, top / (innerHeight * 0.85)));
  };
  addEventListener("scroll", readProgress, { passive: true });

  const ease = (t) => 1 - Math.pow(1 - t, 3);                   // easeOutCubic

  function resize() {
    const w = canvas.clientWidth || canvas.parentElement.clientWidth || 1;
    const h = canvas.clientHeight || w;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  resize();
  addEventListener("resize", resize);

  const tmp = new THREE.Vector3();
  const clock = new THREE.Clock();

  function frame() {
    if (!canvas.isConnected) {                                  // changement de page → on libère
      renderer.dispose();
      removeEventListener("scroll", readProgress);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      addEventListener && removeEventListener("resize", resize);
      return;
    }
    requestAnimationFrame(frame);
    const dt = clock.getDelta();
    const t = clock.elapsedTime;
    const e = ease(prog);

    // assemblage : exploded (0) → assemblé (1)
    for (const p of parts) {
      tmp.copy(p.exp).lerp(p.asm, e);
      p.mesh.position.copy(tmp);
      p.mesh.rotation.set(p.expRot.x * (1 - e), p.expRot.y * (1 - e), p.expRot.z * (1 - e));
    }
    // ventilos qui tournent
    group.traverse((o) => { if (o.userData && o.userData.spin) o.rotation.z += dt * 6; });

    // RGB cyclique
    const hue = (t * 0.06) % 1;
    for (const m of rgbMats) m.emissive.setHSL(hue, 1, 0.55);
    rgb1.color.setHSL(hue, 0.8, 0.6);
    rgb2.color.setHSL((hue + 0.4) % 1, 0.8, 0.6);

    // orbite + auto-rotation au repos
    idle += dt;
    if (!dragging && idle > 1.4) tRotY += dt * 0.18;
    rotY += (tRotY - rotY) * 0.08;
    rotX += (tRotX - rotX) * 0.08;
    group.rotation.y = rotY;
    group.rotation.x = rotX;

    // léger recul caméra quand assemblé (on “range” la machine)
    camera.position.z = 20 - e * 2.5;
    camera.lookAt(0, 0, 0);

    renderer.render(scene, camera);
  }
  frame();
};
