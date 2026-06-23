/* ════════════════════════════════════════════════════════════════
   VOLT PC — Application front (SPA vanilla JS)
   ════════════════════════════════════════════════════════════════ */
"use strict";

const API = "/api";
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const fmtPrice = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const fmt = (n) => fmtPrice.format(n);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ─── État global ─── */
const state = {
  // La session vit désormais dans un cookie HttpOnly posé par le backend
  // (inaccessible au JS, donc à l'abri du vol par XSS). `token` n'est plus
  // qu'un drapeau « connecté » côté UI : on n'expose ni ne stocke le jeton brut.
  // On le déduit du profil mémorisé (volt_user) ; /auth/me le revalidera via le
  // cookie au démarrage et l'invalidera s'il a expiré.
  token: localStorage.getItem("volt_user") ? true : null,
  user: JSON.parse(localStorage.getItem("volt_user") || "null"),
  cart: [],
  promo: JSON.parse(localStorage.getItem("volt_promo") || "null"),
  build: {},          // configurateur : { categorie: produit }
  afterLogin: null,   // action à reprendre après connexion
  favorites: new Set(),                                              // ids favoris (chargés à la connexion)
  compare: JSON.parse(localStorage.getItem("volt_compare") || "[]"), // ids à comparer
};

const apiCache = new Map();
const productIndex = new Map();
const API_CACHE_TTL_MS = 30_000;
let cartDrawerDirty = true;
let cartPushTimer = null;

function isCacheableApiPath(path) {
  return path === "/categories" || path.startsWith("/products");
}

function clearApiCache(prefix = "") {
  for (const key of apiCache.keys()) {
    if (!prefix || key.startsWith(prefix)) apiCache.delete(key);
  }
}

function indexProducts(products = []) {
  for (const p of products) {
    if (p?.id) productIndex.set(Number(p.id), p);
  }
}

async function getIndexedProduct(id) {
  const key = Number(id);
  let p = productIndex.get(key);
  if (!p) {
    p = await api("/products/" + key);
    indexProducts([p]);
  }
  return p;
}

function saveCompare() { localStorage.setItem("volt_compare", JSON.stringify(state.compare)); }

// Le panier appartient au compte client : aucune persistance navigateur invitée.
function saveCart() {
  if (state.user) schedulePushCart();
  updateCartCount();
  cartDrawerDirty = true;
}

function schedulePushCart() {
  clearTimeout(cartPushTimer);
  cartPushTimer = setTimeout(pushCart, 250);
}

// Envoie le panier courant au serveur (connecté uniquement). Non bloquant.
async function pushCart() {
  if (!state.user) return;
  try {
    await api("/cart", { method: "PUT", body: JSON.stringify({
      items: state.cart.map((i) => ({ product_id: i.id, quantity: i.qty })),
    }) });
  } catch { /* la persistance ne doit jamais bloquer l'UI */ }
}

// À la connexion : charge le panier enregistré sur le compte serveur.
async function syncCartOnLogin() {
  if (!state.user) return;
  let server = [];
  try { server = await api("/cart"); } catch { server = []; }
  const byId = new Map(server.map((i) => [i.id, { ...i }]));
  state.cart = [...byId.values()].map((i) => ({
    id: i.id, name: i.name, brand: i.brand, category: i.category,
    price: i.price, stock: i.stock, qty: i.qty,
  }));
  updateCartCount();
  refreshCartDrawer();
}

async function restoreSessionAndCart({ syncCart = true, clearOnFail = true } = {}) {
  try {
    const me = await api("/auth/me", { preserveAuthOn401: !clearOnFail });
    state.token = true;
    state.user = { ...(state.user || {}), ...me };
    saveAuth();
    if (syncCart) await syncCartOnLogin();
    return true;
  } catch {
    if (clearOnFail) {
      state.token = null;
      state.user = null;
      saveAuth();
      if (syncCart) {
        state.cart = [];
        updateCartCount();
        refreshCartDrawer();
      }
    }
    return false;
  }
}
function savePromo() { localStorage.setItem("volt_promo", JSON.stringify(state.promo)); }
function saveAuth() {
  if (state.token) {
    // On ne mémorise QUE le profil d'affichage (nom/email) — jamais le jeton,
    // qui reste confiné au cookie HttpOnly géré par le navigateur.
    localStorage.setItem("volt_user", JSON.stringify(state.user));
  } else {
    localStorage.removeItem("volt_user");
    localStorage.removeItem("volt_token"); // nettoyage d'anciennes sessions
  }
  $("#accountLabel").textContent = state.user ? state.user.name.split(" ")[0] : "Compte";
}

/* ─── API ─── */
async function api(path, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  if (method === "GET" && isCacheableApiPath(path)) {
    const cached = apiCache.get(path);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
  }

  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  // credentials: "include" → le cookie de session HttpOnly accompagne la requête.
  const res = await fetch(API + path, { ...options, headers, credentials: "include" });
  let data = null;
  let raw = "";
  try { raw = await res.text(); } catch { /* réponse vide */ }
  if (raw) {
    try { data = JSON.parse(raw); }
    catch { data = { detail: raw.trim() }; }
  }
  if (!res.ok) {
    if (res.status === 401 && state.token && !options.preserveAuthOn401) {
      state.token = null;
      state.user = null;
      saveAuth();
    }
    throw new Error(data?.detail || "Erreur réseau");
  }

  if (method === "GET" && isCacheableApiPath(path)) {
    apiCache.set(path, { value: data, expiresAt: Date.now() + API_CACHE_TTL_MS });
  } else if (method !== "GET" && (path.startsWith("/admin/products") || path.includes("/reviews") || path === "/products")) {
    clearApiCache("/products");
    clearApiCache("/categories");
  }
  return data;
}

/* ─── Téléchargement de la facture PDF ─── */
// Global (utilisé via onclick="downloadInvoice(id)"). On passe par fetch + blob
// car le téléchargement nécessite l'en-tête d'authentification.
async function downloadInvoice(orderId) {
  try {
    const res = await fetch(API + `/orders/${orderId}/invoice`, {
      credentials: "include", // session transmise via le cookie HttpOnly
    });
    if (!res.ok) {
      let d = {};
      try { d = await res.json(); } catch { /* corps non-JSON */ }
      throw new Error(d.detail || "Impossible de générer la facture");
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `facture-${orderId}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    toast(err.message, "error");
  }
}

/* ─── Favoris (liste de souhaits) ─── */
async function loadFavorites() {
  if (!state.user) { state.favorites = new Set(); return; }
  try {
    const favs = await api("/favorites");
    state.favorites = new Set(favs.map((p) => p.id));
  } catch { state.favorites = new Set(); }
}

function refreshFavoriteButtons() {
  $$("[data-fav]").forEach((b) =>
    b.classList.toggle("on", state.favorites.has(Number(b.dataset.fav))));
}

function routeNeedsAuth(path) {
  return path === "compte" || path === "commande" || path.startsWith("admin");
}

// Bascule un favori, puis met à jour l'icône cœur correspondante à l'écran.
async function toggleFavorite(id, btn) {
  if (!state.user) { requireAuth(() => toggleFavorite(id)); return; }
  const isFav = state.favorites.has(id);
  try {
    await api(`/favorites/${id}`, { method: isFav ? "DELETE" : "POST" });
    if (isFav) { state.favorites.delete(id); toast("Retiré des favoris", "info"); }
    else { state.favorites.add(id); toast("Ajouté aux favoris ♥"); }
    // Rafraîchit tous les boutons cœur de cet id présents à l'écran.
    $$(`[data-fav="${id}"]`).forEach((b) => b.classList.toggle("on", state.favorites.has(id)));
  } catch (e) { toast(e.message, "error"); }
}

const heartBtn = (p) => `
  <button class="fav-btn ${state.favorites.has(p.id) ? "on" : ""}" data-fav="${p.id}" title="Ajouter aux favoris" aria-label="Favori">
    <svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 21s-7.5-4.6-9.7-9C.8 8.6 2.5 5 6 5c2 0 3.2 1.1 4 2.3C10.8 6.1 12 5 14 5c3.5 0 5.2 3.6 3.7 7-2.2 4.4-9.7 9-9.7 9z" stroke="currentColor" stroke-width="2" fill="none" stroke-linejoin="round"/></svg>
  </button>`;

/* ─── Comparateur ─── */
const COMPARE_MAX = 4;
function inCompare(id) { return state.compare.includes(id); }
function toggleCompare(id) {
  if (inCompare(id)) {
    state.compare = state.compare.filter((x) => x !== id);
  } else {
    if (state.compare.length >= COMPARE_MAX) { toast(`Comparaison limitée à ${COMPARE_MAX} produits`, "error"); return; }
    state.compare.push(id);
  }
  saveCompare();
  renderCompareBar();
  $$(`[data-cmp="${id}"]`).forEach((b) => b.classList.toggle("on", inCompare(id)));
}

async function renderCompareBar() {
  const bar = $("#compareBar");
  if (!bar) return;
  if (state.compare.length === 0) { bar.hidden = true; bar.innerHTML = ""; return; }
  bar.hidden = false;
  bar.innerHTML = `
    <span class="compare-bar-label">Comparer (${state.compare.length}/${COMPARE_MAX})</span>
    <div class="compare-bar-items">${state.compare.map((id) => `<span class="compare-chip" data-cmp-rm="${id}">#${id} ✕</span>`).join("")}</div>
    <a class="btn btn-primary btn-sm" href="/comparer" ${state.compare.length < 2 ? 'style="opacity:.5;pointer-events:none"' : ""}>Comparer →</a>
    <button class="btn btn-ghost btn-sm" id="compareClear">Vider</button>`;
  $("#compareClear").onclick = () => { state.compare = []; saveCompare(); renderCompareBar(); $$("[data-cmp]").forEach((b) => b.classList.remove("on")); };
  $$("[data-cmp-rm]", bar).forEach((c) => c.onclick = () => toggleCompare(Number(c.dataset.cmpRm)));
}

/* ─── Toasts ─── */
function toast(msg, type = "success") {
  const existing = Array.from($$("#toasts .toast")).find((t) => t.dataset.msg === msg && t.dataset.type === type);
  if (existing) return;
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.dataset.msg = msg;
  el.dataset.type = type;
  el.innerHTML = `<span>${type === "error" ? "⚠️" : type === "info" ? "ℹ️" : "✓"}</span><span>${esc(msg)}</span>`;
  $("#toasts").appendChild(el);
  setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 320); }, 3400);
}

function setupCookieBanner() {
  if (localStorage.getItem("volt_cookie_consent")) return;
  const banner = document.createElement("div");
  banner.className = "cookie-banner";
  banner.setAttribute("role", "dialog");
  banner.setAttribute("aria-label", "Préférences cookies");
  banner.innerHTML = `
    <div>
      <strong>Cookies et confidentialité</strong>
      <p>Les cookies nécessaires servent au panier, au compte et à la sécurité. Les cookies de mesure ou marketing ne sont activés qu'avec votre accord.</p>
    </div>
    <div class="cookie-actions">
      <button class="btn btn-ghost btn-sm" data-cookie="necessary">Refuser</button>
      <button class="btn btn-primary btn-sm" data-cookie="all">Accepter</button>
    </div>`;
  document.body.appendChild(banner);
  banner.querySelectorAll("[data-cookie]").forEach((btn) => {
    btn.addEventListener("click", () => {
      localStorage.setItem("volt_cookie_consent", btn.dataset.cookie);
      banner.remove();
      toast(btn.dataset.cookie === "all" ? "Préférences cookies enregistrées" : "Cookies optionnels refusés", "info");
    });
  });
}

/* ─── Catégories & visuels SVG ─── */
const CATS = {
  gpu: { label: "Cartes graphiques", short: "GPU" },
  cpu: { label: "Processeurs", short: "CPU" },
  ram: { label: "Mémoire RAM", short: "RAM" },
  storage: { label: "Stockage SSD", short: "SSD" },
  motherboard: { label: "Cartes mères", short: "Carte mère" },
  psu: { label: "Alimentations", short: "Alim" },
  case: { label: "Boîtiers", short: "Boîtier" },
  cooling: { label: "Refroidissement", short: "Cooling" },
  monitor: { label: "Écrans", short: "Écran" },
  keyboard: { label: "Claviers", short: "Clavier" },
  mouse: { label: "Souris", short: "Souris" },
  headset: { label: "Casques audio", short: "Casque" },
  fan: { label: "Ventilateurs", short: "Ventilo" },
  thermal: { label: "Pâte thermique", short: "Pâte" },
  webcam: { label: "Webcams", short: "Webcam" },
  microphone: { label: "Microphones", short: "Micro" },
  speaker: { label: "Enceintes", short: "Enceinte" },
  mousepad: { label: "Tapis de souris", short: "Tapis" },
  chair: { label: "Chaises gaming", short: "Chaise" },
};

// Groupes pour les sous-menus de navigation
const COMPONENT_CATS = ["gpu", "cpu", "ram", "storage", "motherboard", "psu", "case", "cooling", "fan", "thermal"];
const PERIPH_CATS = ["monitor", "keyboard", "mouse", "headset", "webcam", "microphone", "speaker", "mousepad", "chair"];

let uidCounter = 0;
function art(category, hue = 30) {
  const uid = "g" + (++uidCounter);
  // Teinte décalée vers la famille indigo → violet du nouveau thème clair.
  const h = hue + 205;
  const grad = `<defs><linearGradient id="${uid}" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="hsl(${h}, 82%, 65%)"/>
    <stop offset="1" stop-color="hsl(${h + 16}, 74%, 52%)"/></linearGradient></defs>`;
  const S = `stroke="url(#${uid})" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"`;
  const F = `fill="url(#${uid})"`;
  const shapes = {
    gpu: `<rect x="8" y="30" width="104" height="50" rx="8" ${S}/>
      <circle cx="40" cy="55" r="15" ${S}/><circle cx="80" cy="55" r="15" ${S}/>
      <path d="M40 44v22M30 55h20M80 44v22M70 55h20" ${S} stroke-width="2"/>
      <path d="M16 80v8h44v-8M14 30v-6h60" ${S} stroke-width="2"/>`,
    cpu: `<rect x="28" y="28" width="64" height="64" rx="9" ${S}/>
      <rect x="44" y="44" width="32" height="32" rx="5" ${S} stroke-width="2.5"/>
      <path d="M40 28V14M60 28V14M80 28V14M40 92v14M60 92v14M80 92v14M28 40H14M28 60H14M28 80H14M92 40h14M92 60h14M92 80h14" ${S} stroke-width="2.5"/>`,
    ram: `<rect x="34" y="12" width="52" height="86" rx="6" ${S}/>
      <rect x="44" y="24" width="32" height="12" rx="2" ${F} opacity="0.85"/>
      <rect x="44" y="44" width="32" height="12" rx="2" ${F} opacity="0.6"/>
      <rect x="44" y="64" width="32" height="12" rx="2" ${F} opacity="0.85"/>
      <path d="M40 98v8M50 98v8M60 98v8M70 98v8M80 98v8" ${S} stroke-width="2.5"/>`,
    storage: `<rect x="14" y="38" width="92" height="44" rx="7" ${S}/>
      <rect x="24" y="50" width="20" height="20" rx="3" ${F} opacity="0.85"/>
      <rect x="52" y="50" width="14" height="20" rx="3" ${F} opacity="0.55"/>
      <rect x="72" y="50" width="14" height="20" rx="3" ${F} opacity="0.55"/>
      <path d="M106 50v20" ${S} stroke-width="5"/>`,
    motherboard: `<rect x="14" y="14" width="92" height="92" rx="8" ${S}/>
      <rect x="28" y="28" width="34" height="34" rx="4" ${S} stroke-width="2.5"/>
      <path d="M72 30v30M80 30v30M88 30v30" ${S} stroke-width="2.5"/>
      <rect x="28" y="74" width="50" height="8" rx="3" ${F} opacity="0.7"/>
      <rect x="28" y="88" width="36" height="8" rx="3" ${F} opacity="0.45"/>
      <circle cx="92" cy="88" r="7" ${S} stroke-width="2.5"/>`,
    psu: `<rect x="12" y="28" width="96" height="64" rx="8" ${S}/>
      <circle cx="48" cy="60" r="20" ${S}/>
      <path d="M48 44v32M34 60h28M38 50l20 20M58 50 38 70" ${S} stroke-width="2"/>
      <rect x="80" y="44" width="18" height="8" rx="2" ${F} opacity="0.7"/>
      <rect x="80" y="58" width="18" height="8" rx="2" ${F} opacity="0.45"/>`,
    case: `<rect x="26" y="10" width="68" height="100" rx="9" ${S}/>
      <path d="M40 10v100" ${S} stroke-width="2" opacity="0.7"/>
      <circle cx="68" cy="38" r="13" ${S} stroke-width="2.5"/>
      <circle cx="68" cy="74" r="13" ${S} stroke-width="2.5"/>
      <path d="M33 24h0.1M33 34h0.1" ${S} stroke-width="3"/>`,
    cooling: `<circle cx="60" cy="60" r="44" ${S}/>
      <circle cx="60" cy="60" r="10" ${F}/>
      <path d="M60 50c-2-14 4-26 14-32M70 60c14-2 26 4 32 14M60 70c2 14-4 26-14 32M50 60c-14 2-26-4-32-14" ${S} stroke-width="2.5"/>`,
    monitor: `<rect x="10" y="18" width="100" height="64" rx="7" ${S}/>
      <path d="M22 70 42 48l14 12 20-24 22 26" ${S} stroke-width="2.5"/>
      <path d="M60 82v14M38 102h44" ${S}/>`,
    keyboard: `<rect x="8" y="36" width="104" height="50" rx="8" ${S}/>
      <rect x="18" y="46" width="10" height="9" rx="2" ${F} opacity="0.75"/><rect x="34" y="46" width="10" height="9" rx="2" ${F} opacity="0.5"/><rect x="50" y="46" width="10" height="9" rx="2" ${F} opacity="0.75"/><rect x="66" y="46" width="10" height="9" rx="2" ${F} opacity="0.5"/><rect x="82" y="46" width="20" height="9" rx="2" ${F} opacity="0.75"/>
      <rect x="18" y="61" width="10" height="9" rx="2" ${F} opacity="0.5"/><rect x="34" y="61" width="52" height="9" rx="2" ${F} opacity="0.65"/><rect x="92" y="61" width="10" height="9" rx="2" ${F} opacity="0.5"/>`,
    mouse: `<rect x="38" y="14" width="44" height="92" rx="22" ${S}/>
      <path d="M60 14v30" ${S} stroke-width="2.5"/>
      <rect x="56" y="28" width="8" height="14" rx="4" ${F}/>`,
    headset: `<path d="M22 66a38 38 0 0 1 76 0" ${S}/>
      <rect x="16" y="62" width="18" height="30" rx="8" ${S}/>
      <rect x="86" y="62" width="18" height="30" rx="8" ${S}/>
      <path d="M95 92v6a14 14 0 0 1-14 14H64" ${S} stroke-width="2.5"/>
      <circle cx="58" cy="112" r="5" ${F}/>`,
    fan: `<rect x="14" y="14" width="92" height="92" rx="14" ${S}/>
      <circle cx="60" cy="60" r="34" ${S}/><circle cx="60" cy="60" r="8" ${F}/>
      <path d="M60 52c-3-12 3-22 12-26M68 60c12-3 22 3 26 12M60 68c3 12-3 22-12 26M52 60c-12 3-22-3-26-12" ${S} stroke-width="2.5"/>
      <path d="M22 22h0.1M98 22h0.1M22 98h0.1M98 98h0.1" ${S} stroke-width="3"/>`,
    thermal: `<rect x="42" y="18" width="22" height="58" rx="6" ${S}/>
      <rect x="47" y="8" width="12" height="12" rx="2" ${F}/>
      <path d="M49 30h8M49 40h8M49 50h8" ${S} stroke-width="2" opacity="0.7"/>
      <path d="M53 76v10" ${S} stroke-width="4"/>
      <path d="M53 92c7 0 12 6 12 12a12 12 0 0 1-24 0c0-6 5-12 12-12Z" ${F}/>`,
    webcam: `<circle cx="60" cy="48" r="32" ${S}/>
      <circle cx="60" cy="48" r="13" ${S} stroke-width="2.5"/><circle cx="60" cy="48" r="4" ${F}/>
      <circle cx="82" cy="34" r="3" ${F}/>
      <path d="M42 78h36l-7 22H49z" ${S}/>`,
    microphone: `<rect x="46" y="12" width="28" height="52" rx="14" ${S}/>
      <path d="M54 24h12M54 34h12M54 44h12" ${S} stroke-width="2" opacity="0.7"/>
      <path d="M34 54a26 26 0 0 0 52 0" ${S}/>
      <path d="M60 80v18M44 102h32" ${S} stroke-width="2.5"/>`,
    speaker: `<rect x="34" y="10" width="52" height="100" rx="8" ${S}/>
      <circle cx="60" cy="38" r="13" ${S} stroke-width="2.5"/><circle cx="60" cy="38" r="4" ${F}/>
      <circle cx="60" cy="80" r="18" ${S} stroke-width="2.5"/><circle cx="60" cy="80" r="6" ${F}/>`,
    mousepad: `<rect x="10" y="32" width="100" height="56" rx="9" ${S}/>
      <rect x="18" y="40" width="84" height="40" rx="5" ${S} stroke-width="1.5" opacity="0.45"/>
      <rect x="70" y="48" width="22" height="30" rx="11" ${F} opacity="0.7"/>
      <path d="M81 48v11" ${S} stroke-width="1.5" opacity="0.5"/>`,
    chair: `<path d="M38 16c0-4 3-6 7-6h30c4 0 7 2 7 6v40H38z" ${S}/>
      <rect x="32" y="54" width="56" height="16" rx="6" ${S}/>
      <path d="M60 70v20M40 100h40" ${S} stroke-width="2.5"/>
      <circle cx="40" cy="106" r="5" ${F}/><circle cx="80" cy="106" r="5" ${F}/><circle cx="60" cy="108" r="5" ${F}/>`,
  };
  return `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${grad}${shapes[category] || shapes.cpu}</svg>`;
}

const hueOf = (p) => 18 + ((p.id * 37) % 24);
const tintOf = (p) => `hsla(${hueOf(p) + 205}, 60%, 60%, 0.12)`;

// Photo du produit : URL personnalisée (image_url) si définie, sinon le fichier
// local images/{id}.jpg. Si rien ne charge, l'img se retire et le visuel SVG
// situé dessous reste affiché.
const imgTag = (p) =>
  `<img class="pimg" src="${esc(p.image_url || `/images/${slugify(p.name)}-1.jpg`)}" alt="${esc(p.name)}" loading="lazy" decoding="async" onerror="this.remove()">`;

// Slug stable du nom (identique à backend/gen_images.py) pour retrouver les
// fichiers galerie /images/<slug>-N.jpg.
function slugify(name) {
  return (name || "")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    .toLowerCase() || "produit";
}

function cleanupProductThumbs() {
  const thumbs = $("#ppThumbs");
  if (!thumbs) return;
  const items = $$(".pp-thumb", thumbs);
  if (items.length <= 1) thumbs.style.display = "none";
}

async function validateProductGallery() {
  const thumbs = $("#ppThumbs");
  const main = $("#ppMain");
  if (!thumbs) return;
  const seen = new Set();
  const buttons = $$(".pp-thumb", thumbs);
  const checks = await Promise.all(buttons.map(async (btn) => {
    const img = $("img", btn);
    if (!img) return { btn, ok: false };
    if (!img.complete) {
      await new Promise((resolve) => {
        const done = () => resolve();
        img.addEventListener("load", done, { once: true });
        img.addEventListener("error", done, { once: true });
      });
    }
    const src = img.currentSrc || img.src || btn.dataset.src;
    const ok = !!(img.naturalWidth && img.naturalHeight);
    return { btn, ok, src };
  }));
  for (const { btn, ok, src } of checks) {
    if (!ok || !src || seen.has(src)) {
      btn.remove();
      continue;
    }
    seen.add(src);
  }

  const first = $("#ppThumbs .pp-thumb");
  if (!first) {
    if (main) main.remove();
  } else if (main && !first.classList.contains("active")) {
    main.src = first.dataset.src;
    $$("#ppThumbs .pp-thumb").forEach((b) => b.classList.toggle("active", b === first));
  }
  cleanupProductThumbs();
}

function stars(rating) {
  const full = Math.round(rating);
  return `<span class="stars">${"★".repeat(full)}${"☆".repeat(5 - full)}</span>`;
}

function badgeHtml(badge) {
  if (!badge) return "";
  const cls = { "Promo": "promo", "Top vente": "top", "Flagship": "flagship", "Nouveau": "new" }[badge] || "";
  return `<span class="badge ${cls}">${esc(badge)}</span>`;
}

function usefulBadge(p) {
  if (p.stock > 0 && p.stock <= 5) return "Stock faible";
  const text = `${p.name} ${p.brand} ${JSON.stringify(p.specs || {})}`.toLowerCase();
  if (p.category === "gpu" && /(rtx 4070|rtx 5070|rx 7800|rx 8800|rx 9070)/.test(text)) return "Idéal gaming 1440p";
  if (p.category === "cpu" && /(x3d|ryzen 7|core ultra 7|i7)/.test(text)) return "Très bon en jeu";
  if (p.category === "ram" && /ddr5/.test(text)) return "Compatible DDR5";
  if (p.category === "motherboard" && /am5/.test(text)) return "Compatible AM5";
  if (p.category === "case" && /(silent|silence|quiet|define)/.test(text)) return "Silencieux";
  if (p.price < 120 && ["ram", "storage", "psu", "cooling"].includes(p.category)) return "Bon rapport perf/prix";
  return "";
}

function stockHtml(stock) {
  if (stock <= 0) return `<span class="stock-dot out">Rupture</span>`;
  if (stock <= 10) return `<span class="stock-dot low">Plus que ${stock}</span>`;
  return `<span class="stock-dot">En stock</span>`;
}

/* ─── Specs : lecture machine + scoring perf / usage ─────────────────
   Sert au comparateur (« performance estimée », surbrillance), aux filtres
   par specs et au configurateur (score d'usage, détection de déséquilibre). */

// Premier nombre d'une spec texte : "12 Go GDDR6" → 12 ; "2560 × 1440" → 2560.
function specNum(v) {
  const m = String(v ?? "").replace(",", ".").match(/\d[\d\s.]*/);
  return m ? parseFloat(m[0].replace(/\s/g, "").replace(/\.$/, "")) : 0;
}

// Niveau de performance d'un GPU (0–100), par modèle puis repli sur le prix.
const GPU_TIERS = [
  [/rtx\s*5090/, 100], [/rtx\s*5080/, 92], [/rtx\s*5070\s*ti/, 86], [/rtx\s*5070/, 80],
  [/rtx\s*5060\s*ti/, 66], [/rtx\s*5060/, 58],
  [/rtx\s*4090/, 96], [/rtx\s*4080/, 88], [/rtx\s*4070\s*ti/, 82], [/rtx\s*4070/, 76],
  [/rtx\s*4060\s*ti/, 64], [/rtx\s*4060/, 56],
  [/rtx\s*3090/, 78], [/rtx\s*3080/, 72], [/rtx\s*3070/, 62], [/rtx\s*3060\s*ti/, 56], [/rtx\s*3060/, 48],
  [/rx\s*9070\s*xt/, 88], [/rx\s*9070/, 80], [/rx\s*8800/, 74],
  [/rx\s*7900/, 84], [/rx\s*7800\s*xt/, 74], [/rx\s*7700/, 64], [/rx\s*7600/, 50],
  [/arc\s*b5/, 54], [/arc\s*a7/, 46],
];
function gpuTier(p) {
  const t = `${p.name} ${p.brand}`.toLowerCase();
  for (const [re, v] of GPU_TIERS) if (re.test(t)) return v;
  return Math.max(20, Math.min(95, 25 + (p.price || 0) / 28));
}
// Niveau d'un CPU (0–100) : threads + boost + bonus jeu (X3D).
function cpuTier(p) {
  const s = p.specs || {};
  const threads = specNum(String(s["Cœurs"] || "").split("/").pop());
  const boost = specNum(s["Boost"]);
  const x3d = /x3d/i.test(p.name) ? 12 : 0;
  return Math.max(15, Math.min(100, threads * 2.3 + boost * 5 + x3d));
}
function cpuGameTier(p) { return Math.min(100, cpuTier(p) + (/x3d/i.test(p.name) ? 18 : 0)); }

// Score de performance générique (pour le comparateur, toutes catégories).
function perfScore(p) {
  const s = p.specs || {}, c = p.category;
  if (c === "gpu") return Math.round(gpuTier(p));
  if (c === "cpu") return Math.round(cpuTier(p));
  if (c === "ram") return Math.round(specNum(s["Capacité"]) * 0.8 + specNum(s["Fréquence"]) / 120);
  if (c === "storage") {
    const gen = /5\.0/.test(s["Interface"]) ? 50 : /4\.0/.test(s["Interface"]) ? 35 : 20;
    return Math.round(gen + specNum(s["Lecture"]) / 300);
  }
  if (c === "psu") return Math.round(specNum(s["Puissance"]) / 12);
  if (c === "monitor") {
    const hz = specNum(s["Fréquence"]);
    const oled = /oled/i.test(s["Dalle"]) ? 25 : 0;
    return Math.round(hz / 6 + oled);
  }
  if (c === "cooling") return Math.round(specNum(s["TDP supporté"]) / 6);
  return Math.round((p.price || 0) / 25); // boîtier, périphériques : prix = proxy
}

function ratingWord(score) {
  if (score >= 85) return { word: "Excellent", cls: "exc" };
  if (score >= 70) return { word: "Très bon", cls: "good" };
  if (score >= 50) return { word: "Bon", cls: "ok" };
  if (score >= 30) return { word: "Moyen", cls: "mid" };
  return { word: "Limité", cls: "low" };
}

// Scores d'usage d'une configuration (configurateur). Renvoie [] si pas de pièce maîtresse.
function usageScores(b) {
  const gpu = b.gpu ? gpuTier(b.gpu) : 0;
  const cpu = b.cpu ? cpuTier(b.cpu) : 0;
  const cpuGame = b.cpu ? cpuGameTier(b.cpu) : 0;
  const ramCap = b.ram ? specNum(b.ram.specs["Capacité"]) : 0;
  const threads = b.cpu ? specNum(String(b.cpu.specs["Cœurs"] || "").split("/").pop()) : 0;
  if (!gpu && !cpu) return [];

  // Goulot CPU en jeu : un GPU bien au-dessus du CPU plafonne les FPS.
  const gameLimit = (g) => (cpuGame && g - cpuGame > 22) ? cpuGame + 22 : g;
  const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));

  return [
    { label: "Gaming 1080p", score: clamp(gameLimit(gpu) * 1.35) },
    { label: "Gaming 1440p", score: clamp(gameLimit(gpu) * 1.05) },
    { label: "Gaming 4K", score: clamp(gameLimit(gpu) * 0.82) },
    { label: "Création vidéo", score: clamp(threads * 2.2 + ramCap * 0.5 + gpu * 0.25) },
    { label: "Évolutivité", score: clamp(
        (b.psu ? Math.min(30, (specNum(b.psu.specs["Puissance"]) - estimateWatts()) / 12) : 6) +
        (ramCap >= 32 ? 28 : ramCap >= 16 ? 18 : 8) +
        (b.motherboard ? 24 : 8) +
        (b.case ? 16 : 6)) },
  ];
}

