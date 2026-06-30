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

/* ─── Export RGPD : télécharge toutes les données du compte en JSON ─── */
async function exportMyData() {
  try {
    const res = await fetch(API + "/auth/export", { credentials: "include" });
    if (!res.ok) {
      let d = {};
      try { d = await res.json(); } catch { /* corps non-JSON */ }
      throw new Error(d.detail || "Impossible d'exporter les données");
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mes-donnees-voltcore.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast("Export téléchargé ✔");
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
    if (isFav) { state.favorites.delete(id); toast("Retiré de la liste de souhaits", "info"); }
    else { state.favorites.add(id); toast("Ajouté à la liste de souhaits ♥"); }
    // Rafraîchit tous les boutons cœur de cet id présents à l'écran.
    $$(`[data-fav="${id}"]`).forEach((b) => b.classList.toggle("on", state.favorites.has(id)));
  } catch (e) { toast(e.message, "error"); }
}

const heartBtn = (p) => `
  <button class="fav-btn ${state.favorites.has(p.id) ? "on" : ""}" data-fav="${p.id}" title="Ajouter à ma liste de souhaits" aria-label="Liste de souhaits">
    <svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 21s-7.5-4.6-9.7-9C.8 8.6 2.5 5 6 5c2 0 3.2 1.1 4 2.3C10.8 6.1 12 5 14 5c3.5 0 5.2 3.6 3.7 7-2.2 4.4-9.7 9-9.7 9z" stroke="currentColor" stroke-width="2" fill="none" stroke-linejoin="round"/></svg>
  </button>`;

/* ─── Comparateur ─── */
const COMPARE_MAX = 6;
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

// Slugs FR des URLs de catégorie (/categorie/<slug>). Miroir du backend (main.py).
const CAT_SLUG = {
  gpu: "cartes-graphiques", cpu: "processeurs", ram: "memoire-ram",
  storage: "stockage-ssd", motherboard: "cartes-meres", psu: "alimentations",
  case: "boitiers", cooling: "refroidissement", monitor: "ecrans",
  keyboard: "claviers", mouse: "souris", headset: "casques-audio",
  fan: "ventilateurs", thermal: "pate-thermique", webcam: "webcams",
  microphone: "microphones", speaker: "enceintes", mousepad: "tapis-de-souris",
  chair: "chaises-gaming",
};
const SLUG_CAT = Object.fromEntries(Object.entries(CAT_SLUG).map(([k, v]) => [v, k]));
const catUrl = (k) => CAT_SLUG[k] ? `/categorie/${CAT_SLUG[k]}` : `/catalogue?cat=${k}`;

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
  `<img class="pimg" src="${esc(p.image_url || `/images/${slugify(p.name)}-1.jpg`)}" alt="${esc(p.name)}" width="800" height="800" loading="lazy" decoding="async" onerror="this.remove()">`;

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
function specNumMax(v) {
  const nums = String(v ?? "").replace(/,/g, ".").match(/\d+(?:\.\d+)?/g)?.map(Number) || [];
  return nums.length ? Math.max(...nums) : 0;
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
  const boost = specNumMax(s["Boost"] || s["Fréquence"]);
  const x3d = /x3d/i.test(p.name) ? 12 : 0;
  return Math.max(30, Math.min(100, threads * 2.1 + boost * 8 + x3d));
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
        <button class="cmp-btn ${inCompare(p.id) ? "on" : ""}" data-cmp="${p.id}" title="Comparer" aria-label="Comparer ${esc(p.name)}">⇄</button>
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
        <button class="add-btn" data-add="${p.id}" title="Ajouter au panier" aria-label="Ajouter ${esc(p.name)} au panier" ${p.stock <= 0 ? "disabled" : ""}>
          <svg viewBox="0 0 24 24" width="19" height="19"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>
        </button>
      </div>
    </div>
  </article>`;
}

/* ─── Regroupement par modèle (afficher « RTX 5070 » + menu des marques) ─── */
// Pour les GPU, la « marque » est le fabricant de la carte (MSI, ASUS…) alors
// que la puce (RTX 5070) est commune : on regroupe donc les variantes d'un même
// modèle. Pour la RAM on regroupe par capacité + fréquence. Ailleurs, chaque
// produit reste unique (sa clé = son nom → aucun regroupement).
// Modèle GPU = la PUCE uniquement (sans la mémoire ni la gamme du fabricant) :
// toutes les variantes d'une même puce sont regroupées (ex. RTX 5090 « Gaming
// Trio » et « SUPRIM Liquid 32G » → un seul modèle « GeForce RTX 5090 »).
function gpuModel(name) {
  let m = name.match(/(GeForce\s+(?:RTX|GTX)\s*\d{3,4})(\s*Ti)?(\s*Super)?/i);
  if (m) return (m[1] + (m[2] || "") + (m[3] || "")).replace(/\s+/g, " ").trim();
  if ((m = name.match(/(Radeon\s+RX\s*\d{3,4})(\s*(?:XTX|XT|GRE))?/i))) return (m[1] + (m[2] || "")).replace(/\s+/g, " ").trim();
  if ((m = name.match(/(Arc\s+[AB]\d{3})/i))) return m[1].replace(/\s+/g, " ").trim();
  return null;
}
// Constructeur (fabricant de la puce) plutôt que la marque de revente :
// pour un GPU, NVIDIA / AMD / Intel et non MSI / ASUS / Gigabyte. Ailleurs, la
// marque EST le fabricant.
function manufacturer(p) {
  if (p.category === "gpu") {
    if (/GeForce|RTX|GTX/i.test(p.name)) return "NVIDIA";
    if (/Radeon|\bRX\b/i.test(p.name)) return "AMD";
    if (/\bArc\b/i.test(p.name)) return "Intel";
  }
  return p.brand;
}

// Boîtiers vendus SANS ventilateur : l'achat impose alors le choix d'un pack.
const CASES_WITHOUT_FANS = new Set(["O11 Dynamic EVO", "O11 Vision", "H9 Flow", "Y70 Touch"]);
const caseNeedsFans = (p) => p.category === "case" && CASES_WITHOUT_FANS.has(p.name);

function productModel(p) {
  if (p.category === "gpu") { const g = gpuModel(p.name); if (g) return g; }
  if (p.category === "ram") {
    const r = p.name.match(/(\d+)\s*Go\s+(DDR\d)[ -]?(\d{3,4})/i);
    if (r) return `${r[1]} Go ${r[2].toUpperCase()}-${r[3]}`;
  }
  return p.name;  // unique → pas de regroupement
}
// Regroupe une liste (déjà triée) par modèle, en conservant l'ordre d'apparition.
function groupByModel(products) {
  const map = new Map();
  for (const p of products) {
    const key = p.category + "|" + productModel(p);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(p);
  }
  return [...map.values()].map((items) => {
    const sorted = items.slice().sort((a, b) => a.price - b.price);
    return {
      model: productModel(sorted[0]), items: sorted, rep: sorted[0],
      min: sorted[0].price,
      brands: [...new Set(sorted.map((p) => p.brand))],
    };
  });
}
// Carte « modèle » : un seul visuel pour plusieurs marques, prix « dès … ».
function modelCard(g) {
  const p = g.rep;
  const n = g.brands.length;
  return `
  <article class="product-card model-card" data-goto="/produit/${p.id}">
    <div class="product-visual" style="--tint:${tintOf(p)}">
      ${art(p.category, hueOf(p))}
      ${imgTag(p)}
      <span class="model-badge">${n} marque${n > 1 ? "s" : ""}</span>
    </div>
    <div class="product-info">
      <span class="product-brand">${n} marque${n > 1 ? "s" : ""} disponible${n > 1 ? "s" : ""}</span>
      <h3 class="product-name">${esc(g.model)}</h3>
      <div class="product-rating">${stars(p.rating)} <span>${p.rating.toFixed(1)}</span></div>
      <div class="product-bottom">
        <div class="price"><small class="price-from">dès</small> ${fmt(g.min)}</div>
        <span class="add-btn model-go" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="19" height="19"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </span>
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
          <button data-qty="${i.id}|-1" aria-label="Retirer une unité de ${esc(i.name)}">−</button><span aria-label="Quantité ${i.qty}">${i.qty}</span><button data-qty="${i.id}|1" aria-label="Ajouter une unité de ${esc(i.name)}">+</button>
        </div>
        <button class="cart-item-remove" data-remove="${i.id}" aria-label="Retirer ${esc(i.name)} du panier" title="Retirer du panier">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5" />
          </svg>
        </button>
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

// Repli : si le serveur renvoie un `dev_code` (aucun service d'email configuré),
// on pré-remplit silencieusement le champ pour ne pas bloquer l'inscription.
function showDevCode(code, inputName) {
  if (!code) return;
  const input = document.querySelector(`input[name="${inputName}"]:not([hidden])`)
    || [...document.querySelectorAll(`input[name="${inputName}"]`)].find((i) => i.offsetParent !== null);
  if (input) input.value = code;
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

// Ajoute un bouton « œil » à chaque champ mot de passe de la modale d'auth pour
// afficher/masquer la saisie. Idempotent (peut être rappelé sans dupliquer).
const EYE_SHOW = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>`;
const EYE_HIDE = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.9 10.9 0 0 1 12 5c6.5 0 10 7 10 7a18 18 0 0 1-3.2 4.1M6.5 6.5A18 18 0 0 0 2 12s3.5 7 10 7a10.9 10.9 0 0 0 4.4-.9"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>`;

function setupPasswordToggles() {
  $$("#authModal input[type=password]").forEach((input) => {
    if (input.dataset.pwEnhanced) return;
    input.dataset.pwEnhanced = "1";
    const wrap = document.createElement("span");
    wrap.className = "pw-field";
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pw-toggle";
    btn.setAttribute("aria-label", "Afficher le mot de passe");
    btn.innerHTML = EYE_SHOW;
    btn.onclick = () => {
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.innerHTML = show ? EYE_HIDE : EYE_SHOW;
      btn.setAttribute("aria-label", show ? "Masquer le mot de passe" : "Afficher le mot de passe");
    };
    wrap.appendChild(btn);
  });
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

  const handle = (endpoint, prep) => async (e) => {
    e.preventDefault();
    const form = e.target;
    const body = Object.fromEntries(new FormData(form));
    // Validation/transformation optionnelle avant envoi (renvoyer false = abandon).
    if (prep && prep(body, form) === false) return;
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
  $("#registerForm").onsubmit = handle("/auth/register", (body) => {
    if (body.password !== body.password_confirm) {
      toast("Les mots de passe ne correspondent pas", "error");
      return false;
    }
    delete body.password_confirm;   // champ de confirmation : non attendu côté API
  });
  setupPasswordToggles();

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
// Quand vrai, le prochain render() ne remonte PAS la page (ex. application d'un
// filtre catalogue : on reste à la position de lecture courante).
let preserveScroll = false;

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
  const navSection = path.split("/")[0];
  $$(".nav a").forEach((a) => a.classList.toggle("active", a.dataset.nav === navSection));
  document.body.classList.toggle("void-home-active", isHome);
  if (!isHome) cleanupHome3D();
  if (preserveScroll) preserveScroll = false;
  else window.scrollTo({ top: 0 });

  try {
    if (isHome) await viewHome(app);
    else if (path.startsWith("categorie/")) {
      const cat = SLUG_CAT[path.split("/")[1]];
      await viewCatalog(app, new URLSearchParams(cat ? { cat } : {}));
    }
    else if (path === "catalogue") await viewCatalog(app, params);
    else if (path.startsWith("produit/")) await viewProduct(app, Number(path.split("/")[1]));
    else if (path.startsWith("prebuilt/")) await viewPrebuilt(app, path.split("/")[1]);
    else if (path === "configurateur") await viewBuilder(app);
    else if (path === "comparer") await viewCompare(app);
    else if (path === "qui-sommes-nous") viewAbout(app);
    else if (path === "contact") viewContact(app);
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
      <p style="color:var(--text-faint);font-size:.85rem">Une erreur est survenue. Réessayez dans un instant ou revenez à l'accueil.</p>
      <br><a class="btn btn-primary" href="/">Retour à l'accueil</a></div>`;
  }
}

/* ─── Vue : accueil ─── */
// Grandes marques du catalogue (bandeau défilant). Piste dupliquée côté template
// pour une boucle sans couture (translateX(-50%) = exactement une piste).
const TRUST_BRANDS = ["NVIDIA", "AMD", "Intel", "ASUS", "MSI", "Gigabyte", "Corsair", "Samsung", "Kingston", "Logitech", "Razer", "Noctua", "Seasonic", "be quiet!"];
async function viewHome(app) {
  const trustRow = TRUST_BRANDS.map((b) => `<span class="void-trust-item">${b}</span>`).join("");
  app.innerHTML = `
  <div class="void-home">
    <section class="void-hero">
      <canvas class="void-field" id="voidField" aria-hidden="true"></canvas>
      <div class="void-grid" aria-hidden="true"></div>
      <div class="void-lamp" aria-hidden="true"></div>
      <div class="void-depth" aria-hidden="true">
        <span></span><span></span><span></span><span></span>
      </div>

      <div class="void-copy gsap-pending">
        <span class="void-eyebrow">VoltCore / void build</span>
        <div class="void-h1-wrap">
          <h1 class="void-h1">Construis dans le noir.</h1>
        </div>
        <p>Un espace calme pour choisir ton PC. Peu de bruit, des composants lisibles, une machine qui sort lentement du vide.</p>
        <div class="void-actions">
          <a class="btn void-btn void-btn-primary" href="#prebuilts"><span>Voir les machines</span><b aria-hidden="true">&rarr;</b></a>
          <a class="btn void-btn void-btn-ghost" href="/configurateur"><span>Configurer</span><b aria-hidden="true">+</b></a>
        </div>
        <div class="void-readout">
          <div><strong id="statCount">280+</strong><span>pieces en stock</span></div>
          <div><strong>4</strong><span>machines pretes</span></div>
        </div>
      </div>

      <div class="void-stage" id="voidStage" aria-label="Scene 3D VoltCore en mouvement">
        <canvas class="void-model" id="voidModel" aria-hidden="true"></canvas>
      </div>

      <div class="void-scroll" aria-hidden="true"><span></span></div>
    </section>

    <section class="void-orbit-strip" data-void-sep>
      <a class="void-orbit-card" href="/catalogue"><span>Catalogue</span><strong>Plus de 280 composants en stock, fiches claires et prix &agrave; jour.</strong></a>
      <a class="void-orbit-card" href="/configurateur"><span>Configurateur</span><strong>Un assistant guid&eacute; qui v&eacute;rifie la compatibilit&eacute; &agrave; chaque &eacute;tape.</strong></a>
      <a class="void-orbit-card" href="/compte"><span>Commande</span><strong>Paiement s&eacute;curis&eacute; Stripe, facture PDF et suivi dans votre compte.</strong></a>
    </section>

    <div class="void-trust" aria-label="Grandes marques de notre catalogue">
      <span class="void-trust-label">Les grandes marques de notre catalogue</span>
      <div class="void-trust-track">${trustRow}<span aria-hidden="true" style="display:contents">${trustRow}</span></div>
    </div>

    <section class="section void-section prebuilts" id="prebuilts">
      <div class="section-head"><h2>Machines pr&ecirc;tes</h2><a href="/configurateur">Composer le mien &rarr;</a></div>
      <p class="pb-sub">Quatre bases noires, lisibles, calibr&eacute;es pour comparer vite sans effet inutile.</p>
      <div class="pb-grid" id="prebuiltGrid">${"<div class='skeleton void-skeleton' style='min-height:420px'></div>".repeat(4)}</div>
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
      <div class="perks">
        <a class="perk" href="/cgv"><div class="perk-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7h11v8H3z"/><path d="M14 10h4l3 3v2h-7z"/><circle cx="7.5" cy="17.5" r="1.7"/><circle cx="17.5" cy="17.5" r="1.7"/></svg></div><div><h4>Livraison</h4><p>Les frais et options disponibles sont calculés au panier.</p></div></a>
        <a class="perk" href="/retours-remboursements"><div class="perk-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 5 6v5c0 4.5 3 7.6 7 9 4-1.4 7-4.5 7-9V6z"/><path d="m9 12 2 2 4-4"/></svg></div><div><h4>Garanties</h4><p>Rétractation légale 14 jours et garantie légale de conformité.</p></div></a>
        <a class="perk" href="/configurateur"><div class="perk-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/></svg></div><div><h4>Compatibilité</h4><p>Le configurateur vérifie les choix au fil de la sélection.</p></div></a>
        <a class="perk" href="/confidentialite"><div class="perk-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg></div><div><h4>Paiement</h4><p>Transactions chiffrées et données protégées.</p></div></a>
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
    <a class="cat-card" href="${catUrl(key)}">
      <div class="cat-icon" style="width:54px;height:54px">${art(key, 30)}</div>
      <h3>${c.label}</h3>
      <span>${catCount[key]?.count ?? 0} produits · dès ${fmt(catCount[key]?.min_price ?? 0)}</span>
    </a>`).join("");
  $("#featuredGrid").innerHTML = `<div class="product-grid">${featured.filter((p) => p.featured).slice(0, 8).map(productCard).join("")}</div>`;
  bindProductCards(app, featured);

  renderPrebuilts();
  initHome3D();
  homeMotionCleanup = initHomeMotion();

  // Hero GSAP (lazy, accueil uniquement). Progressive enhancement : si GSAP
  // est indisponible ou lent, on retire .gsap-pending pour révéler la copie
  // (jamais de hero masqué). Filet de sécurité à 2,5 s contre un CDN qui pend.
  const heroEl = $(".void-hero");
  const copyEl = $(".void-copy");
  const revealCopy = () => copyEl && copyEl.classList.remove("gsap-pending");
  const gsapFallback = setTimeout(revealCopy, 2500);
  ensureGsap().then((ok) => {
    clearTimeout(gsapFallback);
    if (ok && heroEl && heroEl.isConnected && window.initVoltHeroGSAP) {
      heroGsapCleanup = window.initVoltHeroGSAP(heroEl);
    } else {
      revealCopy();
    }
  });
}

/* ─── PC prémontés (configs curées, compatibilité vérifiée) ─── */
// Rôle d'une machine → catégorie du catalogue correspondante.
const PREBUILT_CATEGORIES = {
  "Processeur": "cpu",
  "Carte graphique": "gpu",
  "Mémoire": "ram",
  "Carte mère": "motherboard",
  "Stockage": "storage",
  "Refroidissement": "cooling",
  "Alimentation": "psu",
  "Boîtier": "case",
  "Écran": "monitor",
  "Clavier": "keyboard",
  "Souris": "mouse",
  "Casque": "headset",
  "Tapis": "mousepad",
};
// Roles « tour » (composants PC) et roles « bundle » (tour + périphériques).
const PREBUILT_CORE_ROLES = ["Processeur", "Carte graphique", "Mémoire", "Carte mère", "Stockage", "Refroidissement", "Alimentation", "Boîtier"];
const PREBUILT_ROLES = Object.keys(PREBUILT_CATEGORIES);

// Machines composées DYNAMIQUEMENT depuis le catalogue, PAR TRANCHE DE BUDGET.
// Les 4 configs sont des BUNDLES COMPLETS (tour + écran, clavier, souris, casque
// micro, tapis). Le budget est réparti par poste puis on retient le composant le
// plus performant qui tient dans son enveloppe, et une 2e passe dépense le
// budget restant à améliorer GPU/CPU → configs équilibrées et rentables.
const PREBUILTS = [
  { key: "pulse", tier: "Essentiel", name: "VoltCore Pulse", tag: "Bundle complet — bureautique & e-sport 1080p", featured: false, budget: 1050, ids: {} },
  { key: "spark", tier: "Entrée gaming", name: "VoltCore Spark", tag: "Bundle complet — gaming 1080p haute fréquence", featured: false, budget: 1750, ids: {} },
  { key: "surge", tier: "Performance", name: "VoltCore Surge", tag: "Bundle complet — 1440p haut niveau & création", featured: true, budget: 2800, ids: {} },
  { key: "apex", tier: "Ultra haut de gamme", name: "VoltCore Apex", tag: "Bundle complet — 4K ultra & IA", featured: false, budget: 5200, ids: {} },
];

// Répartition indicative du budget par poste (somme ≈ 1, bundle complet). On
// concentre sur GPU puis CPU, on économise sur boîtier/RAM/périphériques, sans
// rogner sur l'alimentation ni le refroidissement (stabilité).
const BUDGET_SPLIT = {
  "Carte graphique": 0.30,
  "Processeur": 0.15,
  "Carte mère": 0.08,
  "Mémoire": 0.06,
  "Stockage": 0.07,
  "Refroidissement": 0.05,
  "Alimentation": 0.07,
  "Boîtier": 0.06,
  "Écran": 0.09,
  "Clavier": 0.025,
  "Souris": 0.02,
  "Casque": 0.03,
  "Tapis": 0.01,
};

// Index du composant le plus cher tenant dans l'enveloppe (liste triée croissant).
function pickIndexForBudget(list, alloc) {
  let idx = 0;
  for (let i = 0; i < list.length; i++) { if (list[i].price <= alloc) idx = i; else break; }
  return idx;
}

const prebuiltRoleLabel = (role) => ({
  "Carte graphique": "GPU",
  "Processeur": "CPU",
  "Carte mère": "CM",
  "Mémoire": "RAM",
  "Refroidissement": "Cooling",
  "Alimentation": "PSU",
}[role] || role);
const findPrebuilt = (key) => PREBUILTS.find((b) => b.key === key);

// Composants mis en avant sur la carte d'aperçu (les autres sont résumés).
const PREBUILT_KEY_ROLES = ["Processeur", "Carte graphique", "Mémoire", "Stockage"];

// Charge le catalogue, compose chaque machine (remplit b.ids role→id) et renvoie
// une Map id→produit avec tous les composants retenus.

// Charge le catalogue groupé par catégorie (listes triées par prix croissant),
// pour composer des machines à la volée à n'importe quel budget.
async function loadPrebuiltCatalog() {
  const wanted = new Set(Object.values(PREBUILT_CATEGORIES));
  // Vue compacte enrichie des seules specs nécessaires à la compatibilité :
  // nettement plus légère que les fiches complètes, mais assez riche pour
  // composer une vraie machine (socket, TDP, dimensions, puissance).
  const all = await api(`/products?compact=1&compat=1&limit=1000`);
  const byCat = new Map();
  for (const p of all) {
    if (!wanted.has(p.category) || (p.stock ?? 0) <= 0) continue;
    if (!byCat.has(p.category)) byCat.set(p.category, []);
    byCat.get(p.category).push(p);
  }
  for (const list of byCat.values()) list.sort((a, b) => a.price - b.price);
  return byCat;
}

const partSpec = (p, key, label = key) => p?.specs?.[key] ?? p?.specs?.[label];
const partWatts = (p) => Number(partSpec(p, "watts")) || specNum(partSpec(p, "Puissance"));
const partTdp = (p) => Number(partSpec(p, "tdp_w")) || specNum(partSpec(p, "TDP"));
const gpuLength = (p) => Number(partSpec(p, "length_mm")) || specNum(partSpec(p, "Longueur"));
const caseGpuLength = (p) => Number(partSpec(p, "max_gpu_mm")) || specNum(partSpec(p, "GPU max")) || 999;
const coolingCapacity = (p) => specNum(partSpec(p, "TDP supporté"));
const storageTerabytes = (p) => {
  const value = String(partSpec(p, "Capacité") || "");
  const amount = specNum(value);
  return /\bgo\b/i.test(value) ? amount / 1000 : amount;
};

function caseSupportsMotherboard(pcCase, motherboard) {
  const board = String(partSpec(motherboard, "form_factor", "Format") || "").toLowerCase();
  const tower = String(partSpec(pcCase, "Format") || "").toLowerCase();
  if (!board || !tower) return true;
  if (board.includes("e-atx")) return tower.includes("e-atx");
  if (board.includes("atx") && !board.includes("micro")) return tower.includes("atx") && !tower.includes("mini");
  if (board.includes("matx") || board.includes("micro")) return !tower.includes("mini-itx");
  return true; // Une carte Mini-ITX tient dans tous les formats du catalogue.
}

function compatibleBudgetPart(role, product, chosen) {
  const cpu = chosen["Processeur"]?.product;
  const gpu = chosen["Carte graphique"]?.product;
  const motherboard = chosen["Carte mère"]?.product;
  if (role === "Carte mère" && cpu) {
    const ram = chosen["Mémoire"]?.product;
    const pcCase = chosen["Boîtier"]?.product;
    return partSpec(product, "socket") === partSpec(cpu, "socket")
      && (!ram || partSpec(product, "ram_type") === partSpec(ram, "ram_type"))
      && (!pcCase || caseSupportsMotherboard(pcCase, product));
  }
  if (role === "Mémoire" && motherboard) return partSpec(product, "ram_type") === partSpec(motherboard, "ram_type");
  if (role === "Refroidissement" && cpu) {
    const sockets = partSpec(product, "sockets") || [];
    return sockets.includes(partSpec(cpu, "socket")) && (!coolingCapacity(product) || coolingCapacity(product) >= partTdp(cpu));
  }
  if (role === "Boîtier") {
    const gpuFits = !gpu || !gpuLength(gpu) || caseGpuLength(product) >= gpuLength(gpu);
    return gpuFits && (!motherboard || caseSupportsMotherboard(product, motherboard));
  }
  if (role === "Alimentation" && (cpu || gpu)) {
    const need = Math.ceil((150 + partTdp(cpu) + partTdp(gpu)) * 1.25 / 50) * 50;
    return partWatts(product) >= need;
  }
  return true;
}

function bestBudgetPart(list, ceiling, score = perfScore) {
  const affordable = list.filter((p) => p.price <= ceiling);
  const pool = affordable.length ? affordable : list.slice(0, 1);
  return pool.reduce((best, p) => {
    const diff = score(p) - score(best);
    return diff > 0 || (diff === 0 && p.price < best.price) ? p : best;
  }, pool[0]);
}

function budgetCpuTier(p) {
  const cores = Math.min(16, specNum(partSpec(p, "Cœurs")));
  const boost = specNumMax(partSpec(p, "Boost") || partSpec(p, "Fréquence"));
  const generation = /ryzen\s+\d\s+9\d{3}/i.test(p.name) ? 5
    : /core ultra/i.test(p.name) ? 4
    : /ryzen\s+\d\s+7\d{3}|i[579]-14/i.test(p.name) ? 2 : 0;
  return cores * 2 + boost * 7 + (/x3d/i.test(p.name) ? 18 : 0) + generation;
}

function budgetRoleScore(role, p, chosen) {
  if (role === "Carte mère") {
    return (p.rating || 0) * 10 + specNum(partSpec(p, "M.2")) * 3 + (/wifi/i.test(p.name) ? 2 : 0);
  }
  if (role === "Refroidissement") {
    const cpuTdp = partTdp(chosen["Processeur"]?.product);
    return Math.min(coolingCapacity(p), Math.max(180, cpuTdp * 1.25)) / 5 + (p.rating || 0) * 2;
  }
  if (role === "Boîtier") return (p.rating || 0) * 10 + Math.min(5, caseGpuLength(p) / 100);
  return perfScore(p);
}

// Élimine les produits dominés (plus chers sans être plus performants).
// La recherche CPU × GPU travaille ainsi sur une petite frontière de Pareto
// plutôt que sur tout le catalogue à chaque mouvement du curseur.
function performanceFrontier(list, score) {
  let best = -Infinity;
  return [...list].sort((a, b) => a.price - b.price).filter((p) => {
    const value = score(p);
    if (value <= best) return false;
    best = value;
    return true;
  });
}

// Compose une machine compatible et équilibrée. Le moteur évalue les couples
// CPU/GPU, construit pour chacun la plateforme minimale valide, puis utilise le
// budget restant sur les améliorations offrant le meilleur gain par euro.
function composeForBudget(budget, byCat, roles = PREBUILT_ROLES) {
  const lists = Object.fromEntries(roles.map((role) => [role, byCat.get(PREBUILT_CATEGORIES[role]) || []]));
  const fixed = {};
  const platformRoles = new Set(PREBUILT_CORE_ROLES);

  // Les périphériques sont réservés avant la tour pour que les bundles ne
  // consomment pas tout leur budget dans le GPU.
  for (const role of roles.filter((r) => !platformRoles.has(r))) {
    if (!lists[role].length) continue;
    fixed[role] = { product: bestBudgetPart(lists[role], budget * (BUDGET_SPLIT[role] || .03)) };
  }
  const fixedSpent = Object.values(fixed).reduce((sum, c) => sum + c.product.price, 0);
  const coreBudget = budget - fixedSpent;
  const cpus = performanceFrontier((lists["Processeur"] || []).filter((cpu) => {
    const socket = partSpec(cpu, "socket");
    return socket !== "sTR5"
      && !(budget >= 1800 && socket === "AM4")
      && lists["Carte mère"]?.some((m) => partSpec(m, "socket") === socket)
      && lists["Refroidissement"]?.some((c) => (partSpec(c, "sockets") || []).includes(socket));
  }), budgetCpuTier);
  const gpus = performanceFrontier(lists["Carte graphique"] || [], gpuTier);
  let winner = null;

  for (const cpu of cpus) {
    for (const gpu of gpus) {
      if (cpu.price > coreBudget * .30 || gpu.price > coreBudget * .58) continue;
      const chosen = {
        ...fixed,
        "Processeur": { product: cpu },
        "Carte graphique": { product: gpu },
      };
      const socket = partSpec(cpu, "socket");
      const mobos = lists["Carte mère"].filter((p) => partSpec(p, "socket") === socket);
      if (!mobos.length) continue;
      chosen["Carte mère"] = {
        product: bestBudgetPart(mobos, coreBudget * .08, (p) => budgetRoleScore("Carte mère", p, chosen)),
      };

      const ramType = partSpec(chosen["Carte mère"].product, "ram_type");
      const targetRam = budget >= 2500 ? 64 : budget >= 1000 ? 32 : 16;
      let rams = lists["Mémoire"].filter((p) => partSpec(p, "ram_type") === ramType && specNum(partSpec(p, "Capacité")) >= targetRam);
      if (!rams.length) rams = lists["Mémoire"].filter((p) => partSpec(p, "ram_type") === ramType);
      const coolers = lists["Refroidissement"].filter((p) => compatibleBudgetPart("Refroidissement", p, chosen));
      const cases = lists["Boîtier"].filter((p) => compatibleBudgetPart("Boîtier", p, chosen));
      if (!rams.length || !coolers.length || !cases.length) continue;
      chosen["Mémoire"] = { product: bestBudgetPart(rams, coreBudget * .06) };
      chosen["Refroidissement"] = { product: coolers[0] };
      chosen["Boîtier"] = {
        product: bestBudgetPart(cases, coreBudget * .06, (p) => budgetRoleScore("Boîtier", p, chosen)),
      };

      const psus = lists["Alimentation"].filter((p) => compatibleBudgetPart("Alimentation", p, chosen))
        .sort((a, b) => partWatts(a) - partWatts(b) || a.price - b.price);
      if (!psus.length) continue;
      chosen["Alimentation"] = { product: psus[0] };
      if (lists["Stockage"]?.length) {
        const targetStorage = budget >= 3000 ? 2 : budget >= 1000 ? 1 : .48;
        const storage = lists["Stockage"].filter((p) => storageTerabytes(p) >= targetStorage);
        chosen["Stockage"] = { product: bestBudgetPart(storage.length ? storage : lists["Stockage"], coreBudget * .07) };
      }

      const spent = Object.values(chosen).reduce((sum, c) => sum + c.product.price, 0);
      if (spent > budget) continue;
      const gpuScore = gpuTier(gpu), cpuScore = budgetCpuTier(cpu);
      const score = gpuScore * 2 + cpuScore * .85 - Math.max(0, gpuScore - cpuScore - 18) * .7;
      if (!winner || score > winner.score || (score === winner.score && spent < winner.spent)) {
        winner = { chosen, spent, score };
      }
    }
  }

  if (!winner) {
    // Repli robuste pour un catalogue incomplet ou un budget exceptionnellement bas.
    const chosen = { ...fixed };
    for (const role of roles.filter((r) => !chosen[r] && lists[r]?.length)) chosen[role] = { product: lists[role][0] };
    return roles.map((role) => chosen[role] ? { role, product: chosen[role].product } : null).filter(Boolean);
  }

  // Améliorations sûres : chaque candidate est revérifiée contre la plateforme
  // courante et classée par gain de performance / euro.
  const chosen = winner.chosen;
  let spent = winner.spent;
  const maxRam = budget < 1000 ? 16 : budget < 2500 ? 32 : budget < 4000 ? 64 : 96;
  const upgradable = new Set(["Stockage", "Mémoire", "Carte mère", "Refroidissement", "Écran", "Clavier", "Souris", "Casque", "Tapis"]);
  for (let pass = 0; pass < 24; pass++) {
    let best = null;
    for (const role of roles) {
      if (!upgradable.has(role) || !chosen[role]) continue;
      const current = chosen[role].product;
      for (const candidate of lists[role] || []) {
        if (role === "Mémoire" && specNum(partSpec(candidate, "Capacité")) > maxRam) continue;
        const extra = candidate.price - current.price;
        if (extra <= 0 || spent + extra > budget || !compatibleBudgetPart(role, candidate, chosen)) continue;
        const gain = budgetRoleScore(role, candidate, chosen) - budgetRoleScore(role, current, chosen);
        if (gain <= 0) continue;
        const value = gain / extra;
        if (!best || value > best.value || (value === best.value && gain > best.gain)) best = { role, candidate, extra, gain, value };
      }
    }
    if (!best) break;
    chosen[best.role] = { product: best.candidate };
    spent += best.extra;
  }
  return roles.map((role) => chosen[role] ? { role, product: chosen[role].product } : null).filter(Boolean);
}

async function loadPrebuiltProducts() {
  const byCat = await loadPrebuiltCatalog();
  const byId = new Map();
  for (const b of PREBUILTS) {
    b.ids = {};
    for (const { role, product } of composeForBudget(b.budget, byCat)) {  // bundle complet
      b.ids[role] = product.id;
      byId.set(product.id, product);
    }
  }
  return byId;
}
const prebuiltParts = (b, byId) =>
  PREBUILT_ROLES.map((role) => ({ role, product: byId.get(b.ids[role]) })).filter((x) => x.product);
const prebuiltTotal = (parts) => parts.reduce((s, { product }) => s + product.price, 0);

function addPrebuiltToCart(b, byId, excluded = null) {
  if (!state.user) {
    requireAuth(() => addPrebuiltToCart(b, byId, excluded));
    toast("Connectez-vous pour enregistrer votre panier sur votre compte", "info");
    return;
  }
  let n = 0;
  // `excluded` (Set d'index) = composants que le client a retirés sur la page
  // détail ; le pack de base reste intact, seul le panier du client est filtré.
  prebuiltParts(b, byId).forEach(({ product }, i) => {
    if (excluded && excluded.has(i)) return;
    if (product.stock > 0) { addToCart(product, 1, true); n++; }
  });
  if (n === 0) { toast("Aucun composant à ajouter", "info"); return; }
  fireVoltBurst();
  toast(`${b.name} ajouté : ${n} composant${n > 1 ? "s" : ""}`, "success");
  openCart();
}

function addPartsToCart(parts, label = "Configuration") {
  if (!state.user) {
    requireAuth(() => addPartsToCart(parts, label));
    toast("Connectez-vous pour enregistrer votre panier sur votre compte", "info");
    return;
  }
  let n = 0;
  parts.forEach(({ product }) => { if (product.stock > 0) { addToCart(product, 1, true); n++; } });
  fireVoltBurst();
  toast(`${label} ajoutée : ${n} composants`, "success");
  openCart();
}

// Niveau de jeu indicatif selon le budget total.
function budgetPowerLabel(b) {
  if (b < 800) return "Bureautique &amp; e-sport · 1080p";
  if (b < 1300) return "Gaming fluide · 1080p haute fréquence";
  if (b < 2000) return "Gaming exigeant · 1440p";
  if (b < 3000) return "Création &amp; gaming · 1440p/4K";
  return "Ultra · 4K &amp; IA";
}

// Générateur de configuration accessible : un curseur de budget compose en
// direct une machine complète et équilibrée pour le montant choisi.
async function renderBudgetBuilder() {
  const host = $("#budgetBuilder");
  if (!host) return;
  let byCat;
  try { byCat = await loadPrebuiltCatalog(); }
  catch { host.innerHTML = ""; return; }
  const MIN = 500, MAX = 5000, STEP = 50, def = 1200;

  host.innerHTML = `
    <div class="bb-card">
      <div class="bb-head">
        <div>
          <span class="pb-tier">Composez par budget</span>
          <h3 class="bb-title">Un PC complet pour <span id="bbAmount"></span></h3>
          <p class="bb-power" id="bbPower"></p>
        </div>
        <button class="btn void-btn void-btn-primary" id="bbAdd"><span>Ajouter au panier</span><b aria-hidden="true">+</b></button>
      </div>
      <div class="bb-slider">
        <div class="bb-track" aria-hidden="true"><div class="bb-fill"><i class="bb-flow"></i></div></div>
        <output class="bb-budget-pop" id="bbBudgetPop" for="bbRange"></output>
        <input type="range" id="bbRange" class="bb-range" min="${MIN}" max="${MAX}" step="${STEP}" value="${def}"
          aria-label="Budget de la configuration">
      </div>
      <div class="bb-ticks"><span>${fmt(MIN)}</span><span>${fmt(MAX)}</span></div>
      <div class="bb-smart" id="bbSmart" aria-live="polite"></div>
      <ul class="bb-parts" id="bbParts"></ul>
      <div class="bb-total"><span>Total estimé</span><strong id="bbTotal"></strong></div>
    </div>`;

  const range = $("#bbRange", host);
  const slider = range.closest(".bb-slider");
  const buildCache = new Map();
  let current = [];
  const update = () => {
    const budget = +range.value;
    const fill = `${(budget - MIN) / (MAX - MIN) * 100}%`;
    // Le curseur compose une TOUR (composants seuls) ; les 4 configs sont des bundles.
    current = buildCache.get(budget) || composeForBudget(budget, byCat, PREBUILT_CORE_ROLES);
    if (!buildCache.has(budget)) buildCache.set(budget, current);
    const total = prebuiltTotal(current);
    const selected = Object.fromEntries(current.map(({ role, product }) => [role, product]));
    const estimatedLoad = 150 + partTdp(selected["Processeur"]) + partTdp(selected["Carte graphique"]);
    const psuHeadroom = Math.max(0, partWatts(selected["Alimentation"]) - estimatedLoad);
    slider.style.setProperty("--bb-fill", fill);
    range.setAttribute("aria-valuetext", fmt(budget));
    $("#bbBudgetPop", host).textContent = fmt(budget);
    $("#bbAmount", host).textContent = fmt(budget);
    $("#bbPower", host).innerHTML = budgetPowerLabel(budget);
    $("#bbTotal", host).textContent = fmt(total);
    $("#bbSmart", host).innerHTML = `
      <span class="bb-smart-ok">✓ Compatibilité vérifiée</span>
      <span>⚡ ${Math.round(psuHeadroom)} W de marge</span>
      <span>Budget utilisé à ${Math.round(total / budget * 100)} %</span>`;
    $("#bbParts", host).innerHTML = current.map(({ role, product }) =>
      `<li><span class="k">${prebuiltRoleLabel(role)}</span><span class="v">${esc(product.brand)} ${esc(product.name)}</span><span class="p">${fmt(product.price)}</span></li>`
    ).join("");
  };
  range.oninput = update;
  const startDrag = () => slider.classList.add("is-dragging");
  const stopDrag = () => {
    slider.classList.remove("is-dragging");
    slider.classList.remove("is-settling");
    void slider.offsetWidth;
    slider.classList.add("is-settling");
    window.setTimeout(() => slider.classList.remove("is-settling"), 520);
  };
  range.addEventListener("pointerdown", startDrag);
  range.addEventListener("pointerup", stopDrag);
  range.addEventListener("pointercancel", stopDrag);
  range.addEventListener("change", stopDrag);
  $("#bbAdd", host).onclick = () => addPartsToCart(current, "Configuration sur mesure");
  update();
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

  const allParts = prebuiltParts(b, byId);
  // Composants retirés par le client — exclusion LOCALE à cette vue (par index).
  // Ne modifie pas le pack de base (PREBUILTS) : ça n'agit que sur ce que le
  // client ajoutera à son panier.
  const excluded = new Set();
  const kept = () => allParts.filter((_, i) => !excluded.has(i));

  function render() {
    const keptParts = kept();
    const total = prebuiltTotal(keptParts);
    const available = keptParts.filter(({ product }) => product.stock > 0).length;
    const allAvailable = keptParts.length > 0 && available === keptParts.length;
    app.innerHTML = `
  <div class="breadcrumb"><a href="/">Accueil</a><span>/</span><a href="/#prebuilts">PC prémontés</a><span>/</span><span>${esc(b.name)}</span></div>
  <section class="prebuilt-page">
    <div class="prebuilt-page-head">
      <span class="pb-tier">${esc(b.tier)}</span>
      <h1>${esc(b.name)}</h1>
      <p>${esc(b.tag)}</p>
      <div class="prebuilt-facts">
        <span>Compatibilité vérifiée</span>
        <span>${keptParts.length}/${allParts.length} composants${excluded.size ? " conservés" : ""}</span>
        <span>${keptParts.length === 0 ? "Aucun composant sélectionné" : (allAvailable ? "Disponible selon stock actuel" : `${available}/${keptParts.length} composants en stock`)}</span>
      </div>
    </div>
    <aside class="prebuilt-summary panel">
      <span>Total composants</span>
      <strong>${fmt(total)}</strong>
      <p>Retirez des composants ci-dessous pour personnaliser ce que vous ajoutez au panier. Le pack de base n'est pas modifié.</p>
      <button class="btn btn-primary btn-block" id="prebuiltAdd"${keptParts.length === 0 ? " disabled" : ""}>Ajouter la configuration${excluded.size ? " personnalisée" : ""}</button>
      ${excluded.size ? `<button class="btn btn-ghost btn-block btn-sm" id="prebuiltReset">↩ Rétablir le pack complet</button>` : ""}
      <a class="btn btn-ghost btn-block" href="/configurateur">Ouvrir le configurateur</a>
    </aside>
  </section>
  <section class="section">
    <div class="section-head"><h2>Composants inclus</h2><a href="/#prebuilts">Retour aux configurations</a></div>
    <div class="prebuilt-component-list">
      ${allParts.map(({ role, product }, i) => {
        const off = excluded.has(i);
        return `
        <div class="prebuilt-component-row" style="display:flex;align-items:center;gap:10px${off ? ";opacity:.5" : ""}">
          <a class="prebuilt-component" href="/produit/${product.id}" style="flex:1${off ? ";pointer-events:none" : ""}">
            <div class="prebuilt-component-visual">${art(product.category, hueOf(product))}${imgTag(product)}</div>
            <div>
              <span>${prebuiltRoleLabel(role)}</span>
              <strong>${esc(product.brand)} ${esc(product.name)}${off ? " — retiré" : ""}</strong>
            </div>
            <div class="prebuilt-component-meta">
              <strong>${fmt(product.price)}</strong>
              <small class="${product.stock > 0 ? "" : "out"}">${product.stock > 0 ? `${product.stock} en stock` : "Rupture"}</small>
            </div>
          </a>
          <button class="btn btn-sm pb-comp-toggle" data-idx="${i}" title="${off ? "Remettre ce composant" : "Retirer ce composant de votre panier"}"
            style="white-space:nowrap;flex-shrink:0;${off ? "" : "color:#d9544f;border:1px solid #d9544f;background:transparent"}">${off ? "↩ Remettre" : "✕ Retirer"}</button>
        </div>`;
      }).join("")}
    </div>
  </section>
  </div>`;

    const addBtn = $("#prebuiltAdd");
    if (addBtn) addBtn.onclick = () => addPrebuiltToCart(b, byId, excluded);
    const resetBtn = $("#prebuiltReset");
    if (resetBtn) resetBtn.onclick = () => { excluded.clear(); render(); };
    $$(".pb-comp-toggle").forEach((btn) => {
      btn.onclick = (e) => {
        e.preventDefault();
        const i = +btn.dataset.idx;
        if (excluded.has(i)) excluded.delete(i); else excluded.add(i);
        render();
      };
    });
  }

  render();
}

async function renderPrebuilts(preloaded) {
  const grid = $("#prebuiltGrid");
  if (!grid) return;
  let byId;
  try {
    byId = await loadPrebuiltProducts();
  } catch {
    grid.innerHTML = `<p style="color:var(--text-faint)">Configurations momentanément indisponibles.</p>`;
    return;
  }
  grid.innerHTML = PREBUILTS.map((b) => {
    const parts = prebuiltParts(b, byId);
    const total = prebuiltTotal(parts);
    const keyParts = PREBUILT_KEY_ROLES
      .map((r) => parts.find(({ role }) => role === r))
      .filter(Boolean);
    const restCount = parts.length - keyParts.length;
    const specs = keyParts.map(({ role, product }) =>
      `<li><span class="k">${prebuiltRoleLabel(role)}</span><span class="v">${esc(product.brand)} ${esc(product.name)}</span></li>`
    ).join("")
    + (restCount > 0
      ? `<li class="pb-more"><span class="k">+</span><span class="v">+${restCount} autres composants</span></li>`
      : "");
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
function viewAbout(app) {
  app.innerHTML = `
  <section class="content-page about-page">
    <nav class="breadcrumb"><a href="/">Accueil</a> / Qui sommes-nous</nav>
    <div class="content-hero">
      <span class="eyebrow">Boutique française</span>
      <h1>VoltCore aide à choisir les bons composants, sans jargon inutile.</h1>
      <p>Nous sélectionnons des cartes graphiques, processeurs, alimentations, boîtiers et périphériques pensés pour des configurations fiables, équilibrées et faciles à faire évoluer.</p>
    </div>
    <div class="story-grid">
      <article><h2>Notre rôle</h2><p>Rendre l'achat PC plus clair : des fiches lisibles, des conseils de compatibilité, un configurateur guidé et un panier qui garde les informations importantes sous les yeux.</p></article>
      <article><h2>Notre méthode</h2><p>Chaque recommandation met en avant l'usage réel : gaming 1080p, 1440p, création vidéo, silence, évolutivité ou budget maîtrisé.</p></article>
      <article><h2>Expédition</h2><p>Les informations de livraison, de facture et de suivi de commande sont affichées dans l'espace client lorsque la commande est disponible.</p></article>
    </div>
    <div class="content-actions">
      <a class="btn btn-primary" href="/configurateur">Configurer un PC</a>
      <a class="btn btn-ghost" href="/catalogue">Voir le catalogue</a>
      <a class="btn btn-ghost" href="/contact">Nous contacter</a>
    </div>
  </section>`;
}

/* ─── Vue : Nous contacter ─── */
function viewContact(app) {
  app.innerHTML = `
  <section class="content-page contact-page">
    <nav class="breadcrumb"><a href="/">Accueil</a> / Nous contacter</nav>
    <div class="content-hero compact">
      <span class="eyebrow">Support VoltCore</span>
      <h1>Une question ? Nous sommes là pour vous aider.</h1>
      <p>Notre équipe répond aux questions sur les produits, les commandes, le suivi de livraison et le service après-vente.</p>
    </div>
    <div class="contact-grid">
      <a class="contact-card" href="mailto:support@voltcore.fr">
        <div class="contact-ico"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg></div>
        <h2>Par e-mail</h2>
        <p>Écrivez-nous à tout moment, nous répondons sous 24&nbsp;h ouvrées.</p>
        <strong>support@voltcore.fr</strong>
      </a>
      <div class="contact-card">
        <div class="contact-ico"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></div>
        <h2>Horaires</h2>
        <p>Du lundi au vendredi, de 9&nbsp;h à 18&nbsp;h.</p>
        <strong>Réponse sous 24&nbsp;h ouvrées</strong>
      </div>
      <div class="contact-card">
        <div class="contact-ico"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></div>
        <h2>Suivi de commande</h2>
        <p>Précisez votre numéro de commande et l'e-mail utilisé lors de l'achat.</p>
        <strong>Espace « Mon compte »</strong>
      </div>
    </div>
    <div class="content-actions">
      <a class="btn btn-primary" href="mailto:support@voltcore.fr">Envoyer un e-mail</a>
      <a class="btn btn-ghost" href="/compte">Mon compte</a>
    </div>
  </section>`;
}

const LEGAL_PAGES = {
  mentions: {
    title: "Mentions légales",
    intro: "Informations d'identification, de contact et de responsabilité de la boutique VoltCore.",
    sections: [
      ["Éditeur du site", "VoltCore, boutique française de composants et de périphériques PC. Pour toute question relative à l'identité de l'éditeur ou au responsable de publication, contactez-nous à support@voltcore.fr."],
      ["Contact", "Pour toute question ou réclamation : support@voltcore.fr. Les demandes liées aux commandes doivent préciser le numéro de commande et l'adresse e-mail utilisée lors de l'achat."],
      ["Hébergement", "Le site est hébergé par Render (Render Inc.). Toute demande relative à l'hébergement peut être adressée à notre support."],
      ["Facturation", "Une facture PDF est générée automatiquement après paiement et reste disponible à tout moment depuis l'espace client."],
      ["Propriété intellectuelle", "Les textes, interfaces et éléments de marque VoltCore sont protégés. Toute reproduction sans autorisation est interdite."],
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
      ["Vos droits", "Vous pouvez demander l'accès, la rectification, l'effacement, la limitation, l'opposition ou la portabilité de vos données via support@voltcore.fr."],
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
  </section>`;
}

/* ─── Animations home : tour PC (hero) + séparateurs 3D pilotés au scroll ───
   Chaque séparateur reçoit une progression --p (0→1) selon sa traversée du
   viewport ; le CSS la transforme en effets VARIÉS (profondeur, dépliage),
   pas seulement en rotation. La tour du hero réagit au scroll + à la souris. */
let home3DCleanup = null;
let homeMotionCleanup = null;
let heroGsapCleanup = null;
function cleanupHome3D() {
  if (home3DCleanup) { home3DCleanup(); home3DCleanup = null; }
  if (homeMotionCleanup) { homeMotionCleanup(); homeMotionCleanup = null; }
  if (heroGsapCleanup) { heroGsapCleanup(); heroGsapCleanup = null; }
}

/* Charge GSAP 3.13 (+ ScrollTrigger, SplitText) et hero-gsap.js à la demande,
   uniquement sur l'accueil. Vendoré en local (comme three.min.js) → same-origin,
   pas de CDN tiers. Tous les plugins GSAP sont gratuits (rachat Webflow).
   Renvoie une promesse résolue à true si prêt, false sinon (le hero reste
   alors statique mais entièrement fonctionnel). */
let _gsapPromise = null;
function ensureGsap() {
  if (typeof gsap !== "undefined" && window.ScrollTrigger && window.SplitText && window.initVoltHeroGSAP) {
    return Promise.resolve(true);
  }
  if (_gsapPromise) return _gsapPromise;
  const load = (src) => new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = src; s.async = true; s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
  const v = "?v=313";
  _gsapPromise = load("/js/gsap.min.js" + v)
    .then(() => Promise.all([load("/js/ScrollTrigger.min.js" + v), load("/js/SplitText.min.js" + v)]))
    .then(() => load("/js/hero-gsap.js?v=2"))
    .then(() => { gsap.registerPlugin(window.ScrollTrigger, window.SplitText); return true; })
    .catch(() => { _gsapPromise = null; return false; });
  return _gsapPromise;
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

/* Charge three.min.js + hero-void.js à la demande (une seule fois). Le modèle
   WebGL du hero ne sert que sur l'accueil → inutile de payer 589 Ko ailleurs.
   Renvoie une promesse résolue à true si la lib est prête, false sinon. */
let _heroLibPromise = null;
function ensureHeroLib() {
  if (typeof THREE !== "undefined" && window.initVoltVoidModel) return Promise.resolve(true);
  if (_heroLibPromise) return _heroLibPromise;
  const load = (src) => new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = src; s.async = true; s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
  _heroLibPromise = load("/js/three.min.js?v=104")
    .then(() => load("/js/hero-void.js?v=104"))
    .then(() => true)
    .catch(() => { _heroLibPromise = null; return false; });
  return _heroLibPromise;
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
    let stopStatic = null, cancelled = false;
    if (stage && modelCanvas) {
      ensureHeroLib().then((ok) => {
        if (cancelled || !ok || !window.initVoltVoidModel) return;
        stopStatic = window.initVoltVoidModel(stage, modelCanvas, { reducedMotion: true });
      });
    }
    home3DCleanup = () => { cancelled = true; if (stopStatic) stopStatic(); };
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

  let stopModel = null, modelCancelled = false;
  if (stage && modelCanvas) {
    ensureHeroLib().then((ok) => {
      if (modelCancelled || !ok || !window.initVoltVoidModel) return;
      stopModel = window.initVoltVoidModel(stage, modelCanvas);
    });
  }

  home3DCleanup = () => {
    modelCancelled = true;
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", onScroll);
    stopVoidFields.forEach((stop) => stop());
    if (stopModel) stopModel();
  };
  update();
}

/* ─── Accueil : couche « premium » (cartes + sections) ─────────────
   Tilt 3D + reflet des cartes et révélation des sections au scroll.
   Le hero (intro, CTA magnétiques, lampe, compteurs, parallaxe) est
   désormais géré par hero-gsap.js (GSAP). Différé (appelé en fin de
   viewHome), 100 % transform/opacity, jamais armé en reduced-motion.
   Renvoie une fonction de nettoyage stockée dans homeMotionCleanup. */
function initHomeMotion() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return null;
  const home = $(".void-home");
  if (!home) return null;
  const cleanups = [];
  // Amplitude d'inclinaison (deg). Cartes produit volontairement plus douces
  // (rendu pro, moins « gadget ») que les cartes catégorie.
  const TILT_PRODUCT = 2.6;
  const TILT_CAT = 4;

  /* 1 · Tilt 3D + reflet des cartes (parallaxe au curseur).
     Délégation sur le conteneur → fonctionne aussi pour les cartes
     injectées après coup (PC prémontés chargés en différé). */
  let active = null, tiltTick = false, lastEvt = null, dropTimer = 0;
  const applyTilt = () => {
    tiltTick = false;
    if (!active || !lastEvt) return;
    const r = active.getBoundingClientRect();
    const px = clamp01((lastEvt.clientX - r.left) / (r.width || 1));
    const py = clamp01((lastEvt.clientY - r.top) / (r.height || 1));
    const isCat = active.matches(".cat-card");
    const ampl = isCat ? TILT_CAT : TILT_PRODUCT;
    active.style.setProperty("--tilt-y", ((px - 0.5) * 2 * ampl).toFixed(2) + "deg");
    active.style.setProperty("--tilt-x", (-(py - 0.5) * 2 * ampl).toFixed(2) + "deg");
    active.style.setProperty("--tilt-lift", (isCat ? -4 : -3) + "px");
    active.style.setProperty("--gx", (px * 100).toFixed(1) + "%");
    active.style.setProperty("--gy", (py * 100).toFixed(1) + "%");
  };
  const resetCard = (card) => {
    card.style.setProperty("--tilt-x", "0deg");
    card.style.setProperty("--tilt-y", "0deg");
    card.style.setProperty("--tilt-lift", "0px");
    clearTimeout(dropTimer);
    dropTimer = setTimeout(() => card.classList.remove("is-tilt"), 520);
  };
  const onOver = (e) => {
    const card = e.target.closest(".product-card, .cat-card");
    if (!card || card === active) return;
    if (active) resetCard(active);
    active = card;
    clearTimeout(dropTimer);
    card.classList.add("is-tilt");
  };
  const onMove = (e) => {
    if (!active) return;
    lastEvt = e;
    if (!tiltTick) { tiltTick = true; requestAnimationFrame(applyTilt); }
  };
  const onOut = (e) => {
    if (!active) return;
    if (e.relatedTarget && active.contains(e.relatedTarget)) return; // déplacement interne
    resetCard(active);
    active = null;
  };
  home.addEventListener("pointerover", onOver);
  home.addEventListener("pointermove", onMove, { passive: true });
  home.addEventListener("pointerout", onOut);
  cleanups.push(() => {
    home.removeEventListener("pointerover", onOver);
    home.removeEventListener("pointermove", onMove);
    home.removeEventListener("pointerout", onOut);
    clearTimeout(dropTimer);
  });

  /* 2 · Révélation des sections au scroll (IntersectionObserver) */
  const secs = $$(".void-section", home);
  if (secs.length && "IntersectionObserver" in window) {
    secs.forEach((s) => s.classList.add("reveal-armed"));
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); }
      }
    }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
    secs.forEach((s) => io.observe(s));
    cleanups.push(() => io.disconnect());
  }

  return () => cleanups.forEach((fn) => fn());
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
  const sortOptions = [
    ["featured", "En vedette"],
    ["performance", "Performance"],
    ["price_asc", "Prix croissant"],
    ["price_desc", "Prix décroissant"],
    ["rating", "Meilleures notes"],
    ["name", "Nom A→Z"],
  ];
  const activeSortLabel = sortOptions.find(([value]) => value === filters.sort)?.[1] || "En vedette";

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
      <div class="filter-group" id="brandGroup"><span>Constructeur</span></div>
      <div id="specGroup"></div>
      <div class="filter-group" id="priceGroup"><span>Prix (€)</span></div>
      <button class="btn btn-ghost btn-sm" id="resetFilters">Réinitialiser</button>
    </aside>
    <div class="catalog-results" id="catalogResults">
      <div class="catalog-toolbar">
        <h1>${pageTitle}<span class="count" id="resultCount"></span></h1>
        <div class="sort-control" id="sortControl">
          <button class="sort-trigger" id="sortTrigger" type="button" aria-haspopup="listbox" aria-expanded="false">
            <span class="sort-caption">Trier par</span>
            <strong>${activeSortLabel}</strong>
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>
          </button>
          <div class="sort-menu" id="sortMenu" role="listbox" aria-label="Ordre de tri" hidden>
            ${sortOptions.map(([value, label]) => `
              <button type="button" role="option" data-sort="${value}" aria-selected="${filters.sort === value}">
                <span>${label}</span>
                ${filters.sort === value ? '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 8 3 3 7-7"/></svg>' : ""}
              </button>`).join("")}
          </div>
        </div>
      </div>
      <div id="catalogGrid">${skeletons(8)}</div>
    </div>
  </div>`;

  const allProducts = await api("/products");
  const sortProducts = (list) => list.sort((a, b) => {
    if (filters.sort === "performance") return perfScore(b) - perfScore(a);
    if (filters.sort === "price_asc") return a.price - b.price;
    if (filters.sort === "price_desc") return b.price - a.price;
    if (filters.sort === "rating") return (b.rating - a.rating) || (b.rating_count - a.rating_count);
    if (filters.sort === "name") return a.name.localeCompare(b.name, "fr");
    return (Number(b.featured) - Number(a.featured)) || (b.rating - a.rating);
  });
  let products = allProducts.filter((p) => {
    if (filters.cat && p.category !== filters.cat) return false;
    if (filters.q && !`${p.name} ${p.brand} ${p.description || ""}`.toLowerCase().includes(filters.q.toLowerCase())) return false;
    if (filters.promo && !p.old_price) return false;
    if (filters.nouveau && p.badge !== "Nouveau") return false;
    return true;
  });
  sortProducts(products);
  // Filtre constructeur côté client (NVIDIA/AMD/Intel pour les GPU, etc.).
  let allForBrand = products.slice();
  if (filters.brand) products = products.filter((p) => manufacturer(p) === filters.brand);

  // Filtres par caractéristiques (client) : on garde une base non filtrée par
  // specs pour proposer les options encore pertinentes.
  let specFields = (filters.cat && SPEC_FILTERS[filters.cat]) || [];
  let baseForSpecs = products.slice();
  for (const f of specFields) {
    const sel = filters.spec[f.key];
    if (sel) products = products.filter((p) => f.fn(p) === sel);
  }
  let priceBase = products.slice();
  const renderCatalogProducts = (visibleProducts, requestedPage = filters.page) => {
    $("#resultCount").textContent = `${visibleProducts.length} produit${visibleProducts.length > 1 ? "s" : ""}`;
    const groups = groupByModel(visibleProducts);
    const pageCount = Math.max(1, Math.ceil(groups.length / PER_PAGE));
    const page = Math.min(requestedPage, pageCount);
    const pageGroups = groups.slice((page - 1) * PER_PAGE, page * PER_PAGE);
    const cells = pageGroups.flatMap((g) => g.brands.length > 1 ? [modelCard(g)] : g.items.map(productCard));
    $("#catalogGrid").innerHTML = groups.length
      ? `<div class="product-grid">${cells.join("")}</div>${pagerHtml(page, pageCount)}`
      : `<div class="empty-state"><p>Aucun produit ne correspond à vos critères.</p></div>`;
    bindProductCards(app, pageGroups.flatMap((g) => g.brands.length > 1 ? [] : g.items));
    $$("[data-page]", app).forEach((b) => b.onclick = () => {
      navigate({ page: Number(b.dataset.page) });
    });
  };
  const revealCatalogResults = () => requestAnimationFrame(() =>
    $("#catalogResults")?.scrollTo({ top: 0, behavior: "smooth" }));
  const initialMin = filters.min ? +filters.min : -Infinity;
  const initialMax = filters.max ? +filters.max : Infinity;
  renderCatalogProducts(priceBase.filter((p) => p.price >= initialMin && p.price <= initialMax));

  // Constructeurs disponibles (sur la catégorie courante, avant filtre).
  const brands = [...new Set(allForBrand.map(manufacturer))].sort();
  $("#brandGroup").insertAdjacentHTML("beforeend",
    `<label class="filter-option"><input type="radio" name="brand" value="" ${!filters.brand ? "checked" : ""}> Tous</label>` +
    brands.map((b) => `<label class="filter-option"><input type="radio" name="brand" value="${esc(b)}" ${filters.brand === b ? "checked" : ""}> ${esc(b)}</label>`).join(""));

  const navigate = (patch) => {
    Object.assign(filters, patch);
    if (!("page" in patch)) filters.page = 1;
    const p = new URLSearchParams();
    if (filters.cat) p.set("cat", filters.cat);
    if (filters.q) p.set("q", filters.q);
    if (filters.brand) p.set("brand", filters.brand);
    if (filters.min) p.set("min", filters.min);
    if (filters.max) p.set("max", filters.max);
    if (filters.sort !== "featured") p.set("sort", filters.sort);
    if (filters.promo) p.set("promo", "1");
    if (filters.nouveau) p.set("new", "1");
    for (const [k, v] of Object.entries(filters.spec || {})) if (v) p.set("s_" + k, v);
    if (filters.page > 1) p.set("page", filters.page);
    history.pushState({}, "", "/catalogue" + (p.toString() ? "?" + p.toString() : ""));

    let nextProducts = allProducts.filter((product) => {
      if (filters.cat && product.category !== filters.cat) return false;
      if (filters.q && !`${product.name} ${product.brand} ${product.description || ""}`.toLowerCase().includes(filters.q.toLowerCase())) return false;
      if (filters.promo && !product.old_price) return false;
      if (filters.nouveau && product.badge !== "Nouveau") return false;
      return true;
    });
    sortProducts(nextProducts);
    allForBrand = nextProducts.slice();
    if (filters.brand) nextProducts = nextProducts.filter((product) => manufacturer(product) === filters.brand);
    specFields = (filters.cat && SPEC_FILTERS[filters.cat]) || [];
    baseForSpecs = nextProducts.slice();
    for (const field of specFields) {
      const selected = filters.spec[field.key];
      if (selected) nextProducts = nextProducts.filter((product) => field.fn(product) === selected);
    }
    priceBase = nextProducts;
    const min = filters.min ? +filters.min : -Infinity;
    const max = filters.max ? +filters.max : Infinity;
    renderCatalogProducts(priceBase.filter((product) => product.price >= min && product.price <= max), filters.page);
    revealCatalogResults();
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

  const bindBrandFilters = () => {
    $$("input[name=brand]", app).forEach((r) => r.onchange = () => navigate({ brand: r.value }));
  };
  const refreshDependentFilters = () => {
    const availableBrands = [...new Set(allForBrand.map(manufacturer))].sort();
    $("#brandGroup").innerHTML = `<span>Constructeur</span>
      <label class="filter-option"><input type="radio" name="brand" value="" checked> Tous</label>
      ${availableBrands.map((brand) => `<label class="filter-option"><input type="radio" name="brand" value="${esc(brand)}"> ${esc(brand)}</label>`).join("")}`;
    $("#specGroup").innerHTML = specFields.map((field) => {
      const options = [...new Set(baseForSpecs.map(field.fn).filter(Boolean))].sort(specOptSort);
      if (options.length < 2) return "";
      return `<div class="filter-group"><span>${esc(field.label)}</span>
        <label class="filter-option"><input type="radio" name="s_${field.key}" value="" checked> Toutes</label>
        ${options.map((option) => `<label class="filter-option"><input type="radio" name="s_${field.key}" value="${esc(option)}"> ${esc(option)}</label>`).join("")}
      </div>`;
    }).join("");
    bindBrandFilters();
    $$("#specGroup input[type=radio]", app).forEach((r) => r.onchange = () =>
      navigate({ spec: { ...filters.spec, [r.name.slice(2)]: r.value } }));
  };
  $$("input[name=cat]", app).forEach((r) => r.onchange = () => {
    navigate({ cat: r.value, brand: "", spec: {}, min: "", max: "" });
    refreshDependentFilters();
    const minRange = $("#prMin");
    const maxRange = $("#prMax");
    if (minRange && maxRange) {
      minRange.value = minRange.min;
      maxRange.value = maxRange.max;
      minRange.oninput();
    }
  });
  bindBrandFilters();
  const sortControl = $("#sortControl");
  const sortTrigger = $("#sortTrigger");
  const sortMenu = $("#sortMenu");
  const closeSort = () => {
    sortMenu.hidden = true;
    sortTrigger.setAttribute("aria-expanded", "false");
  };
  sortTrigger.onclick = () => {
    const opening = sortMenu.hidden;
    sortMenu.hidden = !opening;
    sortTrigger.setAttribute("aria-expanded", String(opening));
    if (opening) sortMenu.querySelector('[aria-selected="true"]')?.focus();
  };
  sortControl.onfocusout = () => setTimeout(() => {
    if (!sortControl.contains(document.activeElement)) closeSort();
  });
  sortControl.onkeydown = (e) => {
    if (e.key === "Escape") {
      closeSort();
      sortTrigger.focus();
    }
  };
  $$("[data-sort]", sortMenu).forEach((option) => {
    option.onclick = () => {
      navigate({ sort: option.dataset.sort });
      sortTrigger.querySelector("strong").textContent = option.querySelector("span").textContent;
      $$("[data-sort]", sortMenu).forEach((item) =>
        item.setAttribute("aria-selected", String(item === option)));
      closeSort();
    };
  });
  $("#resetFilters").onclick = () => {
    navigate({ cat: "", brand: "", spec: {}, min: "", max: "", sort: "featured", promo: false, nouveau: false, page: 1 });
    $$("input[name=cat]", app).forEach((radio) => { radio.checked = radio.value === ""; });
    refreshDependentFilters();
    sortTrigger.querySelector("strong").textContent = "En vedette";
    $$("[data-sort]", sortMenu).forEach((item) =>
      item.setAttribute("aria-selected", String(item.dataset.sort === "featured")));
    const minRange = $("#prMin");
    const maxRange = $("#prMax");
    if (minRange && maxRange) {
      minRange.value = minRange.min;
      maxRange.value = maxRange.max;
      minRange.oninput();
    }
  };

  // Curseur de prix à deux poignées (min/max) — bornes dérivées du catalogue.
  const prices = allProducts.map((p) => p.price);
  if (prices.length) {
    const lo = Math.floor(Math.min(...prices) / 10) * 10;
    const hi = Math.ceil(Math.max(...prices) / 10) * 10;
    const step = Math.max(1, Math.round((hi - lo) / 100 / 5) * 5) || 10;
    const curMin = Math.max(lo, Math.min(+filters.min || lo, hi));
    const curMax = Math.min(hi, Math.max(+filters.max || hi, lo));
    $("#priceGroup").innerHTML = `<span>Prix (€)</span>
      <div class="range-values" aria-live="polite">
        <output for="prMin"><small>Minimum</small><strong id="prMinLbl"></strong></output>
        <output for="prMax"><small>Maximum</small><strong id="prMaxLbl"></strong></output>
      </div>
      <div class="range-dual">
        <div class="range-track"><div class="range-fill" id="prFill"></div></div>
        <input type="range" id="prMin" min="${lo}" max="${hi}" step="${step}" value="${curMin}" aria-label="Prix minimum">
        <input type="range" id="prMax" min="${lo}" max="${hi}" step="${step}" value="${curMax}" aria-label="Prix maximum">
      </div>
      <div class="range-bounds"><span>${fmt(lo)}</span><span>${fmt(hi)}</span></div>`;
    const mn = $("#prMin"), mx = $("#prMax"), fill = $("#prFill"), mnl = $("#prMinLbl"), mxl = $("#prMaxLbl");
    const span = hi - lo || 1;
    let renderFrame = 0;
    const applyLive = () => {
      cancelAnimationFrame(renderFrame);
      renderFrame = requestAnimationFrame(() => {
        const min = +mn.value;
        const max = +mx.value;
        filters.min = min > lo ? String(min) : "";
        filters.max = max < hi ? String(max) : "";
        filters.page = 1;
        renderCatalogProducts(priceBase.filter((p) => p.price >= min && p.price <= max), 1);
        const url = new URL(location.href);
        if (min > lo) url.searchParams.set("min", String(min)); else url.searchParams.delete("min");
        if (max < hi) url.searchParams.set("max", String(max)); else url.searchParams.delete("max");
        url.searchParams.delete("page");
        history.replaceState({}, "", url);
      });
    };
    const paint = () => {
      const a = +mn.value, b = +mx.value;
      fill.style.left = `${(a - lo) / span * 100}%`;
      fill.style.right = `${(1 - (b - lo) / span) * 100}%`;
      mnl.textContent = fmt(a); mxl.textContent = fmt(b);
      mn.style.zIndex = a >= hi - step ? "5" : "3";
      mx.style.zIndex = "4";
    };
    mn.oninput = () => {
      if (+mn.value > +mx.value - step) mn.value = Math.max(lo, +mx.value - step);
      paint();
      applyLive();
    };
    mx.oninput = () => {
      if (+mx.value < +mn.value + step) mx.value = Math.min(hi, +mn.value + step);
      paint();
      applyLive();
    };
    paint();
  }
}

/* ─── Vue : fiche produit ─── */
async function viewProduct(app, id) {
  app.innerHTML = skeletons(4);
  const p = await api("/products/" + id);
  // Le choix de la marque/variante se fait via les rectangles « Marques
  // disponibles » (voir renderRecos), pas par un menu déroulant.
  // Boîtier sans ventilateur → on charge les packs de ventilateurs (option obligatoire).
  let fanOptions = [];
  if (caseNeedsFans(p)) {
    try {
      fanOptions = (await api("/products?category=fan")).filter((f) => f.stock > 0).sort((a, b) => a.price - b.price);
    } catch { /* si échec, on n'impose pas */ }
  }
  const needFans = fanOptions.length > 0;
  const discount = p.old_price ? Math.round((1 - p.price / p.old_price) * 100) : 0;
  const specEntries = Object.entries(p.specs).filter(([k]) => /^[A-ZÀ-Ü]/.test(k));
  app.innerHTML = `
  <button class="btn btn-ghost btn-sm pp-back" id="ppBack" type="button">← Retour</button>
  <nav class="breadcrumb">
    <a href="/">Accueil</a> / <a href="/catalogue">Catalogue</a> /
    <a href="${catUrl(p.category)}">${CATS[p.category]?.label ?? p.category}</a> / <span>${esc(p.name)}</span>
  </nav>
  <div class="product-page">
    <div class="product-gallery">
      <div class="product-page-visual" style="--tint:${tintOf(p)}">
        ${art(p.category, hueOf(p))}
        <img class="pimg" id="ppMain" src="${esc(p.image_url || `/images/${slugify(p.name)}-1.jpg`)}" alt="${esc(p.name)}" width="800" height="800" fetchpriority="high" decoding="async" onerror="this.remove(); cleanupProductThumbs()">
        ${badgeHtml(usefulBadge(p) || p.badge)}
      </div>
      <div class="pp-thumbs" id="ppThumbs">
        ${[1,2,3,4,5].map((n) => `
          <button class="pp-thumb${n === 1 ? " active" : ""}" data-src="/images/${slugify(p.name)}-${n}.jpg?v=2">
            <img src="/images/${slugify(p.name)}-${n}.jpg?v=2" alt="" width="800" height="800" loading="lazy" decoding="async" onerror="this.closest('.pp-thumb').remove(); cleanupProductThumbs()">
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
      ${needFans ? `
      <div class="fan-required">
        <p>⚠️ Ce boîtier est livré <strong>sans ventilateur</strong>. Choisissez un pack de ventilateurs (obligatoire) :</p>
        <select class="select" id="fanPick">
          ${fanOptions.map((f) => `<option value="${f.id}">${esc(f.name)} · +${fmt(f.price)}</option>`).join("")}
        </select>
      </div>` : ""}
      <div class="buy-row">
        ${p.stock <= 0
          ? `<button class="btn btn-primary" style="flex:1" data-fav="${p.id}" id="buyBtn">
               ${state.favorites.has(p.id) ? "♥ Dans ma liste de souhaits" : "♡ Ajouter à ma liste de souhaits"}
             </button>`
          : `<button class="btn btn-primary" id="buyBtn" style="flex:1">${needFans ? "Ajouter le boîtier + ventilateurs" : "Ajouter au panier"}</button>`}
      </div>
      ${p.stock <= 0 ? `<p class="oos-note" style="color:var(--text-dim);font-size:.85rem;margin:8px 0 0">Produit en rupture — ajoutez-le à votre liste de souhaits pour le retrouver facilement.</p>` : ""}
      <div class="pp-actions">
        ${p.stock > 0 ? `<button class="btn btn-ghost btn-sm ${state.favorites.has(p.id) ? "fav-active" : ""}" data-fav="${p.id}" id="ppFav">
          ${state.favorites.has(p.id) ? "♥ Dans ma liste de souhaits" : "♡ Ajouter à ma liste de souhaits"}
        </button>` : ""}
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

  // En stock : ajoute au panier (avec ventilateurs si le boîtier en exige).
  // En rupture : le bouton principal bascule la liste de souhaits.
  if (p.stock > 0) {
    $("#buyBtn").onclick = () => {
      if (needFans) {
        const fan = fanOptions.find((f) => f.id === +$("#fanPick").value) || fanOptions[0];
        addToCart(fan, 1, true);
        addToCart(p, 1, true);
        toast(`Boîtier + ${fan.name} ajoutés`, "success");
      } else {
        addToCart(p, 1);
      }
    };
  } else {
    $("#buyBtn").onclick = async () => {
      await toggleFavorite(p.id);
      const on = state.favorites.has(p.id);
      $("#buyBtn").classList.toggle("fav-active", on);
      $("#buyBtn").textContent = on ? "♥ Dans ma liste de souhaits" : "♡ Ajouter à ma liste de souhaits";
    };
  }
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
  const ppFav = $("#ppFav");
  if (ppFav) ppFav.onclick = async () => {
    await toggleFavorite(p.id);
    const on = state.favorites.has(p.id);
    ppFav.classList.toggle("fav-active", on);
    ppFav.textContent = on ? "♥ Dans ma liste de souhaits" : "♡ Ajouter à ma liste de souhaits";
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

  // Marques disponibles : un rectangle par variante du même modèle (autres
  // marques), affiché AU-DESSUS des compatibilités.
  const model = productModel(p);
  const variants = all.filter((x) => x.category === p.category && productModel(x) === model)
    .sort((a, b) => a.price - b.price);
  const variantBrands = new Set(variants.map((v) => v.brand)).size;
  const variantBlock = (variants.length > 1 && variantBrands > 1) ? `
    <section class="section">
      <div class="section-head"><h2>Marques disponibles</h2></div>
      <div class="variant-grid">
        ${variants.map((v) => `
          <article class="variant-card${v.id === p.id ? " current" : ""}" data-goto="/produit/${v.id}">
            <span class="variant-brand">${esc(v.brand)}</span>
            <span class="variant-name">${esc(v.name)}</span>
            <span class="variant-foot">
              <span class="variant-price">${fmt(v.price)}</span>
              <span class="variant-stock${v.stock > 0 ? "" : " out"}">${v.stock > 0 ? "En stock" : "Rupture"}</span>
            </span>
            ${v.id === p.id ? `<span class="variant-tag">Sélectionné</span>` : ""}
          </article>`).join("")}
      </div>
    </section>` : "";

  zone.innerHTML =
    variantBlock +
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

  const slots = [...products];
  while (slots.length < COMPARE_MAX) slots.push(null);

  const cell = (p, i) => p ? `<th class="cmp-col">
      <div class="cmp-visual">${art(p.category, hueOf(p))}${imgTag(p)}</div>
      <div class="cmp-name">${esc(p.brand)} ${esc(p.name)}</div>
      <button class="cmp-remove" data-cmp-rm="${p.id}" title="Retirer">✕ retirer</button>
    </th>` : `<th class="cmp-col cmp-slot-head">
      <a class="cmp-slot-plus" href="/catalogue" title="Ajouter un produit" aria-label="Ajouter un produit">+</a>
      <div class="cmp-name">Place disponible</div>
      <small>${i + 1}/${COMPARE_MAX}</small>
    </th>`;

  const row = (label, fn) =>
    `<tr><td class="cmp-label">${esc(label)}</td>${slots.map((p) => `<td class="${p ? "" : "cmp-slot-empty"}">${p ? fn(p) : "—"}</td>`).join("")}</tr>`;

  const rankedRow = (label, fn, metric, dir = "max") => {
    const vals = products.map(metric);
    const finite = vals.filter((v) => Number.isFinite(v));
    const best = finite.length ? (dir === "min" ? Math.min(...finite) : Math.max(...finite)) : null;
    const hasRank = best !== null && finite.some((v) => v !== best);
    return `<tr><td class="cmp-label">${esc(label)}</td>${slots.map((p) => {
      if (!p) return `<td class="cmp-slot-empty">—</td>`;
      const val = metric(p);
      const rank = hasRank && val === best ? "best" : hasRank && Number.isFinite(val) ? "worst" : "";
      return `<td class="${rank ? `cmp-rank-${rank}` : ""}">
        <span class="cmp-value">${fn(p)}</span>
        ${rank === "best" ? `<span class="cmp-badge good">Meilleur</span>` : rank === "worst" ? `<span class="cmp-badge bad">Moins bon</span>` : ""}
      </td>`;
    }).join("")}</tr>`;
  };
  const specMetric = (v) => {
    if (typeof v === "number") return v;
    const nums = String(v ?? "").replace(/,/g, ".").match(/\d+(?:\.\d+)?/g)?.map(Number) || [];
    if (!nums.length) return NaN;
    return nums.reduce((a, b) => a + b, 0);
  };
  const specDir = (k) => /tdp|latence|latency|cas/i.test(k) ? "min" : "max";

  const allCompatible = products.length > 1 && products.every((p) => p.category === products[0].category);

  app.innerHTML = `
  <div class="compare-page">
  <div class="section-head" style="margin-top:0"><h1>Comparateur</h1>
    <button class="btn btn-ghost btn-sm" id="cmpClearAll">Tout vider</button></div>
  <p style="color:var(--text-dim);margin:-8px 0 18px">Les meilleures valeurs sont signalées par des badges, sans modifier les lignes neutres.</p>
  <div class="cmp-wrap cmp-page-wrap">
    <table class="cmp-table cmp-table-global">
      <thead><tr><th class="cmp-label"></th>${slots.map(cell).join("")}</tr></thead>
      <tbody>
        ${rankedRow("Prix", (p) => `<strong>${fmt(p.price)}</strong>${p.old_price ? ` <small class="cmp-old">${fmt(p.old_price)}</small>` : ""}`, (p) => p.price, "min")}
        ${rankedRow("Performance estimée", (p) => `<span class="perf-pill ${ratingWord(perfScore(p)).cls}">${ratingWord(perfScore(p)).word}</span>`, (p) => perfScore(p), "max")}
        ${row("Catégorie", (p) => esc(CATS[p.category]?.label || p.category))}
        ${row("Marque", (p) => esc(p.brand))}
        ${rankedRow("Note", (p) => `${stars(p.rating)} <small>${p.rating.toFixed(1)} (${p.rating_count})</small>`, (p) => p.rating, "max")}
        ${row("Disponibilité", (p) => p.stock > 0 ? "En stock" : "Rupture")}
        ${allCompatible ? `<tr><td class="cmp-label">Compatibilité</td><td colspan="${COMPARE_MAX}" style="color:var(--text-dim)">Même catégorie (${esc(CATS[products[0].category]?.label || products[0].category)}) — interchangeables dans une configuration.</td></tr>` : ""}
        ${specKeys.map((k) => rankedRow(k, (p) => esc(p.specs[k] ?? "—"), (p) => specMetric(p.specs[k]), specDir(k))).join("")}
        ${row("", (p) => `<button class="btn btn-primary btn-sm" data-add="${p.id}" ${p.stock <= 0 ? "disabled" : ""}>Ajouter au panier</button>`)}
      </tbody>
    </table>
  </div>
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
  { id: "g800", label: "Gaming 800 €", target: 800, cpu: "game", ram: 16, budget: "low" },
  { id: "g1500", label: "Gaming 1500 €", target: 1500, cpu: "game", ram: 32, budget: "mid" },
  { id: "uhd", label: "PC 4K", target: 2800, cpu: "game", ram: 32, budget: "high" },
  { id: "stream", label: "Streaming", target: 2200, cpu: "threads", ram: 64, budget: "high" },
  { id: "silent", label: "Silence", target: 1800, cpu: "game", ram: 32, budget: "mid", quiet: true },
  { id: "white", label: "Blanc RGB", target: 1800, cpu: "game", ram: 32, budget: "mid", white: true },
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
  <details class="budget-assist">
    <summary>
      <span class="budget-assist-icon" aria-hidden="true">€</span>
      <span><strong>Composer automatiquement par budget</strong><small>Un raccourci optionnel pour générer une base avec un curseur</small></span>
      <span class="budget-assist-chevron" aria-hidden="true">⌄</span>
    </summary>
    <div class="budget-builder" id="budgetBuilder"></div>
  </details>
  <a class="builder-summary-skip btn btn-ghost btn-sm" href="#buildSummary">Voir le récapitulatif</a>
  <div class="presets" id="presetBar">
    <span class="presets-label">Pour démarrer vite (puis ajustez)</span>
    ${PRESETS.map((p) => `<button class="preset-btn" data-preset="${p.id}">${esc(p.label)}</button>`).join("")}
    <button class="preset-btn preset-reset" data-preset="reset">Vider</button>
  </div>
  <div class="builder-grid">
    <div id="slots" class="builder-slots" aria-label="Étapes du configurateur"></div>
    <aside id="buildSummary" aria-live="polite"></aside>
  </div>`;

  renderBudgetBuilder();

  const products = await api("/products");
  const byCat = {};
  for (const p of products) (byCat[p.category] ??= []).push(p);

  // Remplissage automatique d'une configuration compatible selon un profil.
  const generateBuild = (preset) => {
    const inStock = (cat) => (byCat[cat] || []).filter((p) => p.stock > 0);
    const closest = (list, val, key) => list.length
      ? list.reduce((best, p) => Math.abs(key(p) - val) < Math.abs(key(best) - val) ? p : best) : null;
    const bestUnder = (list, ceiling, score) => {
      const affordable = list.filter((p) => p.price <= ceiling);
      const pool = affordable.length ? affordable : list;
      return pool.sort((a, c) => (score(c) - score(a)) || (a.price - c.price))[0];
    };
    const b = {};

    // CPU : jeu (le X3D prime, cœurs plafonnés à 8) ou multicœur (streaming/création),
    // borné par le budget du profil.
    const cpuScore = preset.cpu === "threads"
      ? cpuTier
      : cpuGameTier;
    const cpuCeil = preset.target * (preset.cpu === "threads" ? 0.22 : 0.18);
    b.cpu = bestUnder(inStock("cpu"), cpuCeil, cpuScore);

    if (b.cpu) {
      let mobos = inStock("motherboard").filter((p) => p.specs.socket === b.cpu.specs.socket);
      if (!mobos.length) mobos = inStock("motherboard");
      const moboTarget = preset.budget === "low" ? 90 : preset.budget === "mid" ? 150 : 210;
      b.motherboard = closest(mobos, moboTarget, (p) => p.price);
    }
    if (b.motherboard) {
      let rams = inStock("ram").filter((p) => p.specs.ram_type === b.motherboard.specs.ram_type);
      if (!rams.length) rams = inStock("ram");
      const capacityDelta = Math.min(...rams.map((p) => Math.abs(specNum(p.specs["Capacité"]) - preset.ram)));
      const matchingCapacity = rams.filter((p) => Math.abs(specNum(p.specs["Capacité"]) - preset.ram) === capacityDelta);
      b.ram = bestUnder(matchingCapacity, preset.target * 0.11,
        (p) => specNum(p.specs["Fréquence"]) / Math.max(1, specNum(p.specs["Latence"]) || 36));
    }

    let gpus = inStock("gpu");
    if (preset.white) { const w = gpus.filter((p) => /white|blanc|snow/i.test(p.name)); if (w.length) gpus = w; }
    const gpuShare = preset.cpu === "threads" ? 0.38 : 0.46;
    b.gpu = bestUnder(gpus, preset.target * gpuShare, gpuTier);

    if (b.cpu) {
      let cool = inStock("cooling").filter((p) => (p.specs.sockets || []).includes(b.cpu.specs.socket));
      if (!cool.length) cool = inStock("cooling");
      const isAio = (p) => /aio|240|280|360|liquid|water|freezer iii/i.test(`${p.name} ${JSON.stringify(p.specs)}`);
      if (preset.budget !== "high") {
        const air = cool.filter((p) => !isAio(p));
        if (air.length) cool = air;
      } else {
        const sensible = cool.filter((p) => p.price <= 149);
        if (sensible.length) cool = sensible;
      }
      const coolTarget = preset.budget === "low" ? 39 : preset.budget === "mid" ? (preset.quiet ? 99 : 65) : 99;
      b.cooling = closest(cool, coolTarget, (p) => p.price);
    }

    const len = b.gpu ? (specNum(b.gpu.specs["Longueur"]) || b.gpu.specs.length_mm || 0) : 0;
    let cases = inStock("case").filter((p) => (p.specs.max_gpu_mm || specNum(p.specs["GPU max"]) || 999) >= len);
    if (!cases.length) cases = inStock("case");
    if (preset.white) { const w = cases.filter((p) => /white|blanc|snow/i.test(p.name)); if (w.length) cases = w; }
    if (preset.quiet) { const q = cases.filter((p) => /silent|silence|define|quiet/i.test(p.name)); if (q.length) cases = q; }
    const caseTarget = preset.budget === "low" ? 89 : preset.budget === "mid" ? 109 : 139;
    const sensibleCases = cases.filter((p) => p.price <= caseTarget + 30);
    b.case = closest(sensibleCases.length ? sensibleCases : cases, caseTarget, (p) => p.price);

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

    let st = inStock("storage").filter((p) => !/sata|gen5/i.test(`${p.name} ${JSON.stringify(p.specs)}`));
    if (!st.length) st = inStock("storage");
    const storageTarget = preset.budget === "low" ? 64 : preset.budget === "mid" ? 99 : 149;
    b.storage = closest(st, storageTarget, (p) => p.price);

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
      <div class="builder-slot ${sel ? "filled" : ""}" data-slot="${slot.cat}">
        <div class="builder-slot-icon">${art(slot.cat, 30)}</div>
        <div class="builder-slot-main">
          <h3>${slot.label}</h3>
          <p>${sel ? `${esc(sel.brand)} ${esc(sel.name)}` : esc(slotGuide(slot.cat))}</p>
        </div>
        ${sel ? `<span class="price">${fmt(sel.price)}</span>` : ""}
        <div class="builder-slot-actions">
          <button class="btn ${sel ? "btn-ghost" : "btn-primary"} btn-sm" data-pick="${slot.cat}" aria-label="${sel ? "Changer" : "Choisir"} ${esc(slot.label)}">${sel ? "Changer" : "Choisir"}</button>
          ${sel ? `<button class="icon-btn" data-unpick="${slot.cat}" title="Retirer" aria-label="Retirer ${esc(slot.label)}">✕</button>` : ""}
        </div>
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
        <a class="btn btn-ghost btn-block builder-next-missing" href="#slots">Continuer la sélection</a>`;
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
    let detailProduct = compatList[0] || null;
    let pickerMode = "select";
    const galleryIndex = {}; // { productId: image number }
    const galleryImages = {}; // { productId: valid image URLs }

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay picker-overlay";
    document.body.appendChild(overlay);
    document.body.classList.add("picker-open");
    const close = () => {
      overlay.remove();
      document.body.classList.remove("picker-open");
    };
    const pickProduct = (p) => {
      if (!p) return;
      state.build[cat] = p;
      close();
      renderSlots();
    };

    const pickerCompareProducts = () => {
      const seen = new Set();
      return state.compare
        .map((id) => products.find((p) => p.id === id && p.category === cat))
        .filter((p) => {
          if (!p || seen.has(p.id)) return false;
          seen.add(p.id);
          return true;
        });
    };

    const compareHtml = () => {
      const compared = pickerCompareProducts();
      const slots = [...compared];
      while (slots.length < COMPARE_MAX) slots.push(null);
      const specKeys = [];
      for (const p of compared) {
        for (const k of Object.keys(p.specs || {})) {
          if (/^[A-ZÀ-Ü]/.test(k) && !specKeys.includes(k)) specKeys.push(k);
        }
      }
      const row = (label, fn) =>
        `<tr><td class="cmp-label">${esc(label)}</td>${slots.map((p) => `<td class="${p ? "" : "cmp-slot-empty"}">${p ? fn(p) : "—"}</td>`).join("")}</tr>`;
      const rankedRow = (label, fn, metric, dir = "max") => {
        const vals = compared.map(metric);
        const finite = vals.filter((v) => Number.isFinite(v));
        const best = finite.length ? (dir === "min" ? Math.min(...finite) : Math.max(...finite)) : null;
        const hasRank = best !== null && finite.some((v) => v !== best);
        return `<tr><td class="cmp-label">${esc(label)}</td>${slots.map((p) => {
          if (!p) return `<td class="cmp-slot-empty">—</td>`;
          const val = metric(p);
          const rank = hasRank && val === best ? "best" : hasRank && Number.isFinite(val) ? "worst" : "";
          return `<td class="${rank ? `cmp-rank-${rank}` : ""}">
            <span class="cmp-value">${fn(p)}</span>
            ${rank === "best" ? `<span class="cmp-badge good">Meilleur</span>` : rank === "worst" ? `<span class="cmp-badge bad">Moins bon</span>` : ""}
          </td>`;
        }).join("")}</tr>`;
      };
      const specMetric = (v) => {
        if (typeof v === "number") return v;
        const nums = String(v ?? "").replace(/,/g, ".").match(/\d+(?:\.\d+)?/g)?.map(Number) || [];
        if (!nums.length) return NaN;
        return nums.reduce((a, b) => a + b, 0);
      };
      const specDir = (k) => /tdp|latence|latency|cas/i.test(k) ? "min" : "max";
      const cell = (p, i) => p ? `<th class="cmp-col">
        <div class="cmp-visual">${art(p.category, hueOf(p))}${imgTag(p)}</div>
        <div class="cmp-name">${esc(p.brand)} ${esc(p.name)}</div>
        <button class="cmp-remove" data-picker-cmp-rm="${p.id}" type="button" title="Retirer">× retirer</button>
      </th>` : `<th class="cmp-col cmp-slot-head">
        <button class="cmp-slot-plus" data-picker-back type="button" title="Retour à la sélection" aria-label="Retour à la sélection">+</button>
        <div class="cmp-name">Place disponible</div>
        <small>${i + 1}/${COMPARE_MAX}</small>
      </th>`;
      return `<div class="picker-compare">
        <div class="picker-compare-head">
          <div>
            <span>Comparaison dans la sélection</span>
            <h3>Comparer les composants</h3>
          </div>
          <div class="picker-compare-actions">
            <button class="btn btn-ghost btn-sm" data-picker-back type="button">Retour à la sélection</button>
            ${compared.length ? `<button class="btn btn-ghost btn-sm" data-picker-compare-clear type="button">Tout vider</button>` : ""}
          </div>
        </div>
        ${compared.length ? `<div class="cmp-wrap picker-cmp-wrap">
          <table class="cmp-table picker-cmp-table">
            <thead><tr><th class="cmp-label"></th>${slots.map(cell).join("")}</tr></thead>
            <tbody>
              ${rankedRow("Prix", (p) => `<strong>${fmt(p.price)}</strong>${p.old_price ? ` <small class="cmp-old">${fmt(p.old_price)}</small>` : ""}`, (p) => p.price, "min")}
              ${rankedRow("Performance estimée", (p) => `<span class="perf-pill ${ratingWord(perfScore(p)).cls}">${ratingWord(perfScore(p)).word}</span>`, (p) => perfScore(p), "max")}
              ${row("Catégorie", (p) => esc(CATS[p.category]?.label || p.category))}
              ${row("Marque", (p) => esc(p.brand))}
              ${rankedRow("Note", (p) => `${stars(p.rating)} <small>${p.rating.toFixed(1)} (${p.rating_count})</small>`, (p) => p.rating, "max")}
              ${row("Disponibilité", (p) => p.stock > 0 ? "En stock" : "Rupture")}
              ${specKeys.map((k) => rankedRow(k, (p) => esc(p.specs[k] ?? "—"), (p) => specMetric(p.specs[k]), specDir(k))).join("")}
              ${row("", (p) => `<button class="btn btn-primary btn-sm" data-preview-pick="${p.id}" ${p.stock <= 0 ? "disabled" : ""}>Choisir</button>`)}
            </tbody>
          </table>
        </div>` : `<div class="picker-compare-empty">
          <strong>Aucun produit à comparer.</strong>
          <p>Retournez à la sélection et cliquez sur Comparer depuis un produit.</p>
        </div>`}
      </div>`;
    };

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
      if (!list.some((p) => p.id === detailProduct?.id)) detailProduct = list[0] || null;

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
                <button class="picker-item ${detailProduct?.id === p.id ? "on" : ""} ${p.stock <= 0 ? "unavailable" : ""}" data-id="${p.id}" ${p.stock <= 0 ? "disabled" : ""}>
                  <div class="picker-visual">${art(p.category, hueOf(p))}${imgTag(p)}</div>
                  <div class="picker-item-info">
                    <strong>${esc(p.brand)} ${esc(p.name)}</strong>
                    ${stockHtml(p.stock)}
                  </div>
                  <span class="price" style="font-size:.95rem">${fmt(p.price)}</span>
                </button>
              </div>`;
      const listHtml = brandOrder.map((b) =>
        `<div class="picker-group">${esc(b)}</div>${groups[b].map(itemHtml).join("")}`).join("");
      const detailHtml = (p) => {
        if (!p) return `<aside class="picker-preview empty"><p>Sélectionnez un composant pour voir ses détails.</p></aside>`;
        const specs = Object.entries(p.specs || {})
          .filter(([k, v]) => /^[A-ZÀ-Ü]/.test(k) && v !== undefined && v !== "");
        const galleryReady = !!galleryImages[p.id];
        const imgs = galleryImages[p.id] || [p.image_url || `/images/${slugify(p.name)}-1.jpg`];
        const imgI = Math.min(galleryIndex[p.id] || 0, imgs.length - 1);
        const imgSrc = imgs[imgI];
        const hasGallery = galleryReady && imgs.length > 1;
        return `<aside class="picker-preview picker-preview-full">
          <div class="picker-preview-gallery">
            <div class="picker-preview-visual">
              ${art(p.category, hueOf(p))}
              <img class="pimg" src="${esc(imgSrc)}" alt="${esc(p.name)}" loading="lazy" decoding="async" onerror="this.remove()">
              ${hasGallery ? `<button class="picker-gallery-arrow prev" data-gallery-step="-1" type="button" title="Image précédente" aria-label="Image précédente">‹</button>
              <button class="picker-gallery-arrow next" data-gallery-step="1" type="button" title="Image suivante" aria-label="Image suivante">›</button>` : ""}
            </div>
            ${hasGallery ? `<div class="picker-preview-thumbs">
              ${imgs.map((src, i) => `<button class="picker-preview-thumb ${i === imgI ? "active" : ""}" data-gallery-index="${i}" type="button"><img src="${esc(src)}" alt="" loading="lazy"></button>`).join("")}
            </div>` : ""}
          </div>
          <div class="picker-preview-content">
            <div class="picker-preview-head">
              <span>${esc(p.brand)} · ${esc(CATS[p.category]?.label || p.category)}</span>
              <h3>${esc(p.name)}</h3>
            </div>
            ${p.description ? `<p class="picker-preview-desc">${esc(p.description)}</p>` : ""}
            <div class="picker-preview-price-row">
              <strong>${fmt(p.price)}</strong>
              ${stockHtml(p.stock)}
            </div>
            <button class="btn btn-primary btn-block btn-sm" data-preview-pick="${p.id}" ${p.stock <= 0 ? "disabled" : ""}>${p.stock <= 0 ? "Indisponible" : "Choisir"}</button>
            <div class="picker-preview-actions">
              <button class="btn btn-ghost btn-sm ${state.favorites.has(p.id) ? "on" : ""}" data-fav="${p.id}" type="button">♡ Ajouter à ma liste de souhaits</button>
              <button class="btn btn-ghost btn-sm ${inCompare(p.id) ? "on" : ""}" data-picker-compare-open="${p.id}" type="button">⇄ Comparer</button>
            </div>
            ${specs.length ? `<section class="picker-preview-section">
              <h4>Caractéristiques</h4>
              <dl class="picker-preview-specs">
                ${specs.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}
              </dl>
            </section>` : ""}
          </div>
        </aside>`;
      };

      overlay.innerHTML = `
        <div class="modal wide picker-modal ${pickerMode === "compare" ? "picker-modal-compare" : ""}">
          <button class="modal-close" aria-label="Fermer la sélection">✕</button>
          <h2 class="picker-title">Choisir : ${CATS[cat].label}<span class="picker-count">${list.length} dispo${list.length > 1 ? "s" : ""}</span></h2>
          ${CATEGORY_TIP[cat] ? `<p class="picker-tip"><b>Conseil.</b> ${CATEGORY_TIP[cat]}</p>` : ""}
          ${pickerMode === "select" && chipBar ? `<div class="picker-filters">${chipBar}</div>` : ""}
          ${pickerMode === "compare" ? compareHtml() : `<div class="picker-body">
            <div class="picker-list">
              ${list.length ? listHtml
              : `<p class="picker-empty">${compatList.length ? "Aucun résultat avec ces filtres — élargissez votre choix." : "Aucun composant compatible avec votre sélection actuelle."}</p>`}
            </div>
            ${detailHtml(detailProduct)}
          </div>`}
        </div>`;

      $(".modal-close", overlay).onclick = close;
      $$("[data-picker-back]", overlay).forEach((btn) => btn.addEventListener("click", () => {
        pickerMode = "select";
        render();
      }));
      $("[data-picker-compare-clear]", overlay)?.addEventListener("click", () => {
        const currentIds = new Set(pickerCompareProducts().map((p) => p.id));
        state.compare = state.compare.filter((id) => !currentIds.has(id));
        saveCompare();
        renderCompareBar();
        render();
      });
      $$("[data-picker-cmp-rm]", overlay).forEach((btn) => btn.onclick = () => {
        toggleCompare(Number(btn.dataset.pickerCmpRm));
        render();
      });
      $$("[data-fk]", overlay).forEach((chip) => chip.onclick = () => {
        const k = chip.dataset.fk, v = chip.dataset.fv;
        active[k] = active[k] === v ? undefined : v; // re-clic = désélection
        render();
      });
      $$("[data-preview-pick]", overlay).forEach((btn) => btn.onclick = (e) => {
        const p = compatList.find((x) => x.id === Number(e.currentTarget.dataset.previewPick));
        pickProduct(p);
      });
      $$("[data-picker-compare-open]", overlay).forEach((btn) => btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = Number(btn.dataset.pickerCompareOpen);
        if (!inCompare(id)) toggleCompare(id);
        if (pickerCompareProducts().length < 2) {
          toast("Ajoutez un deuxième composant pour comparer", "info");
          pickerMode = "select";
          render();
          return;
        }
        pickerMode = "compare";
        render();
      });
      $$("[data-gallery-step]", overlay).forEach((btn) => btn.onclick = (e) => {
        e.stopPropagation();
        if (!detailProduct) return;
        const imgs = galleryImages[detailProduct.id] || [];
        if (imgs.length < 2) return;
        const current = galleryIndex[detailProduct.id] || 0;
        galleryIndex[detailProduct.id] = (current + Number(btn.dataset.galleryStep) + imgs.length) % imgs.length;
        render();
      });
      $$("[data-gallery-index]", overlay).forEach((btn) => btn.onclick = (e) => {
        e.stopPropagation();
        if (!detailProduct) return;
        galleryIndex[detailProduct.id] = Number(btn.dataset.galleryIndex) || 0;
        render();
      });
      $$(".picker-item", overlay).forEach((item) => item.onclick = () => {
        const p = compatList.find((x) => x.id === Number(item.dataset.id));
        if (!p || p.stock <= 0) return;
        galleryIndex[p.id] ??= 1;
        detailProduct = p || detailProduct;
        render();
      });
      if (detailProduct && !galleryImages[detailProduct.id]) {
        const product = detailProduct;
        const candidates = [
          product.image_url || `/images/${slugify(product.name)}-1.jpg`,
          ...[2, 3, 4, 5].map((n) => `/images/${slugify(product.name)}-${n}.jpg`),
        ];
        Promise.all(candidates.map((src) => new Promise((resolve) => {
          const img = new Image();
          img.onload = () => resolve(src);
          img.onerror = () => resolve(null);
          img.src = src;
        }))).then((valid) => {
          if (!overlay.isConnected || detailProduct?.id !== product.id) return;
          galleryImages[product.id] = valid.filter(Boolean);
          galleryIndex[product.id] = 0;
          render();
        });
      }
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
        <h2>Commande n°${res.order_seq || res.order_id} confirmée !</h2>
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
    <button class="account-tab" data-tab="favorites">Liste de souhaits</button>
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
async function renderAccountOrders(panel, sub = "active") {
  panel.innerHTML = `<div class="skeleton" style="min-height:110px"></div>`;
  let orders;
  try { orders = await api("/orders"); }
  catch { return renderPanelError(panel, () => renderAccountOrders(panel, sub)); }
  const cancellable = new Set(["en attente de paiement", "payée", "préparée"]);
  // Les commandes annulées sont rangées dans un onglet séparé pour ne pas
  // encombrer indéfiniment la liste des commandes en cours.
  const active = orders.filter((o) => o.status !== "annulée");
  const cancelled = orders.filter((o) => o.status === "annulée");
  if (sub === "cancelled" && !cancelled.length) sub = "active";
  const list = sub === "cancelled" ? cancelled : active;

  const card = (o) => `
      <div class="order-card">
        <div class="order-head">
          <h3>Commande n°${o.user_seq || o.id} — ${new Date(o.created_at * 1000).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</h3>
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
      </div>`;

  const subtabs = cancelled.length ? `
    <div class="order-subtabs">
      <button class="order-subtab${sub === "active" ? " active" : ""}" data-sub="active">En cours (${active.length})</button>
      <button class="order-subtab${sub === "cancelled" ? " active" : ""}" data-sub="cancelled">Annulées (${cancelled.length})</button>
    </div>` : "";

  const empty = sub === "cancelled"
    ? `<div class="empty-state"><p>Aucune commande annulée.</p></div>`
    : `<div class="empty-state"><p>Aucune commande en cours.</p><br><a class="btn btn-primary" href="/catalogue">Découvrir le catalogue</a></div>`;

  panel.innerHTML = orders.length
    ? subtabs + (list.length ? list.map(card).join("") : empty)
    : `<div class="empty-state"><p>Aucune commande pour le moment.</p><br><a class="btn btn-primary" href="/catalogue">Découvrir le catalogue</a></div>`;

  $$("[data-sub]", panel).forEach((b) => b.onclick = () => renderAccountOrders(panel, b.dataset.sub));
  $$("[data-cancel]", panel).forEach((btn) => btn.onclick = async () => {
    if (!confirm("Annuler cette commande ? Le stock sera restitué.")) return;
    btn.disabled = true;
    try {
      const res = await api(`/orders/${btn.dataset.cancel}/cancel`, { method: "POST" });
      toast(res.refund_pending ? "Commande annulée — remboursement en cours de traitement" : "Commande annulée");
      renderAccountOrders(panel, sub);
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
    : `<div class="empty-state"><div class="big">♡</div><p>Votre liste de souhaits est vide pour le moment.</p><br><a class="btn btn-primary" href="/catalogue">Parcourir le catalogue</a></div>`;
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
  const u = state.user;
  const memberSince = u.created_at
    ? new Date(u.created_at * 1000).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
    : "—";
  const verifiedBadge = u.email_verified
    ? `<span class="verified-badge">✓ Vérifié</span>`
    : `<span class="verified-badge" style="color:var(--amber);border-color:rgba(180,83,9,.5)">Non vérifié</span>`;

  panel.innerHTML = `
    <div class="panel" style="margin-bottom:18px">
      <h2 style="margin-bottom:14px">Aperçu du compte</h2>
      <div class="kpi-grid">
        <div class="kpi-card"><span class="kpi-label">Membre depuis</span><strong class="kpi-value" style="font-size:1.1rem">${memberSince}</strong></div>
        <div class="kpi-card"><span class="kpi-label">E-mail</span><strong class="kpi-value" style="font-size:1.1rem">${verifiedBadge}</strong></div>
        <div class="kpi-card"><span class="kpi-label">Commandes</span><strong class="kpi-value" data-recap="count">…</strong></div>
        <div class="kpi-card"><span class="kpi-label">Total dépensé</span><strong class="kpi-value" data-recap="spent">…</strong></div>
      </div>
    </div>

    <div class="panel" style="margin-bottom:18px">
      <h2 style="margin-bottom:14px">Mes informations</h2>
      <form id="profileForm" class="form-grid">
        <label class="full">Nom affiché<input name="name" required minlength="2" value="${esc(u.name)}"></label>
        <label class="full">E-mail<input value="${esc(u.email)}" disabled style="opacity:.6"></label>
        <label class="full">Téléphone<input name="phone" type="tel" autocomplete="tel" placeholder="06 12 34 56 78" value="${esc(u.phone || "")}"></label>
        <label class="full" style="flex-direction:row;align-items:center;gap:10px">
          <input type="checkbox" name="newsletter" style="width:auto" ${u.newsletter ? "checked" : ""}>
          Recevoir les offres et nouveautés par e-mail
        </label>
        <button class="btn btn-primary" type="submit" style="color:var(--on-primary);align-self:flex-start">Enregistrer</button>
      </form>
    </div>

    <div class="panel" style="margin-bottom:18px">
      <h2 style="margin-bottom:14px">Changer mon mot de passe</h2>
      <form id="passwordForm" class="form-grid">
        <label class="full">Mot de passe actuel<input name="current_password" type="password" required></label>
        <label class="full">Nouveau mot de passe<input name="new_password" type="password" required minlength="8" placeholder="8 caractères minimum"></label>
        <button class="btn btn-primary" type="submit" style="color:var(--on-primary);align-self:flex-start">Mettre à jour</button>
      </form>
    </div>

    <div class="panel">
      <h2 style="margin-bottom:6px">Données &amp; confidentialité</h2>
      <p style="color:var(--text-dim);font-size:.9rem;margin-bottom:14px">Téléchargez une copie de vos données, ou supprimez définitivement votre compte (RGPD).</p>
      <button class="btn btn-ghost btn-sm" id="exportDataBtn">Exporter mes données</button>
      <details style="margin-top:16px;border-top:1px solid var(--border);padding-top:14px">
        <summary style="cursor:pointer;font-weight:600;color:var(--red)">Supprimer mon compte</summary>
        <form id="deleteAccountForm" class="form-grid" style="margin-top:14px">
          <p class="full" style="color:var(--text-dim);font-size:.88rem;margin:0">Action <strong>irréversible</strong> : vos commandes, adresses et favoris seront supprimés. Confirmez avec votre mot de passe.</p>
          <label class="full">Mot de passe<input name="password" type="password" required autocomplete="current-password"></label>
          <button class="btn btn-sm full" type="submit" style="background:var(--red);color:#fff;border-color:var(--red)">Supprimer définitivement mon compte</button>
        </form>
      </details>
    </div>`;

  // Récap d'activité (commandes + total dépensé) — chargé en différé.
  (async () => {
    const setRecap = (count, spent) => {
      const c = $('[data-recap="count"]', panel);
      const s = $('[data-recap="spent"]', panel);
      if (c) c.textContent = count;
      if (s) s.textContent = spent;
    };
    try {
      const orders = await api("/orders");
      const kept = orders.filter((o) => o.status !== "annulée");
      const spent = kept
        .filter((o) => o.status !== "en attente de paiement")
        .reduce((sum, o) => sum + o.total, 0);
      setRecap(String(kept.length), fmt(spent));
    } catch { setRecap("—", "—"); }
  })();

  $("#profileForm").onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const btn = $("button[type=submit]", e.target);
    btn.disabled = true;
    try {
      const me = await api("/auth/profile", { method: "PATCH", body: JSON.stringify({
        name: f.get("name").trim(),
        phone: (f.get("phone") || "").trim(),
        newsletter: f.get("newsletter") === "on",
      }) });
      state.user = { ...state.user, ...me };
      saveAuth();
      toast("Profil mis à jour ✔");
    } catch (err) { toast(err.message, "error"); }
    finally { btn.disabled = false; }
  };

  $("#exportDataBtn").onclick = exportMyData;

  $("#deleteAccountForm").onsubmit = async (e) => {
    e.preventDefault();
    if (!confirm("Supprimer définitivement votre compte ? Cette action est irréversible.")) return;
    const f = new FormData(e.target);
    const btn = $("button[type=submit]", e.target);
    btn.disabled = true;
    try {
      await api("/auth/account", { method: "DELETE", body: JSON.stringify({ password: f.get("password") }) });
      // Session effacée côté serveur : on nettoie l'état local comme une déconnexion.
      state.token = null; state.user = null; state.favorites = new Set();
      state.cart = []; state.promo = null;
      savePromo(); saveAuth(); updateCartCount(); refreshCartDrawer();
      toast("Votre compte a été supprimé");
      go("/");
    } catch (err) { toast(err.message, "error"); btn.disabled = false; }
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
  <style>
    .pp-del{display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;padding:0;color:#e0564f;border:1px solid rgba(224,86,79,.45);background:transparent;border-radius:10px;cursor:pointer;transition:transform .12s ease,background .15s ease,border-color .15s ease,box-shadow .15s ease}
    .pp-del:hover{background:rgba(224,86,79,.12);border-color:#e0564f;box-shadow:0 0 0 3px rgba(224,86,79,.12)}
    .pp-del:active{transform:scale(.84)}
    .pp-del.deleting svg{animation:ppTrash .5s ease}
    .pp-del .lid{transform-origin:12px 6px}
    @keyframes ppTrash{10%{transform:rotate(-22deg)}30%{transform:rotate(16deg)}50%{transform:rotate(-10deg)}70%{transform:rotate(6deg)}100%{transform:rotate(0)}}
    .order-card.removing{animation:ppRowOut .34s ease forwards;overflow:hidden}
    @keyframes ppRowOut{to{opacity:0;transform:translateX(28px);max-height:0;margin-top:0;margin-bottom:0;padding-top:0;padding-bottom:0}}
  </style>
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
  <div style="margin-bottom:14px">
    <input id="adminSearch" type="search" autocomplete="off" placeholder="🔎 Rechercher un produit (nom, marque, catégorie, #id)…"
      style="width:100%;padding:11px 13px;border-radius:10px;background:var(--bg);color:var(--text);border:1px solid var(--border-strong)">
  </div>
  <div id="adminProducts"><div class="skeleton" style="min-height:160px"></div></div>`;

  const inp = "padding:8px 10px;border-radius:8px;background:var(--bg);color:var(--text);border:1px solid var(--border-strong)";
  let allProducts = [];

  function productCard(p) {
    return `
      <div class="order-card" style="display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap">
        <div style="display:flex;align-items:center;gap:12px;min-width:220px">
          <img src="${esc(p.image_url || `/images/${p.id}-1.jpg`)}" alt="" width="800" height="800" loading="lazy" decoding="async" onerror="this.style.visibility='hidden'" style="width:44px;height:44px;object-fit:contain;border-radius:6px;background:var(--surface);flex-shrink:0">
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
          <button class="pp-del" data-pid="${p.id}" title="Supprimer ce produit" aria-label="Supprimer ${esc(p.name)}">
            <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path class="lid" d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
              <line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>
            </svg>
          </button>
        </div>
      </div>`;
  }

  function renderList(q = "") {
    const adminProducts = $("#adminProducts");
    if (!adminProducts) return;
    const needle = q.trim().toLowerCase();
    const list = needle
      ? allProducts.filter((p) =>
          `${p.name} ${p.brand} ${CATS[p.category]?.label || p.category} #${p.id}`.toLowerCase().includes(needle))
      : allProducts;
    adminProducts.innerHTML =
      `<p style="color:var(--text-dim);margin-bottom:12px">${list.length} produit${list.length > 1 ? "s" : ""}${needle ? ` sur ${allProducts.length}` : ""}</p>` +
      (list.length ? list.map(productCard).join("")
        : `<p style="color:var(--text-dim)">Aucun produit ne correspond à « ${esc(q)} ».</p>`);
    bindRowHandlers();
  }

  function bindRowHandlers() {
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
        // Secousse de la poubelle, en laissant le navigateur peindre avant la
        // confirmation (qui bloque le thread).
        btn.classList.add("deleting");
        await new Promise((r) => setTimeout(r, 180));
        btn.classList.remove("deleting");
        if (!confirm("Supprimer ce produit définitivement ?")) return;
        btn.disabled = true;
        try {
          await api(`/admin/products/${id}`, { method: "DELETE" });
          toast("Produit supprimé");
          const card = btn.closest(".order-card");
          if (card) { card.classList.add("removing"); setTimeout(load, 320); }
          else load();
        } catch (err) { btn.disabled = false; toast(err.message, "error"); }
      };
    });
  }

  async function load() {
    allProducts = await api("/products?sort=name");
    if (isStaleRender(renderToken, app)) return;
    renderList($("#adminSearch")?.value || "");
  }

  const searchInput = $("#adminSearch");
  if (searchInput) searchInput.oninput = (e) => renderList(e.target.value);

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
    <a class="nav-menu-link" href="${catUrl(k)}">
      <span class="nav-menu-ico">${art(k, 30)}</span>${CATS[k].label}
    </a>`;
  const comp = $("#menuComponents");
  const periph = $("#menuPeriph");
  if (comp) comp.innerHTML = COMPONENT_CATS.map(link).join("") +
    `<a class="nav-menu-all" href="/catalogue">Tout le catalogue →</a>`;
  if (periph) periph.innerHTML = PERIPH_CATS.map(link).join("") +
    `<a class="nav-menu-all" href="/catalogue?new=1">Toutes les nouveautés →</a>`;
}

/* ─── Menu mobile (navigation latérale) ─── */
function fillMobileMenu() {
  const body = $("#mobileMenuBody");
  if (!body) return;
  body.innerHTML = `
    <a class="mm-link" href="/">Accueil</a>
    <a class="mm-link" href="/catalogue">Catalogue</a>
    <a class="mm-link" href="/configurateur">Configurateur</a>
    <a class="mm-link" href="/contact">Nous contacter</a>
    <div class="mm-foot">
      <a class="mm-link" href="/compte">Mon compte</a>
    </div>`;
  // Clic sur un lien → on laisse le routeur agir puis on referme le menu.
  body.querySelectorAll("a").forEach((a) => a.addEventListener("click", closeMenu));
}

function openMenu() {
  $("#mobileMenu").classList.add("open");
  $("#menuOverlay").hidden = false;
  $("#menuBtn")?.setAttribute("aria-expanded", "true");
  document.body.classList.add("menu-open");
}
function closeMenu() {
  $("#mobileMenu").classList.remove("open");
  $("#menuOverlay").hidden = true;
  $("#menuBtn")?.setAttribute("aria-expanded", "false");
  document.body.classList.remove("menu-open");
}
window.closeMenu = closeMenu;

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
/* ─── Échelle / zoom : auto-mesure du bandeau + en-tête fixes ───────────────
   Tout le layout (padding du <main>, offsets sticky du catalogue / configurateur
   / galerie, et la hauteur verrouillée au viewport des résultats) dérive de
   --announce-h et --fixed-header-h. Ces variables sont codées en dur par
   breakpoint dans le CSS (78/124/132/182/190/196…). Dès qu'on zoome ou que
   l'échelle d'affichage de l'OS n'est pas pile à un breakpoint, la hauteur
   réelle de l'en-tête diverge de la valeur devinée : le contenu glisse SOUS
   l'en-tête fixe (inatteignable) ou un grand vide apparaît — le site devient
   « impraticable à cause de l'échelle ».
   On mesure les hauteurs réellement rendues et on les écrit en inline sur :root
   (prioritaire sur toutes les media-queries) : chaque calc() se recalibre à
   n'importe quelle échelle. Les valeurs CSS restent le repli sans JS. */
function setupViewportMetrics() {
  const root = document.documentElement;
  const header = document.querySelector(".header");
  if (!header) return;
  const announce = document.querySelector(".announce");
  let raf = 0;
  const apply = () => {
    raf = 0;
    const hh = Math.round(header.getBoundingClientRect().height);
    const ah = announce ? Math.round(announce.getBoundingClientRect().height) : 0;
    if (hh && root.style.getPropertyValue("--fixed-header-h") !== `${hh}px`)
      root.style.setProperty("--fixed-header-h", `${hh}px`);
    if (announce && ah && root.style.getPropertyValue("--announce-h") !== `${ah}px`)
      root.style.setProperty("--announce-h", `${ah}px`);
  };
  const schedule = () => { if (!raf) raf = requestAnimationFrame(apply); };
  apply();
  if (typeof ResizeObserver !== "undefined") {
    const ro = new ResizeObserver(schedule);
    ro.observe(header);
    if (announce) ro.observe(announce);
  }
  // Le zoom navigateur / changement d'échelle déclenche un resize ; on couvre
  // aussi l'orientation mobile et le reflow après chargement des polices.
  window.addEventListener("resize", schedule, { passive: true });
  window.addEventListener("orientationchange", schedule, { passive: true });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);
}

function init() {
  setupViewportMetrics();
  saveAuth();
  setupDelegatedProductClicks();
  updateCartCount();
  setupAuth();
  fillNavMenus();
  fillMobileMenu();

  setupTheme();
  setupCookieBanner();
  $("#cartBtn").onclick = openCart;
  $("#cartClose").onclick = closeCart;
  $("#drawerOverlay").onclick = closeCart;
  $("#menuBtn").onclick = openMenu;
  $("#menuClose").onclick = closeMenu;
  $("#menuOverlay").onclick = closeMenu;
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
    if (e.key === "Escape") {
      closeCart(); closeAuth(); closeMenu();
      $$(".modal-overlay:not(#authModal)").forEach((m) => m.remove());
      document.body.classList.remove("picker-open");
    }
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
