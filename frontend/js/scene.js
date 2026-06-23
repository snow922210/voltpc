/* ════════════════════════════════════════════════════════════════
  VOLT PC — Scène WebGL « build » (Three.js, auto-hébergé)
  Une tour PC détaillée dont les composants s'assemblent au scroll
  (section épinglée). Orbitable à la souris, RGB animé, métal
  réfléchissant via environnement procédural. Expose window.initHeroGL.
  ════════════════════════════════════════════════════════════════ */
"use strict";

window.initHeroGL = function initHeroGL(canvas) {
 if (!canvas || typeof THREE === "undefined") return;
 if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

 let renderer;
 try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
 } catch (e) { return; }
 canvas.addEventListener("webglcontextlost", (e) => e.preventDefault(), false);
 renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
 renderer.setClearColor(0x000000, 0);
 renderer.outputEncoding = THREE.sRGBEncoding;
 renderer.toneMapping = THREE.ACESFilmicToneMapping;
 renderer.toneMappingExposure = 1.05;

 const scene = new THREE.Scene();
 const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
 camera.position.set(2, 2, 22);

 // ─── Environnement procédural (reflets sur le métal/verre) ───
 (function buildEnv() {
  const cv = document.createElement("canvas");
  cv.width = 16; cv.height = 128;
  const g = cv.getContext("2d").createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, "#eef3ff"); g.addColorStop(0.5, "#b4bfd4"); g.addColorStop(1, "#222a3a");
  const ctx2 = cv.getContext("2d"); ctx2.fillStyle = g; ctx2.fillRect(0, 0, 16, 128);
  const tex = new THREE.CanvasTexture(cv);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.encoding = THREE.sRGBEncoding;
  scene.environment = tex;
 })();

 // ─── Lumières ───
 scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x202838, 0.7));
 const key = new THREE.DirectionalLight(0xffffff, 1.4); key.position.set(8, 12, 10); scene.add(key);
 const fill = new THREE.DirectionalLight(0x88aaff, 0.5); fill.position.set(-10, -4, -6); scene.add(fill);
 const rgbL1 = new THREE.PointLight(0x3b82f6, 1.6, 50); rgbL1.position.set(-5, 4, 8); scene.add(rgbL1);
 const rgbL2 = new THREE.PointLight(0xa855f7, 1.3, 50); rgbL2.position.set(6, -3, 6); scene.add(rgbL2);

 // ─── Matières ───
 const M = {
  case:  new THREE.MeshStandardMaterial({ color: 0x20262f, metalness: 0.95, roughness: 0.34 }),
  alu:  new THREE.MeshStandardMaterial({ color: 0xc9d2dc, metalness: 1.0, roughness: 0.28 }),
  dark:  new THREE.MeshStandardMaterial({ color: 0x0c0f15, metalness: 0.5, roughness: 0.55 }),
  plastic:new THREE.MeshStandardMaterial({ color: 0x14181f, metalness: 0.2, roughness: 0.7 }),
  pcb:  new THREE.MeshStandardMaterial({ color: 0x0a1730, metalness: 0.4, roughness: 0.62 }),
  gold:  new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 1.0, roughness: 0.35 }),
  glass: new THREE.MeshStandardMaterial({ color: 0xaecaf2, metalness: 0.1, roughness: 0.04, transparent: true, opacity: 0.1, side: THREE.DoubleSide }),
 };
 const rgbMats = [];
 const rgb = () => { const m = new THREE.MeshStandardMaterial({ color: 0x8ab4ff, emissive: 0x3b82f6, emissiveIntensity: 2.4, metalness: 0.2, roughness: 0.4 }); rgbMats.push(m); return m; };

 const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
 const cyl = (r1, r2, h, m, seg = 24) => new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), m);

 // Ventilateur réaliste : cadre + moyeu + 9 pales inclinées + anneau RGB
 function fan(radius) {
  const g = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.TorusGeometry(radius, radius * 0.12, 12, 36), M.plastic);
  g.add(frame);
  const corners = box(radius * 2.2, radius * 2.2, radius * 0.18, M.plastic);
  corners.position.z = -radius * 0.02; g.add(corners);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.86, radius * 0.05, 10, 36), rgb());
  g.add(ring);
  const blades = new THREE.Group();
  const hub = cyl(radius * 0.26, radius * 0.26, radius * 0.3, M.dark, 18);
  hub.rotation.x = Math.PI / 2; blades.add(hub);
  for (let i = 0; i < 9; i++) {
   const b = box(radius * 0.66, radius * 0.018 * 18, radius * 0.05, M.dark);
   b.position.set(Math.cos(i / 9 * 6.283) * radius * 0.46, Math.sin(i / 9 * 6.283) * radius * 0.46, 0);
   b.rotation.z = i / 9 * 6.283; b.rotation.y = 0.5; blades.add(b);
  }
  blades.userData.spin = true; g.add(blades); g.userData.blades = blades;
  return g;
 }
 // Dissipateur à ailettes
 function heatsink(w, h, d, fins) {
  const g = new THREE.Group();
  for (let i = 0; i < fins; i++) {
   const f = box(w, h, d / fins * 0.6, M.alu);
   f.position.z = -d / 2 + (i + 0.5) * d / fins; g.add(f);
  }
  return g;
 }

 const group = new THREE.Group();
 scene.add(group);
 const parts = [];
 const V = (x, y, z) => new THREE.Vector3(x, y, z);
 const EXPLODE = 0.62;
 function add(obj, asm, exp, expRot) {
  obj.position.copy(asm); group.add(obj);
  parts.push({ obj, asm: asm.clone(), exp: asm.clone().add(exp.clone().multiplyScalar(EXPLODE)), expRot: expRot || V(0, 0, 0) });
  return obj;
 }

 // ─── Boîtier : 4 montants + cadres haut/bas + panneau arrière + verre ───
 const chassis = new THREE.Group();
 const W = 5, H = 9, D = 9, t = 0.22;
 const postMat = M.case;
 for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
  const p = box(t, H, t, postMat); p.position.set(sx * (W / 2), 0, sz * (D / 2)); chassis.add(p);
 }
 for (const sy of [-1, 1]) {
  const fx = box(W, t, t, postMat); fx.position.set(0, sy * (H / 2), D / 2); chassis.add(fx);
  const bx = box(W, t, t, postMat); bx.position.set(0, sy * (H / 2), -D / 2); chassis.add(bx);
  const lz = box(t, t, D, postMat); lz.position.set(-W / 2, sy * (H / 2), 0); chassis.add(lz);
  const rz = box(t, t, D, postMat); rz.position.set(W / 2, sy * (H / 2), 0); chassis.add(rz);
 }
 const back = box(t, H - t, D - t, M.case); back.position.x = -W / 2; chassis.add(back);
 const bottom = box(W - t, t, D - t, M.case); bottom.position.y = -H / 2; chassis.add(bottom);
 const glass = box(t * 0.5, H - t, D - t, M.glass); glass.position.x = W / 2; chassis.add(glass);
 add(chassis, V(0, 0, 0), V(0, 0, 0));

 // ─── Carte mère détaillée (PCB, VRM, M.2, chipset RGB, slots, I/O) ───
 const mb = new THREE.Group();
 mb.add(box(0.18, 7, 7, M.pcb));
 const vrmTop = heatsink(0.5, 1.6, 2.6, 8); vrmTop.position.set(0.2, 2.6, 0.4); vrmTop.rotation.y = Math.PI / 2; mb.add(vrmTop); // VRM haut
 const vrmL = heatsink(0.5, 2.4, 0.7, 6); vrmL.position.set(0.2, 1.0, 2.4); vrmL.rotation.y = Math.PI / 2; mb.add(vrmL);    // VRM gauche
 const chip = box(0.28, 1.5, 1.5, M.dark); chip.position.set(0.2, -2.0, 0.4); mb.add(chip);
 const chipRGB = box(0.32, 0.9, 0.9, rgb()); chipRGB.position.set(0.22, -2.0, 0.4); mb.add(chipRGB);  // chipset RGB
 const m2 = box(0.22, 0.5, 3.2, M.alu); m2.position.set(0.2, -0.4, -0.2); mb.add(m2);         // cache M.2
 for (let i = 0; i < 3; i++) { const s = box(0.16, 0.45, 4.4, M.plastic); s.position.set(0.18, -1.2 - i * 0.8, -0.4); mb.add(s); } // slots PCIe
 const io = box(0.5, 1.7, 0.7, M.alu); io.position.set(0, 2.7, -3.0); mb.add(io);           // I/O shield
 const ioRGB = box(0.54, 0.12, 0.7, rgb()); ioRGB.position.set(0, 3.55, -3.0); mb.add(ioRGB);
 add(mb, V(-1.9, 0.4, 0), V(-7, 1.5, 0), V(0, 0.5, 0.3));

 // ─── CPU + watercooling AIO (pompe RGB + tubes + radiateur ventilé) ───
 const cpu = box(0.4, 1.3, 1.3, M.alu); add(cpu, V(-1.6, 2.0, 0.4), V(2, 7, 3), V(0.6, 0.6, 0));
 const pump = new THREE.Group();
 pump.add(box(1.5, 1.6, 1.6, M.dark));
 const pumpRing = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.09, 12, 36), rgb());
 pumpRing.position.x = 0.78; pumpRing.rotation.y = Math.PI / 2; pump.add(pumpRing);
 const pumpFace = box(0.05, 0.75, 0.75, rgb()); pumpFace.position.x = 0.79; pump.add(pumpFace);
 add(pump, V(-1.05, 2.0, 0.4), V(3.5, 8.5, 3), V(0.4, 1.0, 0.3));

 const rad = new THREE.Group();
 rad.add(heatsink(4.6, 1.0, 1.7, 22));
 const radFan = fan(0.78); radFan.position.set(0, -0.95, 0); radFan.rotation.x = Math.PI / 2; rad.add(radFan);
 const tubeMat = new THREE.MeshStandardMaterial({ color: 0x0a0d12, metalness: 0.2, roughness: 0.75 });
 for (const sx of [-0.55, 0.55]) {
  const curve = new THREE.CatmullRomCurve3([V(sx, -0.5, 0.6), V(sx + 0.4, -1.9, 0.7), V(0.7, -3.1, 0.5)]);
  rad.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 18, 0.13, 8), tubeMat));
 }
 add(rad, V(0, 3.7, 0), V(0, 9, 5), V(0.5, 0, 0.2));

 // ─── RAM ×2 (dissipateur + barre RGB) ───
 for (let i = 0; i < 2; i++) {
  const r = new THREE.Group();
  r.add(box(0.22, 2.3, 0.5, M.alu));
  const top = box(0.24, 0.35, 0.5, rgb()); top.position.y = 1.25; r.add(top);
  add(r, V(-1.45, 1.7, 1.9 + i * 0.6), V(0.5 + i, 9.5, 5 + i), V(0.3, 0, 0.8 + i * 0.2));
 }

 // ─── GPU : shroud + backplate + 3 ventilos + barre RGB ───
 const gpu = new THREE.Group();
 gpu.add(box(1.3, 1.7, 6.4, M.plastic));
 const backplate = box(0.12, 1.7, 6.4, M.alu); backplate.position.x = -0.75; gpu.add(backplate);
 const strip = box(0.1, 0.18, 5.6, rgb()); strip.position.set(0.66, 0.85, 0); gpu.add(strip);
 for (let i = -1; i <= 1; i++) { const f = fan(0.86); f.position.set(0.7, -0.1, i * 2.0); f.rotation.y = Math.PI / 2; gpu.add(f); }
 const pcie = box(0.5, 0.35, 1.4, M.gold); pcie.position.set(-0.4, -0.95, -2.4); gpu.add(pcie);
 add(gpu, V(-0.7, -0.7, 0), V(6, -1, 7), V(0.2, 0.8, 0.2));

 // ─── Alimentation (avec ventilo grille) ───
 const psu = new THREE.Group();
 psu.add(box(2.8, 2.0, 4.4, M.case));
 const pFan = fan(0.85); pFan.position.set(0, 1.05, 0); pFan.rotation.x = -Math.PI / 2; psu.add(pFan);
 add(psu, V(-0.3, -3.5, 0), V(0, -9, 4), V(0.4, 0.5, 0));

 // ─── SSD M.2 ───
 const ssd = box(0.16, 0.7, 2.4, M.pcb); add(ssd, V(-1.6, -1.4, 1.2), V(3, -6, 8), V(0.5, 0.5, 0.7));

 // ─── Ventilateurs d'admission frontaux ───
 const front = new THREE.Group();
 for (let i = 0; i < 2; i++) { const f = fan(0.95); f.position.set(0, -1.3 + i * 2.2, 4.05); front.add(f); }
 add(front, V(0, 0, 0), V(0, 0, 9), V(0.4, 0, 0.1));

 // ─── Câbles (tubes) ───
 const cableMat = new THREE.MeshStandardMaterial({ color: 0x0a0d12, metalness: 0.1, roughness: 0.8 });
 function cable(p0, p1, sag) {
  const mid = p0.clone().lerp(p1, 0.5); mid.x -= sag;
  const curve = new THREE.CatmullRomCurve3([p0, mid, p1]);
  return new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.1, 8), cableMat);
 }
 const cab = new THREE.Group();
 cab.add(cable(V(-1.9, -2.5, 1.5), V(-1.9, 1.5, 1.5), 0.8));
 cab.add(cable(V(-1.9, -2.5, -1), V(-0.5, -0.2, 0), 0.6));
 add(cab, V(0, 0, 0), V(-5, -3, 2), V(0, 0, 0.5));

 // ─── Interaction orbite ───
 let tRY = -0.55, tRX = 0.12, rY = -0.55, rX = 0.12, drag = false, px = 0, py = 0, idle = 0;
 const down = (e) => { drag = true; idle = 0; px = e.touches ? e.touches[0].clientX : e.clientX; py = e.touches ? e.touches[0].clientY : e.clientY; };
 const move = (e) => {
  if (!drag) return;
  const cx = e.touches ? e.touches[0].clientX : e.clientX, cy = e.touches ? e.touches[0].clientY : e.clientY;
  tRY += (cx - px) * 0.008; tRX += (cy - py) * 0.006; tRX = Math.max(-0.9, Math.min(0.9, tRX));
  px = cx; py = cy; idle = 0;
 };
 const up = () => { drag = false; };
 canvas.addEventListener("pointerdown", down);
 addEventListener("pointermove", move, { passive: true });
 addEventListener("pointerup", up);

 // ─── Assemblage AUTOMATIQUE : se déclenche quand la section entre dans la vue ───
 const root = canvas.closest(".build-scroll") || canvas.closest(".home-hero") || canvas;
 let prog = 0, target = 0;
 const obs = new IntersectionObserver((es) => {
  const e = es[0];
  target = (e.isIntersecting && e.intersectionRatio >= 0.4) ? 1 : 0;
 }, { threshold: [0, 0.2, 0.4, 0.6, 0.8] });
 obs.observe(root);

 const ease = (t) => 1 - Math.pow(1 - t, 3);
 let lastW = 0, lastH = 0;
 function resize() {
  const w = canvas.clientWidth || canvas.parentElement.clientWidth || 1;
  const h = canvas.clientHeight || w;
  lastW = canvas.clientWidth; lastH = canvas.clientHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
 }
 resize(); addEventListener("resize", resize);

 const tmp = new THREE.Vector3();
 const clock = new THREE.Clock();

 function loop() {
  if (!canvas.isConnected) {
   renderer.dispose(); obs.disconnect();
   removeEventListener("pointermove", move); removeEventListener("pointerup", up);
   removeEventListener("resize", resize);
   return;
  }
  requestAnimationFrame(loop);
  if (canvas.clientWidth !== lastW || canvas.clientHeight !== lastH) resize();
  const dt = clock.getDelta(), t = clock.elapsedTime;
  prog += (target - prog) * Math.min(1, dt * 2.2);  // assemblage animé tout seul
  if (Math.abs(target - prog) < 0.001) prog = target;
  window.__heroProg = prog;
  const e = ease(prog);

  for (const p of parts) {
   tmp.copy(p.exp).lerp(p.asm, e); p.obj.position.copy(tmp);
   p.obj.rotation.set(p.expRot.x * (1 - e), p.expRot.y * (1 - e), p.expRot.z * (1 - e));
  }
  group.traverse((o) => { if (o.userData && o.userData.spin) o.rotation.z += dt * 7; });

  const hue = (t * 0.06) % 1;
  for (const m of rgbMats) m.emissive.setHSL(hue, 1, 0.55);
  rgbL1.color.setHSL(hue, 0.8, 0.6); rgbL2.color.setHSL((hue + 0.4) % 1, 0.8, 0.6);

  idle += dt; if (!drag && idle > 1.4) tRY += dt * 0.16;
  rY += (tRY - rY) * 0.08; rX += (tRX - rX) * 0.08;
  group.rotation.y = rY; group.rotation.x = rX;

  camera.position.z = 23 - e * 6; camera.position.y = 1.8 - e * 1.3; camera.position.x = 1.4 - e * 1.4;
  camera.lookAt(0, 0.2, 0);
  renderer.render(scene, camera);
 }
 loop();
};