// Déséquilibres notables (avertissements « intelligents » du configurateur).
function buildImbalances(b) {
  const out = [];
  if (b.gpu && b.cpu) {
    const g = gpuTier(b.gpu), c = cpuGameTier(b.cpu);
    if (g - c > 22) out.push(`GPU très puissant mais CPU un peu juste — léger goulot d'étranglement possible en jeu (1080p surtout).`);
    else if (c - g > 28) out.push(`CPU costaud pour un GPU plus modeste — marge pour une carte graphique plus performante.`);
  }
  if (b.psu) {
    const cap = specNum(b.psu.specs["Puissance"]), need = estimateWatts();
    if (cap > need * 1.8 && cap - need > 350) out.push(`Alimentation surdimensionnée (${cap} W pour ≈ ${need} W) — vous payez de la marge inutile.`);
  }
  if (b.gpu && b.case) {
    const len = specNum(b.gpu.specs["Longueur"]) || b.gpu.specs.length_mm || 0;
    const max = b.case.specs.max_gpu_mm || specNum(b.case.specs["GPU max"]) || 999;
    if (len && max && len <= max && max - len < 20) out.push(`Boîtier compact : le GPU (${len} mm) passe de justesse (max ${max} mm) — attention au montage.`);
  }
  return out;
}

/* ─── Carte produit ─── */
function productCard(p) {
  const discount = p.old_price ? Math.round((1 - p.price / p.old_price) * 100) : 0;
  return `
  <article class="product-card" data-goto="/produit/${p.id}">
    <div class="product-visual" style="--tint:${tintOf(p)}">
      ${art(p.category, hueOf(p))}
      ${imgTag(p)}
      ${badgeHtml(usefulBadge(p) || p.badge)}
      <div class="card-actions">
        ${heartBtn(p)}
        <button class="cmp-btn ${inCompare(p.id) ? "on" : ""}" data-cmp="${p.id}" title="Comparer" aria-label="Comparer">⇄</button>
      </div>
    </div>
    <div class="product-info">
      <span class="product-brand">${esc(p.brand)}</span>
      <h3 class="product-name">${esc(p.name)}</h3>
      <div class="product-rating">${stars(p.rating)} <span>${p.rating.toFixed(1)}${p.rating_count ? ` (${p.rating_count})` : ""}</span></div>
      ${stockHtml(p.stock)}
      <div class="product-bottom">
        <div class="price">
          ${p.old_price ? `<span class="price-old">${fmt(p.old_price)}</span>` : ""}
          ${fmt(p.price)}${discount ? ` <small style="color:var(--red);font-size:.75rem">-${discount}%</small>` : ""}
        </div>
        <button class="add-btn" data-add="${p.id}" title="Ajouter au panier" ${p.stock <= 0 ? "disabled" : ""}>
          <svg viewBox="0 0 24 24" width="19" height="19"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>
        </button>
      </div>
    </div>
  </article>`;
}

/* ─── Panier ─── */
function updateCartCount() {
  const n = state.cart.reduce((s, i) => s + i.qty, 0);
  const el = $("#cartCount");
  el.textContent = n;
  el.hidden = n === 0;
}

function fireVoltBurst(originEl = document.activeElement) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const cart = $("#cartBtn");
  if (cart) {
    cart.classList.remove("cart-surge");
    void cart.offsetWidth;
    cart.classList.add("cart-surge");
    setTimeout(() => cart.classList.remove("cart-surge"), 760);
  }

  const rect = originEl?.getBoundingClientRect?.() || cart?.getBoundingClientRect?.();
  if (!rect) return;
  const burst = document.createElement("div");
  burst.className = "volt-burst";
  burst.style.left = `${rect.left + rect.width / 2}px`;
  burst.style.top = `${rect.top + rect.height / 2}px`;

  for (let i = 0; i < 18; i++) {
    const spark = document.createElement("i");
    const angle = (i / 18) * Math.PI * 2 + Math.random() * 0.28;
    const distance = 38 + Math.random() * 64;
    spark.style.setProperty("--x", `${Math.cos(angle) * distance}px`);
    spark.style.setProperty("--y", `${Math.sin(angle) * distance}px`);
    spark.style.setProperty("--d", `${Math.random() * 0.16}s`);
    spark.style.setProperty("--s", `${0.72 + Math.random() * 0.65}`);
    spark.style.setProperty("--r", `${angle}rad`);
    burst.appendChild(spark);
  }

  document.body.appendChild(burst);
  setTimeout(() => burst.remove(), 900);
}

function addToCart(p, qty = 1, quiet = false) {
  if (!state.user) {
    requireAuth(() => addToCart(p, qty, quiet));
    toast("Connectez-vous pour enregistrer votre panier sur votre compte", "info");
    return;
  }
  const line = state.cart.find((i) => i.id === p.id);
  if (line) {
    if (line.qty + qty > p.stock) { if (!quiet) toast("Stock maximum atteint pour ce produit", "error"); return; }
    line.qty += qty;
  } else {
    state.cart.push({ id: p.id, name: p.name, brand: p.brand, category: p.category, price: p.price, stock: p.stock, qty });
  }
  saveCart();
  refreshCartDrawer();
  if (!quiet) fireVoltBurst();
  if (!quiet) { toast(`${p.name} ajouté au panier`); openCart(); }
}

function cartTotals() {
  const subtotal = state.cart.reduce((s, i) => s + i.price * i.qty, 0);
  const discount = state.promo ? subtotal * state.promo.percent / 100 : 0;
  const shipping = state.cart.length === 0 || subtotal - discount >= 50 ? 0 : 5.99;
  return { subtotal, discount, shipping, total: subtotal - discount + shipping };
}

function renderCartDrawer() {
  cartDrawerDirty = false;
  const body = $("#cartBody");
  const foot = $("#cartFoot");
  if (!state.user) {
    body.innerHTML = `<div class="empty-state"><p>Connectez-vous pour retrouver votre panier lié à votre compte.</p><br>
      <button class="btn btn-primary btn-sm" id="cartLoginBtn">Se connecter</button></div>`;
    foot.innerHTML = "";
    const btn = $("#cartLoginBtn");
    if (btn) btn.onclick = () => { closeCart(); openAuth(); };
    return;
  }
  if (state.cart.length === 0) {
    body.innerHTML = `<div class="empty-state"><p>Votre panier est vide.</p><br>
      <a class="btn btn-primary btn-sm" href="/catalogue" onclick="closeCart()">Voir le catalogue</a></div>`;
    foot.innerHTML = "";
    return;
  }
  body.innerHTML = state.cart.map((i) => `
    <div class="cart-item">
      <div class="cart-item-visual">${art(i.category, 18 + ((i.id * 37) % 24))}${imgTag(i)}</div>
      <div class="cart-item-info">
        <h4>${esc(i.name)}</h4>
        <span class="price">${fmt(i.price)}</span>
        <div class="cart-item-qty">
          <button data-qty="${i.id}|-1">−</button><span>${i.qty}</span><button data-qty="${i.id}|1">+</button>
        </div>
        <button class="cart-item-remove" data-remove="${i.id}">Retirer</button>
      </div>
    </div>`).join("");

  const t = cartTotals();
  foot.innerHTML = `
    <div class="promo-row">
      <input id="promoInput" placeholder="Code promo" value="${state.promo ? esc(state.promo.code) : ""}">
      <button class="btn btn-ghost btn-sm" id="promoApply">${state.promo ? "Retirer" : "Appliquer"}</button>
    </div>
    <div class="cart-totals">
      <div class="row"><span>Sous-total</span><span>${fmt(t.subtotal)}</span></div>
      ${t.discount ? `<div class="row"><span>Code ${esc(state.promo.code)} (-${state.promo.percent}%)</span><span class="green">−${fmt(t.discount)}</span></div>` : ""}
      <div class="row"><span>Livraison</span><span>${t.shipping ? fmt(t.shipping) : '<span class="green">Offerte</span>'}</span></div>
      <div class="row total"><span>Total</span><span>${fmt(t.total)}</span></div>
    </div>
    <div class="cart-trust">
      <span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 5 6v5c0 4.4 2.9 7.6 7 9 4.1-1.4 7-4.6 7-9V6l-7-3z"/><path d="m9 12 2 2 4-4"/></svg>Paiement sécurisé Stripe</span>
      <span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h11v8H3z"/><path d="M14 10h4l3 3v2h-7z"/><circle cx="7.5" cy="17.5" r="1.5"/><circle cx="17.5" cy="17.5" r="1.5"/></svg>Livraison suivie</span>
      <span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h10v10H7z"/><path d="M9 3h6M9 21h6M3 9v6M21 9v6"/></svg>Espace client</span>
      <span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h8l4 4v14H7z"/><path d="M15 3v5h5"/><path d="M10 13h7M10 17h5"/></svg>Facture PDF</span>
    </div>
    ${t.shipping ? `<div class="shipping-meter"><span>${fmt(Math.max(0, 50 - (t.subtotal - t.discount)))} avant livraison offerte</span><b style="width:${Math.min(100, ((t.subtotal - t.discount) / 50) * 100)}%"></b></div>` : ""}
    <a class="btn btn-ghost btn-block" href="/catalogue" onclick="closeCart()">Continuer mes achats</a>
    <button class="btn btn-primary btn-block" id="checkoutBtn">Passer commande →</button>`;

  $("#promoApply").onclick = applyPromo;
  $("#promoInput").onkeydown = (e) => { if (e.key === "Enter") applyPromo(); };
  $("#checkoutBtn").onclick = () => { closeCart(); requireAuth(() => { go("/commande"); }); };
}

async function applyPromo() {
  if (state.promo) { state.promo = null; savePromo(); renderCartDrawer(); return; }
  const code = $("#promoInput").value.trim();
  if (!code) return;
  try {
    state.promo = await api("/promo/validate", { method: "POST", body: JSON.stringify({ code }) });
    savePromo();
    toast(`Code ${state.promo.code} appliqué : ${state.promo.label}`);
  } catch (e) {
    toast(e.message, "error");
  }
  refreshCartDrawer();
}

function refreshCartDrawer() {
  const drawer = $("#cartDrawer");
  if (drawer?.classList.contains("open")) renderCartDrawer();
  else cartDrawerDirty = true;
}

function openCart() {
  if (cartDrawerDirty) renderCartDrawer();
  $("#cartDrawer").classList.add("open");
  $("#drawerOverlay").hidden = false;
}
function closeCart() { $("#cartDrawer").classList.remove("open"); $("#drawerOverlay").hidden = true; }
window.closeCart = closeCart;

/* ─── Authentification ─── */
function openAuth() { $("#authModal").hidden = false; }
function closeAuth() { $("#authModal").hidden = true; }

function requireAuth(action) {
  if (state.user) { action(); return; }
  state.afterLogin = action;
  openAuth();
}

