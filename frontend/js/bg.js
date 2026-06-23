/* ════════════════════════════════════════════════════════════════
  VOLT PC — Fond animé : la carte mère cachée
  Un circuit imprimé géant court sous la surface du site :
  pistes de cuivre, pastilles, vias et puces, à peine visibles
  dans le noir. Des impulsions électriques voyagent le long des
  pistes, et le curseur agit comme une lampe-torche qui révèle
  le circuit à son passage.
  Désactivé si l'utilisateur préfère réduire les animations.
  ════════════════════════════════════════════════════════════════ */
"use strict";

(() => {
 const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

 const canvas = document.createElement("canvas");
 canvas.id = "bgfx";
 canvas.setAttribute("aria-hidden", "true");
 document.body.prepend(canvas);
 const ctx = canvas.getContext("2d");

 let W = 0, H = 0, DPR = 1;
 const mouse = { x: -9999, y: -9999, gx: -9999, gy: -9999 };

 /* couches pré-rendues : circuit éteint / circuit allumé / masque */
 const dimLayer = document.createElement("canvas");
 const litLayer = document.createElement("canvas");
 const maskLayer = document.createElement("canvas");

 let traces = [];  // { pts:[{x,y}…], len, lens:[…] }
 let pulses = [];

 /* ─── Génération du circuit (style PCB : angles à 45°) ─── */
 function buildCircuit() {
  const G = 72 * DPR;            // pas de la grille
  const rnd = (n) => Math.floor(Math.random() * n);
  const cols = Math.max(2, Math.floor(W / G));
  const rows = Math.max(2, Math.floor(H / G));
  traces = [];

  const count = Math.min(64, Math.max(22, Math.floor((W * H) / (90000 * DPR * DPR))));
  for (let t = 0; t < count; t++) {
   let x = (1 + rnd(cols - 1)) * G;
   let y = (1 + rnd(rows - 1)) * G;
   let dir = [0, 90, 180, 270][rnd(4)];  // départ orthogonal
   const pts = [{ x, y }];
   const segs = 3 + rnd(4);
   for (let s = 0; s < segs; s++) {
    const step = G * (1 + rnd(3));
    const rad = (dir * Math.PI) / 180;
    x += Math.cos(rad) * step;
    y += Math.sin(rad) * step;
    x = Math.max(G * 0.4, Math.min(W - G * 0.4, x));
    y = Math.max(G * 0.4, Math.min(H - G * 0.4, y));
    pts.push({ x, y });
    dir += [45, -45, 90, -90][rnd(4)];  // virages PCB
   }
   // longueurs cumulées pour faire circuler les impulsions
   const lens = [0];
   let len = 0;
   for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    lens.push(len);
   }
   if (len > G) traces.push({ pts, len, lens });
  }
 }

 /* ─── Dessin du circuit sur une couche ─── */
 function paintCircuit(c, bright) {
  const g = c.getContext("2d");
  g.clearRect(0, 0, W, H);
  const trace = bright ? "hsla(245, 78%, 60%, 0.42)" : "hsla(235, 45%, 50%, 0.06)";
  const pad = bright ? "hsla(255, 78%, 62%, 0.55)" : "hsla(235, 45%, 52%, 0.10)";
  const hole = "#f6f7fb";
  if (bright) { g.shadowColor = "hsla(250, 88%, 62%, 0.5)"; g.shadowBlur = 9 * DPR; }
  g.lineWidth = 1.3 * DPR;
  g.lineJoin = "round";
  g.lineCap = "round";
  for (const tr of traces) {
   g.strokeStyle = trace;
   g.beginPath();
   g.moveTo(tr.pts[0].x, tr.pts[0].y);
   for (let i = 1; i < tr.pts.length; i++) g.lineTo(tr.pts[i].x, tr.pts[i].y);
   g.stroke();
   // pastille de départ + pad d'arrivée percé (style soudure)
   for (const end of [tr.pts[0], tr.pts[tr.pts.length - 1]]) {
    g.fillStyle = pad;
    g.beginPath(); g.arc(end.x, end.y, 4.5 * DPR, 0, 6.2832); g.fill();
    g.fillStyle = hole;
    g.beginPath(); g.arc(end.x, end.y, 1.8 * DPR, 0, 6.2832); g.fill();
   }
   // vias sur quelques coudes
   for (let i = 1; i < tr.pts.length - 1; i += 2) {
    g.fillStyle = pad;
    g.beginPath(); g.arc(tr.pts[i].x, tr.pts[i].y, 2.2 * DPR, 0, 6.2832); g.fill();
   }
  }
  g.shadowBlur = 0;
 }

 /* ─── Impulsions électriques ─── */
 function spawnPulses() {
  pulses = [];
  const n = Math.min(16, Math.max(6, Math.floor(traces.length / 3)));
  for (let i = 0; i < n; i++) pulses.push(newPulse(Math.random() * 2000));
 }
 function newPulse(delay = 0) {
  const trace = traces[Math.floor(Math.random() * traces.length)];
  return {
   trace,
   dist: 0,
   speed: (50 + Math.random() * 70) * DPR / 60,  // px par frame (~60 fps)
   delay,                     // ms avant départ
   born: performance.now(),
  };
 }
 function pulsePos(p) {
  const { pts, lens } = p.trace;
  for (let i = 1; i < lens.length; i++) {
   if (p.dist <= lens[i]) {
    const f = (p.dist - lens[i - 1]) / (lens[i] - lens[i - 1] || 1);
    return {
     x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * f,
     y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * f,
    };
   }
  }
  return pts[pts.length - 1];
 }

 /* ─── Mise en page ─── */
 function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 1.5);
  W = Math.floor(innerWidth * DPR);
  H = Math.floor(innerHeight * DPR);
  if (W < 4 || H < 4) return;        // panneau pas encore affiché
  for (const c of [canvas, dimLayer, litLayer, maskLayer]) {
   c.width = W; c.height = H;
  }
  canvas.style.width = innerWidth + "px";
  canvas.style.height = innerHeight + "px";
  buildCircuit();
  paintCircuit(dimLayer, false);
  paintCircuit(litLayer, true);
  spawnPulses();
  // première frame synchrone : le circuit est visible avant même
  // que la boucle d'animation ne démarre (ou sans elle, en réduit)
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(dimLayer, 0, 0);
 }
 resize();
 let resizeTimer;
 addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(resize, 200); });
 document.addEventListener("visibilitychange", () => { if (W < 4) resize(); });

 if (REDUCED) return;

 addEventListener("pointermove", (e) => {
  mouse.x = e.clientX * DPR;
  mouse.y = e.clientY * DPR;
 }, { passive: true });
 document.addEventListener("pointerleave", () => { mouse.x = mouse.y = -9999; });

 /* ─── Boucle ─── */
 function tick(now) {
  if (Math.floor(innerWidth * DPR) !== W && innerWidth > 2) resize();
  ctx.clearRect(0, 0, W, H);

  // 1. circuit éteint, à peine perceptible
  ctx.drawImage(dimLayer, 0, 0);

  // 2. lampe-torche : révèle le circuit allumé autour du curseur
  mouse.gx += (mouse.x - mouse.gx) * 0.09;
  mouse.gy += (mouse.y - mouse.gy) * 0.09;
  if (mouse.gx > -5000) {
   const R = 270 * DPR;
   const mg = maskLayer.getContext("2d");
   mg.clearRect(0, 0, W, H);
   const grad = mg.createRadialGradient(mouse.gx, mouse.gy, 0, mouse.gx, mouse.gy, R);
   grad.addColorStop(0, "rgba(255,255,255,0.95)");
   grad.addColorStop(0.6, "rgba(255,255,255,0.40)");
   grad.addColorStop(1, "rgba(255,255,255,0)");
   mg.fillStyle = grad;
   mg.fillRect(mouse.gx - R, mouse.gy - R, R * 2, R * 2);
   mg.globalCompositeOperation = "source-in";
   mg.drawImage(litLayer, 0, 0);
   mg.globalCompositeOperation = "source-over";
   ctx.drawImage(maskLayer, 0, 0);
   // halo ambiant très doux
   const glow = ctx.createRadialGradient(mouse.gx, mouse.gy, 0, mouse.gx, mouse.gy, R * 1.2);
   glow.addColorStop(0, "rgba(99, 102, 241, 0.06)");
   glow.addColorStop(1, "rgba(99, 102, 241, 0)");
   ctx.fillStyle = glow;
   ctx.fillRect(0, 0, W, H);
  }

  // 3. impulsions électriques le long des pistes
  for (let i = 0; i < pulses.length; i++) {
   const p = pulses[i];
   if (now - p.born < p.delay) continue;
   p.dist += p.speed;
   if (p.dist >= p.trace.len) { pulses[i] = newPulse(400 + Math.random() * 1800); continue; }
   const pos = pulsePos(p);
   ctx.shadowColor = "hsla(250, 90%, 62%, 0.9)";
   ctx.shadowBlur = 14 * DPR;
   ctx.fillStyle = "hsla(255, 95%, 68%, 0.95)";
   ctx.beginPath();
   ctx.arc(pos.x, pos.y, 2.1 * DPR, 0, 6.2832);
   ctx.fill();
   ctx.shadowBlur = 0;
  }

  requestAnimationFrame(tick);
 }
 requestAnimationFrame(tick);
})();
