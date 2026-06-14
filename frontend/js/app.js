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
  token: localStorage.getItem("volt_token") || null,
  user: JSON.parse(localStorage.getItem("volt_user") || "null"),
  cart: JSON.parse(localStorage.getItem("volt_cart") || "[]"),
  promo: JSON.parse(localStorage.getItem("volt_promo") || "null"),
  build: {},          // configurateur : { categorie: produit }
  afterLogin: null,   // action à reprendre après connexion
  favorites: new Set(),                                              // ids favoris (chargés à la connexion)
  compare: JSON.parse(localStorage.getItem("volt_compare") || "[]"), // ids à comparer
};

function saveCompare() { localStorage.setItem("volt_compare", JSON.stringify(state.compare)); }

// Persistance du panier :
//  • invité  → localStorage (le temps de la session de navigation)
//  • connecté → côté serveur, rattaché au compte (suit l'utilisateur, pas le navigateur)
function saveCart() {
  if (state.user) pushCart();
  else localStorage.setItem("volt_cart", JSON.stringify(state.cart));
  updateCartCount();
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

// À la connexion : fusionne le panier invité (localStorage) avec le panier
// enregistré sur le compte, puis persiste le résultat et vide le panier invité.
async function syncCartOnLogin() {
  if (!state.user) return;
  const guest = JSON.parse(localStorage.getItem("volt_cart") || "[]");
  let server = [];
  try { server = await api("/cart"); } catch { server = []; }
  const byId = new Map(server.map((i) => [i.id, { ...i }]));
  for (const g of guest) {
    const ex = byId.get(g.id);
    if (ex) ex.qty = Math.min(ex.qty + g.qty, g.stock || 99, 99);
    else byId.set(g.id, g);
  }
  state.cart = [...byId.values()].map((i) => ({
    id: i.id, name: i.name, brand: i.brand, category: i.category,
    price: i.price, stock: i.stock, qty: i.qty,
  }));
  localStorage.removeItem("volt_cart");   // le panier invité a été absorbé
  await pushCart();
  updateCartCount();
  renderCartDrawer();
}
function savePromo() { localStorage.setItem("volt_promo", JSON.stringify(state.promo)); }
function saveAuth() {
  if (state.token) {
    localStorage.setItem("volt_token", state.token);
    localStorage.setItem("volt_user", JSON.stringify(state.user));
  } else {
    localStorage.removeItem("volt_token");
    localStorage.removeItem("volt_user");
  }
  $("#accountLabel").textContent = state.user ? state.user.name.split(" ")[0] : "Compte";
}

/* ─── API ─── */
async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (state.token) headers["Authorization"] = "Bearer " + state.token;
  const res = await fetch(API + path, { ...options, headers });
  let data = null;
  try { data = await res.json(); } catch { /* réponse vide */ }
  if (!res.ok) {
    if (res.status === 401 && state.token) { state.token = null; state.user = null; saveAuth(); }
    throw new Error(data?.detail || "Erreur réseau");
  }
  return data;
}