// Revient à l'écran de connexion par défaut (cache l'étape de vérification).
function resetAuthView() {
  $(".auth-tabs").hidden = false;
  $$(".auth-tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === "login"));
  $("#loginForm").hidden = false;
  $("#registerForm").hidden = true;
  $("#verifyForm").hidden = true;
  $("#forgotForm").hidden = true;
  $("#resetForm").hidden = true;
}

// Affiche une étape unique de la modale d'auth (masque les autres formulaires).
function showAuthStep(formId, withTabs = false) {
  $(".auth-tabs").hidden = !withTabs;
  ["#loginForm", "#registerForm", "#verifyForm", "#forgotForm", "#resetForm"]
    .forEach((id) => { $(id).hidden = id !== formId; });
}

// Repli développement : si le serveur renvoie un `dev_code` (SMTP non configuré),
// on pré-remplit le champ et on affiche le code pour permettre les tests locaux.
function showDevCode(code, inputName) {
  if (!code) return;
  const input = document.querySelector(`input[name="${inputName}"]:not([hidden])`)
    || [...document.querySelectorAll(`input[name="${inputName}"]`)].find((i) => i.offsetParent !== null);
  if (input) input.value = code;
  toast(`Mode test — votre code : ${code}`, "info");
}

// Affiche l'étape « saisie du code » pour l'email donné.
function showVerifyStep(email) {
  state.pendingEmail = email;
  $(".auth-tabs").hidden = true;
  $("#loginForm").hidden = true;
  $("#registerForm").hidden = true;
  $("#verifyForm").hidden = false;
  $("#verifyEmailLabel").textContent = email;
  $("#verifyForm").reset();
}

// Connexion réussie : enregistre la session et ferme la modale.
async function finishLogin(data) {
  // Le backend a posé le cookie de session ; on ne conserve que le drapeau d'état.
  state.token = true;
  state.user = data.user;
  saveAuth();
  resetAuthView();
  closeAuth();
  toast(`Bienvenue, ${state.user.name}`);
  await loadFavorites();
  await syncCartOnLogin();   // charge le panier lié au compte
  if (state.afterLogin) { const fn = state.afterLogin; state.afterLogin = null; fn(); }
  else render();
}

function setupAuth() {
  $("#authClose").onclick = () => { resetAuthView(); closeAuth(); };
  // Fermeture sur clic en dehors — mais SEULEMENT si le clic a aussi COMMENCÉ
  // sur le fond. Évite la fermeture quand on sélectionne du texte dans un champ
  // et qu'on relâche la souris en dehors de la fenêtre.
  let authDownOnOverlay = false;
  $("#authModal").addEventListener("mousedown", (e) => {
    authDownOnOverlay = e.target === $("#authModal");
  });
  $("#authModal").addEventListener("click", (e) => {
    if (e.target === $("#authModal") && authDownOnOverlay) { resetAuthView(); closeAuth(); }
  });
  $$(".auth-tab").forEach((tab) => {
    tab.onclick = () => {
      $$(".auth-tab").forEach((t) => t.classList.toggle("active", t === tab));
      $("#loginForm").hidden = tab.dataset.tab !== "login";
      $("#registerForm").hidden = tab.dataset.tab !== "register";
      $("#verifyForm").hidden = true;
    };
  });

  const handle = (endpoint) => async (e) => {
    e.preventDefault();
    const form = e.target;
    const body = Object.fromEntries(new FormData(form));
    const btn = $("button[type=submit]", form);
    btn.disabled = true;
    try {
      const data = await api(endpoint, { method: "POST", body: JSON.stringify(body) });
      form.reset();
      // Compte non vérifié → on bascule sur l'étape de saisie du code.
      if (data.verification_required) {
        showVerifyStep(data.email);
        if (data.dev_code) showDevCode(data.dev_code, "code");
        else toast("Un code de vérification vous a été envoyé par email️");
        return;
      }
      finishLogin(data);
    } catch (err) {
      toast(err.message, "error");
    } finally {
      btn.disabled = false;
    }
  };
  $("#loginForm").onsubmit = handle("/auth/login");
  $("#registerForm").onsubmit = handle("/auth/register");

  // Étape de vérification : saisie du code reçu par email.
  $("#verifyForm").onsubmit = async (e) => {
    e.preventDefault();
    const code = new FormData(e.target).get("code").trim();
    const btn = $("button[type=submit]", e.target);
    btn.disabled = true;
    try {
      const data = await api("/auth/verify", {
        method: "POST",
        body: JSON.stringify({ email: state.pendingEmail, code }),
      });
      finishLogin(data);
    } catch (err) {
      toast(err.message, "error");
    } finally {
      btn.disabled = false;
    }
  };

  $("#resendCode").onclick = async (e) => {
    e.preventDefault();
    try {
      const data = await api("/auth/resend-code", {
        method: "POST",
        body: JSON.stringify({ email: state.pendingEmail }),
      });
      if (data.dev_code) showDevCode(data.dev_code, "code");
      else toast("Nouveau code envoyé️");
    } catch (err) {
      toast(err.message, "error");
    }
  };

  $("#backToLogin").onclick = (e) => { e.preventDefault(); resetAuthView(); };

  // ── Mot de passe oublié ──
  $("#forgotLink").onclick = (e) => { e.preventDefault(); showAuthStep("#forgotForm"); };
  $("#forgotBack").onclick = (e) => { e.preventDefault(); resetAuthView(); };
  $("#resetBack").onclick = (e) => { e.preventDefault(); resetAuthView(); };

  $("#forgotForm").onsubmit = async (e) => {
    e.preventDefault();
    const email = new FormData(e.target).get("email").trim().toLowerCase();
    const btn = $("button[type=submit]", e.target);
    btn.disabled = true;
    try {
      const data = await api("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) });
      state.resetEmail = email;
      $("#resetEmailLabel").textContent = email;
      $("#resetForm").reset();
      showAuthStep("#resetForm");
      if (data.dev_code) showDevCode(data.dev_code, "code");
      else toast("Si ce compte existe, un code vient d'être envoyé️", "info");
    } catch (err) { toast(err.message, "error"); }
    finally { btn.disabled = false; }
  };

  $("#resetResend").onclick = async (e) => {
    e.preventDefault();
    try {
      const data = await api("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email: state.resetEmail }) });
      if (data.dev_code) showDevCode(data.dev_code, "code");
      else toast("Nouveau code envoyé️");
    } catch (err) { toast(err.message, "error"); }
  };

  $("#resetForm").onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const btn = $("button[type=submit]", e.target);
    btn.disabled = true;
    try {
      const data = await api("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ email: state.resetEmail, code: f.get("code").trim(), password: f.get("password") }),
      });
      toast("Mot de passe réinitialisé ✔");
      finishLogin(data);
    } catch (err) { toast(err.message, "error"); }
    finally { btn.disabled = false; }
  };
}

function logout() {
  // Demande au backend d'effacer le cookie de session HttpOnly (le JS ne peut
  // pas le supprimer lui-même). Non bloquant : on nettoie l'UI quoi qu'il arrive.
  api("/auth/logout", { method: "POST" }).catch(() => {});
  state.token = null;
  state.user = null;
  state.favorites = new Set();
  // Le panier appartient au compte : on le vide à la déconnexion pour qu'il ne
  // « fuie » pas vers l'utilisateur suivant sur le même navigateur.
  state.cart = [];
  state.promo = null;
  savePromo();
  saveAuth();
  updateCartCount();
  refreshCartDrawer();
  toast("Vous êtes déconnecté");
  go("/");
}

/* ─── Routeur (URLs réelles via History API) ─── */
function parsePath() {
  // Retour Stripe : l'URL revient sous la forme "/#/commande/succes?session_id=…".
  // On lit alors la route ET la query depuis le hash ; sinon depuis le chemin.
  const hash = location.hash;
  if (hash.startsWith("#/")) {
    const [rawPath, query] = hash.slice(2).split("?");
    const path = rawPath.replace(/^\/+/, "").replace(/\/+$/, "");
    return { path, params: new URLSearchParams(query || "") };
  }
  // "/produit/5" → path "produit/5" ; query depuis location.search
  const path = location.pathname.replace(/^\/+/, "").replace(/\/+$/, "");
  return { path, params: new URLSearchParams(location.search) };
}

// Navigation interne sans rechargement. Tolère un ancien lien "#/x".
function go(to, options = {}) {
  if (to.startsWith("#/")) to = to.slice(1);
  if (to === location.pathname + location.search) {
    if (options.force) render();
    else window.scrollTo({ top: 0 });
    return;
  }
  history.pushState(null, "", to);
  render();
  const hash = to.includes("#") ? to.split("#")[1] : "";
  if (hash) setTimeout(() => document.getElementById(hash)?.scrollIntoView({ block: "start" }), 0);
}

const skeletons = (n) => `<div class="product-grid">${"<div class='skeleton'></div>".repeat(n)}</div>`;
let currentRenderToken = 0;

function isStaleRender(token, app) {
  return token !== currentRenderToken || !app?.isConnected || app !== $("#app");
}

// Construit la barre de pagination (rendue sous la grille du catalogue).
function pagerHtml(page, pageCount) {
  if (pageCount <= 1) return "";
  const btn = (label, target, opts = {}) =>
    `<button class="pager-btn ${opts.active ? "active" : ""}" data-page="${target}" ${opts.disabled ? "disabled" : ""}>${label}</button>`;
  // Fenêtre de pages autour de la page courante.
  const nums = [];
  const from = Math.max(1, page - 2), to = Math.min(pageCount, page + 2);
  if (from > 1) nums.push(1, from > 2 ? "…" : null);
  for (let i = from; i <= to; i++) nums.push(i);
  if (to < pageCount) nums.push(to < pageCount - 1 ? "…" : null, pageCount);
  const cells = nums.filter((n) => n !== null).map((n) =>
    n === "…" ? `<span class="pager-gap">…</span>` : btn(n, n, { active: n === page })).join("");
  return `<div class="pager">
    ${btn("← Précédent", page - 1, { disabled: page <= 1 })}
    ${cells}
    ${btn("Suivant →", page + 1, { disabled: page >= pageCount })}
  </div>`;
}

async function render() {
  const { path, params } = parsePath();
  const app = $("#app");
  const renderToken = ++currentRenderToken;
  const isHome = path === "";
  $$(".nav a").forEach((a) => a.classList.toggle("active", a.dataset.nav === path.split("/")[0]));
  document.body.classList.toggle("void-home-active", isHome);
  if (!isHome) cleanupHome3D();
  window.scrollTo({ top: 0 });

  try {
    if (isHome) await viewHome(app);
    else if (path === "catalogue") await viewCatalog(app, params);
    else if (path.startsWith("produit/")) await viewProduct(app, Number(path.split("/")[1]));
    else if (path.startsWith("prebuilt/")) await viewPrebuilt(app, path.split("/")[1]);
    else if (path === "configurateur") await viewBuilder(app);
    else if (path === "comparer") await viewCompare(app);
    else if (path === "qui-sommes-nous") viewAbout(app);
    else if (path === "mentions-legales") viewLegal(app, "mentions");
    else if (path === "cgv") viewLegal(app, "cgv");
    else if (path === "confidentialite") viewLegal(app, "privacy");
    else if (path === "retours-remboursements") viewLegal(app, "returns");
    else if (path === "commande/succes") await viewPaymentSuccess(app, params);
    else if (path === "commande/annulee") viewPaymentCancelled(app);
    else if (path === "commande") await viewCheckout(app);
    else if (path === "compte") await viewAccount(app, params);
    else if (path === "admin/produits") await viewAdminProducts(app, renderToken);
    else if (path === "admin/stats") await viewAdminStats(app, renderToken);
    else if (path === "admin") await viewAdmin(app, params, renderToken);
    else app.innerHTML = `<div class="empty-state"><h2>Page introuvable</h2><br><a class="btn btn-primary" href="/">Retour à l'accueil</a></div>`;
  } catch (e) {
    if (isStaleRender(renderToken, app)) return;
    app.innerHTML = `<div class="empty-state"><h2>Oups, une erreur</h2><p>${esc(e.message)}</p><br>
      <p style="color:var(--text-faint);font-size:.85rem">Le serveur est-il lancé ? <code>uvicorn main:app</code> dans voltpc/backend</p></div>`;
  }
}

/* ─── Vue : accueil ─── */
async function viewHome(app) {
  app.innerHTML = `
  <div class="void-home">
    <section class="void-hero">
      <canvas class="void-field" id="voidField" aria-hidden="true"></canvas>
      <div class="void-depth" aria-hidden="true">
        <span></span><span></span><span></span><span></span>
      </div>

      <div class="void-copy">
        <span class="void-eyebrow">VoltCore / void build</span>
        <h1>Construis dans le noir.</h1>
        <p>Un espace calme pour choisir ton PC. Peu de bruit, des composants lisibles, une machine qui sort lentement du vide.</p>
        <div class="void-actions">
          <a class="btn void-btn void-btn-primary" href="#prebuilts"><span>Voir les machines</span><b aria-hidden="true">&rarr;</b></a>
          <a class="btn void-btn void-btn-ghost" href="/configurateur"><span>Configurer</span><b aria-hidden="true">+</b></a>
        </div>
        <div class="void-readout">
          <div><strong id="statCount">280+</strong><span>pieces en stock</span></div>
          <div><strong>3</strong><span>machines pretes</span></div>
          <div><strong>0</strong><span>distraction</span></div>
        </div>
      </div>

      <div class="void-stage" id="voidStage" aria-label="Scene 3D VoltCore en mouvement">
        <canvas class="void-model" id="voidModel" aria-hidden="true"></canvas>
      </div>

      <div class="void-scroll" aria-hidden="true"><span></span></div>
    </section>

    <section class="void-orbit-strip" data-void-sep>
      <article><span>Catalogue</span><strong>Des composants visibles, sans lumi&egrave;re inutile.</strong></article>
      <article><span>Config</span><strong>Une s&eacute;lection lente, claire, sans tunnel confus.</strong></article>
      <article><span>Commande</span><strong>Panier, paiement et suivi restent sobres.</strong></article>
    </section>

    <section class="section void-section prebuilts" id="prebuilts">
      <div class="section-head"><h2>Machines pr&ecirc;tes</h2><a href="/configurateur">Composer le mien &rarr;</a></div>
      <p class="pb-sub">Trois bases noires, lisibles, calibr&eacute;es pour comparer vite sans effet inutile.</p>
      <div class="pb-grid" id="prebuiltGrid">${"<div class='skeleton void-skeleton' style='min-height:420px'></div>".repeat(3)}</div>
    </section>

    <section class="void-console" data-void-sep>
      <div>
        <span>Control room</span>
        <h2>Le vide autour. Les choix devant.</h2>
      </div>
      <div class="void-console-lines" aria-hidden="true">
        <i></i><i></i><i></i><i></i><i></i>
      </div>
    </section>

    <section class="section void-section">
      <div class="section-head"><h2>Entr&eacute;es du catalogue</h2><a href="/catalogue">Tout voir &rarr;</a></div>
      <div class="cat-grid" id="catGrid">${"<div class='skeleton void-skeleton' style='min-height:130px'></div>".repeat(12)}</div>
    </section>

    <section class="section void-section">
      <div class="section-head"><h2>S&eacute;lection VoltCore</h2><a href="/catalogue">Tout le catalogue &rarr;</a></div>
      <div id="featuredGrid">${skeletons(4)}</div>
    </section>

    <section class="section void-section">
      <div class="promo-banner void-promo">
        <div>
          <h3>SUMMER20 : -20 % sur le site</h3>
          <p>Un code simple, une interface plus tranchante, et le catalogue complet en quelques secondes.</p>
        </div>
        <a class="btn void-btn void-btn-primary" href="/catalogue"><span>Voir le catalogue</span><b aria-hidden="true">&rarr;</b></a>
      </div>
    </section>

    <section class="section void-section">
      <div class="perks">
        <div class="perk"><div class="perk-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7h11v8H3z"/><path d="M14 10h4l3 3v2h-7z"/><circle cx="7.5" cy="17.5" r="1.7"/><circle cx="17.5" cy="17.5" r="1.7"/></svg></div><div><h4>Livraison</h4><p>Les frais et options disponibles sont calculés au panier.</p></div></div>
        <div class="perk"><div class="perk-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 5 6v5c0 4.5 3 7.6 7 9 4-1.4 7-4.5 7-9V6z"/><path d="m9 12 2 2 4-4"/></svg></div><div><h4>Garanties</h4><p>Rétractation légale 14 jours et garantie légale de conformité.</p></div></div>
        <div class="perk"><div class="perk-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/></svg></div><div><h4>Compatibilité</h4><p>Le configurateur vérifie les choix au fil de la sélection.</p></div></div>
        <div class="perk"><div class="perk-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg></div><div><h4>Paiement</h4><p>Transactions chiffrées et données protégées.</p></div></div>
      </div>
    </section>
  </div>`;

  const [cats, featured] = await Promise.all([
    api("/categories"),
    api("/products?sort=featured&compact=1&limit=8"),
  ]);
  const catCount = Object.fromEntries(cats.map((c) => [c.category, c]));
  const total = cats.reduce((s, c) => s + c.count, 0);
  const statEl = $("#statCount");
  if (statEl && total) statEl.textContent = `${Math.floor(total / 10) * 10}+`;
  $("#catGrid").innerHTML = Object.entries(CATS).map(([key, c]) => `
    <a class="cat-card" href="/catalogue?cat=${key}">
      <div class="cat-icon" style="width:54px;height:54px">${art(key, 30)}</div>
      <h3>${c.label}</h3>
      <span>${catCount[key]?.count ?? 0} produits · dès ${fmt(catCount[key]?.min_price ?? 0)}</span>
    </a>`).join("");
  $("#featuredGrid").innerHTML = `<div class="product-grid">${featured.filter((p) => p.featured).slice(0, 8).map(productCard).join("")}</div>`;
  bindProductCards(app, featured);

  renderPrebuilts();
  initHome3D();
}

/* ─── PC prémontés (configs curées, compatibilité vérifiée) ─── */
const PREBUILTS = [
  { key: "spark", tier: "Entrée gaming", name: "VoltCore Spark", tag: "Gaming 1080p haute fréquence", featured: false,
    ids: { "Processeur": 141, "Carte graphique": 166, "Mémoire": 80, "Carte mère": 75, "Stockage": 89, "Refroidissement": 102, "Alimentation": 93, "Boîtier": 230 } },
  { key: "surge", tier: "Performance", name: "VoltCore Surge", tag: "1440p haut niveau & création", featured: true,
    ids: { "Processeur": 138, "Carte graphique": 169, "Mémoire": 81, "Carte mère": 214, "Stockage": 64, "Refroidissement": 105, "Alimentation": 223, "Boîtier": 100 } },
  { key: "apex", tier: "Ultra haut de gamme", name: "VoltCore Apex", tag: "4K ultra & IA", featured: false,
    ids: { "Processeur": 136, "Carte graphique": 17, "Mémoire": 20, "Carte mère": 28, "Stockage": 204, "Refroidissement": 243, "Alimentation": 225, "Boîtier": 38 } },
];

const PREBUILT_ROLES = ["Processeur", "Carte graphique", "Mémoire", "Carte mère", "Stockage", "Refroidissement", "Alimentation", "Boîtier"];
const prebuiltRoleLabel = (role) => ({
  "Carte graphique": "GPU",
  "Processeur": "CPU",
  "Carte mère": "CM",
  "Mémoire": "RAM",
  "Refroidissement": "Cooling",
  "Alimentation": "PSU",
}[role] || role);
const findPrebuilt = (key) => PREBUILTS.find((b) => b.key === key);
const prebuiltIds = () => [...new Set(PREBUILTS.flatMap((b) => Object.values(b.ids)))];
const loadPrebuiltProducts = async () => {
  const all = await api(`/products?compact=1&ids=${prebuiltIds().join(",")}`);
  return new Map(all.map((p) => [p.id, p]));
};
const prebuiltParts = (b, byId) =>
  PREBUILT_ROLES.map((role) => ({ role, product: byId.get(b.ids[role]) })).filter((x) => x.product);
const prebuiltTotal = (parts) => parts.reduce((s, { product }) => s + product.price, 0);

function addPrebuiltToCart(b, byId) {
  if (!state.user) {
    requireAuth(() => addPrebuiltToCart(b, byId));
    toast("Connectez-vous pour enregistrer votre panier sur votre compte", "info");
    return;
  }
  let n = 0;
  prebuiltParts(b, byId).forEach(({ product }) => {
    if (product.stock > 0) { addToCart(product, 1, true); n++; }
  });
  fireVoltBurst();
  toast(`${b.name} ajouté : ${n} composants`, "success");
  openCart();
}

async function viewPrebuilt(app, key) {
  const b = findPrebuilt(key);
  if (!b) {
    app.innerHTML = `<div class="empty-state"><h2>Configuration introuvable</h2><br><a class="btn btn-primary" href="/#prebuilts">Voir les PC prémontés</a></div>`;
    return;
  }

  app.innerHTML = `<div class="empty-state"><div class="big">⏳</div><h2>Chargement de la configuration...</h2></div>`;
  let byId;
  try { byId = await loadPrebuiltProducts(); }
  catch {
    app.innerHTML = `<div class="empty-state"><div class="big">⚠️</div><h2>Configuration indisponible</h2><p>Impossible de charger les composants pour le moment.</p></div>`;
    return;
  }

  const parts = prebuiltParts(b, byId);
  const total = prebuiltTotal(parts);
  const available = parts.filter(({ product }) => product.stock > 0).length;
  const allAvailable = available === parts.length;
  app.innerHTML = `
  <div class="breadcrumb"><a href="/">Accueil</a><span>/</span><a href="/#prebuilts">PC prémontés</a><span>/</span><span>${esc(b.name)}</span></div>
  <section class="prebuilt-page">
    <div class="prebuilt-page-head">
      <span class="pb-tier">${esc(b.tier)}</span>
      <h1>${esc(b.name)}</h1>
      <p>${esc(b.tag)}</p>
      <div class="prebuilt-facts">
        <span>Compatibilité vérifiée</span>
        <span>${parts.length} composants</span>
        <span>${allAvailable ? "Disponible selon stock actuel" : `${available}/${parts.length} composants en stock`}</span>
      </div>
    </div>
    <aside class="prebuilt-summary panel">
      <span>Total composants</span>
      <strong>${fmt(total)}</strong>
      <p>Prix calculé à partir des composants listés ci-dessous. Les frais éventuels sont calculés au panier.</p>
      <button class="btn btn-primary btn-block" id="prebuiltAdd">Ajouter la configuration</button>
      <a class="btn btn-ghost btn-block" href="/configurateur">Ouvrir le configurateur</a>
    </aside>
  </section>
  <section class="section">
    <div class="section-head"><h2>Composants inclus</h2><a href="/#prebuilts">Retour aux configurations</a></div>
    <div class="prebuilt-component-list">
      ${parts.map(({ role, product }) => `
        <a class="prebuilt-component" href="/produit/${product.id}">
          <div class="prebuilt-component-visual">${art(product.category, hueOf(product))}${imgTag(product)}</div>
          <div>
            <span>${prebuiltRoleLabel(role)}</span>
            <strong>${esc(product.brand)} ${esc(product.name)}</strong>
          </div>
          <div class="prebuilt-component-meta">
            <strong>${fmt(product.price)}</strong>
            <small class="${product.stock > 0 ? "" : "out"}">${product.stock > 0 ? `${product.stock} en stock` : "Rupture"}</small>
          </div>
        </a>
      `).join("")}
    </div>
  </section>
  </div>`;
  $("#prebuiltAdd").onclick = () => addPrebuiltToCart(b, byId);
}

async function renderPrebuilts(preloaded) {
  const grid = $("#prebuiltGrid");
  if (!grid) return;
  let byId;
  try {
    const all = preloaded || await api(`/products?compact=1&ids=${prebuiltIds().join(",")}`);
    byId = new Map(all.map((p) => [p.id, p]));
  } catch {
    grid.innerHTML = `<p style="color:var(--text-faint)">Configurations momentanément indisponibles.</p>`;
    return;
  }
  grid.innerHTML = PREBUILTS.map((b) => {
    const parts = prebuiltParts(b, byId);
    const total = prebuiltTotal(parts);
    const specs = parts.map(({ role, product }) =>
      `<li><span class="k">${prebuiltRoleLabel(role)}</span><span class="v">${esc(product.brand)} ${esc(product.name)}</span></li>`
    ).join("");
    return `<article class="pb-card${b.featured ? " featured" : ""}">
      <div class="pb-head">
        <span class="pb-tier">${b.tier}</span>
        <div class="pb-name">${b.name}</div>
        <div class="pb-tag">${b.tag}</div>
        <span class="pb-compat"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>Compatibilité confirmée</span>
      </div>
      <ul class="pb-specs">${specs}</ul>
      <div class="pb-foot">
        <div class="pb-price">${fmt(total)}<small>${parts.length} composants sélectionnés</small></div>
        <div class="pb-actions">
          <a class="btn btn-ghost btn-sm" href="/prebuilt/${b.key}">Détails</a>
          <button class="btn btn-primary btn-sm" data-pb="${b.key}">Ajouter</button>
        </div>
      </div>
    </article>`;
  }).join("");
  grid.querySelectorAll("[data-pb]").forEach((btn) => btn.onclick = () => {
    const b = PREBUILTS.find((x) => x.key === btn.dataset.pb);
    addPrebuiltToCart(b, byId);
  });
}

/* ─── Pages de confiance ─── */
const trustIcon = (path) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;

function trustStrip() {
  const items = [
    ["Paiement sécurisé Stripe", "M12 3 5 6v5c0 4.4 2.9 7.6 7 9 4.1-1.4 7-4.6 7-9V6l-7-3z"],
    ["Rétractation 14 jours", "M4 7h10a5 5 0 1 1-4 8M4 7l4-4M4 7l4 4"],
    ["Espace client", "M5 18v-5a7 7 0 0 1 14 0v5M5 18h4v-6H5v6zm10 0h4v-6h-4v6z"],
    ["Facture PDF", "M7 3h8l4 4v14H7z"],
    ["Garantie légale", "M12 3 5 6v5c0 4.4 2.9 7.6 7 9 4.1-1.4 7-4.6 7-9V6l-7-3z"],
    ["DEEE / recyclage", "M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15M10 10v7M14 10v7"],
  ];
  return `<div class="trust-strip">${items.map(([label, path]) =>
    `<span>${trustIcon(path)}${label}</span>`).join("")}</div>`;
}

function viewAbout(app) {
  app.innerHTML = `
  <section class="content-page about-page">
    <nav class="breadcrumb"><a href="/">Accueil</a> / Qui sommes-nous</nav>
    <div class="content-hero">
      <span class="eyebrow">Boutique française</span>
      <h1>VoltCore aide à choisir les bons composants, sans jargon inutile.</h1>
      <p>Nous sélectionnons des cartes graphiques, processeurs, alimentations, boîtiers et périphériques pensés pour des configurations fiables, équilibrées et faciles à faire évoluer.</p>
    </div>
    ${trustStrip()}
    <div class="story-grid">
      <article><h2>Notre rôle</h2><p>Rendre l'achat PC plus clair : des fiches lisibles, des conseils de compatibilité, un configurateur guidé et un panier qui garde les informations importantes sous les yeux.</p></article>
      <article><h2>Notre méthode</h2><p>Chaque recommandation met en avant l'usage réel : gaming 1080p, 1440p, création vidéo, silence, évolutivité ou budget maîtrisé.</p></article>
      <article><h2>Expédition</h2><p>Les informations de livraison, de facture et de suivi de commande sont affichées dans l'espace client lorsque la commande est disponible.</p></article>
    </div>
    <div class="content-actions">
      <a class="btn btn-primary" href="/configurateur">Configurer un PC</a>
      <a class="btn btn-ghost" href="/catalogue">Voir le catalogue</a>
    </div>
  </section>`;
}

const LEGAL_PAGES = {
  mentions: {
    title: "Mentions légales",
    intro: "Informations d'identification, de contact et de responsabilité de la boutique VoltCore.",
    sections: [
      ["Éditeur du site", "VoltCore, boutique française de composants PC. Avant mise en production, compléter la raison sociale, la forme juridique, le capital, l'adresse du siège, le SIRET/RCS, le numéro de TVA si applicable et le responsable de publication."],
      ["Contact", "Pour toute question ou réclamation : support@voltpc.fr. Les demandes liées aux commandes doivent préciser le numéro de commande et l'adresse e-mail utilisée lors de l'achat."],
      ["Hébergement", "Site hébergé sur Render pour la démonstration, avec service applicatif FastAPI et base de données de développement. Remplacer par les informations exactes de l'hébergeur en production."],
      ["Facturation", "Une facture PDF est générée après paiement et reste disponible depuis l'espace client. Les mentions société des factures doivent être renseignées dans la configuration de production."],
      ["Propriété intellectuelle", "Les textes, interfaces et éléments de marque VoltCore sont protégés. Les photos produits référencées indiquent leurs crédits dans le fichier dédié."],
      ["Approvisionnement", "Les produits proposés doivent provenir de fournisseurs légitimes. Les factures d'achat sont à conserver afin de justifier l'origine des marchandises et d'éviter toute vente de contrefaçon ou d'importation irrégulière."],
    ],
  },
  cgv: {
    title: "Conditions générales de vente",
    intro: "Conditions d'achat applicables aux commandes de composants PC et périphériques vendus par VoltCore.",
    sections: [
      ["Commande", "La commande est confirmée après validation du paiement. Les prix, remises, frais de livraison et disponibilités sont recalculés côté serveur avant le paiement."],
      ["Paiement sécurisé", "Le paiement est traité par Stripe Checkout. Les coordonnées bancaires ne transitent jamais par les serveurs VoltCore. Les moyens de paiement disponibles dépendent de la configuration Stripe active."],
      ["Livraison", "La livraison est suivie et offerte dès 50 EUR d'achat après remise. Les délais exacts sont indiqués lors de la commande et peuvent varier selon le transporteur."],
      ["Droit de rétractation", "Le consommateur dispose d'un délai légal de 14 jours à compter de la réception pour se rétracter, sauf exceptions prévues par la loi. VoltCore peut proposer une politique commerciale plus favorable de 30 jours lorsque le produit est complet et en bon état."],
      ["Garanties légales", "Les produits bénéficient de la garantie légale de conformité et de la garantie contre les vices cachés. Les garanties commerciales ou constructeur s'ajoutent à ces droits sans les remplacer."],
      ["SAV et réclamations", "Le support accompagne le diagnostic initial, les demandes de retour, les échanges avec le transporteur et les réclamations. Le client doit fournir le numéro de commande, le produit concerné et une description du problème."],
      ["Équipements électroniques", "Les composants et périphériques électroniques peuvent relever de la filière DEEE. Selon le rôle exact de VoltCore, revendeur, importateur ou metteur sur le marché, des obligations de reprise, de déclaration ou d'éco-participation peuvent s'appliquer."],
      ["Factures", "Une facture est fournie après paiement. Elle peut être téléchargée depuis l'espace client lorsque la commande n'est plus en attente de paiement."],
    ],
  },
  privacy: {
    title: "Politique de confidentialité",
    intro: "Les données collectées servent au fonctionnement de la boutique, au suivi des commandes, au support et à la sécurité.",
    sections: [
      ["Données collectées", "Compte client, adresse de livraison, panier, commandes, factures, avis, préférences et informations nécessaires au traitement des demandes."],
      ["Finalités", "Préparation des commandes, livraison, facturation, service après-vente, sécurité du compte, lutte contre la fraude et amélioration de l'expérience d'achat."],
      ["Paiement", "Les données de paiement sont gérées par Stripe. VoltCore ne stocke pas les numéros de carte bancaire."],
      ["Cookies", "Les cookies strictement nécessaires permettent le panier, la session et la sécurité. Les cookies de mesure d'audience ou de marketing ne doivent être utilisés qu'après consentement."],
      ["Sécurité", "Les accès sensibles sont protégés par authentification. Les données clients doivent être limitées aux personnes qui en ont besoin pour traiter les commandes et le support."],
      ["Durées de conservation", "Les données de compte sont conservées tant que le compte reste actif. Les données de commande et de facturation sont conservées selon les obligations comptables et légales applicables."],
      ["Vos droits", "Vous pouvez demander l'accès, la rectification, l'effacement, la limitation, l'opposition ou la portabilité de vos données via support@voltpc.fr."],
    ],
  },
  returns: {
    title: "Retours et remboursement",
    intro: "Un cadre simple pour exercer la rétractation, demander un retour SAV et suivre le remboursement.",
    sections: [
      ["Rétractation légale", "Vous disposez d'un délai légal de 14 jours à compter de la réception pour exercer votre droit de rétractation, sauf exceptions prévues par la loi."],
      ["Retour commercial", "VoltCore peut accepter les demandes de retour jusqu'à 30 jours après réception lorsque le produit est complet, non endommagé et renvoyé avec ses accessoires."],
      ["Procédure", "Contactez le support avec le numéro de commande, le produit concerné et le motif du retour. Le support vous indiquera l'adresse et les consignes de retour."],
      ["Remboursement", "Lorsque le remboursement est dû, il est effectué sur le moyen de paiement initial dans les délais légaux après réception ou preuve d'expédition du retour, selon le cas applicable."],
      ["Garanties et SAV", "En cas de défaut ou de panne, la garantie légale de conformité s'applique. Le support peut demander des photos, tests ou informations techniques pour orienter la prise en charge."],
      ["Exceptions", "Les produits endommagés par mauvaise manipulation, incomplets, retournés sans accessoires essentiels ou personnalisés peuvent nécessiter une vérification complémentaire."],
    ],
  },
};

function viewLegal(app, key) {
  const page = LEGAL_PAGES[key] || LEGAL_PAGES.mentions;
  app.innerHTML = `
  <section class="content-page legal-page">
    <nav class="breadcrumb"><a href="/">Accueil</a> / ${page.title}</nav>
    <div class="content-hero compact">
      <span class="eyebrow">Confiance</span>
      <h1>${page.title}</h1>
      <p>${page.intro}</p>
    </div>
    <div class="legal-grid">
      ${page.sections.map(([title, text]) => `<article><h2>${title}</h2><p>${text}</p></article>`).join("")}
    </div>
    ${trustStrip()}
  </section>`;
}

/* ─── Animations home : tour PC (hero) + séparateurs 3D pilotés au scroll ───
   Chaque séparateur reçoit une progression --p (0→1) selon sa traversée du
   viewport ; le CSS la transforme en effets VARIÉS (profondeur, dépliage),
   pas seulement en rotation. La tour du hero réagit au scroll + à la souris. */
let home3DCleanup = null;
function cleanupHome3D() {
  if (!home3DCleanup) return;
  home3DCleanup();
  home3DCleanup = null;
}

const clamp01 = (n) => Math.max(0, Math.min(1, n));

function initVoidField(stage, canvas) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};

  const pointer = { x: 0.62, y: 0.44, hot: false };
  let raf = 0;
  let inView = true;
  const io = ("IntersectionObserver" in window)
    ? new IntersectionObserver((entries) => { inView = entries[0].isIntersecting; }, { threshold: 0 })
    : null;
  if (io) io.observe(stage);
  let dpr = 1;
  let w = 0;
  let h = 0;
  let last = performance.now();
  let particles = [];

  const resetParticle = (p = {}) => {
    p.x = Math.random();
    p.y = Math.random();
    p.vx = -0.000004 + Math.random() * 0.000014;
    p.vy = 0.000006 + Math.random() * 0.000026;
    p.size = 0.45 + Math.random() * 1.28;
    p.alpha = 0.08 + Math.random() * 0.20;
    p.sway = Math.random() * Math.PI * 2;
    p.depth = Math.random();
    return p;
  };

  const resize = () => {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    w = Math.max(1, Math.floor(r.width * dpr));
    h = Math.max(1, Math.floor(r.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const count = Math.min(64, Math.max(32, Math.floor((canvas.clientWidth || 1) * (canvas.clientHeight || 1) / 26000)));
    particles = Array.from({ length: count }, () => resetParticle());
  };

  const frame = (now) => {
    if (!canvas.isConnected) return;
    raf = requestAnimationFrame(frame);
    if (!inView) { last = now; return; } // pause hors écran
    if (Math.floor(canvas.clientWidth * dpr) !== w || Math.floor(canvas.clientHeight * dpr) !== h) resize();
    const dt = Math.min(36, now - last);
    last = now;

    const cw = canvas.clientWidth || 1;
    const ch = canvas.clientHeight || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);

    const px = pointer.x * cw;
    const py = pointer.y * ch;
    const glow = ctx.createRadialGradient(px, py, 0, px, py, Math.max(cw, ch) * 0.72);
    glow.addColorStop(0, pointer.hot ? "rgba(220,240,246,0.040)" : "rgba(150,178,190,0.024)");
    glow.addColorStop(0.32, "rgba(110,136,148,0.020)");
    glow.addColorStop(0.68, "rgba(38,54,66,0.010)");
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, cw, ch);

    ctx.globalAlpha = pointer.hot ? 0.16 : 0.10;
    ctx.strokeStyle = "rgba(226,244,248,.42)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      const y = ch * (0.36 + i * 0.115) + (pointer.y - 0.5) * (7 + i * 3);
      const start = cw * (0.52 - i * 0.045);
      const end = cw * (0.88 + i * 0.035);
      ctx.beginPath();
      ctx.moveTo(start, y);
      ctx.bezierCurveTo(cw * 0.66, y - 18 - i * 9, cw * 0.76, y + 18 + i * 5, end, y - 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    for (const p of particles) {
      const speedBoost = pointer.hot ? 1.025 : 1;
      p.sway += dt * (0.00018 + p.depth * 0.00008);
      p.x += (p.vx * dt * speedBoost) + Math.cos(p.sway) * 0.000003 * dt;
      p.y += p.vy * dt * speedBoost;
      if (p.y > 1.16 || p.x < -0.08 || p.x > 1.08) {
        resetParticle(p);
        p.y = -0.12;
      }

      const depthScale = 0.65 + p.depth * 1.25;
      const x = p.x * cw + (pointer.x - 0.5) * 10 * p.depth;
      const y = p.y * ch + (pointer.y - 0.5) * 7 * p.depth;
      const r = p.size * depthScale;
      const alpha = p.alpha * (0.72 + p.depth * 0.36);

      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.depth > 0.62 ? "rgba(238,250,252,.58)" : "rgba(172,205,218,.42)";
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();

      if (p.depth > 0.70) {
        ctx.globalAlpha = alpha * 0.10;
        ctx.fillStyle = "rgba(238,250,252,.70)";
        ctx.fillRect(x - r * 0.18, y - r * 1.2, Math.max(1, r * 0.24), r * 2.1);
      }
      ctx.globalAlpha = 1;
    }
  };

  const onMove = (e) => {
    const r = stage.getBoundingClientRect();
    pointer.x = clamp01((e.clientX - r.left) / (r.width || 1));
    pointer.y = clamp01((e.clientY - r.top) / (r.height || 1));
    pointer.hot = true;
  };
  const onLeave = () => { pointer.hot = false; pointer.x = 0.62; pointer.y = 0.44; };

  stage.addEventListener("pointermove", onMove, { passive: true });
  stage.addEventListener("pointerleave", onLeave);
  resize();
  raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(raf);
    if (io) io.disconnect();
    stage.removeEventListener("pointermove", onMove);
    stage.removeEventListener("pointerleave", onLeave);
  };
}

function initHome3D() {
  cleanupHome3D();
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const stage = $("#voidStage");
  const hero = $(".void-hero");
  const modelCanvas = $("#voidModel");
  const seps = $$("[data-void-sep]");
  const voidFields = $$(".void-field");
  if (reduce) {                              // accessibilité : état final figé, zéro mouvement
    seps.forEach((s) => s.style.setProperty("--p", "1"));
    // La tour reste visible (une seule image figée), mais plus aucune animation.
    const stopStatic = (stage && modelCanvas && window.initVoltVoidModel)
      ? window.initVoltVoidModel(stage, modelCanvas, { reducedMotion: true })
      : null;
    home3DCleanup = () => { if (stopStatic) stopStatic(); };
    return;
  }

  let ticking = false;
  const update = () => {
    ticking = false;
    const vh = window.innerHeight;
    // Tour du hero : légère rotation + recul selon le scroll d'entrée
    if (stage) {
      const r = stage.getBoundingClientRect();
      const prog = 1 - (r.top + r.height / 2) / vh;     // ~0 en haut → 1 en bas de l'écran
      stage.style.setProperty("--void-scroll", clamp01(prog).toFixed(3));
      hero?.style.setProperty("--void-scroll", clamp01(prog).toFixed(3));
    }
    // Séparateurs : 0 quand le bloc entre par le bas, 1 quand il atteint le centre/haut
    for (const s of seps) {
      const r = s.getBoundingClientRect();
      const p = (vh - r.top) / (vh + r.height);          // 0 → 1 pendant la traversée
      s.style.setProperty("--p", Math.max(0, Math.min(1, p)).toFixed(3));
    }
  };
  const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });

  const stopVoidFields = voidFields.map((canvas) => {
    const host = canvas.closest(".void-hero") || stage;
    return host ? initVoidField(host, canvas) : null;
  }).filter(Boolean);

  const stopModel = (stage && modelCanvas && window.initVoltVoidModel)
    ? window.initVoltVoidModel(stage, modelCanvas)
    : null;

  home3DCleanup = () => {
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", onScroll);
    stopVoidFields.forEach((stop) => stop());
    if (stopModel) stopModel();
  };
  update();
}

/* ─── Filtres par caractéristiques (selon la catégorie) ─── */
const SPEC_FILTERS = {
  gpu: [
    { key: "vram", label: "Mémoire vidéo", fn: (p) => { const g = specNum(p.specs["Mémoire"]); return g ? (g >= 24 ? "24 Go +" : g + " Go") : null; } },
    { key: "gen", label: "Génération", fn: (p) => { const t = p.name.toLowerCase(); if (/rtx\s*50/.test(t)) return "RTX 50"; if (/rtx\s*40/.test(t)) return "RTX 40"; if (/rtx\s*30/.test(t)) return "RTX 30"; if (/rx\s*90/.test(t)) return "RX 9000"; if (/rx\s*8/.test(t)) return "RX 8000"; if (/rx\s*7/.test(t)) return "RX 7000"; if (/arc/.test(t)) return "Intel Arc"; return null; } },
    { key: "conso", label: "Consommation", fn: (p) => { const w = p.specs.tdp_w || specNum(p.specs["TDP"]); return !w ? null : w <= 200 ? "≤ 200 W" : w <= 300 ? "200–300 W" : "300 W +"; } },
  ],
  cpu: [
    { key: "socket", label: "Socket", fn: (p) => p.specs.socket || p.specs["Socket"] || null },
    { key: "cores", label: "Cœurs", fn: (p) => { const c = specNum(p.specs["Cœurs"]); return !c ? null : c <= 6 ? "6 ou moins" : c <= 8 ? "8 cœurs" : c <= 12 ? "12 cœurs" : "16 cœurs +"; } },
    { key: "tdp", label: "Enveloppe (TDP)", fn: (p) => { const w = p.specs.tdp_w || specNum(p.specs["TDP"]); return !w ? null : w <= 65 ? "≤ 65 W" : w <= 105 ? "65–105 W" : "105 W +"; } },
  ],
  ram: [
    { key: "type", label: "Type", fn: (p) => p.specs.ram_type || p.specs["Type"] || null },
    { key: "cap", label: "Capacité", fn: (p) => { const c = specNum(p.specs["Capacité"]); return !c ? null : c <= 16 ? "16 Go" : c <= 32 ? "32 Go" : c <= 64 ? "64 Go" : "96 Go +"; } },
    { key: "freq", label: "Fréquence", fn: (p) => { const f = specNum(p.specs["Fréquence"]); return !f ? null : f < 6000 ? "< 6000 MT/s" : f < 6400 ? "6000–6400" : "6400 +"; } },
  ],
  monitor: [
    { key: "size", label: "Taille", fn: (p) => { const s = specNum(p.specs["Dalle"]); return !s ? null : s < 25 ? '24"' : s < 28 ? '27"' : s < 33 ? '32"' : '34" +'; } },
    { key: "res", label: "Résolution", fn: (p) => { const n = String(p.specs["Définition"] || "").replace(/\s/g, "").match(/\d+/g) || []; const w = +n[0] || 0; return w >= 3840 ? "4K UHD" : w >= 2560 ? "1440p QHD" : w >= 1920 ? "1080p FHD" : null; } },
    { key: "hz", label: "Fréquence", fn: (p) => { const h = specNum(p.specs["Fréquence"]); return !h ? null : h <= 144 ? "≤ 144 Hz" : h <= 240 ? "165–240 Hz" : "360 Hz +"; } },
  ],
  psu: [
    { key: "watts", label: "Puissance", fn: (p) => { const w = p.specs.watts || specNum(p.specs["Puissance"]); return !w ? null : w < 650 ? "< 650 W" : w < 850 ? "650–850 W" : w < 1000 ? "850–1000 W" : "1000 W +"; } },
    { key: "cert", label: "Certification", fn: (p) => { const m = String(p.specs["Certification"] || "").match(/bronze|silver|gold|platinum|titanium/i); return m ? "80+ " + m[0][0].toUpperCase() + m[0].slice(1).toLowerCase() : null; } },
  ],
  storage: [
    { key: "cap", label: "Capacité", fn: (p) => { const c = specNum(p.specs["Capacité"]); return !c ? null : c <= 1 ? "1 To" : c <= 2 ? "2 To" : c <= 4 ? "4 To" : "4 To +"; } },
    { key: "iface", label: "Interface", fn: (p) => { const m = String(p.specs["Interface"] || "").match(/PCIe\s*\d(\.\d)?/i); return m ? m[0].replace(/\s+/, " ") : (/2[.,]5|sata/i.test(String(p.specs["Interface"] || p.specs["Format"] || "")) ? "SATA" : null); } },
    { key: "form", label: "Format", fn: (p) => { const f = String(p.specs["Format"] || ""); return /m\.?2/i.test(f) ? "M.2" : /2[.,]5/.test(f) ? '2,5"' : null; } },
  ],
  cooling: [
    { key: "type", label: "Type", fn: (p) => { const t = String(p.specs["Type"] || ""); return /aio|watercooling|liquid/i.test(t) ? "Watercooling (AIO)" : "Ventirad (air)"; } },
    { key: "rad", label: "Radiateur", fn: (p) => { const r = specNum(p.specs["Radiateur"]); return !r ? null : r <= 240 ? "≤ 240 mm" : r <= 280 ? "280 mm" : "360 mm"; } },
  ],
  case: [
    { key: "format", label: "Format", fn: (p) => p.specs["Format"] || null },
    { key: "gpumax", label: "GPU max", fn: (p) => { const g = p.specs.max_gpu_mm || specNum(p.specs["GPU max"]); return !g ? null : g < 360 ? "< 360 mm" : g < 420 ? "360–420 mm" : "420 mm +"; } },
  ],
  fan: [
    { key: "size", label: "Taille", fn: (p) => p.specs["Taille"] || null },
  ],
};
const specOptSort = (a, b) => (specNum(a) - specNum(b)) || String(a).localeCompare(String(b), "fr");

/* ─── Vue : catalogue ─── */
async function viewCatalog(app, params) {
  const filters = {
    cat: params.get("cat") || "",
    q: params.get("q") || "",
    brand: params.get("brand") || "",
    min: params.get("min") || "",
    max: params.get("max") || "",
    sort: params.get("sort") || "featured",
    promo: params.get("promo") === "1",
    nouveau: params.get("new") === "1",
    spec: Object.fromEntries([...params.entries()].filter(([k]) => k.startsWith("s_")).map(([k, v]) => [k.slice(2), v])),
    page: Math.max(1, parseInt(params.get("page") || "1", 10) || 1),
  };
  const PER_PAGE = 24;
  const pageTitle = filters.promo ? "Promotions"
    : filters.nouveau ? "Nouveautés"
    : filters.cat ? (CATS[filters.cat]?.label ?? "Catalogue")
    : filters.q ? `Recherche « ${esc(filters.q)} »` : "Catalogue";

  app.innerHTML = `
  <div class="catalog-layout">
    <aside class="filters" id="filtersBox">
      <h3>Filtres</h3>
      <div class="filter-group">
        <span>Catégorie</span>
        <label class="filter-option"><input type="radio" name="cat" value="" ${!filters.cat ? "checked" : ""}> Toutes</label>
        ${Object.entries(CATS).map(([k, c]) => `
          <label class="filter-option"><input type="radio" name="cat" value="${k}" ${filters.cat === k ? "checked" : ""}> ${c.label}</label>`).join("")}
      </div>
      <div class="filter-group" id="brandGroup"><span>Marque</span></div>
      <div id="specGroup"></div>
      <div class="filter-group">
        <span>Prix (€)</span>
        <div class="price-inputs">
          <input type="number" id="minPrice" placeholder="Min" value="${esc(filters.min)}" min="0">
          <span>—</span>
          <input type="number" id="maxPrice" placeholder="Max" value="${esc(filters.max)}" min="0">
        </div>
      </div>
      <button class="btn btn-ghost btn-sm" id="resetFilters">Réinitialiser</button>
    </aside>
    <div>
      <div class="catalog-toolbar">
        <h1>${pageTitle}<span class="count" id="resultCount"></span></h1>
        <select class="select" id="sortSelect">
          <option value="featured" ${filters.sort === "featured" ? "selected" : ""}>En vedette</option>
          <option value="performance" ${filters.sort === "performance" ? "selected" : ""}>Performance ↓</option>
          <option value="price_asc" ${filters.sort === "price_asc" ? "selected" : ""}>Prix croissant</option>
          <option value="price_desc" ${filters.sort === "price_desc" ? "selected" : ""}>Prix décroissant</option>
          <option value="rating" ${filters.sort === "rating" ? "selected" : ""}>Meilleures notes</option>
          <option value="name" ${filters.sort === "name" ? "selected" : ""}>Nom A→Z</option>
        </select>
      </div>
      <div id="catalogGrid">${skeletons(8)}</div>
    </div>
  </div>`;

  const qs = new URLSearchParams();
  if (filters.cat) qs.set("category", filters.cat);
  if (filters.q) qs.set("search", filters.q);
  if (filters.brand) qs.set("brand", filters.brand);
  if (filters.min) qs.set("min_price", filters.min);
  if (filters.max) qs.set("max_price", filters.max);
  qs.set("sort", filters.sort);

  let products = await api("/products?" + qs.toString());
  if (filters.promo) products = products.filter((p) => p.old_price);
  if (filters.nouveau) products = products.filter((p) => p.badge === "Nouveau");

  // Filtres par caractéristiques (client) : on garde une base non filtrée par
  // specs pour proposer les options encore pertinentes.
  const specFields = (filters.cat && SPEC_FILTERS[filters.cat]) || [];
  const baseForSpecs = products.slice();
  for (const f of specFields) {
    const sel = filters.spec[f.key];
    if (sel) products = products.filter((p) => f.fn(p) === sel);
  }
  $("#resultCount").textContent = `${products.length} produit${products.length > 1 ? "s" : ""}`;

  // Pagination côté client : l'API renvoie tout, on affiche par tranches.
  const pageCount = Math.max(1, Math.ceil(products.length / PER_PAGE));
  const page = Math.min(filters.page, pageCount);
  const pageItems = products.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  $("#catalogGrid").innerHTML = products.length
    ? `<div class="product-grid">${pageItems.map(productCard).join("")}</div>${pagerHtml(page, pageCount)}`
    : `<div class="empty-state"><p>Aucun produit ne correspond à vos critères.</p></div>`;
  bindProductCards(app, pageItems);
  $$("[data-page]", app).forEach((b) => b.onclick = () => { navigate({ page: Number(b.dataset.page) }); window.scrollTo({ top: 0 }); });

  // Marques disponibles (sur la catégorie courante, sans filtre marque)
  const brandQs = new URLSearchParams();
  if (filters.cat) brandQs.set("category", filters.cat);
  if (filters.q) brandQs.set("search", filters.q);
  const all = filters.brand ? await api("/products?" + brandQs.toString()) : products;
  const brands = [...new Set(all.map((p) => p.brand))].sort();
  $("#brandGroup").insertAdjacentHTML("beforeend",
    `<label class="filter-option"><input type="radio" name="brand" value="" ${!filters.brand ? "checked" : ""}> Toutes</label>` +
    brands.map((b) => `<label class="filter-option"><input type="radio" name="brand" value="${esc(b)}" ${filters.brand === b ? "checked" : ""}> ${esc(b)}</label>`).join(""));

  const navigate = (patch) => {
    // Changer un filtre ramène en page 1 ; seul un patch {page} conserve le reste.
    const next = { ...filters, ...patch };
    if (!("page" in patch)) next.page = 1;
    const p = new URLSearchParams();
    if (next.cat) p.set("cat", next.cat);
    if (next.q) p.set("q", next.q);
    if (next.brand) p.set("brand", next.brand);
    if (next.min) p.set("min", next.min);
    if (next.max) p.set("max", next.max);
    if (next.sort !== "featured") p.set("sort", next.sort);
    if (next.promo) p.set("promo", "1");
    if (next.nouveau) p.set("new", "1");
    for (const [k, v] of Object.entries(next.spec || {})) if (v) p.set("s_" + k, v);
    if (next.page > 1) p.set("page", next.page);
    go("/catalogue" + (p.toString() ? "?" + p.toString() : ""));
  };

  // Options de filtres par specs : dérivées des produits de la catégorie courante.
  if (specFields.length) {
    $("#specGroup").innerHTML = specFields.map((f) => {
      const opts = [...new Set(baseForSpecs.map(f.fn).filter(Boolean))].sort(specOptSort);
      if (opts.length < 2) return "";
      const sel = filters.spec[f.key] || "";
      return `<div class="filter-group"><span>${esc(f.label)}</span>
        <label class="filter-option"><input type="radio" name="s_${f.key}" value="" ${!sel ? "checked" : ""}> Toutes</label>
        ${opts.map((o) => `<label class="filter-option"><input type="radio" name="s_${f.key}" value="${esc(o)}" ${sel === o ? "checked" : ""}> ${esc(o)}</label>`).join("")}
      </div>`;
    }).join("");
    $$("#specGroup input[type=radio]", app).forEach((r) => r.onchange = () =>
      navigate({ spec: { ...filters.spec, [r.name.slice(2)]: r.value } }));
  }

  $$("input[name=cat]", app).forEach((r) => r.onchange = () => navigate({ cat: r.value, brand: "", spec: {} }));
  $$("input[name=brand]", app).forEach((r) => r.onchange = () => navigate({ brand: r.value }));
  $("#sortSelect").onchange = (e) => navigate({ sort: e.target.value });
  const priceApply = () => navigate({ min: $("#minPrice").value, max: $("#maxPrice").value });
  $("#minPrice").onchange = priceApply;
  $("#maxPrice").onchange = priceApply;
  $("#resetFilters").onclick = () => { go("/catalogue"); };
}