/* ─── Téléchargement de la facture PDF ─── */
// Global (utilisé via onclick="downloadInvoice(id)"). On passe par fetch + blob
// car le téléchargement nécessite l'en-tête d'authentification.
async function downloadInvoice(orderId) {
  try {
    const res = await fetch(API + `/orders/${orderId}/invoice`, {
      headers: { Authorization: "Bearer " + state.token },
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
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${type === "error" ? "⚠️" : type === "info" ? "ℹ️" : "✓"}</span><span>${esc(msg)}</span>`;
  $("#toasts").appendChild(el);
  setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 320); }, 3400);
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
};

// Groupes pour les sous-menus de navigation
const COMPONENT_CATS = ["gpu", "cpu", "ram", "storage", "motherboard", "psu", "case", "cooling"];
const PERIPH_CATS = ["monitor", "keyboard", "mouse", "headset"];

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
  };
  return `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${grad}${shapes[category] || shapes.cpu}</svg>`;
}

const hueOf = (p) => 18 + ((p.id * 37) % 24);
const tintOf = (p) => `hsla(${hueOf(p) + 205}, 60%, 60%, 0.12)`;

// Photo du produit : URL personnalisée (image_url) si définie, sinon le fichier
// local images/{id}.jpg. Si rien ne charge, l'img se retire et le visuel SVG
// situé dessous reste affiché.
const imgTag = (p) =>
  `<img class="pimg" src="${esc(p.image_url || `/images/${p.id}-1.jpg`)}" alt="${esc(p.name)}" loading="lazy" onerror="this.remove()">`;

function stars(rating) {
  const full = Math.round(rating);
  return `<span class="stars">${"★".repeat(full)}${"☆".repeat(5 - full)}</span>`;
}

function badgeHtml(badge) {
  if (!badge) return "";
  const cls = { "Promo": "promo", "Top vente": "top", "Flagship": "flagship", "Nouveau": "new" }[badge] || "";
  return `<span class="badge ${cls}">${esc(badge)}</span>`;
}

function stockHtml(stock) {
  if (stock <= 0) return `<span class="stock-dot out">● Rupture</span>`;
  if (stock <= 10) return `<span class="stock-dot low">● Plus que ${stock}</span>`;
  return `<span class="stock-dot">● En stock</span>`;
}

/* ─── Carte produit ─── */
function productCard(p) {
  const discount = p.old_price ? Math.round((1 - p.price / p.old_price) * 100) : 0;
  return `
  <article class="product-card" data-goto="/produit/${p.id}">
    <div class="product-visual" style="--tint:${tintOf(p)}">
      ${art(p.category, hueOf(p))}
      ${imgTag(p)}
      ${badgeHtml(p.badge)}
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

function addToCart(p, qty = 1, quiet = false) {
  const line = state.cart.find((i) => i.id === p.id);
  if (line) {
    if (line.qty + qty > p.stock) { if (!quiet) toast("Stock maximum atteint pour ce produit", "error"); return; }
    line.qty += qty;
  } else {
    state.cart.push({ id: p.id, name: p.name, brand: p.brand, category: p.category, price: p.price, stock: p.stock, qty });
  }
  saveCart();
  renderCartDrawer();
  if (!quiet) { toast(`${p.name} ajouté au panier`); openCart(); }
}

function cartTotals() {
  const subtotal = state.cart.reduce((s, i) => s + i.price * i.qty, 0);
  const discount = state.promo ? subtotal * state.promo.percent / 100 : 0;
  const shipping = state.cart.length === 0 || subtotal - discount >= 50 ? 0 : 5.99;
  return { subtotal, discount, shipping, total: subtotal - discount + shipping };
}

function renderCartDrawer() {
  const body = $("#cartBody");
  const foot = $("#cartFoot");
  if (state.cart.length === 0) {
    body.innerHTML = `<div class="empty-state"><div class="big">🛒</div><p>Votre panier est vide.</p><br>
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
  renderCartDrawer();
}

function openCart() { $("#cartDrawer").classList.add("open"); $("#drawerOverlay").hidden = false; }
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
  state.token = data.token;
  state.user = data.user;
  saveAuth();
  resetAuthView();
  closeAuth();
  toast(`Bienvenue, ${state.user.name} ⚡`);
  await loadFavorites();
  await syncCartOnLogin();   // fusionne le panier invité avec celui du compte
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
        else toast("Un code de vérification vous a été envoyé par email ✉️");
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
      else toast("Nouveau code envoyé ✉️");
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
      else toast("Si ce compte existe, un code vient d'être envoyé ✉️", "info");
    } catch (err) { toast(err.message, "error"); }
    finally { btn.disabled = false; }
  };

  $("#resetResend").onclick = async (e) => {
    e.preventDefault();
    try {
      const data = await api("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email: state.resetEmail }) });
      if (data.dev_code) showDevCode(data.dev_code, "code");
      else toast("Nouveau code envoyé ✉️");
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
  state.token = null;
  state.user = null;
  state.favorites = new Set();
  // Le panier appartient au compte : on le vide à la déconnexion pour qu'il ne
  // « fuie » pas vers l'utilisateur suivant sur le même navigateur.
  state.cart = [];
  state.promo = null;
  localStorage.removeItem("volt_cart");
  savePromo();
  saveAuth();
  updateCartCount();
  renderCartDrawer();
  toast("Vous êtes déconnecté");
  go("/");
}

/* ─── Routeur (URLs réelles via History API) ─── */
function parsePath() {
  // "/produit/5" → path "produit/5" ; query depuis location.search
  const path = location.pathname.replace(/^\/+/, "").replace(/\/+$/, "");
  return { path, params: new URLSearchParams(location.search) };
}

// Navigation interne sans rechargement. Tolère un ancien lien "#/x".
function go(to) {
  if (to.startsWith("#/")) to = to.slice(1);
  if (to === location.pathname + location.search) { window.scrollTo({ top: 0 }); return; }
  history.pushState(null, "", to);
  render();
}

const skeletons = (n) => `<div class="product-grid">${"<div class='skeleton'></div>".repeat(n)}</div>`;

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
  $$(".nav a").forEach((a) => a.classList.toggle("active", a.dataset.nav === path.split("/")[0]));
  window.scrollTo({ top: 0 });

  try {
    if (path === "") await viewHome(app);
    else if (path === "catalogue") await viewCatalog(app, params);
    else if (path.startsWith("produit/")) await viewProduct(app, Number(path.split("/")[1]));
    else if (path === "configurateur") await viewBuilder(app);
    else if (path === "comparer") await viewCompare(app);
    else if (path === "commande/succes") await viewPaymentSuccess(app, params);
    else if (path === "commande/annulee") viewPaymentCancelled(app);
    else if (path === "commande") await viewCheckout(app);
    else if (path === "compte") await viewAccount(app, params);
    else if (path === "admin/produits") await viewAdminProducts(app);
    else if (path === "admin/stats") await viewAdminStats(app);
    else if (path === "admin") await viewAdmin(app, params);
    else app.innerHTML = `<div class="empty-state"><div class="big">🧭</div><h2>Page introuvable</h2><br><a class="btn btn-primary" href="/">Retour à l'accueil</a></div>`;
  } catch (e) {
    app.innerHTML = `<div class="empty-state"><div class="big">⚡</div><h2>Oups, une erreur</h2><p>${esc(e.message)}</p><br>
      <p style="color:var(--text-faint);font-size:.85rem">Le serveur est-il lancé ? <code>uvicorn main:app</code> dans voltpc/backend</p></div>`;
  }
}

/* ─── Vue : accueil ─── */
async function viewHome(app) {
  app.innerHTML = `
  <section class="home-hero" id="homeHero">
    <div class="hero-pin">
      <div class="hh-copy">
        <span class="hero-kicker"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z"/></svg>Nouvelle génération disponible</span>
        <h1>Assemblez la machine<br>de <span class="grad">vos rêves</span></h1>
        <p>RTX série 50, Ryzen 9000X3D, NVMe Gen5 et refroidissement maîtrisé : chaque VOLT PC est monté à la main, stress-testé 24 h et expédié sous 24 h.</p>
        <div class="hero-cta">
          <a class="btn btn-primary" href="#prebuilts">Voir les PC prémontés</a>
          <a class="btn btn-ghost" href="/configurateur">Configurer le mien</a>
        </div>
        <div class="hero-stats">
          <div class="hero-stat"><strong id="statCount">280+</strong><span>références premium</span></div>
          <div class="hero-stat"><strong>24 h</strong><span>expédition éclair</span></div>
          <div class="hero-stat"><strong>4.8/5</strong><span>avis clients</span></div>
        </div>
      </div>
      <div class="hh-stage" id="hhStage">
        <canvas id="heroGL" class="hero-gl" aria-label="Tour PC 3D — glissez pour pivoter, défilez pour assembler"></canvas>
        <span class="gl-hint">Glissez pour pivoter · défilez pour assembler</span>
      </div>
      <a class="scroll-cue" aria-hidden="true"><span></span></a>
    </div>
  </section>

  <!-- Séparateur 3D #1 : traversée en profondeur (zoom / fly-through, sans rotation) -->
  <div class="sep3d sep-depth" data-sep aria-hidden="true">
    <div class="depth"><i style="--i:0"></i><i style="--i:1"></i><i style="--i:2"></i><i style="--i:3"></i><i style="--i:4"></i></div>
    <div class="sep-label">Assemblé · Testé · Garanti</div>
  </div>

  <section class="section prebuilts" id="prebuilts">
    <div class="section-head"><h2>PC prémontés</h2><a href="/configurateur">Composer le mien →</a></div>
    <p class="pb-sub">Des configurations équilibrées, assemblées et testées par nos soins. Compatibilité vérifiée par notre moteur — il ne reste qu'à brancher.</p>
    <div class="pb-grid" id="prebuiltGrid">${"<div class='skeleton' style='min-height:420px'></div>".repeat(3)}</div>
  </section>

  <section class="section">
    <div class="section-head"><h2>Catégories</h2><a href="/catalogue">Tout voir →</a></div>
    <div class="cat-grid" id="catGrid">${"<div class='skeleton' style='min-height:130px'></div>".repeat(12)}</div>
  </section>

  <section class="section">
    <div class="section-head"><h2>La sélection VOLT</h2><a href="/catalogue">Tout le catalogue →</a></div>
    <div id="featuredGrid">${skeletons(4)}</div>
  </section>

  <section class="section">
    <div class="promo-banner">
      <div>
        <h3><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/></svg>Soldes d'été — jusqu'à -20 %</h3>
        <p>Utilisez le code <code>SUMMER20</code> au panier et profitez de -20 % sur l'intégralité du site.</p>
      </div>
      <a class="btn btn-primary" href="/catalogue">J'en profite</a>
    </div>
  </section>

  <section class="section">
    <div class="perks">
      <div class="perk"><div class="perk-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7h11v8H3z"/><path d="M14 10h4l3 3v2h-7z"/><circle cx="7.5" cy="17.5" r="1.7"/><circle cx="17.5" cy="17.5" r="1.7"/></svg></div><div><h4>Livraison 24 h</h4><p>Offerte dès 50 € d'achat, partout en France.</p></div></div>
      <div class="perk"><div class="perk-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 5 6v5c0 4.5 3 7.6 7 9 4-1.4 7-4.5 7-9V6z"/><path d="m9 12 2 2 4-4"/></svg></div><div><h4>Garantie sereine</h4><p>Retours 30 jours et garantie constructeur complète.</p></div></div>
      <div class="perk"><div class="perk-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/></svg></div><div><h4>Conseil d'experts</h4><p>Notre configurateur vérifie la compatibilité à votre place.</p></div></div>
      <div class="perk"><div class="perk-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg></div><div><h4>Paiement sécurisé</h4><p>Transactions chiffrées et données protégées.</p></div></div>
    </div>
  </section>

  <!-- Séparateur 3D #2 : dépliage des garanties (rotateX, effet différent du #1) -->
  <div class="sep3d sep-fold" data-sep aria-hidden="true">
    <i style="--i:0"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 5 6v5c0 4.5 3 7.6 7 9 4-1.4 7-4.5 7-9V6z"/><path d="m9 12 2 2 4-4"/></svg></i>
    <i style="--i:1"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h11v8H3z"/><path d="M14 10h4l3 3v2h-7z"/><circle cx="7.5" cy="17.5" r="1.7"/><circle cx="17.5" cy="17.5" r="1.7"/></svg></i>
    <i style="--i:2"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></i>
    <i style="--i:3"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg></i>
    <i style="--i:4"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z"/></svg></i>
  </div>

  <section class="section svc-block">
    <div class="svc-cols">
      <div>
        <h4>Services</h4>
        <a href="/configurateur">Configurateur PC</a>
        <a href="/catalogue">Catalogue complet</a>
        <a href="/compte">Mon compte & commandes</a>
      </div>
      <div>
        <h4>Garanties</h4>
        <span>✓ Montage & test 24 h</span>
        <span>✓ Garantie 2 ans pièces</span>
        <span>✓ Retours 30 jours</span>
        <span>✓ Support 7j/7</span>
      </div>
      <div>
        <h4>Mentions légales</h4>
        <a href="/catalogue">Conditions générales de vente</a>
        <a href="/catalogue">Politique de confidentialité</a>
        <a href="/catalogue">Paiement sécurisé & cookies</a>
      </div>
    </div>
  </section>`;

  const [cats, featured] = await Promise.all([
    api("/categories"),
    api("/products?sort=featured"),
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
  if (window.initHeroGL) window.initHeroGL($("#heroGL"));   // scène WebGL Three.js
}

/* ─── PC prémontés (configs curées, compatibilité vérifiée) ─── */
const PREBUILTS = [
  { key: "spark", tier: "Entrée gaming", name: "VOLT Spark", tag: "Gaming 1080p haute fréquence", featured: false,
    ids: { "Processeur": 141, "Carte graphique": 166, "Mémoire": 80, "Carte mère": 75, "Stockage": 89, "Refroidissement": 102, "Alimentation": 93, "Boîtier": 230 } },
  { key: "surge", tier: "Performance", name: "VOLT Surge", tag: "1440p haut niveau & création", featured: true,
    ids: { "Processeur": 138, "Carte graphique": 169, "Mémoire": 81, "Carte mère": 214, "Stockage": 64, "Refroidissement": 105, "Alimentation": 223, "Boîtier": 100 } },
  { key: "apex", tier: "Ultra haut de gamme", name: "VOLT Apex", tag: "4K ultra & IA", featured: false,
    ids: { "Processeur": 136, "Carte graphique": 17, "Mémoire": 20, "Carte mère": 28, "Stockage": 204, "Refroidissement": 243, "Alimentation": 225, "Boîtier": 38 } },
];

async function renderPrebuilts() {
  const grid = $("#prebuiltGrid");
  if (!grid) return;
  let byId;
  try {
    const all = await api("/products");
    byId = new Map(all.map((p) => [p.id, p]));
  } catch {
    grid.innerHTML = `<p style="color:var(--text-faint)">Configurations momentanément indisponibles.</p>`;
    return;
  }
  const SHOW = ["Processeur", "Carte graphique", "Mémoire", "Stockage"];
  grid.innerHTML = PREBUILTS.map((b) => {
    const parts = Object.values(b.ids).map((id) => byId.get(id)).filter(Boolean);
    const total = parts.reduce((s, p) => s + p.price, 0);
    const specs = SHOW.map((role) => {
      const p = byId.get(b.ids[role]);
      return p ? `<li><span class="k">${role === "Carte graphique" ? "GPU" : role === "Processeur" ? "CPU" : role}</span><span class="v">${esc(p.brand)} ${esc(p.name)}</span></li>` : "";
    }).join("");
    return `<article class="pb-card${b.featured ? " featured" : ""}">
      <div class="pb-head">
        <span class="pb-tier">${b.tier}</span>
        <div class="pb-name">${b.name}</div>
        <div class="pb-tag">${b.tag}</div>
        <span class="pb-compat"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>Compatibilité confirmée</span>
      </div>
      <ul class="pb-specs">${specs}</ul>
      <div class="pb-foot">
        <div class="pb-price">${fmt(total)}<small>${parts.length} composants montés & testés</small></div>
        <button class="btn btn-primary btn-sm" data-pb="${b.key}">Ajouter au panier</button>
      </div>
    </article>`;
  }).join("");
  grid.querySelectorAll("[data-pb]").forEach((btn) => btn.onclick = () => {
    const b = PREBUILTS.find((x) => x.key === btn.dataset.pb);
    let n = 0;
    Object.values(b.ids).forEach((id) => { const p = byId.get(id); if (p && p.stock > 0) { addToCart(p, 1, true); n++; } });
    toast(`${b.name} ajouté : ${n} composants 🛒`, "success");
    openCart();
  });
}

/* ─── Animations home : tour PC (hero) + séparateurs 3D pilotés au scroll ───
   Chaque séparateur reçoit une progression --p (0→1) selon sa traversée du
   viewport ; le CSS la transforme en effets VARIÉS (profondeur, dépliage),
   pas seulement en rotation. La tour du hero réagit au scroll + à la souris. */
function initHome3D() {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const pc = $("#pc3d");
  const stage = $("#hhStage");
  const seps = $$("[data-sep]");
  if (reduce) {                              // accessibilité : état final figé, zéro mouvement
    seps.forEach((s) => s.style.setProperty("--p", "1"));
    return;
  }

  let ticking = false;
  const update = () => {
    ticking = false;
    const vh = window.innerHeight;
    // Tour du hero : légère rotation + recul selon le scroll d'entrée
    if (pc) {
      const r = pc.getBoundingClientRect();
      const prog = 1 - (r.top + r.height / 2) / vh;     // ~0 en haut → 1 en bas de l'écran
      pc.style.setProperty("--rot", `${-26 + prog * 60}deg`);
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

  // Tilt souris de la tour (parallaxe douce dans le hero)
  if (stage && pc) {
    stage.addEventListener("pointermove", (e) => {
      const r = stage.getBoundingClientRect();
      const dx = (e.clientX - r.left) / r.width - 0.5;
      const dy = (e.clientY - r.top) / r.height - 0.5;
      pc.style.setProperty("--tiltx", `${(-dy * 10).toFixed(1)}deg`);
      pc.style.setProperty("--tilty", `${(dx * 16).toFixed(1)}deg`);
    });
    stage.addEventListener("pointerleave", () => {
      pc.style.setProperty("--tiltx", "0deg");
      pc.style.setProperty("--tilty", "0deg");
    });
  }
  update();
}

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
  $("#resultCount").textContent = `${products.length} produit${products.length > 1 ? "s" : ""}`;

  // Pagination côté client : l'API renvoie tout, on affiche par tranches.
  const pageCount = Math.max(1, Math.ceil(products.length / PER_PAGE));
  const page = Math.min(filters.page, pageCount);
  const pageItems = products.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  $("#catalogGrid").innerHTML = products.length
    ? `<div class="product-grid">${pageItems.map(productCard).join("")}</div>${pagerHtml(page, pageCount)}`
    : `<div class="empty-state"><div class="big">🔍</div><p>Aucun produit ne correspond à vos critères.</p></div>`;
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
    if (next.page > 1) p.set("page", next.page);
    go("/catalogue" + (p.toString() ? "?" + p.toString() : ""));
  };

  $$("input[name=cat]", app).forEach((r) => r.onchange = () => navigate({ cat: r.value, brand: "" }));
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
  <nav class="breadcrumb">
    <a href="/">Accueil</a> / <a href="/catalogue">Catalogue</a> /
    <a href="/catalogue?cat=${p.category}">${CATS[p.category]?.label ?? p.category}</a> / <span>${esc(p.name)}</span>
  </nav>
  <div class="product-page">
    <div class="product-gallery">
      <div class="product-page-visual" style="--tint:${tintOf(p)}">
        ${art(p.category, hueOf(p))}
        <img class="pimg" id="ppMain" src="${esc(p.image_url || `/images/${p.id}-1.jpg`)}" alt="${esc(p.name)}" onerror="this.remove()">
        ${badgeHtml(p.badge)}
      </div>
      <div class="pp-thumbs" id="ppThumbs">
        ${[1,2,3].map((n) => `
          <button class="pp-thumb${n === 1 ? " active" : ""}" data-src="/images/${p.id}-${n}.jpg">
            <img src="/images/${p.id}-${n}.jpg" alt="" loading="lazy" onerror="this.closest('.pp-thumb').remove()">
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

  // Galerie : clic sur une miniature → change l'image principale.
  $$("#ppThumbs .pp-thumb").forEach((btn) => btn.onclick = () => {
    const main = $("#ppMain");
    if (main) main.src = btn.dataset.src;
    $$("#ppThumbs .pp-thumb").forEach((b) => b.classList.toggle("active", b === btn));
  });
  // Masque la rangée de miniatures s'il n'en reste qu'une (ou zéro) après chargement.
  setTimeout(() => {
    const thumbs = $("#ppThumbs");
    if (thumbs && thumbs.querySelectorAll(".pp-thumb").length <= 1) thumbs.style.display = "none";
  }, 1200);
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
      $("#reviewText").value = "";
      $("#reviewSubmit").dataset.mode = "create";
      toast(editing ? "Avis mis à jour ✔" : "Merci pour votre avis !");
      await loadReviews();
    } catch (e) { toast(e.message, "error"); }
  });

  await loadReviews();
}

/* ─── Vue : comparateur ─── */
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

  app.innerHTML = `
  <div class="section-head" style="margin-top:0"><h1>Comparateur</h1>
    <button class="btn btn-ghost btn-sm" id="cmpClearAll">Tout vider</button></div>
  <div class="cmp-wrap">
    <table class="cmp-table">
      <thead><tr><th class="cmp-label"></th>${products.map(cell).join("")}</tr></thead>
      <tbody>
        ${row("Prix", (p) => `<strong>${fmt(p.price)}</strong>${p.old_price ? ` <small class="cmp-old">${fmt(p.old_price)}</small>` : ""}`)}
        ${row("Catégorie", (p) => esc(CATS[p.category]?.label || p.category))}
        ${row("Marque", (p) => esc(p.brand))}
        ${row("Note", (p) => `${stars(p.rating)} <small>${p.rating.toFixed(1)} (${p.rating_count})</small>`)}
        ${row("Disponibilité", (p) => p.stock > 0 ? `<span class="green">En stock</span>` : `<span style="color:var(--red)">Rupture</span>`)}
        ${specKeys.map((k) => row(k, (p) => esc(p.specs[k] ?? "—"))).join("")}
        ${row("", (p) => `<button class="btn btn-primary btn-sm" data-add="${p.id}" ${p.stock <= 0 ? "disabled" : ""}>Ajouter au panier</button>`)}
      </tbody>
    </table>
  </div>`;

  const map = new Map(products.map((p) => [p.id, p]));
  $$("[data-add]", app).forEach((b) => b.onclick = () => { const p = map.get(Number(b.dataset.add)); if (p) addToCart(p); });
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
  { cat: "monitor", label: "Écran", hint: "Optionnel — OLED conseillé" },
  { cat: "keyboard", label: "Clavier", hint: "Optionnel" },
  { cat: "mouse", label: "Souris", hint: "Optionnel" },
  { cat: "headset", label: "Casque", hint: "Optionnel" },
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
  <p style="color:var(--text-dim);margin-bottom:26px">Composez votre machine pièce par pièce — la compatibilité est vérifiée automatiquement à chaque étape.</p>
  <div class="builder-layout">
    <div id="slots"></div>
    <div class="builder-summary panel" id="buildSummary"></div>
  </div>`;

  const products = await api("/products");
  const byCat = {};
  for (const p of products) (byCat[p.category] ??= []).push(p);

  const renderSlots = () => {
    $("#slots").innerHTML = BUILD_SLOTS.map((slot) => {
      const sel = state.build[slot.cat];
      return `
      <div class="builder-slot ${sel ? "filled" : ""}">
        <div class="builder-slot-icon" style="width:52px;height:52px">${art(slot.cat, 30)}</div>
        <div class="builder-slot-main">
          <h3>${slot.label}</h3>
          <p>${sel ? `${esc(sel.brand)} ${esc(sel.name)}` : slot.hint}</p>
        </div>
        ${sel ? `<span class="price">${fmt(sel.price)}</span>` : ""}
        <button class="btn ${sel ? "btn-ghost" : "btn-primary"} btn-sm" data-pick="${slot.cat}">${sel ? "Changer" : "Choisir"}</button>
        ${sel ? `<button class="icon-btn" data-unpick="${slot.cat}" title="Retirer" style="padding:8px 11px">✕</button>` : ""}
      </div>`;
    }).join("");

    const total = Object.values(state.build).reduce((s, p) => s + p.price, 0);
    const count = Object.keys(state.build).length;
    const checks = buildChecks();
    const watts = estimateWatts();
    const psuW = state.build.psu?.specs?.watts || 0;
    const hasError = checks.some((c) => c.level === "err");

    $("#buildSummary").innerHTML = `
      <h2>Ma configuration</h2>
      <div class="cart-totals">
        <div class="row"><span>${count} / ${BUILD_SLOTS.length} composants</span><span></span></div>
        <div class="row total"><span>Total</span><span>${fmt(total)}</span></div>
      </div>
      <div class="compat">
        ${checks.length ? checks.map((c) => `<div class="compat-item ${c.level}"><span>${c.level === "ok" ? "✓" : c.level === "warn" ? "⚠" : "✕"}</span><span>${c.text}</span></div>`).join("")
          : `<div class="compat-item" style="color:var(--text-faint)">Sélectionnez des composants pour lancer les vérifications.</div>`}
      </div>
      ${count ? `
        <div class="watt-label">Consommation estimée : <strong>${watts} W</strong>${psuW ? ` / ${psuW} W` : ""}</div>
        <div class="watt-bar"><div style="width:${psuW ? Math.min(100, watts / psuW * 100) : Math.min(100, watts / 10)}%"></div></div>` : ""}
      <br>
      <button class="btn btn-primary btn-block" id="buildToCart" ${count === 0 || hasError ? "disabled" : ""}>
        ${hasError ? "Corrigez les incompatibilités" : "Ajouter la config au panier"}
      </button>`;

    $$("[data-pick]").forEach((b) => b.onclick = () => openPicker(b.dataset.pick));
    $$("[data-unpick]").forEach((b) => b.onclick = () => { delete state.build[b.dataset.unpick]; renderSlots(); });
    const toCart = $("#buildToCart");
    if (toCart) toCart.onclick = () => {
      for (const p of Object.values(state.build)) {
        const line = state.cart.find((i) => i.id === p.id);
        if (line) line.qty += 1;
        else state.cart.push({ id: p.id, name: p.name, brand: p.brand, category: p.category, price: p.price, stock: p.stock, qty: 1 });
      }
      saveCart();
      renderCartDrawer();
      toast("Configuration ajoutée au panier ⚡");
      openCart();
    };
  };

  const isCompatible = (cat, p) => {
    const b = state.build;
    if (cat === "motherboard" && b.cpu) return p.specs.socket === b.cpu.specs.socket;
    if (cat === "cpu" && b.motherboard) return p.specs.socket === b.motherboard.specs.socket;
    if (cat === "cooling" && b.cpu) return (p.specs.sockets || []).includes(b.cpu.specs.socket);
    if (cat === "case" && b.gpu) return (b.gpu.specs.length_mm || 0) <= (p.specs.max_gpu_mm || 999);
    if (cat === "gpu" && b.case) return (p.specs.length_mm || 0) <= (b.case.specs.max_gpu_mm || 999);
    if (cat === "psu") return (p.specs.watts || 0) >= estimateWatts();
    return true;
  };

  const openPicker = (cat) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal wide">
        <button class="modal-close">✕</button>
        <h2 style="font-size:1.2rem">Choisir : ${CATS[cat].label}</h2>
        <div class="picker-list">
          ${(byCat[cat] || []).map((p) => {
            const compat = isCompatible(cat, p);
            return `
            <button class="picker-item ${compat ? "" : "incompatible"}" data-id="${p.id}">
              <div class="picker-visual">${art(p.category, hueOf(p))}${imgTag(p)}</div>
              <div class="picker-item-info">
                <strong>${esc(p.brand)} ${esc(p.name)}</strong>
                <span>${compat ? stockHtml(p.stock).replace(/<[^>]+>/g, "") : "⚠ Incompatible avec votre sélection"}</span>
              </div>
              <span class="price" style="font-size:.95rem">${fmt(p.price)}</span>
            </button>`;
          }).join("")}
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.onclick = (e) => { if (e.target === overlay) close(); };
    $(".modal-close", overlay).onclick = close;
    $$(".picker-item", overlay).forEach((item) => item.onclick = () => {
      const p = (byCat[cat] || []).find((x) => x.id === Number(item.dataset.id));
      if (!isCompatible(cat, p)) { toast("Ce composant est incompatible avec votre sélection actuelle", "error"); return; }
      state.build[cat] = p;
      close();
      renderSlots();
    });
  };

  renderSlots();
}

/* ─── Vue : checkout ─── */
async function viewCheckout(app) {
  if (!state.user) { go("/"); openAuth(); return; }
  if (state.cart.length === 0) {
    app.innerHTML = `<div class="empty-state"><div class="big">🛒</div><h2>Votre panier est vide</h2><br><a class="btn btn-primary" href="/catalogue">Voir le catalogue</a></div>`;
    return;
  }
  const t = cartTotals();
  // Carnet d'adresses : pré-remplissage rapide depuis une adresse enregistrée.
  let addresses = [];
  try { addresses = await api("/addresses"); } catch { /* non bloquant */ }

  // Une adresse enregistrée dans le compte est OBLIGATOIRE pour accéder au paiement
  // (elle reste modifiable ci-dessous). Sinon, on renvoie vers le carnet d'adresses.
  if (addresses.length === 0) {
    app.innerHTML = `
      <div class="empty-state">
        <div class="big">📍</div>
        <h2>Ajoutez une adresse de livraison</h2>
        <p style="margin-top:10px">Pour passer au paiement, enregistrez d'abord une adresse de livraison dans votre compte. Vous pourrez la modifier au moment de la commande.</p>
        <br>
        <a class="btn btn-primary" href="/compte?tab=addresses">Ajouter une adresse</a>
        &nbsp;<a class="btn btn-ghost" href="/catalogue">Continuer mes achats</a>
      </div>`;
    window.scrollTo({ top: 0 });
    return;
  }

  const addressPicker = addresses.length ? `
      <label class="full">Adresse enregistrée
        <select id="addrPicker">
          <option value="">— Nouvelle adresse —</option>
          ${addresses.map((a) => `<option value="${a.id}">${esc(a.label || a.ship_name)} — ${esc(a.ship_address)}, ${esc(a.ship_zip)} ${esc(a.ship_city)}</option>`).join("")}
        </select>
      </label>` : "";
  const def = addresses.find((a) => a.is_default);

  app.innerHTML = `
  <h1 style="margin-bottom:24px">Finaliser ma commande</h1>
  <div class="checkout-layout">
    <form class="panel" id="checkoutForm">
      <h2>Adresse de livraison</h2>
      <div class="form-grid">
        ${addressPicker}
        <label class="full">Nom complet<input name="ship_name" required minlength="2" value="${esc(def?.ship_name || state.user.name)}"></label>
        <label class="full">Adresse<input name="ship_address" required minlength="4" placeholder="12 rue de la Paix" value="${esc(def?.ship_address || "")}"></label>
        <label>Ville<input name="ship_city" required minlength="2" placeholder="Paris" value="${esc(def?.ship_city || "")}"></label>
        <label>Code postal<input name="ship_zip" required minlength="4" placeholder="75001" value="${esc(def?.ship_zip || "")}"></label>
        <label class="full" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" id="saveAddr" style="width:auto"> Enregistrer cette adresse dans mon carnet</label>
      </div>
      <br>
      <h2>Paiement</h2>
      <p style="color:var(--text-dim);font-size:.85rem;margin:4px 0 12px">
        🔒 Vous serez redirigé vers la page de paiement sécurisée <strong>Stripe</strong>.
        Vos coordonnées bancaires ne transitent jamais par nos serveurs.</p>
      <p style="color:var(--text-faint);font-size:.78rem">Carte de test : <code>4242 4242 4242 4242</code> · date future · CVC libre.</p>
      <br>
      <button class="btn btn-primary btn-block" type="submit">Payer ${fmt(t.total)} →</button>
    </form>
    <div class="panel">
      <h2>Récapitulatif</h2>
      ${state.cart.map((i) => `<div class="summary-line"><span>${i.qty} × ${esc(i.name)}</span><span>${fmt(i.price * i.qty)}</span></div>`).join("")}
      ${t.discount ? `<div class="summary-line"><span>Code ${esc(state.promo.code)}</span><span style="color:var(--green)">−${fmt(t.discount)}</span></div>` : ""}
      <div class="summary-line"><span>Livraison</span><span>${t.shipping ? fmt(t.shipping) : "Offerte"}</span></div>
      <div class="summary-line"><span>Total</span><span>${fmt(t.total)}</span></div>
    </div>
  </div>`;

  // Pré-remplit le formulaire depuis une adresse enregistrée.
  const picker = $("#addrPicker");
  if (picker) picker.onchange = () => {
    const a = addresses.find((x) => String(x.id) === picker.value);
    const form = $("#checkoutForm");
    if (a) {
      form.ship_name.value = a.ship_name; form.ship_address.value = a.ship_address;
      form.ship_city.value = a.ship_city; form.ship_zip.value = a.ship_zip;
    }
  };

  $("#checkoutForm").onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const btn = $("button[type=submit]", e.target);
    btn.disabled = true;
    btn.textContent = "Redirection vers le paiement…";
    try {
      // Enregistrement optionnel de l'adresse dans le carnet (non bloquant).
      if ($("#saveAddr")?.checked) {
        try {
          await api("/addresses", { method: "POST", body: JSON.stringify({
            ship_name: f.get("ship_name"), ship_address: f.get("ship_address"),
            ship_city: f.get("ship_city"), ship_zip: f.get("ship_zip"),
          }) });
        } catch { /* on n'empêche pas le paiement si la sauvegarde échoue */ }
      }
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
        }),
      });
      // Redirection vers la page de paiement hébergée par Stripe.
      window.location.href = url;
    } catch (err) {
      toast(err.message, "error");
      btn.disabled = false;
      btn.textContent = `Payer ${fmt(t.total)} →`;
    }
  };
}

/* ─── Vue : retour de paiement réussi (Stripe → success_url) ─── */
async function viewPaymentSuccess(app, params) {
  const sessionId = params.get("session_id");
  app.innerHTML = `<div class="empty-state"><div class="big">⏳</div><h2>Vérification du paiement…</h2></div>`;
  try {
    // On confirme l'état réel auprès du serveur (qui interroge Stripe).
    const res = await api("/checkout/status?session_id=" + encodeURIComponent(sessionId || ""));
    if (res.payment_status !== "paid") throw new Error("Paiement non confirmé");
    // Paiement validé : on vide le panier local.
    state.cart = [];
    state.promo = null;
    saveCart();
    savePromo();
    renderCartDrawer();
    app.innerHTML = `
      <div class="empty-state">
        <div class="big">🎉</div>
        <h2>Commande n°${res.order_id} confirmée !</h2>
        <p style="margin-top:10px">Paiement reçu — total réglé : <strong>${fmt(res.amount_total)}</strong>.<br>Expédition sous 24 h, suivi disponible dans votre compte.</p>
        <br>
        <a class="btn btn-primary" href="/compte">Voir mes commandes</a>
        &nbsp;<a class="btn btn-ghost" href="/catalogue">Continuer mes achats</a>
      </div>`;
  } catch (err) {
    app.innerHTML = `
      <div class="empty-state">
        <div class="big">⚠️</div>
        <h2>Paiement non confirmé</h2>
        <p style="margin-top:10px">${esc(err.message)}. Si vous avez été débité, votre commande sera validée automatiquement sous peu.</p>
        <br><a class="btn btn-primary" href="/compte">Voir mes commandes</a>
      </div>`;
  }
  window.scrollTo({ top: 0 });
}

/* ─── Vue : paiement annulé (Stripe → cancel_url) ─── */
function viewPaymentCancelled(app) {
  app.innerHTML = `
    <div class="empty-state">
      <div class="big">🛑</div>
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
  if (!state.user) { go("/"); openAuth(); return; }
  // Rafraîchit le profil (notamment le statut admin) pour les sessions déjà
  // ouvertes avant l'ajout de cette fonctionnalité.
  try {
    const me = await api("/auth/me");
    state.user = { ...state.user, ...me };
    saveAuth();
  } catch { /* token invalide : géré par api() */ }

  const adminLink = state.user.is_admin
    ? `<a class="btn btn-primary btn-sm" style="color:var(--on-primary)" href="/admin">🛠️ Espace admin</a>` : "";

  app.innerHTML = `
  <div class="section-head" style="margin-top:0">
    <h1>Bonjour, ${esc(state.user.name)} 👋</h1>
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
  const initial = params?.get("tab");
  const startTab = tabs[initial] ? initial : "orders";
  $$(".account-tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === startTab));
  tabs[startTab]();
}

/* ─── Compte : commandes (avec annulation) ─── */
async function renderAccountOrders(panel) {
  panel.innerHTML = `<div class="skeleton" style="min-height:110px"></div>`;
  const orders = await api("/orders");
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
          ${o.status !== "en attente de paiement" ? `<button class="btn btn-ghost btn-sm" onclick="downloadInvoice(${o.id})">🧾 Télécharger la facture</button>` : ""}
          ${cancellable.has(o.status) ? `<button class="btn btn-ghost btn-sm order-cancel" data-cancel="${o.id}" style="color:var(--red)">Annuler la commande</button>` : ""}
        </div>
      </div>`).join("")
    : `<div class="empty-state"><div class="big">📦</div><p>Aucune commande pour le moment.</p><br><a class="btn btn-primary" href="/catalogue">Découvrir le catalogue</a></div>`;

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
  const favs = await api("/favorites");
  state.favorites = new Set(favs.map((p) => p.id));
  panel.innerHTML = favs.length
    ? `<div class="product-grid">${favs.map(productCard).join("")}</div>`
    : `<div class="empty-state"><div class="big">♡</div><p>Aucun favori pour le moment.</p><br><a class="btn btn-primary" href="/catalogue">Parcourir le catalogue</a></div>`;
  bindProductCards(panel, favs);
}

/* ─── Compte : carnet d'adresses ─── */
async function renderAccountAddresses(panel) {
  panel.innerHTML = `<div class="skeleton" style="min-height:110px"></div>`;
  const addresses = await api("/addresses");
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
      <summary style="cursor:pointer;font-weight:600">➕ Ajouter une adresse</summary>
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
    ${tab("stats", "/admin/stats", "📊 Tableau de bord")}
    ${tab("orders", "/admin", "Commandes")}
    ${tab("products", "/admin/produits", "Produits")}
  </div>`;
}

/* ─── Vue : espace admin — tableau de bord ─── */
async function viewAdminStats(app) {
  if (!state.user) { go("/"); openAuth(); return; }
  app.innerHTML = `
  <div class="section-head" style="margin-top:0"><h1>📊 Tableau de bord — Admin</h1>
    <a class="btn btn-ghost btn-sm" href="/compte">← Mon compte</a></div>
  ${adminNav("stats")}
  <div id="statsBody"><div class="skeleton" style="min-height:140px"></div></div>`;

  let s;
  try { s = await api("/admin/stats"); }
  catch (err) {
    $("#statsBody").innerHTML = `<div class="empty-state"><div class="big">🔒</div><h2>Accès réservé</h2><p style="margin-top:10px">${esc(err.message)}</p><br><a class="btn btn-primary" href="/">Accueil</a></div>`;
    return;
  }

  const kpi = (label, value, sub = "") =>
    `<div class="kpi-card"><span class="kpi-label">${label}</span><strong class="kpi-value">${value}</strong>${sub ? `<span class="kpi-sub">${sub}</span>` : ""}</div>`;
  const statusOrder = ["en attente de paiement", "payée", "préparée", "expédiée", "livrée", "annulée"];

  $("#statsBody").innerHTML = `
    <div class="kpi-grid">
      ${kpi("Chiffre d'affaires", fmt(s.revenue), "commandes réglées")}
      ${kpi("CA aujourd'hui", fmt(s.revenue_today), `${s.orders_today} commande${s.orders_today > 1 ? "s" : ""}`)}
      ${kpi("Commandes payées", s.orders_paid)}
      ${kpi("Panier moyen", fmt(s.avg_basket))}
      ${kpi("Clients", s.customers)}
    </div>

    <div class="admin-cols">
      <div class="panel">
        <h2 style="margin-bottom:14px">🏆 Meilleures ventes</h2>
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
        </table>` : `<p style="color:var(--text-dim)">Tous les stocks sont confortables 👍</p>`}
      </div>
    </div>

    <div class="panel" style="margin-top:18px">
      <h2 style="margin-bottom:14px">Commandes par statut</h2>
      <div class="status-pills">
        ${statusOrder.filter((st) => s.by_status[st]).map((st) => `
          <a class="status-pill" href="/admin?status=${encodeURIComponent(st)}">${statusBadge(st)} <strong>${s.by_status[st]}</strong></a>`).join("") || `<span style="color:var(--text-dim)">Aucune commande.</span>`}
      </div>
    </div>`;
}

/* ─── Vue : espace admin (toutes les commandes) ─── */
async function viewAdmin(app, params) {
  if (!state.user) { go("/"); openAuth(); return; }

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
    <h1>🛠️ Commandes — Admin</h1>
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
    // 403 = compte non administrateur
    app.innerHTML = `<div class="empty-state"><div class="big">🔒</div><h2>Accès réservé</h2><p style="margin-top:10px">${esc(err.message)}</p><br><a class="btn btn-primary" href="/">Retour à l'accueil</a></div>`;
    return;
  }

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

  $("#adminOrders").innerHTML = orders.length
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
            <strong style="color:var(--text-dim);font-size:.8rem;text-transform:uppercase">📦 Livraison</strong><br>
            ${esc(o.ship_name)}<br>
            ${esc(o.ship_address)}<br>
            ${esc(o.ship_zip)} ${esc(o.ship_city)}
          </div>
        </div>
        <div class="order-items">
          ${o.items.map((i) => `${i.quantity} × ${esc(i.product_name)} — ${fmt(i.unit_price * i.quantity)}`).join("<br>")}
        </div>
        <div class="order-total">Total : ${fmt(o.total)}${o.promo_code ? ` <small style="color:var(--green);font-weight:400">(code ${esc(o.promo_code)}, −${fmt(o.discount)})</small>` : ""}${o.shipping ? ` · port ${fmt(o.shipping)}` : " · port offert"}</div>
        ${o.status !== "en attente de paiement" ? `<div style="margin-top:10px"><button class="btn btn-ghost btn-sm" onclick="downloadInvoice(${o.id})">🧾 Facture</button></div>` : ""}
        ${statusControls(o)}
      </div>`).join("")
    : `<div class="empty-state"><div class="big">📭</div><p>Aucune commande${current ? " pour ce statut" : ""}.</p></div>`;

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
        viewAdmin(app, params); // recharge la liste
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
    ? `<div style="margin-top:10px;font-size:.85rem;color:var(--text-dim)">📦 ${o.carrier ? esc(o.carrier) + " — " : ""}suivi : <strong style="color:var(--text)">${esc(o.tracking_number)}</strong></div>`
    : "";
  return `<div style="margin-top:14px"><div style="display:flex;align-items:flex-end">${bar}</div>${track}</div>`;
}

/* ─── Vue : espace admin — gestion des produits ─── */
async function viewAdminProducts(app) {
  if (!state.user) { go("/"); openAuth(); return; }
  // Rafraîchit le statut admin puis verrouille l'accès.
  try { const me = await api("/auth/me"); state.user = { ...state.user, ...me }; saveAuth(); } catch { /* géré par api() */ }
  if (!state.user.is_admin) {
    app.innerHTML = `<div class="empty-state"><div class="big">🔒</div><h2>Accès réservé</h2><br><a class="btn btn-primary" href="/">Retour à l'accueil</a></div>`;
    return;
  }

  const catOptions = Object.entries(CATS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join("");
  app.innerHTML = `
  <div class="section-head" style="margin-top:0">
    <h1>🛠️ Produits — Admin</h1>
    <a class="btn btn-ghost btn-sm" href="/compte">← Mon compte</a>
  </div>
  ${adminNav("products")}
  <details class="panel" style="margin-bottom:20px">
    <summary style="cursor:pointer;font-weight:600;font-size:1.05rem">➕ Ajouter un produit</summary>
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
    $("#adminProducts").innerHTML =
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
          <button class="btn btn-primary btn-sm pp-save" data-pid="${p.id}" style="color:var(--on-primary)">💾 Enregistrer</button>
          <button class="btn btn-ghost btn-sm pp-del" data-pid="${p.id}">🗑</button>
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
  const map = new Map(products.map((p) => [p.id, p]));
  $$("[data-goto]", root).forEach((card) => {
    card.addEventListener("click", (e) => {
      // Les boutons d'action (panier, favori, comparer) ne déclenchent pas la navigation.
      if (e.target.closest("[data-add],[data-fav],[data-cmp]")) return;
      go(card.dataset.goto);
    });
  });
  $$("[data-add]", root).forEach((btn) => {
    btn.addEventListener("click", () => {
      const p = map.get(Number(btn.dataset.add));
      if (p) addToCart(p);
    });
  });
  $$("[data-fav]", root).forEach((btn) => {
    btn.addEventListener("click", (e) => { e.stopPropagation(); toggleFavorite(Number(btn.dataset.fav), btn); });
  });
  $$("[data-cmp]", root).forEach((btn) => {
    btn.addEventListener("click", (e) => { e.stopPropagation(); toggleCompare(Number(btn.dataset.cmp)); });
  });
}

/* ─── Sous-menus de navigation ─── */
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

/* ─── Initialisation ─── */
function init() {
  saveAuth();
  updateCartCount();
  renderCartDrawer();
  setupAuth();
  fillNavMenus();

  $("#cartBtn").onclick = () => { renderCartDrawer(); openCart(); };
  $("#cartClose").onclick = closeCart;
  $("#drawerOverlay").onclick = closeCart;
  $("#accountBtn").onclick = () => { if (state.user) go("/compte"); else openAuth(); };
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
  // Si déjà connecté : charge les favoris ET le panier du compte avant le premier
  // rendu (cœurs dans le bon état, panier rattaché à l'utilisateur).
  (async () => {
    if (state.user) {
      try { await loadFavorites(); await syncCartOnLogin(); } catch { /* non bloquant */ }
    }
    render();
  })();
}

init();