/* ─── Vue : fiche produit ─── */
async function viewProduct(app, id) {
  app.innerHTML = skeletons(4);
  const p = await api("/products/" + id);
  const discount = p.old_price ? Math.round((1 - p.price / p.old_price) * 100) : 0;
  const specEntries = Object.entries(p.specs).filter(([k]) => /^[A-ZÀ-Ü]/.test(k));
  let qty = 1;

  app.innerHTML = `
  <button class="btn btn-ghost btn-sm pp-back" id="ppBack" type="button">← Retour</button>
  <nav class="breadcrumb">
    <a href="/">Accueil</a> / <a href="/catalogue">Catalogue</a> /
    <a href="/catalogue?cat=${p.category}">${CATS[p.category]?.label ?? p.category}</a> / <span>${esc(p.name)}</span>
  </nav>
  <div class="product-page">
    <div class="product-gallery">
      <div class="product-page-visual" style="--tint:${tintOf(p)}">
        ${art(p.category, hueOf(p))}
        <img class="pimg" id="ppMain" src="${esc(p.image_url || `/images/${slugify(p.name)}-1.jpg`)}" alt="${esc(p.name)}" onerror="this.remove(); cleanupProductThumbs()">
        ${badgeHtml(usefulBadge(p) || p.badge)}
      </div>
      <div class="pp-thumbs" id="ppThumbs">
        ${[1,2,3,4,5].map((n) => `
          <button class="pp-thumb${n === 1 ? " active" : ""}" data-src="/images/${slugify(p.name)}-${n}.jpg">
            <img src="/images/${slugify(p.name)}-${n}.jpg" alt="" loading="lazy" onerror="this.closest('.pp-thumb').remove(); cleanupProductThumbs()">
          </button>`).join("")}
      </div>
    </div>
    <div class="product-page-info">
      <span class="product-brand">${esc(p.brand)} · ${CATS[p.category]?.label ?? ""}</span>
      <h1>${esc(p.name)}</h1>
      <div class="product-rating">${stars(p.rating)} <span>${p.rating.toFixed(1)} — ${p.rating_count} avis</span></div>
      <p class="desc">${esc(p.description)}</p>
      <div class="price-row">
        <span class="price">${fmt(p.price)}</span>
        ${p.old_price ? `<span class="price-old">${fmt(p.old_price)}</span><span class="discount-chip">-${discount}%</span>` : ""}
      </div>
      ${stockHtml(p.stock)}
      <div class="buy-row">
        <div class="qty-picker">
          <button id="qtyMinus">−</button><span id="qtyVal">1</span><button id="qtyPlus">+</button>
        </div>
        <button class="btn btn-primary" id="buyBtn" style="flex:1" ${p.stock <= 0 ? "disabled" : ""}>
          ${p.stock <= 0 ? "Indisponible" : "Ajouter au panier"}
        </button>
      </div>
      <div class="pp-actions">
        <button class="btn btn-ghost btn-sm ${state.favorites.has(p.id) ? "fav-active" : ""}" data-fav="${p.id}" id="ppFav">
          ${state.favorites.has(p.id) ? "♥ Dans mes favoris" : "♡ Ajouter aux favoris"}
        </button>
        <button class="btn btn-ghost btn-sm ${inCompare(p.id) ? "fav-active" : ""}" data-cmp="${p.id}" id="ppCmp">
          ⇄ ${inCompare(p.id) ? "Dans le comparateur" : "Comparer"}
        </button>
      </div>
      <div class="specs-card">
        <table class="specs-table">
          ${specEntries.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join("")}
        </table>
      </div>
    </div>
  </div>
  <div id="recoZone"></div>
  <section class="reviews">
    <div class="section-head"><h2>Avis clients</h2></div>
    <div id="reviewList"><div class="skeleton" style="min-height:90px"></div></div>
    <div class="review-form" id="reviewForm">
      <h3 id="reviewFormTitle">Donner mon avis</h3>
      <div class="star-picker" id="starPicker">${[1,2,3,4,5].map((n) => `<button data-star="${n}">★</button>`).join("")}</div>
      <textarea id="reviewText" placeholder="Partagez votre expérience avec ce produit…"></textarea>
      <button class="btn btn-primary btn-sm" id="reviewSubmit" style="align-self:flex-start">Publier mon avis</button>
    </div>
  </section>`;

  $("#qtyPlus").onclick = () => { if (qty < p.stock) { qty++; $("#qtyVal").textContent = qty; } };
  $("#qtyMinus").onclick = () => { if (qty > 1) { qty--; $("#qtyVal").textContent = qty; } };
  $("#buyBtn").onclick = () => addToCart(p, qty);
  $("#ppBack").onclick = () => { if (history.length > 1) history.back(); else go("/catalogue"); };

  // Galerie : clic sur une miniature → change l'image principale.
  $$("#ppThumbs .pp-thumb").forEach((btn) => btn.onclick = () => {
    const main = $("#ppMain");
    if (main) main.src = btn.dataset.src;
    $$("#ppThumbs .pp-thumb").forEach((b) => b.classList.toggle("active", b === btn));
  });
  // Masque la rangée de miniatures s'il n'en reste qu'une (ou zéro) après chargement.
  setTimeout(cleanupProductThumbs, 1200);
  validateProductGallery();
  renderRecos(p);
  $("#ppFav").onclick = async () => {
    await toggleFavorite(p.id);
    const on = state.favorites.has(p.id);
    $("#ppFav").classList.toggle("fav-active", on);
    $("#ppFav").textContent = on ? "♥ Dans mes favoris" : "♡ Ajouter aux favoris";
  };
  $("#ppCmp").onclick = () => {
    toggleCompare(p.id);
    const on = inCompare(p.id);
    $("#ppCmp").classList.toggle("fav-active", on);
    $("#ppCmp").textContent = `⇄ ${on ? "Dans le comparateur" : "Comparer"}`;
  };

  let pickedStars = 5;
  const myId = state.user?.id;

  const loadReviews = async () => {
    const reviews = await api(`/products/${id}/reviews`);
    const mine = myId ? reviews.find((r) => r.user_id === myId) : null;
    $("#reviewList").innerHTML = reviews.length
      ? reviews.map((r) => `
        <div class="review-card">
          <div class="review-head">
            <strong>${esc(r.author)}</strong>
            ${r.verified ? `<span class="verified-badge" title="Avis d'un acheteur vérifié">✓ Achat vérifié</span>` : ""}
            ${stars(r.rating)}
          </div>
          <p>${esc(r.comment)}</p>
          ${r.user_id && r.user_id === myId ? `<div class="review-mine">
            <button class="btn btn-ghost btn-sm" id="reviewEdit">Modifier</button>
            <button class="btn btn-ghost btn-sm" id="reviewDelete">Supprimer</button>
          </div>` : ""}
        </div>`).join("")
      : `<p style="color:var(--text-dim)">Aucun avis pour le moment — soyez le premier !</p>`;

    // Le formulaire s'adapte : masqué si l'utilisateur a déjà un avis (édité via « Modifier »).
    const form = $("#reviewForm");
    if (mine) {
      form.hidden = true;
      $("#reviewEdit").onclick = () => {
        form.hidden = false;
        $("#reviewFormTitle").textContent = "Modifier mon avis";
        $("#reviewText").value = mine.comment;
        pickedStars = mine.rating; paintStars();
        $("#reviewSubmit").dataset.mode = "edit";
        $("#reviewSubmit").textContent = "Mettre à jour mon avis";
      };
      $("#reviewDelete").onclick = async () => {
        if (!confirm("Supprimer votre avis ?")) return;
        try {
          await api(`/products/${id}/reviews`, { method: "DELETE" });
          clearApiCache("/products");
          toast("Avis supprimé");
          $("#reviewText").value = ""; pickedStars = 5;
          $("#reviewSubmit").dataset.mode = "create";
          $("#reviewFormTitle").textContent = "Donner mon avis";
          $("#reviewSubmit").textContent = "Publier mon avis";
          await loadReviews();
        } catch (e) { toast(e.message, "error"); }
      };
    } else {
      form.hidden = false;
    }
  };

  const paintStars = () => $$("#starPicker button").forEach((b) => b.classList.toggle("on", Number(b.dataset.star) <= pickedStars));
  paintStars();
  $$("#starPicker button").forEach((b) => b.onclick = () => { pickedStars = Number(b.dataset.star); paintStars(); });
  $("#reviewSubmit").onclick = () => requireAuth(async () => {
    const comment = $("#reviewText").value.trim();
    if (comment.length < 3) { toast("Votre avis est un peu court", "error"); return; }
    const editing = $("#reviewSubmit").dataset.mode === "edit";
    try {
      await api(`/products/${id}/reviews`, {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify({ rating: pickedStars, comment }),
      });
      clearApiCache("/products");
      $("#reviewText").value = "";
      $("#reviewSubmit").dataset.mode = "create";
      toast(editing ? "Avis mis à jour ✔" : "Merci pour votre avis !");
      await loadReviews();
    } catch (e) { toast(e.message, "error"); }
  });

  await loadReviews();
}

/* ─── Vue : comparateur ─── */
/* ─── Recommandations de la fiche produit ─── */
async function renderRecos(p) {
  const zone = $("#recoZone");
  if (!zone) return;
  let all;
  try { all = await api("/products"); } catch { return; }

  const same = all.filter((x) => x.category === p.category && x.id !== p.id);
  const cheaper = same.filter((x) => x.stock > 0 && x.price < p.price).sort((a, b) => b.price - a.price)[0];
  const stronger = same.filter((x) => x.stock > 0 && perfScore(x) > perfScore(p)).sort((a, b) => perfScore(a) - perfScore(b))[0];

  // Compatibles avec ce produit — mêmes règles que le configurateur.
  const sock = p.specs.socket, ramType = p.specs.ram_type;
  const gpuLen = specNum(p.specs["Longueur"]) || p.specs.length_mm || 0;
  const compat = all.filter((x) => {
    if (x.id === p.id || x.stock <= 0) return false;
    if (p.category === "cpu") return (x.category === "motherboard" && x.specs.socket === sock) || (x.category === "cooling" && (x.specs.sockets || []).includes(sock));
    if (p.category === "motherboard") return (x.category === "cpu" && x.specs.socket === sock) || (x.category === "ram" && x.specs.ram_type === ramType);
    if (p.category === "ram") return x.category === "motherboard" && x.specs.ram_type === ramType;
    if (p.category === "gpu") return (x.category === "psu" && (x.specs.watts || 0) >= 650) || (x.category === "case" && (x.specs.max_gpu_mm || 999) >= gpuLen && gpuLen > 0);
    if (p.category === "cooling") return x.category === "cpu" && (p.specs.sockets || []).includes(x.specs.socket);
    return false;
  }).sort((a, b) => b.rating - a.rating).slice(0, 4);

  // Souvent acheté avec — meilleures notes dans des catégories complémentaires.
  const COMPL = {
    cpu: ["motherboard", "ram", "cooling", "gpu"], gpu: ["psu", "cpu", "case", "monitor"],
    motherboard: ["cpu", "ram", "gpu"], ram: ["motherboard", "cpu", "gpu"],
    storage: ["motherboard", "gpu", "case"], psu: ["gpu", "cpu", "case"],
    case: ["psu", "cooling", "gpu"], cooling: ["cpu", "case", "gpu"],
    monitor: ["gpu", "keyboard", "mouse"], keyboard: ["mouse", "headset", "monitor"],
    mouse: ["keyboard", "headset", "monitor"], headset: ["keyboard", "mouse", "monitor"],
  };
  const often = (COMPL[p.category] || [])
    .map((c) => all.filter((x) => x.category === c && x.stock > 0).sort((a, b) => b.rating - a.rating)[0])
    .filter(Boolean).slice(0, 4);

  const block = (title, items) => items.length
    ? `<section class="section"><div class="section-head"><h2>${title}</h2></div><div class="product-grid reco-grid">${items.map(productCard).join("")}</div></section>` : "";

  zone.innerHTML =
    block("Compatible avec ce produit", compat) +
    block("Alternative moins chère", cheaper ? [cheaper] : []) +
    block("Alternative plus puissante", stronger ? [stronger] : []) +
    block("Souvent acheté avec", often);
  bindProductCards(zone, [...compat, ...(cheaper ? [cheaper] : []), ...(stronger ? [stronger] : []), ...often]);
}

async function viewCompare(app) {
  if (state.compare.length === 0) {
    app.innerHTML = `<div class="empty-state"><div class="big">⇄</div><h2>Comparateur vide</h2>
      <p style="margin-top:10px">Ajoutez des produits via le bouton ⇄ sur les fiches ou les cartes.</p>
      <br><a class="btn btn-primary" href="/catalogue">Voir le catalogue</a></div>`;
    return;
  }
  app.innerHTML = skeletons(4);
  // Récupère chaque produit comparé (ignore ceux devenus introuvables).
  const products = (await Promise.all(
    state.compare.map((id) => api("/products/" + id).catch(() => null))
  )).filter(Boolean);
  if (products.length === 0) {
    state.compare = []; saveCompare(); renderCompareBar();
    app.innerHTML = `<div class="empty-state"><div class="big">⇄</div><h2>Comparateur vide</h2><br><a class="btn btn-primary" href="/catalogue">Voir le catalogue</a></div>`;
    return;
  }

  // Union ordonnée des caractéristiques (clés « lisibles » commençant par une majuscule).
  const specKeys = [];
  for (const p of products)
    for (const k of Object.keys(p.specs))
      if (/^[A-ZÀ-Ü]/.test(k) && !specKeys.includes(k)) specKeys.push(k);

  const cell = (p) => `<th class="cmp-col">
      <div class="cmp-visual">${art(p.category, hueOf(p))}${imgTag(p)}</div>
      <div class="cmp-name">${esc(p.brand)} ${esc(p.name)}</div>
      <button class="cmp-remove" data-cmp-rm="${p.id}" title="Retirer">✕ retirer</button>
    </th>`;

  const row = (label, fn) =>
    `<tr><td class="cmp-label">${esc(label)}</td>${products.map((p) => `<td>${fn(p)}</td>`).join("")}</tr>`;

  // Rangée avec surbrillance de la (des) meilleure(s) valeur(s).
  // `metric(p)` → nombre comparable ; `dir` = "max" (plus grand = mieux) ou "min".
  const bestRow = (label, fn, metric, dir = "max") => {
    const vals = products.map(metric);
    const finite = vals.filter((v) => Number.isFinite(v) && v > 0);
    const best = finite.length ? (dir === "max" ? Math.max(...finite) : Math.min(...finite)) : null;
    return `<tr><td class="cmp-label">${esc(label)}</td>${products.map((p, i) => {
      const win = best !== null && vals[i] === best && finite.length > 1;
      return `<td class="${win ? "cmp-best" : ""}">${fn(p)}${win ? ` <span class="cmp-tag">★</span>` : ""}</td>`;
    }).join("")}</tr>`;
  };

  const allCompatible = products.length > 1 && products.every((p) => p.category === products[0].category);

  app.innerHTML = `
  <div class="section-head" style="margin-top:0"><h1>Comparateur</h1>
    <button class="btn btn-ghost btn-sm" id="cmpClearAll">Tout vider</button></div>
  <p style="color:var(--text-dim);margin:-8px 0 18px">Les <span class="cmp-best" style="padding:1px 7px;border-radius:6px">meilleures valeurs</span> de chaque ligne sont mises en avant.</p>
  <div class="cmp-wrap">
    <table class="cmp-table">
      <thead><tr><th class="cmp-label"></th>${products.map(cell).join("")}</tr></thead>
      <tbody>
        ${bestRow("Prix", (p) => `<strong>${fmt(p.price)}</strong>${p.old_price ? ` <small class="cmp-old">${fmt(p.old_price)}</small>` : ""}`, (p) => p.price, "min")}
        ${bestRow("Performance estimée", (p) => `<span class="perf-pill ${ratingWord(perfScore(p)).cls}">${ratingWord(perfScore(p)).word}</span>`, (p) => perfScore(p), "max")}
        ${row("Catégorie", (p) => esc(CATS[p.category]?.label || p.category))}
        ${row("Marque", (p) => esc(p.brand))}
        ${bestRow("Note", (p) => `${stars(p.rating)} <small>${p.rating.toFixed(1)} (${p.rating_count})</small>`, (p) => p.rating, "max")}
        ${bestRow("Disponibilité", (p) => p.stock > 0 ? `<span class="green">En stock</span>` : `<span style="color:var(--red)">Rupture</span>`, (p) => p.stock, "max")}
        ${allCompatible ? `<tr><td class="cmp-label">Compatibilité</td><td colspan="${products.length}" style="color:var(--text-dim)">Même catégorie (${esc(CATS[products[0].category]?.label || products[0].category)}) — interchangeables dans une configuration.</td></tr>` : ""}
        ${specKeys.map((k) => row(k, (p) => esc(p.specs[k] ?? "—"))).join("")}
        ${row("", (p) => `<button class="btn btn-primary btn-sm" data-add="${p.id}" ${p.stock <= 0 ? "disabled" : ""}>Ajouter au panier</button>`)}
      </tbody>
    </table>
  </div>`;

  indexProducts(products);
  $$("[data-cmp-rm]", app).forEach((b) => b.onclick = () => { toggleCompare(Number(b.dataset.cmpRm)); viewCompare(app); });
  $("#cmpClearAll").onclick = () => { state.compare = []; saveCompare(); renderCompareBar(); viewCompare(app); };
}

/* ─── Vue : configurateur ─── */
const BUILD_SLOTS = [
  { cat: "cpu", label: "Processeur", hint: "Le cerveau de votre machine" },
  { cat: "motherboard", label: "Carte mère", hint: "Choisie selon le socket du CPU" },
  { cat: "ram", label: "Mémoire RAM", hint: "DDR5 recommandée" },
  { cat: "gpu", label: "Carte graphique", hint: "Pour le jeu et la création" },
  { cat: "storage", label: "Stockage", hint: "SSD NVMe M.2" },
  { cat: "cooling", label: "Refroidissement", hint: "AIO ou ventirad" },
  { cat: "psu", label: "Alimentation", hint: "Dimensionnée selon la config" },
  { cat: "case", label: "Boîtier", hint: "Vérifiez la longueur GPU" },
  { cat: "fan", label: "Ventilateurs", hint: "Optionnel — flux d'air du boîtier" },
  { cat: "thermal", label: "Pâte thermique", hint: "Optionnel — souvent fournie avec le ventirad" },
  { cat: "monitor", label: "Écran", hint: "Optionnel — OLED conseillé" },
  { cat: "keyboard", label: "Clavier", hint: "Optionnel" },
  { cat: "mouse", label: "Souris", hint: "Optionnel" },
  { cat: "headset", label: "Casque", hint: "Optionnel" },
  { cat: "webcam", label: "Webcam", hint: "Optionnel — visio et streaming" },
  { cat: "microphone", label: "Microphone", hint: "Optionnel — streaming et podcast" },
  { cat: "speaker", label: "Enceintes", hint: "Optionnel" },
  { cat: "mousepad", label: "Tapis de souris", hint: "Optionnel" },
  { cat: "chair", label: "Chaise gaming", hint: "Optionnel" },
];

// Profils rapides : remplissent automatiquement une config compatible et équilibrée.
const PRESETS = [
  { id: "g800", label: "Gaming 800 €", gpu: 52, cpu: "game", ram: 16, budget: "low" },
  { id: "g1500", label: "Gaming 1500 €", gpu: 80, cpu: "game", ram: 32, budget: "mid" },
  { id: "uhd", label: "PC 4K", gpu: 100, cpu: "game", ram: 32, budget: "high" },
  { id: "stream", label: "Streaming", gpu: 76, cpu: "threads", ram: 64, budget: "high" },
  { id: "silent", label: "Silence", gpu: 72, cpu: "game", ram: 32, budget: "mid", quiet: true },
  { id: "white", label: "Blanc RGB", gpu: 80, cpu: "game", ram: 32, budget: "mid", white: true },
];

function buildChecks() {
  const b = state.build;
  const checks = [];
  const sp = (p, key) => p?.specs?.[key];

  if (b.cpu && b.motherboard) {
    const ok = sp(b.cpu, "socket") === sp(b.motherboard, "socket");
    checks.push({ level: ok ? "ok" : "err", text: ok
      ? `Socket ${sp(b.cpu, "socket")} : CPU et carte mère compatibles`
      : `Incompatible : CPU ${sp(b.cpu, "socket")} ≠ carte mère ${sp(b.motherboard, "socket")}` });
  }
  if (b.cpu && b.cooling) {
    const sockets = sp(b.cooling, "sockets") || [];
    const ok = sockets.includes(sp(b.cpu, "socket"));
    checks.push({ level: ok ? "ok" : "err", text: ok
      ? "Refroidissement compatible avec le socket CPU"
      : `Ce refroidissement ne supporte pas le socket ${sp(b.cpu, "socket")}` });
  }
  if (b.ram && b.motherboard) {
    const ok = sp(b.ram, "ram_type") === sp(b.motherboard, "ram_type");
    checks.push({ level: ok ? "ok" : "err", text: ok ? "Mémoire DDR5 compatible" : "Type de mémoire incompatible avec la carte mère" });
  }
  if (b.gpu && b.case) {
    const ok = (sp(b.gpu, "length_mm") || 0) <= (sp(b.case, "max_gpu_mm") || 999);
    checks.push({ level: ok ? "ok" : "err", text: ok
      ? `GPU (${sp(b.gpu, "length_mm")} mm) rentre dans le boîtier (max ${sp(b.case, "max_gpu_mm")} mm)`
      : `GPU trop long : ${sp(b.gpu, "length_mm")} mm > ${sp(b.case, "max_gpu_mm")} mm max` });
  }
  const watts = estimateWatts();
  if (b.psu) {
    const cap = sp(b.psu, "watts") || 0;
    const ok = cap >= watts;
    const comfy = cap >= watts * 1.2;
    checks.push({ level: ok ? (comfy ? "ok" : "warn") : "err", text: ok
      ? (comfy ? `Alimentation ${cap} W largement dimensionnée (besoin ≈ ${watts} W)` : `Alimentation ${cap} W juste suffisante (besoin ≈ ${watts} W) — prévoyez de la marge`)
      : `Alimentation insuffisante : ${cap} W < ${watts} W estimés` });
  } else if (watts > 150) {
    checks.push({ level: "warn", text: `Consommation estimée ≈ ${watts} W — choisissez une alimentation adaptée` });
  }
  return checks;
}

function estimateWatts() {
  const b = state.build;
  let w = 150; // carte mère, SSD, ventilateurs
  if (b.cpu) w += b.cpu.specs.tdp_w || 100;
  if (b.gpu) w += b.gpu.specs.tdp_w || 250;
  return w;
}

async function viewBuilder(app) {
  app.innerHTML = `
  <div class="section-head" style="margin-top:0">
    <h1>Configurateur PC</h1>
  </div>
  <p class="builder-intro">Composez votre PC vous-même — chaque étape vous explique à quoi sert la pièce et ce qui doit être compatible. Tout est vérifié automatiquement.</p>
  <div class="presets" id="presetBar">
    <span class="presets-label">Pour démarrer vite (puis ajustez)</span>
    ${PRESETS.map((p) => `<button class="preset-btn" data-preset="${p.id}">${esc(p.label)}</button>`).join("")}
    <button class="preset-btn preset-reset" data-preset="reset">Vider</button>
  </div>
  <div class="builder-grid">
    <div id="slots"></div>
    <aside id="buildSummary"></aside>
  </div>`;

  const products = await api("/products");
  const byCat = {};
  for (const p of products) (byCat[p.category] ??= []).push(p);

  // Remplissage automatique d'une configuration compatible selon un profil.
  const generateBuild = (preset) => {
    const inStock = (cat) => (byCat[cat] || []).filter((p) => p.stock > 0);
    const closest = (list, val, key) => list.length
      ? list.reduce((best, p) => Math.abs(key(p) - val) < Math.abs(key(best) - val) ? p : best) : null;
    const b = {};

    // CPU : jeu (le X3D prime, cœurs plafonnés à 8) ou multicœur (streaming/création),
    // borné par le budget du profil.
    const gameValue = (p) => specNum(p.specs["Boost"]) * 6
      + Math.min(specNum(p.specs["Cœurs"]), 8) * 4
      + (/x3d/i.test(p.name) ? 40 : 0);
    const cpuRanked = inStock("cpu").sort((a, c) => preset.cpu === "threads"
      ? specNum(c.specs["Cœurs"]) - specNum(a.specs["Cœurs"])
      : gameValue(c) - gameValue(a));
    const cpuCeil = preset.budget === "low" ? 300 : preset.budget === "mid" ? 480 : Infinity;
    b.cpu = cpuRanked.find((p) => p.price <= cpuCeil) || cpuRanked[0];

    if (b.cpu) {
      let mobos = inStock("motherboard").filter((p) => p.specs.socket === b.cpu.specs.socket);
      if (!mobos.length) mobos = inStock("motherboard");
      mobos.sort((a, c) => a.price - c.price);
      b.motherboard = preset.budget === "high" ? mobos[mobos.length - 1] : mobos[Math.floor(mobos.length / 2)] || mobos[0];
    }
    if (b.motherboard) {
      let rams = inStock("ram").filter((p) => p.specs.ram_type === b.motherboard.specs.ram_type);
      if (!rams.length) rams = inStock("ram");
      b.ram = closest(rams, preset.ram, (p) => specNum(p.specs["Capacité"]));
    }

    let gpus = inStock("gpu");
    if (preset.white) { const w = gpus.filter((p) => /white|blanc|snow/i.test(p.name)); if (w.length) gpus = w; }
    b.gpu = closest(gpus, preset.gpu, gpuTier);

    if (b.cpu) {
      let cool = inStock("cooling").filter((p) => (p.specs.sockets || []).includes(b.cpu.specs.socket));
      if (!cool.length) cool = inStock("cooling");
      if (preset.quiet) { const aio = cool.filter((p) => /aio|360|liquid|freezer/i.test(`${p.name} ${JSON.stringify(p.specs)}`)); if (aio.length) cool = aio; }
      cool.sort((a, c) => c.price - a.price);
      b.cooling = preset.budget === "low" ? cool[cool.length - 1] : cool[0];
    }

    const len = b.gpu ? (specNum(b.gpu.specs["Longueur"]) || b.gpu.specs.length_mm || 0) : 0;
    let cases = inStock("case").filter((p) => (p.specs.max_gpu_mm || specNum(p.specs["GPU max"]) || 999) >= len);
    if (!cases.length) cases = inStock("case");
    if (preset.white) { const w = cases.filter((p) => /white|blanc|snow/i.test(p.name)); if (w.length) cases = w; }
    if (preset.quiet) { const q = cases.filter((p) => /silent|silence|define|quiet/i.test(p.name)); if (q.length) cases = q; }
    b.case = cases[0];

    state.build = b; // estimateWatts() lit state.build
    const need = estimateWatts();
    let psus = inStock("psu").filter((p) => (p.specs.watts || specNum(p.specs["Puissance"])) >= need);
    if (!psus.length) psus = inStock("psu");
    psus.sort((a, c) => (a.specs.watts || 0) - (c.specs.watts || 0));
    // Plus petite alim offrant une marge confortable (≥ 1,25×) → ni juste, ni surdimensionnée.
    const comfy = psus.filter((p) => (p.specs.watts || specNum(p.specs["Puissance"])) >= need * 1.25);
    const pool = comfy.length ? comfy : psus;
    b.psu = preset.quiet
      ? (pool.find((p) => /platinum|titanium/i.test(p.specs["Certification"] || "")) || pool[0])
      : pool[0];

    let st = inStock("storage").sort((a, c) => a.price - c.price);
    b.storage = preset.budget === "high" ? st[st.length - 1] : st[Math.floor(st.length / 2)] || st[0];

    // Retire les emplacements non pourvus.
    for (const k of Object.keys(b)) if (!b[k]) delete b[k];
    return b;
  };

  const applyPreset = (preset) => {
    state.build = generateBuild(preset);
    renderSlots();
    window.scrollTo({ top: 0, behavior: "smooth" });
    toast(`Profil « ${preset.label} » chargé — ajustez à votre guise`);
  };

  const renderSlots = () => {
    $("#slots").innerHTML = BUILD_SLOTS.map((slot) => {
      const sel = state.build[slot.cat];
      return `
      <div class="builder-slot ${sel ? "filled" : ""}">
        <div class="builder-slot-icon" style="width:52px;height:52px">${art(slot.cat, 30)}</div>
        <div class="builder-slot-main">
          <h3>${slot.label}</h3>
          <p>${sel ? `${esc(sel.brand)} ${esc(sel.name)}` : esc(slotGuide(slot.cat))}</p>
        </div>
        ${sel ? `<span class="price">${fmt(sel.price)}</span>` : ""}
        <button class="btn ${sel ? "btn-ghost" : "btn-primary"} btn-sm" data-pick="${slot.cat}">${sel ? "Changer" : "Choisir"}</button>
        ${sel ? `<button class="icon-btn" data-unpick="${slot.cat}" title="Retirer" style="padding:8px 11px">✕</button>` : ""}
      </div>`;
    }).join("");

    // Câblage des emplacements (toujours présents).
    $$("[data-pick]").forEach((b) => b.onclick = () => openPicker(b.dataset.pick));
    $$("[data-unpick]").forEach((b) => b.onclick = () => { delete state.build[b.dataset.unpick]; renderSlots(); });

    const total = Object.values(state.build).reduce((s, p) => s + p.price, 0);
    const required = BUILD_SLOTS.filter((s) => !/Optionnel/i.test(s.hint)).map((s) => s.cat);
    const filledReq = required.filter((c) => state.build[c]).length;
    const sumEl = $("#buildSummary");
    if (!sumEl) return;

    // Récapitulatif complet UNIQUEMENT quand tous les composants essentiels sont choisis.
    if (filledReq < required.length) {
      const pct = Math.round(filledReq / required.length * 100);
      sumEl.className = "builder-summary panel";
      sumEl.innerHTML = `
        <h2>Ma configuration</h2>
        <div class="cart-totals"><div class="row total"><span>Total</span><span>${fmt(total)}</span></div></div>
        <div class="build-steps">
          <div class="row"><span><strong>${filledReq}</strong> / ${required.length} composants essentiels</span><span>${pct} %</span></div>
          <div class="watt-bar"><div style="width:${pct}%"></div></div>
        </div>
        <p class="builder-progress-hint">Encore ${required.length - filledReq} à choisir, puis vous pourrez ajouter la configuration au panier.</p>
        <button class="btn btn-primary btn-block" disabled>Sélectionnez les essentiels</button>`;
      return;
    }

    const count = Object.keys(state.build).length;
    const checks = buildChecks();
    const watts = estimateWatts();
    const psuW = state.build.psu?.specs?.watts || 0;
    const hasError = checks.some((c) => c.level === "err");
    const scores = usageScores(state.build);
    const imbalances = buildImbalances(state.build);

    sumEl.className = "builder-summary panel";
    sumEl.innerHTML = `
      <h2>Ma configuration</h2>
      <div class="cart-totals">
        <div class="row"><span>${count} / ${BUILD_SLOTS.length} composants</span><span></span></div>
        <div class="row total"><span>Total</span><span>${fmt(total)}</span></div>
      </div>
      ${scores.length ? `<div class="usage-scores">
        <h3>Score par usage</h3>
        ${scores.map((s) => { const r = ratingWord(s.score); return `<div class="usage-row"><span class="usage-name">${s.label}</span><span class="score-track"><b class="${r.cls}" style="width:${s.score}%"></b></span><span class="usage-word ${r.cls}">${r.word}</span></div>`; }).join("")}
      </div>` : ""}
      ${imbalances.length ? `<div class="compat">${imbalances.map((t) => `<div class="compat-item warn"><span>⚠</span><span>${t}</span></div>`).join("")}</div>` : ""}
      <div class="compat">
        ${checks.map((c) => `<div class="compat-item ${c.level}"><span>${c.level === "ok" ? "✓" : c.level === "warn" ? "⚠" : "✕"}</span><span>${c.text}</span></div>`).join("")}
      </div>
      <div class="watt-label">Consommation estimée : <strong>${watts} W</strong>${psuW ? ` / ${psuW} W` : ""}</div>
      <div class="watt-bar"><div style="width:${psuW ? Math.min(100, watts / psuW * 100) : Math.min(100, watts / 10)}%"></div></div>
      <br>
      <button class="btn btn-primary btn-block" id="buildToCart" ${hasError ? "disabled" : ""}>
        ${hasError ? "Corrigez les incompatibilités" : "Ajouter la config au panier"}
      </button>`;
    const toCart = $("#buildToCart");
    if (toCart) toCart.onclick = commitBuildToCart;
  };

  const isCompatible = (cat, p) => {
    const b = state.build;
    if (cat === "motherboard") {
      if (b.cpu && p.specs.socket !== b.cpu.specs.socket) return false;
      if (b.ram && p.specs.ram_type !== b.ram.specs.ram_type) return false;
      return true;
    }
    if (cat === "cpu" && b.motherboard) return p.specs.socket === b.motherboard.specs.socket;
    if (cat === "ram" && b.motherboard) return p.specs.ram_type === b.motherboard.specs.ram_type;
    if (cat === "cooling" && b.cpu) return (p.specs.sockets || []).includes(b.cpu.specs.socket);
    if (cat === "case" && b.gpu) return (b.gpu.specs.length_mm || 0) <= (p.specs.max_gpu_mm || 999);
    if (cat === "gpu" && b.case) return (p.specs.length_mm || 0) <= (b.case.specs.max_gpu_mm || 999);
    if (cat === "psu") return (p.specs.watts || 0) >= estimateWatts();
    return true;
  };

  const openPicker = (cat) => {
    // On n'affiche QUE les composants compatibles avec la sélection actuelle.
    const compatList = (byCat[cat] || []).filter((p) => isCompatible(cat, p));
    const filters = SPEC_FILTERS[cat] || [];
    const active = {}; // { filterKey: valeur sélectionnée }

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    document.body.appendChild(overlay);
    const close = () => overlay.remove();

    const render = () => {
      // Options de chaque filtre, calculées sur la liste compatible.
      const chipBar = filters.map((f) => {
        const opts = [...new Set(compatList.map(f.fn).filter(Boolean))].sort(specOptSort);
        if (opts.length < 2) return ""; // un seul choix → pas de filtre utile
        return `<div class="picker-filter"><span>${f.label}</span><div class="picker-chips">
          ${opts.map((o) => `<button class="picker-chip ${active[f.key] === o ? "on" : ""}" data-fk="${f.key}" data-fv="${esc(o)}">${esc(o)}</button>`).join("")}
        </div></div>`;
      }).join("");

      // Application des filtres techniques actifs.
      const list = compatList.filter((p) => filters.every((f) => !active[f.key] || f.fn(p) === active[f.key]));

      // Tri automatique pour se repérer : regroupé par marque, puis du plus haut
      // au plus bas de gamme (prix décroissant ; à prix égal, n° de modèle
      // décroissant — ex. Intel → i9, i7, i5 14400 puis 12400). Les marques sont
      // ordonnées par leur modèle le plus haut de gamme.
      // Clé de regroupement : pour les GPU, le fabricant de puce (NVIDIA / AMD /
      // Intel) déduit du nom ; pour le reste, la marque (assembleur / fabricant).
      const groupOf = (p) => {
        if (cat === "gpu") {
          const t = String(p.name).toLowerCase();
          if (/geforce|\brtx\b|\bgtx\b/.test(t)) return "NVIDIA";
          if (/radeon|\brx\b/.test(t)) return "AMD";
          if (/\barc\b/.test(t)) return "Intel";
        }
        return p.brand || "Autres";
      };
      const groups = {};
      for (const p of list) (groups[groupOf(p)] ??= []).push(p);
      for (const g of Object.values(groups)) {
        g.sort((a, b) => b.price - a.price || String(b.name).localeCompare(String(a.name), "fr", { numeric: true }));
      }
      const brandOrder = Object.keys(groups).sort((a, b) =>
        Math.max(...groups[b].map((p) => p.price)) - Math.max(...groups[a].map((p) => p.price)) || a.localeCompare(b, "fr"));

      const itemHtml = (p) => `
              <div class="picker-row">
                <button class="picker-item" data-id="${p.id}">
                  <div class="picker-visual">${art(p.category, hueOf(p))}${imgTag(p)}</div>
                  <div class="picker-item-info">
                    <strong>${esc(p.brand)} ${esc(p.name)}</strong>
                    <span>${stockHtml(p.stock).replace(/<[^>]+>/g, "")}</span>
                  </div>
                  <span class="price" style="font-size:.95rem">${fmt(p.price)}</span>
                </button>
                <a class="picker-detail" href="/produit/${p.id}" title="Voir la fiche complète">Détail</a>
              </div>`;
      const listHtml = brandOrder.map((b) =>
        `<div class="picker-group">${esc(b)}</div>${groups[b].map(itemHtml).join("")}`).join("");

      overlay.innerHTML = `
        <div class="modal wide">
          <button class="modal-close">✕</button>
          <h2 style="font-size:1.2rem">Choisir : ${CATS[cat].label}<span class="picker-count">${list.length} dispo${list.length > 1 ? "s" : ""}</span></h2>
          ${CATEGORY_TIP[cat] ? `<p class="picker-tip"><b>Conseil.</b> ${CATEGORY_TIP[cat]}</p>` : ""}
          ${chipBar ? `<div class="picker-filters">${chipBar}</div>` : ""}
          <div class="picker-list">
            ${list.length ? listHtml
            : `<p class="picker-empty">${compatList.length ? "Aucun résultat avec ces filtres — élargissez votre choix." : "Aucun composant compatible avec votre sélection actuelle."}</p>`}
          </div>
        </div>`;

      $(".modal-close", overlay).onclick = close;
      $$("[data-fk]", overlay).forEach((chip) => chip.onclick = () => {
        const k = chip.dataset.fk, v = chip.dataset.fv;
        active[k] = active[k] === v ? undefined : v; // re-clic = désélection
        render();
      });
      // « Détail » → ferme le picker ; le routeur SPA gère la navigation du lien.
      $$(".picker-detail", overlay).forEach((a) => a.onclick = () => close());
      $$(".picker-item", overlay).forEach((item) => item.onclick = () => {
        const p = compatList.find((x) => x.id === Number(item.dataset.id));
        state.build[cat] = p;
        close();
        renderSlots();
      });
    };

    overlay.onclick = (e) => { if (e.target === overlay) close(); };
    render();
  };

  // Ajoute toute la configuration courante au panier.
  const commitBuildToCart = () => {
    if (!state.user) {
      requireAuth(() => commitBuildToCart());
      toast("Connectez-vous pour enregistrer cette configuration sur votre compte", "info");
      return;
    }
    for (const p of Object.values(state.build)) {
      const line = state.cart.find((i) => i.id === p.id);
      if (line) line.qty += 1;
      else state.cart.push({ id: p.id, name: p.name, brand: p.brand, category: p.category, price: p.price, stock: p.stock, qty: 1 });
    }
    saveCart();
    renderCartDrawer();
    toast("Configuration ajoutée au panier");
    openCart();
  };

  // Ce qu'est chaque pièce, en une phrase simple (affichée sous l'emplacement vide).
  const SLOT_HELP = {
    cpu: "Le cerveau du PC : il exécute tout. Pour le jeu, visez la fréquence ; pour la création, plus de cœurs.",
    motherboard: "La base qui relie tous les composants. Son socket doit correspondre au processeur.",
    ram: "La mémoire vive : 16 Go pour jouer, 32 Go pour la création.",
    gpu: "La carte graphique : elle calcule les images des jeux — le poste le plus important pour jouer.",
    storage: "Un SSD pour Windows, vos jeux et fichiers. 1 To confortable, 2 To si beaucoup de jeux.",
    cooling: "Garde le processeur au frais et silencieux. Doit supporter le socket du CPU.",
    psu: "L'alimentation : fournit un courant stable et sûr. À dimensionner selon la config.",
    case: "La tour qui accueille et ventile les composants. Doit être assez grande pour le GPU.",
    fan: "Optionnel : ajoute du flux d'air dans le boîtier.",
    thermal: "Optionnel : améliore le transfert de chaleur (souvent déjà fournie avec le refroidissement).",
    monitor: "Optionnel : l'écran. 1440p pour le jeu, 4K pour l'image.",
    keyboard: "Optionnel : le clavier.", mouse: "Optionnel : la souris.", headset: "Optionnel : le casque.",
    webcam: "Optionnel : pour la visio et le streaming.", microphone: "Optionnel : pour le streaming et le podcast.",
    speaker: "Optionnel : les enceintes.", mousepad: "Optionnel : le tapis de souris.", chair: "Optionnel : le confort sur la durée.",
  };

  // Astuce affichée en haut du sélecteur « Choisir ».
  const CATEGORY_TIP = {
    cpu: "Les modèles « X3D » sont top pour le jeu ; plus de cœurs = mieux pour la création/streaming.",
    motherboard: "Déjà filtrée sur le socket de votre processeur. Le chipset (B / X) change surtout les options et le prix.",
    ram: "Prenez le même type (DDR4/DDR5) que votre carte mère. Deux barrettes valent mieux qu'une.",
    gpu: "Plus de mémoire vidéo et un modèle récent = plus haute résolution et meilleure fluidité.",
    storage: "Un SSD NVMe (M.2) est le plus rapide. La capacité dépend du nombre de jeux installés.",
    cooling: "Un bon ventirad suffit dans la plupart des cas ; un watercooling (AIO) pour les CPU puissants.",
    psu: "Visez environ 25 % de marge. Une certification 80+ Gold = bon rendement et silence.",
    case: "Vérifiez qu'il peut accueillir la longueur de votre carte graphique.",
    monitor: "144 Hz et plus pour le jeu rapide ; 4K pour l'image et la création.",
  };

  // Indication contextuelle sous chaque emplacement : compatibilité expliquée en clair.
  const slotGuide = (cat) => {
    const b = state.build;
    if (cat === "motherboard" && b.cpu) return `À prendre en socket ${b.cpu.specs.socket} (celui de votre processeur).`;
    if (cat === "ram" && b.motherboard) return `Mémoire ${b.motherboard.specs.ram_type} requise par votre carte mère.`;
    if (cat === "cooling" && b.cpu) return `Doit supporter le socket ${b.cpu.specs.socket} de votre processeur.`;
    if (cat === "case" && b.gpu) return `Doit accueillir un GPU de ${b.gpu.specs.length_mm || "?"} mm.`;
    if (cat === "gpu" && b.case) return `Maximum ${b.case.specs.max_gpu_mm || "?"} mm pour tenir dans votre boîtier.`;
    if (cat === "psu" && (b.cpu || b.gpu)) return `Visez ≥ ${Math.round(estimateWatts() * 1.25)} W pour une marge confortable.`;
    return SLOT_HELP[cat] || "";
  };

  $$("[data-preset]").forEach((btn) => btn.onclick = () => {
    if (btn.dataset.preset === "reset") { state.build = {}; renderSlots(); return; }
    applyPreset(PRESETS.find((p) => p.id === btn.dataset.preset));
  });

  renderSlots();
}

/* ─── Vue : checkout ─── */
async function viewCheckout(app) {
  if (!state.user) { go("/"); openAuth(); return; }
  if (state.cart.length === 0) {
    app.innerHTML = `<div class="empty-state"><h2>Votre panier est vide</h2><br><a class="btn btn-primary" href="/catalogue">Voir le catalogue</a></div>`;
    return;
  }
  const t = cartTotals();
  const checkoutRenderToken = currentRenderToken;
  let addresses = [];
  let formTouched = false;

  const fillAddress = (form, a) => {
    if (!form || !a) return;
    form.ship_name.value = a.ship_name;
    form.ship_address.value = a.ship_address;
    form.ship_city.value = a.ship_city;
    form.ship_zip.value = a.ship_zip;
  };

  app.innerHTML = `
  <h1 style="margin-bottom:24px">Finaliser ma commande</h1>
  <div class="checkout-layout">
    <form class="panel" id="checkoutForm">
      <h2>Adresse de livraison</h2>
      <div class="form-grid">
        <label class="full" id="addrPickerWrap">Adresse enregistrée
          <select id="addrPicker" disabled>
            <option value="">Chargement des adresses...</option>
          </select>
        </label>
        <label class="full">Nom complet<input name="ship_name" required minlength="2" autocomplete="name" value="${esc(state.user.name)}"></label>
        <label class="full">Adresse<input name="ship_address" required minlength="4" autocomplete="street-address" placeholder="12 rue de la Paix"></label>
        <label>Ville<input name="ship_city" required minlength="2" autocomplete="address-level2" placeholder="Paris"></label>
        <label>Code postal<input name="ship_zip" required minlength="4" autocomplete="postal-code" placeholder="75001"></label>
        <label class="full" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" id="saveAddr" style="width:auto"> Enregistrer cette adresse dans Mon compte &gt; Adresses</label>
      </div>
      <br>
      <h2>Paiement</h2>
      <p style="color:var(--text-dim);font-size:.85rem;margin:4px 0 12px">
        Vous serez redirigé vers la page de paiement sécurisée <strong>Stripe</strong>.
        Vos coordonnées bancaires ne transitent jamais par nos serveurs.</p>
      <p style="color:var(--text-faint);font-size:.78rem">Carte de test : <code>4242 4242 4242 4242</code> · date future · CVC libre.</p>
      <label class="legal-consent">
        <input type="checkbox" name="legal_accept" required>
        <span>J'accepte les <a href="/cgv">CGV</a>, la <a href="/confidentialite">politique de confidentialité</a> et les conditions de <a href="/retours-remboursements">retour/remboursement</a>.</span>
      </label>
      <br>
      <button class="btn btn-primary btn-block" type="submit">Continuer vers le paiement sécurisé ${fmt(t.total)} →</button>
    </form>
    <div class="panel">
      <h2>Récapitulatif</h2>
      ${state.cart.map((i) => `<div class="summary-line"><span>${i.qty} × ${esc(i.name)}</span><span>${fmt(i.price * i.qty)}</span></div>`).join("")}
      ${t.discount ? `<div class="summary-line"><span>Code ${esc(state.promo.code)}</span><span style="color:var(--green)">−${fmt(t.discount)}</span></div>` : ""}
      <div class="summary-line"><span>Livraison</span><span>${t.shipping ? fmt(t.shipping) : "Offerte"}</span></div>
      <div class="summary-line"><span>Total</span><span>${fmt(t.total)}</span></div>
      ${trustStrip()}
    </div>
  </div>`;

  const form = $("#checkoutForm");
  const picker = $("#addrPicker");
  const saveAddr = $("#saveAddr");
  ["ship_name", "ship_address", "ship_city", "ship_zip"].forEach((name) => {
    form[name].addEventListener("input", () => { formTouched = true; }, { once: true });
  });

  const renderAddressPicker = (list) => {
    if (isStaleRender(checkoutRenderToken, app)) return;
    addresses = Array.isArray(list) ? list : [];
    if (!picker) return;
    picker.disabled = false;
    if (!addresses.length) {
      picker.innerHTML = `<option value="">Aucune adresse enregistrée</option>`;
      if (saveAddr) saveAddr.checked = true;
      return;
    }
    if (saveAddr) saveAddr.checked = false;
    picker.innerHTML = `
      <option value="">— Nouvelle adresse —</option>
      ${addresses.map((a) => `<option value="${a.id}">${esc(a.label || a.ship_name)} — ${esc(a.ship_address)}, ${esc(a.ship_zip)} ${esc(a.ship_city)}</option>`).join("")}`;
    const def = addresses.find((a) => a.is_default) || addresses[0];
    picker.value = String(def.id);
    if (!formTouched) fillAddress(form, def);
  };

  if (picker) picker.onchange = () => {
    const a = addresses.find((x) => String(x.id) === picker.value);
    if (a) {
      if (saveAddr) saveAddr.checked = false;
      fillAddress(form, a);
    } else {
      form.ship_name.value = state.user.name || "";
      form.ship_address.value = "";
      form.ship_city.value = "";
      form.ship_zip.value = "";
      if (saveAddr) saveAddr.checked = true;
    }
  };

  api("/addresses").then(renderAddressPicker).catch(() => {
    if (isStaleRender(checkoutRenderToken, app) || !picker) return;
    picker.innerHTML = `<option value="">Adresses indisponibles</option>`;
  });

  form.onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const btn = $("button[type=submit]", e.target);
    btn.disabled = true;
    btn.textContent = "Redirection vers le paiement…";
    try {
      // On n'envoie QUE les identifiants + quantités : le serveur recalcule
      // tous les prix. Aucun montant n'est transmis depuis le navigateur.
      const { url } = await api("/create-checkout-session", {
        method: "POST",
        body: JSON.stringify({
          items: state.cart.map((i) => ({ product_id: i.id, quantity: i.qty })),
          promo_code: state.promo?.code || null,
          ship_name: f.get("ship_name"),
          ship_address: f.get("ship_address"),
          ship_city: f.get("ship_city"),
          ship_zip: f.get("ship_zip"),
          save_address: Boolean($("#saveAddr")?.checked),
        }),
      });
      // Redirection vers la page de paiement hébergée par Stripe.
      window.location.href = url;
    } catch (err) {
      toast(err.message, "error");
      btn.disabled = false;
      btn.textContent = `Continuer vers le paiement sécurisé ${fmt(t.total)} →`;
    }
  };
}

/* ─── Vue : retour de paiement réussi (Stripe → success_url) ─── */
async function viewPaymentSuccess(app, params) {
  const sessionId = params.get("session_id");
  const returnToken = params.get("return_token") || "";
  const ordersUrl = "/compte?tab=orders";
  app.innerHTML = `<div class="empty-state"><div class="big">⏳</div><h2>Vérification du paiement…</h2></div>`;
  try {
    await restoreSessionAndCart({ syncCart: false, clearOnFail: false });
    // On confirme l'état réel auprès du serveur (qui interroge Stripe).
    const qs = new URLSearchParams({ session_id: sessionId || "" });
    if (returnToken) qs.set("return_token", returnToken);
    const res = await api("/checkout/status?" + qs.toString(), {
      preserveAuthOn401: true,
    });
    if (res.payment_status !== "paid") throw new Error("Paiement non confirmé");
    await restoreSessionAndCart({ syncCart: false, clearOnFail: false });
    // Paiement validé : on vide le panier local.
    state.cart = [];
    state.promo = null;
    saveCart();
    savePromo();
    refreshCartDrawer();
    app.innerHTML = `
      <div class="empty-state">
        <h2>Commande n°${res.order_id} confirmée !</h2>
        <p style="margin-top:10px">Paiement reçu — total réglé : <strong>${fmt(res.amount_total)}</strong>.<br>Redirection vers vos commandes...</p>
        <br>
        <a class="btn btn-primary" href="${ordersUrl}">Voir mes commandes</a>
        &nbsp;<a class="btn btn-ghost" href="/catalogue">Continuer mes achats</a>
      </div>`;
    setTimeout(() => {
      const current = parsePath();
      if (current.path === "commande/succes" && current.params.get("session_id") === sessionId) {
        go(ordersUrl, { force: true });
      }
    }, 800);
  } catch (err) {
    app.innerHTML = `
      <div class="empty-state">
        <div class="big">⚠️</div>
        <h2>Paiement non confirmé</h2>
        <p style="margin-top:10px">${esc(err.message)}. Si vous avez été débité, votre commande sera validée automatiquement sous peu.</p>
        <br><a class="btn btn-primary" href="${ordersUrl}">Voir mes commandes</a>
      </div>`;
  }
  window.scrollTo({ top: 0 });
}

/* ─── Vue : paiement annulé (Stripe → cancel_url) ─── */
function viewPaymentCancelled(app) {
  app.innerHTML = `
    <div class="empty-state">
      <h2>Paiement annulé</h2>
      <p style="margin-top:10px">Aucun montant n'a été débité. Votre panier est toujours disponible.</p>
      <br>
      <a class="btn btn-primary" href="/commande">Reprendre le paiement</a>
      &nbsp;<a class="btn btn-ghost" href="/catalogue">Continuer mes achats</a>
    </div>`;
  window.scrollTo({ top: 0 });
}

/* ─── Vue : compte ─── */
async function viewAccount(app, params) {
  const requestedTab = params?.get("tab") || "orders";
  if (!state.user) {
    app.innerHTML = `<div class="empty-state"><div class="big">⏳</div><h2>Connexion au compte...</h2></div>`;
    const restored = await restoreSessionAndCart({ syncCart: false });
    if (!restored || !state.user) {
      state.afterLogin = () => go(`/compte?tab=${encodeURIComponent(requestedTab)}`, { force: true });
      openAuth();
      app.innerHTML = `
        <div class="empty-state">
          <h2>Connectez-vous pour voir votre compte</h2>
          <br><button class="btn btn-primary" id="accountLoginBtn">Se connecter</button>
        </div>`;
      $("#accountLoginBtn", app).onclick = openAuth;
      return;
    }
  }
  // Rafraîchit le profil (notamment le statut admin) pour les sessions déjà
  // ouvertes avant l'ajout de cette fonctionnalité.
  try {
    const me = await api("/auth/me");
    state.user = { ...state.user, ...me };
    saveAuth();
  } catch { /* token invalide : géré par api() */ }

  const adminLink = state.user.is_admin
    ? `<a class="btn btn-primary btn-sm" style="color:var(--on-primary)" href="/admin">️ Espace admin</a>` : "";

  app.innerHTML = `
  <div class="section-head" style="margin-top:0">
    <h1>Bonjour, ${esc(state.user.name)}</h1>
    <div style="display:flex;gap:8px">${adminLink}<button class="btn btn-ghost btn-sm" id="logoutBtn">Se déconnecter</button></div>
  </div>
  <p style="color:var(--text-dim);margin-bottom:22px">${esc(state.user.email)}</p>
  <div class="account-tabs" id="accountTabs">
    <button class="account-tab active" data-tab="orders">Commandes</button>
    <button class="account-tab" data-tab="favorites">Favoris</button>
    <button class="account-tab" data-tab="addresses">Adresses</button>
    <button class="account-tab" data-tab="profile">Profil</button>
  </div>
  <div id="accountPanel"><div class="skeleton" style="min-height:110px"></div></div>`;

  $("#logoutBtn").onclick = logout;

  const panel = $("#accountPanel");
  const tabs = {
    orders: () => renderAccountOrders(panel),
    favorites: () => renderAccountFavorites(panel),
    addresses: () => renderAccountAddresses(panel),
    profile: () => renderAccountProfile(panel),
  };
  $$(".account-tab").forEach((tab) => tab.onclick = () => {
    $$(".account-tab").forEach((t) => t.classList.toggle("active", t === tab));
    tabs[tab.dataset.tab]();
  });
  // Onglet initial (permet le lien profond #/compte?tab=addresses).
  const initial = requestedTab;
  const startTab = tabs[initial] ? initial : "orders";
  $$(".account-tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === startTab));
  tabs[startTab]();
}

/* ─── Compte : message d'erreur d'un panneau (évite le squelette figé) ─── */
// Si un chargement échoue (token expiré → 401, réseau, serveur), on remplace le
// squelette par un message clair + un bouton « Réessayer », au lieu de laisser
// l'utilisateur devant un panneau vide indéfiniment.
function renderPanelError(panel, retry) {
  const reauth = !state.token; // api() vide le token sur 401 : session expirée.
  panel.innerHTML = `<div class="empty-state">
      <div class="big">⚠️</div>
      <p>${reauth ? "Votre session a expiré. Reconnectez-vous pour voir vos données." : "Impossible de charger ces informations pour le moment."}</p><br>
      <button class="btn btn-primary" id="panelRetry">${reauth ? "Se reconnecter" : "Réessayer"}</button>
    </div>`;
  $("#panelRetry", panel).onclick = () => (reauth ? (go("/"), openAuth()) : retry());
}

/* ─── Compte : commandes (avec annulation) ─── */
async function renderAccountOrders(panel) {
  panel.innerHTML = `<div class="skeleton" style="min-height:110px"></div>`;
  let orders;
  try { orders = await api("/orders"); }
  catch { return renderPanelError(panel, () => renderAccountOrders(panel)); }
  const cancellable = new Set(["en attente de paiement", "payée", "préparée"]);
  panel.innerHTML = orders.length
    ? orders.map((o) => `
      <div class="order-card">
        <div class="order-head">
          <h3>Commande n°${o.id} — ${new Date(o.created_at * 1000).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</h3>
          ${statusBadge(o.status)}
        </div>
        <div class="order-items">
          ${o.items.map((i) => `${i.quantity} × ${esc(i.product_name)} — ${fmt(i.unit_price * i.quantity)}`).join("<br>")}
        </div>
        <div class="order-total">Total : ${fmt(o.total)}${o.discount ? ` <small style="color:var(--green);font-weight:400">(dont −${fmt(o.discount)} de remise)</small>` : ""}</div>
        ${orderProgress(o)}
        <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">
          ${o.status !== "en attente de paiement" ? `<button class="btn btn-ghost btn-sm" onclick="downloadInvoice(${o.id})">Télécharger la facture</button>` : ""}
          ${cancellable.has(o.status) ? `<button class="btn btn-ghost btn-sm order-cancel" data-cancel="${o.id}" style="color:var(--red)">Annuler la commande</button>` : ""}
        </div>
      </div>`).join("")
    : `<div class="empty-state"><p>Aucune commande pour le moment.</p><br><a class="btn btn-primary" href="/catalogue">Découvrir le catalogue</a></div>`;

  $$("[data-cancel]", panel).forEach((btn) => btn.onclick = async () => {
    if (!confirm("Annuler cette commande ? Le stock sera restitué.")) return;
    btn.disabled = true;
    try {
      const res = await api(`/orders/${btn.dataset.cancel}/cancel`, { method: "POST" });
      toast(res.refund_pending ? "Commande annulée — remboursement en cours de traitement" : "Commande annulée");
      renderAccountOrders(panel);
    } catch (e) { toast(e.message, "error"); btn.disabled = false; }
  });
}

/* ─── Compte : favoris ─── */
async function renderAccountFavorites(panel) {
  panel.innerHTML = skeletons(4);
  let favs;
  try { favs = await api("/favorites"); }
  catch { return renderPanelError(panel, () => renderAccountFavorites(panel)); }
  state.favorites = new Set(favs.map((p) => p.id));
  panel.innerHTML = favs.length
    ? `<div class="product-grid">${favs.map(productCard).join("")}</div>`
    : `<div class="empty-state"><div class="big">♡</div><p>Aucun favori pour le moment.</p><br><a class="btn btn-primary" href="/catalogue">Parcourir le catalogue</a></div>`;
  bindProductCards(panel, favs);
}

/* ─── Compte : carnet d'adresses ─── */
async function renderAccountAddresses(panel) {
  panel.innerHTML = `<div class="skeleton" style="min-height:110px"></div>`;
  let addresses;
  try { addresses = await api("/addresses"); }
  catch { return renderPanelError(panel, () => renderAccountAddresses(panel)); }
  panel.innerHTML = `
    ${addresses.length ? addresses.map((a) => `
      <div class="order-card" style="display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap">
        <div>
          <strong>${esc(a.label || a.ship_name)}</strong>${a.is_default ? ` <span class="verified-badge">Par défaut</span>` : ""}<br>
          <span style="color:var(--text-dim)">${esc(a.ship_name)} — ${esc(a.ship_address)}, ${esc(a.ship_zip)} ${esc(a.ship_city)}</span>
        </div>
        <button class="btn btn-ghost btn-sm" data-addr-del="${a.id}" style="color:var(--red)">Supprimer</button>
      </div>`).join("") : `<p style="color:var(--text-dim);margin-bottom:16px">Aucune adresse enregistrée.</p>`}
    <details class="panel" style="margin-top:16px">
      <summary style="cursor:pointer;font-weight:600">+ Ajouter une adresse</summary>
      <form id="addrForm" class="form-grid" style="margin-top:16px">
        <label class="full">Libellé (optionnel)<input name="label" placeholder="Domicile, Bureau…"></label>
        <label class="full">Nom complet<input name="ship_name" required minlength="2" value="${esc(state.user.name)}"></label>
        <label class="full">Adresse<input name="ship_address" required minlength="4"></label>
        <label>Ville<input name="ship_city" required minlength="2"></label>
        <label>Code postal<input name="ship_zip" required minlength="4"></label>
        <label class="full" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" name="is_default" style="width:auto"> Définir comme adresse par défaut</label>
        <button class="btn btn-primary full" type="submit" style="color:var(--on-primary)">Enregistrer</button>
      </form>
    </details>`;

  $$("[data-addr-del]", panel).forEach((btn) => btn.onclick = async () => {
    if (!confirm("Supprimer cette adresse ?")) return;
    try { await api(`/addresses/${btn.dataset.addrDel}`, { method: "DELETE" }); toast("Adresse supprimée"); renderAccountAddresses(panel); }
    catch (e) { toast(e.message, "error"); }
  });
  $("#addrForm").onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const btn = $("button[type=submit]", e.target);
    btn.disabled = true;
    try {
      await api("/addresses", { method: "POST", body: JSON.stringify({
        label: f.get("label") || null, ship_name: f.get("ship_name"),
        ship_address: f.get("ship_address"), ship_city: f.get("ship_city"),
        ship_zip: f.get("ship_zip"), is_default: f.get("is_default") === "on",
      }) });
      toast("Adresse enregistrée ✔");
      renderAccountAddresses(panel);
    } catch (err) { toast(err.message, "error"); btn.disabled = false; }
  };
}

/* ─── Compte : profil + mot de passe ─── */
function renderAccountProfile(panel) {
  panel.innerHTML = `
    <div class="panel" style="margin-bottom:18px">
      <h2 style="margin-bottom:14px">Mes informations</h2>
      <form id="profileForm" class="form-grid">
        <label class="full">Nom affiché<input name="name" required minlength="2" value="${esc(state.user.name)}"></label>
        <label class="full">E-mail<input value="${esc(state.user.email)}" disabled style="opacity:.6"></label>
        <button class="btn btn-primary" type="submit" style="color:var(--on-primary);align-self:flex-start">Enregistrer</button>
      </form>
    </div>
    <div class="panel">
      <h2 style="margin-bottom:14px">Changer mon mot de passe</h2>
      <form id="passwordForm" class="form-grid">
        <label class="full">Mot de passe actuel<input name="current_password" type="password" required></label>
        <label class="full">Nouveau mot de passe<input name="new_password" type="password" required minlength="8" placeholder="8 caractères minimum"></label>
        <button class="btn btn-primary" type="submit" style="color:var(--on-primary);align-self:flex-start">Mettre à jour</button>
      </form>
    </div>`;

  $("#profileForm").onsubmit = async (e) => {
    e.preventDefault();
    const name = new FormData(e.target).get("name").trim();
    const btn = $("button[type=submit]", e.target);
    btn.disabled = true;
    try {
      const me = await api("/auth/profile", { method: "PATCH", body: JSON.stringify({ name }) });
      state.user = { ...state.user, ...me };
      saveAuth();
      toast("Profil mis à jour ✔");
    } catch (err) { toast(err.message, "error"); }
    finally { btn.disabled = false; }
  };
  $("#passwordForm").onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const btn = $("button[type=submit]", e.target);
    btn.disabled = true;
    try {
      await api("/auth/change-password", { method: "POST", body: JSON.stringify({
        current_password: f.get("current_password"), new_password: f.get("new_password"),
      }) });
      e.target.reset();
      toast("Mot de passe modifié ✔");
    } catch (err) { toast(err.message, "error"); }
    finally { btn.disabled = false; }
  };
}

// Barre de navigation commune aux pages admin.
function adminNav(active) {
  const tab = (key, href, label) =>
    `<a class="btn btn-sm ${active === key ? "btn-primary" : "btn-ghost"}" ${active === key ? 'style="color:var(--on-primary)"' : ""} href="${href}">${label}</a>`;
  return `<div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
    ${tab("stats", "/admin/stats", "Tableau de bord")}
    ${tab("orders", "/admin", "Commandes")}
    ${tab("products", "/admin/produits", "Produits")}
  </div>`;
}

/* ─── Vue : espace admin — tableau de bord ─── */
async function viewAdminStats(app, renderToken = currentRenderToken) {
  if (!state.user) { go("/"); openAuth(); return; }
  try { const me = await api("/auth/me"); state.user = { ...state.user, ...me }; saveAuth(); } catch { /* géré par api() */ }
  if (isStaleRender(renderToken, app)) return;
  if (!state.user?.is_admin) {
    app.innerHTML = `<div class="empty-state"><h2>Accès réservé</h2><br><a class="btn btn-primary" href="/">Accueil</a></div>`;
    return;
  }
  app.innerHTML = `
  <div class="section-head" style="margin-top:0"><h1>Tableau de bord — Admin</h1>
    <a class="btn btn-ghost btn-sm" href="/compte">← Mon compte</a></div>
  ${adminNav("stats")}
  <div id="statsBody"><div class="skeleton" style="min-height:140px"></div></div>`;

  let s;
  try { s = await api("/admin/stats"); }
  catch (err) {
    if (isStaleRender(renderToken, app)) return;
    const statsBody = $("#statsBody");
    if (!statsBody) return;
    statsBody.innerHTML = `<div class="empty-state"><h2>Accès réservé</h2><p style="margin-top:10px">${esc(err.message)}</p><br><a class="btn btn-primary" href="/">Accueil</a></div>`;
    return;
  }
  if (isStaleRender(renderToken, app)) return;

  const kpi = (label, value, sub = "") =>
    `<div class="kpi-card"><span class="kpi-label">${label}</span><strong class="kpi-value">${value}</strong>${sub ? `<span class="kpi-sub">${sub}</span>` : ""}</div>`;
  const statusOrder = ["en attente de paiement", "payée", "préparée", "expédiée", "livrée", "annulée"];

  const statsBody = $("#statsBody");
  if (!statsBody) return;
  statsBody.innerHTML = `
    <div class="kpi-grid">
      ${kpi("Chiffre d'affaires", fmt(s.revenue), "commandes réglées")}
      ${kpi("CA aujourd'hui", fmt(s.revenue_today), `${s.orders_today} commande${s.orders_today > 1 ? "s" : ""}`)}
      ${kpi("À expédier", s.to_ship ?? 0, "commandes à préparer")}
      ${kpi("Commandes payées", s.orders_paid)}
      ${kpi("Panier moyen", fmt(s.avg_basket))}
      ${kpi("Clients", s.customers)}
    </div>

    <div class="admin-cols">
      <div class="panel">
        <h2 style="margin-bottom:14px">Meilleures ventes</h2>
        ${s.top_products.length ? `<table class="mini-table">
          <thead><tr><th>Produit</th><th>Qté</th><th>CA</th></tr></thead>
          <tbody>${s.top_products.map((p) => `<tr><td>${esc(p.product_name)}</td><td>${p.qty}</td><td>${fmt(p.revenue)}</td></tr>`).join("")}</tbody>
        </table>` : `<p style="color:var(--text-dim)">Aucune vente pour le moment.</p>`}
      </div>

      <div class="panel">
        <h2 style="margin-bottom:14px">⚠️ Stock faible (≤ 5)</h2>
        ${s.low_stock.length ? `<table class="mini-table">
          <thead><tr><th>Produit</th><th>Catégorie</th><th>Stock</th></tr></thead>
          <tbody>${s.low_stock.map((p) => `<tr><td>${esc(p.name)}</td><td>${esc(CATS[p.category]?.label || p.category)}</td><td><span style="color:${p.stock === 0 ? "var(--red)" : "var(--amber)"};font-weight:700">${p.stock}</span></td></tr>`).join("")}</tbody>
        </table>` : `<p style="color:var(--text-dim)">Tous les stocks sont confortables</p>`}
      </div>
    </div>

    <div class="admin-cols" style="margin-top:18px">
      <div class="panel">
        <h2 style="margin-bottom:14px">Commandes par statut</h2>
        <div class="status-pills">
          ${statusOrder.filter((st) => s.by_status[st]).map((st) => `
            <a class="status-pill" href="/admin?status=${encodeURIComponent(st)}">${statusBadge(st)} <strong>${s.by_status[st]}</strong></a>`).join("") || `<span style="color:var(--text-dim)">Aucune commande.</span>`}
        </div>
      </div>
      <div class="panel">
        <h2 style="margin-bottom:14px">Clients récents</h2>
        ${(s.recent_customers || []).length ? `<table class="mini-table">
          <thead><tr><th>Nom</th><th>E-mail</th><th>Inscrit</th></tr></thead>
          <tbody>${s.recent_customers.map((c) => `<tr><td>${esc(c.name)}</td><td>${esc(c.email)}</td><td>${c.created_at ? new Date(c.created_at * 1000).toLocaleDateString("fr-FR") : "—"}</td></tr>`).join("")}</tbody>
        </table>` : `<p style="color:var(--text-dim)">Aucun client pour le moment.</p>`}
      </div>
    </div>`;
}

/* ─── Vue : espace admin (toutes les commandes) ─── */
async function viewAdmin(app, params, renderToken = currentRenderToken) {
  if (!state.user) { go("/"); openAuth(); return; }
  try { const me = await api("/auth/me"); state.user = { ...state.user, ...me }; saveAuth(); } catch { /* géré par api() */ }
  if (isStaleRender(renderToken, app)) return;
  if (!state.user?.is_admin) {
    app.innerHTML = `<div class="empty-state"><h2>Accès réservé</h2><br><a class="btn btn-primary" href="/">Retour à l'accueil</a></div>`;
    return;
  }

  const current = params.get("status") || "";
  const query = params.get("q") || "";
  const filters = [
    ["", "Toutes"],
    ["payée", "Payées"],
    ["préparée", "Préparées"],
    ["expédiée", "Expédiées"],
    ["livrée", "Livrées"],
    ["en attente de paiement", "En attente"],
    ["annulée", "Annulées"],
  ];
  // Préserve la recherche en cours lorsqu'on change de filtre de statut.
  const withQ = (qs) => { const p = new URLSearchParams(qs); if (query) p.set("q", query); const s = p.toString(); return "/admin" + (s ? "?" + s : ""); };
  const filterBar = filters.map(([val, label]) =>
    `<a class="btn btn-sm ${val === current ? "btn-primary" : "btn-ghost"}" ${val === current ? 'style="color:var(--on-primary)"' : ""} href="${withQ(val ? { status: val } : {})}">${label}</a>`
  ).join(" ");

  app.innerHTML = `
  <div class="section-head" style="margin-top:0">
    <h1>️ Commandes — Admin</h1>
    <a class="btn btn-ghost btn-sm" href="/compte">← Mon compte</a>
  </div>
  ${adminNav("orders")}
  <div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;align-items:center">
    <div class="admin-search">
      <input id="orderSearch" placeholder="Rechercher : nom, e-mail, n° de commande…" value="${esc(query)}">
      <button class="btn btn-ghost btn-sm" id="orderSearchBtn">Rechercher</button>
      ${query ? `<a class="btn btn-ghost btn-sm" href="${withQ({})}" onclick="event.stopPropagation()" style="color:var(--red)">✕</a>` : ""}
    </div>
  </div>
  <div style="display:flex;gap:8px;margin-bottom:20px;flex-wrap:wrap">${filterBar}</div>
  <div id="adminOrders"><div class="skeleton" style="min-height:140px"></div></div>`;

  // Recherche : reconstruit l'URL en conservant le statut courant.
  const runSearch = () => {
    const q = $("#orderSearch").value.trim();
    const p = new URLSearchParams();
    if (current) p.set("status", current);
    if (q) p.set("q", q);
    const s = p.toString();
    go("/admin" + (s ? "?" + s : ""));
  };
  $("#orderSearchBtn").onclick = runSearch;
  $("#orderSearch").onkeydown = (e) => { if (e.key === "Enter") runSearch(); };

  let orders;
  try {
    const qs = new URLSearchParams();
    if (current) qs.set("status", current);
    if (query) qs.set("q", query);
    orders = await api("/admin/orders" + (qs.toString() ? "?" + qs.toString() : ""));
  } catch (err) {
    if (isStaleRender(renderToken, app)) return;
    // 403 = compte non administrateur
    app.innerHTML = `<div class="empty-state"><h2>Accès réservé</h2><p style="margin-top:10px">${esc(err.message)}</p><br><a class="btn btn-primary" href="/">Retour à l'accueil</a></div>`;
    return;
  }
  if (isStaleRender(renderToken, app)) return;

  const date = (t) => new Date(t * 1000).toLocaleString("fr-FR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

  // Contrôles de gestion (statut + suivi) — affichés seulement pour les
  // commandes payées (on ne gère pas une commande non réglée).
  const manageable = ["payée", "préparée", "expédiée", "livrée", "annulée"];
  const statusControls = (o) => {
    if (!manageable.includes(o.status)) return "";
    const opts = manageable.map((s) => `<option value="${s}" ${o.status === s ? "selected" : ""}>${s}</option>`).join("");
    return `
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:14px;padding-top:14px;border-top:1px solid var(--border-strong)">
        <select class="ad-status" data-order="${o.id}" style="padding:8px 10px;border-radius:8px;background:var(--bg);color:var(--text);border:1px solid var(--border-strong)">${opts}</select>
        <input class="ad-carrier" data-order="${o.id}" value="${esc(o.carrier || "")}" placeholder="Transporteur" style="padding:8px 10px;border-radius:8px;background:var(--bg);color:var(--text);border:1px solid var(--border-strong);width:130px">
        <input class="ad-tracking" data-order="${o.id}" value="${esc(o.tracking_number || "")}" placeholder="N° de suivi" style="padding:8px 10px;border-radius:8px;background:var(--bg);color:var(--text);border:1px solid var(--border-strong);width:160px">
        <button class="btn btn-primary btn-sm ad-save" data-order="${o.id}" style="color:var(--on-primary)">Enregistrer</button>
      </div>`;
  };

  const adminOrders = $("#adminOrders");
  if (!adminOrders) return;
  adminOrders.innerHTML = orders.length
    ? orders.map((o) => `
      <div class="order-card">
        <div class="order-head">
          <h3>Commande n°${o.id} — ${date(o.created_at)}</h3>
          ${statusBadge(o.status)}
        </div>
        <div class="admin-order-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:18px;margin:14px 0">
          <div>
            <strong style="color:var(--text-dim);font-size:.8rem;text-transform:uppercase">Client</strong><br>
            ${esc(o.customer_name)}<br>
            <a href="mailto:${esc(o.customer_email)}" style="color:var(--accent)">${esc(o.customer_email)}</a>
          </div>
          <div>
            <strong style="color:var(--text-dim);font-size:.8rem;text-transform:uppercase">Livraison</strong><br>
            ${esc(o.ship_name)}<br>
            ${esc(o.ship_address)}<br>
            ${esc(o.ship_zip)} ${esc(o.ship_city)}
          </div>
        </div>
        <div class="order-items">
          ${o.items.map((i) => `${i.quantity} × ${esc(i.product_name)} — ${fmt(i.unit_price * i.quantity)}`).join("<br>")}
        </div>
        <div class="order-total">Total : ${fmt(o.total)}${o.promo_code ? ` <small style="color:var(--green);font-weight:400">(code ${esc(o.promo_code)}, −${fmt(o.discount)})</small>` : ""}${o.shipping ? ` · port ${fmt(o.shipping)}` : " · port offert"}</div>
        ${o.status !== "en attente de paiement" ? `<div style="margin-top:10px"><button class="btn btn-ghost btn-sm" onclick="downloadInvoice(${o.id})">Facture</button></div>` : ""}
        ${statusControls(o)}
      </div>`).join("")
    : `<div class="empty-state"><p>Aucune commande${current ? " pour ce statut" : ""}.</p></div>`;

  // Enregistrement du statut + suivi pour chaque commande.
  $$(".ad-save").forEach((btn) => {
    btn.onclick = async () => {
      const id = btn.dataset.order;
      const status = $(`.ad-status[data-order="${id}"]`).value;
      const carrier = $(`.ad-carrier[data-order="${id}"]`).value;
      const tracking = $(`.ad-tracking[data-order="${id}"]`).value;
      btn.disabled = true;
      btn.textContent = "…";
      try {
        await api(`/admin/orders/${id}/status`, {
          method: "POST",
          body: JSON.stringify({ status, tracking_number: tracking, carrier }),
        });
        toast(status === "expédiée" ? "Statut mis à jour — email d'expédition envoyé ✔" : "Statut mis à jour ✔");
        viewAdmin(app, params, currentRenderToken); // recharge la liste
      } catch (err) {
        toast(err.message, "error");
        btn.disabled = false;
        btn.textContent = "Enregistrer";
      }
    };
  });
}

// Badge de statut coloré, partagé admin + client.
function statusBadge(s) {
  const colors = {
    "payée": "var(--green)", "préparée": "#3b82f6", "expédiée": "#a855f7",
    "livrée": "#22c55e", "annulée": "#d9544f", "en attente de paiement": "#e0a93f",
  };
  const color = colors[s] || "var(--text-dim)";
  return `<span class="order-status" style="color:${color};border-color:${color}">${esc(s)}</span>`;
}

// Barre de progression du suivi pour le client.
function orderProgress(o) {
  if (o.status === "annulée") {
    return `<div style="margin-top:12px;color:#d9544f;font-weight:600">✕ Commande annulée</div>`;
  }
  const steps = ["payée", "préparée", "expédiée", "livrée"];
  const idx = steps.indexOf(o.status);
  if (idx === -1) return ""; // ex. « en attente de paiement »
  const labels = { "payée": "Payée", "préparée": "Préparée", "expédiée": "Expédiée", "livrée": "Livrée" };
  const bar = steps.map((s, i) => {
    const active = i <= idx;
    return `<div style="flex:1">
      <div style="height:6px;border-radius:3px;background:${active ? "var(--green)" : "var(--border-strong)"}"></div>
      <div style="font-size:.72rem;margin-top:6px;text-align:center;color:${i === idx ? "var(--green)" : "var(--text-dim)"};font-weight:${i === idx ? "700" : "400"}">${labels[s]}</div>
    </div>`;
  }).join('<div style="width:6px"></div>');
  const track = o.tracking_number
    ? `<div style="margin-top:10px;font-size:.85rem;color:var(--text-dim)">${o.carrier ? esc(o.carrier) + " — " : ""}suivi : <strong style="color:var(--text)">${esc(o.tracking_number)}</strong></div>`
    : "";
  return `<div style="margin-top:14px"><div style="display:flex;align-items:flex-end">${bar}</div>${track}</div>`;
}

/* ─── Vue : espace admin — gestion des produits ─── */
async function viewAdminProducts(app, renderToken = currentRenderToken) {
  if (!state.user) { go("/"); openAuth(); return; }
  // Rafraîchit le statut admin puis verrouille l'accès.
  try { const me = await api("/auth/me"); state.user = { ...state.user, ...me }; saveAuth(); } catch { /* géré par api() */ }
  if (isStaleRender(renderToken, app)) return;
  if (!state.user.is_admin) {
    app.innerHTML = `<div class="empty-state"><h2>Accès réservé</h2><br><a class="btn btn-primary" href="/">Retour à l'accueil</a></div>`;
    return;
  }

  const catOptions = Object.entries(CATS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join("");
  app.innerHTML = `
  <div class="section-head" style="margin-top:0">
    <h1>️ Produits — Admin</h1>
    <a class="btn btn-ghost btn-sm" href="/compte">← Mon compte</a>
  </div>
  ${adminNav("products")}
  <details class="panel" style="margin-bottom:20px">
    <summary style="cursor:pointer;font-weight:600;font-size:1.05rem">+ Ajouter un produit</summary>
    <form id="addProductForm" class="form-grid" style="margin-top:16px">
      <label>Nom<input name="name" required></label>
      <label>Marque<input name="brand" required></label>
      <label>Catégorie<select name="category" required>${catOptions}</select></label>
      <label>Prix (€)<input name="price" type="number" step="0.01" min="0" required></label>
      <label>Ancien prix (€)<input name="old_price" type="number" step="0.01" min="0" placeholder="optionnel"></label>
      <label>Stock<input name="stock" type="number" min="0" required></label>
      <label>Badge<input name="badge" placeholder="optionnel : Nouveau, Promo…"></label>
      <label class="full">Description<textarea name="description" rows="2" required></textarea></label>
      <label class="full">Specs — JSON (optionnel)<textarea name="specs" rows="2" placeholder='{"Socket":"AM5","TDP":"120 W"}'></textarea></label>
      <label class="full">URL d'image<input name="image_url" placeholder="https://… (optionnel — sinon visuel généré)"></label>
      <label class="full" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" name="featured" style="width:auto"> Mettre en vedette</label>
      <button class="btn btn-primary full" type="submit" style="color:var(--on-primary)">Créer le produit</button>
    </form>
  </details>
  <div id="adminProducts"><div class="skeleton" style="min-height:160px"></div></div>`;

  const inp = "padding:8px 10px;border-radius:8px;background:var(--bg);color:var(--text);border:1px solid var(--border-strong)";

  async function load() {
    const products = await api("/products?sort=name");
    if (isStaleRender(renderToken, app)) return;
    const adminProducts = $("#adminProducts");
    if (!adminProducts) return;
    adminProducts.innerHTML =
      `<p style="color:var(--text-dim);margin-bottom:12px">${products.length} produits</p>` +
      products.map((p) => `
      <div class="order-card" style="display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap">
        <div style="display:flex;align-items:center;gap:12px;min-width:220px">
          <img src="${esc(p.image_url || `/images/${p.id}-1.jpg`)}" onerror="this.style.visibility='hidden'" style="width:44px;height:44px;object-fit:contain;border-radius:6px;background:var(--surface);flex-shrink:0">
          <div>
            <strong>${esc(p.name)}</strong>${p.stock === 0 ? ` <span style="color:#d9544f;font-size:.8rem">• Rupture</span>` : ""}<br>
            <small style="color:var(--text-dim)">#${p.id} · ${esc(CATS[p.category]?.label || p.category)} · ${esc(p.brand)}</small>
          </div>
        </div>
        <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap">
          <label style="font-size:.75rem;color:var(--text-dim)">Prix €<br><input class="pp-price" data-pid="${p.id}" type="number" step="0.01" min="0" value="${p.price}" style="${inp};width:90px"></label>
          <label style="font-size:.75rem;color:var(--text-dim)">Stock<br><input class="pp-stock" data-pid="${p.id}" type="number" min="0" value="${p.stock}" style="${inp};width:70px"></label>
          <label style="font-size:.75rem;color:var(--text-dim)">URL d'image<br><input class="pp-img" data-pid="${p.id}" value="${esc(p.image_url || "")}" placeholder="https://…" style="${inp};width:220px"></label>
          <button class="btn btn-primary btn-sm pp-save" data-pid="${p.id}" style="color:var(--on-primary)">Enregistrer</button>
          <button class="btn btn-ghost btn-sm pp-del" data-pid="${p.id}"></button>
        </div>
      </div>`).join("");

    $$(".pp-save").forEach((btn) => {
      btn.onclick = async () => {
        const id = btn.dataset.pid;
        const price = parseFloat($(`.pp-price[data-pid="${id}"]`).value);
        const stock = parseInt($(`.pp-stock[data-pid="${id}"]`).value, 10);
        const image_url = $(`.pp-img[data-pid="${id}"]`).value.trim() || null;
        if (isNaN(price) || isNaN(stock)) { toast("Prix/stock invalide", "error"); return; }
        btn.disabled = true;
        try {
          await api(`/admin/products/${id}`, { method: "PATCH", body: JSON.stringify({ price, stock, image_url }) });
          toast("Produit mis à jour ✔");
          load(); // recharge pour rafraîchir la miniature
        } catch (err) { toast(err.message, "error"); }
        finally { btn.disabled = false; }
      };
    });
    $$(".pp-del").forEach((btn) => {
      btn.onclick = async () => {
        const id = btn.dataset.pid;
        if (!confirm("Supprimer ce produit définitivement ?")) return;
        try {
          await api(`/admin/products/${id}`, { method: "DELETE" });
          toast("Produit supprimé");
          load();
        } catch (err) { toast(err.message, "error"); }
      };
    });
  }

  $("#addProductForm").onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    let specs = {};
    const specsRaw = (f.get("specs") || "").trim();
    if (specsRaw) {
      try { specs = JSON.parse(specsRaw); }
      catch { toast("Specs : JSON invalide", "error"); return; }
    }
    const payload = {
      name: f.get("name"), brand: f.get("brand"), category: f.get("category"),
      price: parseFloat(f.get("price")), stock: parseInt(f.get("stock"), 10),
      description: f.get("description"),
      old_price: f.get("old_price") ? parseFloat(f.get("old_price")) : null,
      badge: f.get("badge") || null,
      featured: f.get("featured") === "on",
      image_url: (f.get("image_url") || "").trim() || null,
      specs,
    };
    const btn = $("button[type=submit]", e.target);
    btn.disabled = true;
    try {
      await api("/admin/products", { method: "POST", body: JSON.stringify(payload) });
      toast("Produit créé ✔");
      e.target.reset();
      load();
    } catch (err) { toast(err.message, "error"); }
    finally { btn.disabled = false; }
  };

  load();
}

/* ─── Liaisons communes ─── */
function bindProductCards(root, products) {
  indexProducts(products);
}

/* ─── Sous-menus de navigation ─── */
function setupDelegatedProductClicks() {
  document.addEventListener("click", async (e) => {
    const add = e.target.closest("[data-add]");
    if (add && !add.disabled) {
      e.preventDefault();
      e.stopPropagation();
      try {
        const p = await getIndexedProduct(add.dataset.add);
        if (p) addToCart(p);
      } catch (err) {
        toast(err.message, "error");
      }
      return;
    }

    const fav = e.target.closest("[data-fav]");
    if (fav && fav.id !== "ppFav") {
      e.preventDefault();
      e.stopPropagation();
      toggleFavorite(Number(fav.dataset.fav), fav);
      return;
    }

    const cmp = e.target.closest("[data-cmp]");
    if (cmp && cmp.id !== "ppCmp") {
      e.preventDefault();
      e.stopPropagation();
      toggleCompare(Number(cmp.dataset.cmp));
      return;
    }

    const card = e.target.closest("[data-goto]");
    if (card && !e.target.closest("[data-add],[data-fav],[data-cmp]")) {
      e.preventDefault();
      go(card.dataset.goto);
    }
  });
}

function fillNavMenus() {
  const link = (k) => `
    <a class="nav-menu-link" href="/catalogue?cat=${k}">
      <span class="nav-menu-ico">${art(k, 30)}</span>${CATS[k].label}
    </a>`;
  const comp = $("#menuComponents");
  const periph = $("#menuPeriph");
  if (comp) comp.innerHTML = COMPONENT_CATS.map(link).join("") +
    `<a class="nav-menu-all" href="/catalogue">Tout le catalogue →</a>`;
  if (periph) periph.innerHTML = PERIPH_CATS.map(link).join("") +
    `<a class="nav-menu-all" href="/catalogue?new=1">Toutes les nouveautés →</a>`;
}

/* ─── Thème clair / sombre ─── */
function setupTheme() {
  const btn = $("#themeBtn");
  if (!btn) return;
  const meta = document.querySelector('meta[name="theme-color"]');
  const apply = (t) => {
    document.documentElement.dataset.theme = t;
    localStorage.setItem("volt_theme", t);
    btn.title = t === "dark" ? "Passer en thème clair" : "Passer en thème sombre";
    if (meta) meta.content = t === "dark" ? "#0b0b0d" : "#ffffff";
  };
  // Le script du <head> a déjà posé l'attribut ; on s'aligne dessus.
  apply(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  btn.onclick = () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    if (reduce) { apply(next); return; }
    // Cross-fade composité GPU si dispo (Chrome/Edge), sinon repli par transition.
    if (document.startViewTransition) {
      document.startViewTransition(() => apply(next));
    } else {
      const root = document.documentElement;
      root.classList.add("theme-anim");
      setTimeout(() => root.classList.remove("theme-anim"), 320);
      apply(next);
    }
  };
}

/* ─── Initialisation ─── */
function init() {
  saveAuth();
  setupDelegatedProductClicks();
  updateCartCount();
  setupAuth();
  fillNavMenus();

  setupTheme();
  setupCookieBanner();
  $("#cartBtn").onclick = openCart;
  $("#cartClose").onclick = closeCart;
  $("#drawerOverlay").onclick = closeCart;
  $("#accountBtn").onclick = async () => {
    const ordersUrl = "/compte?tab=orders";
    if (state.user) { go(ordersUrl, { force: true }); return; }
    const restored = await restoreSessionAndCart({ syncCart: false });
    if (restored && state.user) { go(ordersUrl, { force: true }); return; }
    requireAuth(() => go(ordersUrl, { force: true }));
  };
  $("#searchInput").onkeydown = (e) => {
    if (e.key === "Enter") {
      const q = e.target.value.trim();
      go(q ? `/catalogue?q=${encodeURIComponent(q)}` : "/catalogue");
    }
  };
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { closeCart(); closeAuth(); $$(".modal-overlay:not(#authModal)").forEach((m) => m.remove()); }
  });

  // Gestion des quantités du panier (délégation)
  $("#cartBody").addEventListener("click", (e) => {
    const qtyBtn = e.target.closest("[data-qty]");
    if (qtyBtn) {
      const [id, delta] = qtyBtn.dataset.qty.split("|").map(Number);
      const line = state.cart.find((i) => i.id === id);
      if (!line) return;
      line.qty += delta;
      if (line.qty <= 0) state.cart = state.cart.filter((i) => i.id !== id);
      else if (line.qty > line.stock) { line.qty = line.stock; toast("Stock maximum atteint", "error"); }
      saveCart();
      renderCartDrawer();
    }
    const rmBtn = e.target.closest("[data-remove]");
    if (rmBtn) {
      state.cart = state.cart.filter((i) => i.id !== Number(rmBtn.dataset.remove));
      saveCart();
      renderCartDrawer();
    }
  });

  // Bouton précédent/suivant du navigateur
  window.addEventListener("popstate", render);

  // Intercepteur global : tout lien interne <a href="/…"> navigue en SPA
  // sans rechargement. Les fichiers (.jpg, .json, .pdf…), liens externes,
  // _blank, download et clics modifiés sont laissés au navigateur.
  document.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest("a");
    if (!a) return;
    const href = a.getAttribute("href");
    if (!href || a.target === "_blank" || a.hasAttribute("download")) return;
    const url = href.startsWith("#/") ? href.slice(1) : href;
    if (!url.startsWith("/")) return;                 // externe ou ancre simple
    if (/\.[a-z0-9]{2,5}(\?|$)/i.test(url)) return;   // fichier statique → navigateur
    e.preventDefault();
    go(url);
  });

  renderCompareBar();
  const { path } = parsePath();
  const needsAuth = routeNeedsAuth(path);

  // Les pages publiques s'affichent tout de suite, puis on hydrate la session
  // en arrière-plan pour éviter un premier chargement visiblement bloquant.
  if (!needsAuth) render();

  (async () => {
    if (state.token || needsAuth) {
      try {
        await restoreSessionAndCart();
        if (state.user) {
          await loadFavorites();
          refreshFavoriteButtons();
        }
      } catch { /* non bloquant */ }
    }
    if (needsAuth) render();
  })();
}

init();
