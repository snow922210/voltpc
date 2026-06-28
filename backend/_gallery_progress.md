# Collecte galerie Amazon — plan & état (boucle /loop)

## Objectif
3 à 5 vraies images Amazon par produit (245). Si indispo/mismatch → garder 1 image
+ description déjà enrichie. Ne JAMAIS inventer d'ID (cause des mismatches passés).

## Méthode par produit (à suivre à la lettre)
1. amazon.fr/s?k=<brand+name> → extraire candidats {asin,title}.
2. Choisir l'ASIN dont le titre contient les `tokens` (capacité/modèle) de _worklist.json.
   Si aucun match confiant → SKIP (laisser 1 image), noter dans "skipped".
3. Ouvrir /dp/<asin> → extraire les IDs des miniatures #altImages dans l'ordre,
   en filtrant les vignettes vidéo et l'image principale (index 0, = déjà -1).
4. Vetting visuel : OBLIGATOIRE pour storage/ram (capacité imprimée),
   spot-check (-2) pour le reste. Écarter toute image au modèle/capacité erroné.
5. Append { "<name>": [ids secondaires] } dans _gallery_ids.json.
6. Par lot (~6 produits) : `python add_gallery_images.py` puis vérifier les jpg.

## Fichiers
- _worklist.json    : 245 produits {name,brand,category,q,tokens}
- _gallery_ids.json : résultats {name:[ids]} (accumulés)
- add_gallery_images.py : génère <slug>-2.jpg… (ne touche pas -1 ni le mapping)

## État (4/245)
- [x] 990 Pro 2 To → 3 sec. — VALIDÉ
- [x] GeForce RTX 5090 SUPRIM Liquid 32G → 4 sec. — VALIDÉ (vu -2)
- [x] GeForce RTX 5090 Gaming Trio OC → 4 sec.
- [x] GeForce RTX 5080 TUF Gaming OC → 4 sec.
- [x] RTX 5080 Gaming OC, 5070 Ti Gaming OC, 5070 Ventus 3X OC — VALIDÉ (vu Ventus)
- [x] RTX 5060 Ti 16 Go Eagle OC, RTX 5060 Ti 8 Go Ventus 2X
- [x] RTX 4090 ROG Strix OC, RTX 4080 Super Gaming X
- [x] RTX 4070 Super Dual, RTX 4060 Ti 16 Go Gaming OC, RTX 4060 Ti 8 Go Windforce
- [x] RX 9070 XT Nitro+, RX 9070 XT 16 Go (XFX), RX 9070 GRE 12 Go, RX 9060 XT 16 Go
- [x] RX 7900 XTX, RX 7700 XT, RX 7600, RX 7900 XT, RX 7900 GRE
- [x] Arc B580, Arc B570, RTX 3050 6 Go
- [x] ===== CATÉGORIE GPU TERMINÉE (26 galeries / 34 produits, 8 skips) =====
- [x] CPU AMD TOUS FAITS (20) : 9950X3D, 9800X3D, 9950X, 9900X, 9700X, 9600X, 8400F,
      7800X3D, 7600X, 7950X3D, 7900X3D, 7950X, 7900X, 7700X, 7500F, 8700G, 8600G,
      Threadripper 7960X, 5700X3D, 5600, Athlon 3000G
- [x] CPU Intel TOUS FAITS (10) : Ultra 9 285K, Ultra 7 265K, Ultra 5 245K, i7-14700K,
      i5-14600KF, i5-14500, i5-14400F, i5-13400F, i5-12400F, i3-14100F
- [x] ===== CATÉGORIE CPU TERMINÉE (31/31, 0 skip) =====
- [x] RAM faits (5) : Trident Z5 RGB 32Go 6000 CL30 (noir), Vengeance RGB 32Go 6000 CL30 (gris, -1 corrigé),
      Vengeance 32Go 5600 (gris, -1 corrigé Lexar→Corsair), Fury Beast RGB 32Go 6000 (noir, -1 corrigé),
      T-Force Delta RGB 32Go 6400 (noir, -1 corrigé)
- [NOTE] Beaucoup de -1 RAM pré-existants sont FAUX (mauvais modèle/marque/variante) →
      pour la RAM, TOUJOURS réécrire la galerie complète via set_full_gallery.py (couleur standard = noir/gris).
- [x] ===== CATÉGORIE RAM TERMINÉE (15/15) — toutes les -1 corrigées via set_full_gallery.py =====
- [x] ===== CATÉGORIE STOCKAGE TERMINÉE (18/21, 3 skips) =====
      Faits via fetch same-origin (window.AMZ dans Chrome) + vetting montage : 990 Pro 1/4 To,
      WD_Black SN850X 1/2/4 To, FireCuda 530R 2 To, T705/T700 1-2 To, 980 1 To, 870 EVO 1/2 To,
      A400 480 Go, 9100 Pro 2 To, KC3000 2 To, SN580 2 To (que 2 secondaires, reste = bannières),
      970 EVO Plus 1 To, 990 EVO Plus 2 To.
      ATTENTION pièges détectés : Crucial T700/T705 et WD SN850X ont 3-4 BANNIÈRES marketing
      ("Blistering speeds", "NEW LOOK", "POWERED BY SANDISK/RADXORK") en index 1-4 → vetting
      obligatoire, prendre les vraies photos plus loin dans la liste. Samsung = 100% propre.
      SKIPS storage : P3 Plus 1 To (que 500 Go sur amazon.fr), MX500 1 To (que 4 To), P3 2 To Gen3
      (remplacé par P310, P3 gen3 absent).

## MÉTHODE RAPIDE (depuis 2026-06-24) — fetch same-origin
Sur une page amazon.fr ouverte (Chrome MCP), définir window.AMZ avec getHtml(fetch),
pickAsins(DOMParser sur /s?k=), imgIds(regex sur "large":"...images/I/<ID>" du HTML /dp/<asin>?th=1),
run(query,tokens)→cands triés par tokens. Puis ids[1:5] = secondaires (index0=image principale).
Vetting = injecter un montage <img SL300> dans document.body + screenshot. ~10x plus rapide
que naviguer page par page. NE PAS naviguer (window.AMZ se perd) — tout via fetch.

- [x] ===== CATÉGORIE MOTHERBOARD TERMINÉE (18/19, 1 skip) =====
      Pièges : ASUS ROG/Prime haut de gamme (B650M-A, B650E-I, Z790-I, X870E-E) et ASRock Z890
      mettent 4-5 BANNIÈRES A+ ("Built For Speed", "Exclusive AI Intelligence"...) en index 1-5 →
      vraies photos en FIN de liste (index 6+). MSI = petits badges coin (tolérables, board visible,
      éviter l'index "feature icons" le plus chargé). Gigabyte + ASUS PRIME H610M-K = 100% propres.
      A520M-HDV n'a que 3 images (1 photo + 1 diagramme + 1 tableau) → 1 seul secondaire.
      SKIP : B450M DS3H V2 (absent d'amazon.fr, que B550M/A520M DS3H).

- [x] ===== CATÉGORIE PSU TERMINÉE (6 enrichies, 4 conservées 1 image, 3 skips) =====
      Les alims sont TRÈS chargées en bannières A+. Corsair RM-series : 1 photo (index 0) +
      4-5 bannières, PUIS box (index 6) + angle (index 7) en fin de galerie principale — MAIS
      attention le widget comparatif réinjecte les images des AUTRES modèles (RM750e/1000e ont
      l'angle du RM850e à l'index 7, à exclure). be quiet! Pure Power = plusieurs vraies photos.
      Enrichies : RM850e [6,7], RM750e [6], RM1000e [6], RM650x [1,4], RM1200x SHIFT [7,9],
      Pure Power 12 M 650W [1,2,4].
      Que bannières (gardées en 1 image, PAS dans _gallery_ids.json) : HX1000i, SF750, SF1000,
      Prime TX-1300.
      SKIPS : System Power 10 (que SP11 sur amazon.fr), CX550F RGB (que CX550 non-RGB),
      Focus GX-850 (unité blanche / renommée Core, titre mangé → ambigu).

- [ ] Reprendre à : catégorie CASE/boîtiers (13), puis cooling, monitor, keyboard, mouse,
      headset, fan, thermal, webcam, microphone, speaker, mousepad, chair. window.AMZ same-origin.
      THROTTLE : amazon.fr rate-limite le fetch same-origin après ~80 requêtes (pages vides ~2 Ko,
      0 résultat, titre vide). Solution : espacer (delay 800ms+), faire des pauses entre catégories,
      ou attendre ~15-20 min que ça se réinitialise. Re-vérifier avec un fetch /s?k=test (len>1Mo = OK).

RÈGLES RAM (important) :
- Vérifier la COULEUR sur l'image -1 existante AVANT de chercher (match exact).
- Les fiches Amazon basculent souvent en variante BLANCHE par défaut → lire le <title>
  ('Blanc'/'Gris'/'noir') et choisir l'ASIN de la bonne couleur.
- Latence (CL30 vs CL36) NON visible sur le module → tolérée si couleur+modèle+capacité OK.
- Si le -1 existant est la MAUVAISE variante (ex. 'RGB' montrant du non-RGB) :
  utiliser set_full_gallery.py (_full_gallery.json = {nom:[id_principale, id2, ...]})
  pour réécrire -1..-N, puis enregistrer les secondaires dans _gallery_ids.json (suivi 'done').
- Sinon (–1 correct) : add_gallery_images.py habituel (_gallery_ids.json, -2..).

NOTE CPU AMD : images génériques partagées (socket/specs) → ne garder que 1-2 vues
spécifiques (boîte+puce), = ordered (hors blocklist) [:2]. Blocklist générique connue :
21CGoM-+0oL, 41-V-83RP-L, 219z+bfcbxL. Match ASIN par titre = modèle exact obligatoire.

Astuce : add_gallery_images.py skippe les fichiers déjà présents (rapide).
GPU = risque mismatch faible (fiche au modèle exact) → spot-check -2 suffit.
Stockage/RAM = vetting visuel obligatoire (capacité imprimée).

## Skipped (à revoir / pas de fiche fiable)
- GeForce RTX 5060 8 Go Solo — pas de modèle "Solo" sur amazon.fr (que "Dual", cooler ≠).
- GeForce RTX 4070 Ti Super TUF — seule la variante White dispo (mismatch couleur).
- GeForce RTX 4060 Low Profile OC — pas de 4060 LP sur amazon.fr (que 5060/5050 LP).
- Radeon RX 9070 16 Go (non-XT) — PowerColor non-XT absent (que des 9070 XT).
- Radeon RX 9060 XT 8 Go (XFX) — XFX 8 Go qu'en White (mismatch couleur).
- Radeon RX 7800 XT 16 Go Hellhound — pas de PowerColor (que Sapphire/Gigabyte/ASUS).
- Radeon RX 7600 XT 16 Go — pas d'ASRock (que Sapphire).
- Radeon RX 6750 XT 12 Go — RX 6000 retirée d'amazon.fr.
- Radeon RX 6650 XT 8 Go — que Sapphire (seed=ASRock).

## SOUS-CAMPAGNE /loop (2026-06-28) — 41 produits prod sans image_url
Méthode : set_full_gallery.py (crée -1..N, NE touche pas le mapping) + ajout
manuel de l'entrée product_images.py par NOM EXACT de la base prod (les noms
prod diffèrent du worklist). Puis partie B : supprimer images à texte chinois/asiatique.
- [x] Lot 1 (5/41) : RTX 5080 TUF Gaming, 5090 Suprim, 5060 8 Go, 5090 Windforce OC,
      4060 Ventus 2X 8G — commit ab1ba8c.
- [SKIP] GeForce RTX 4070 Dual (633) : Amazon ne propose que "4070 Super Dual Evo" → à revoir.
- [x] Lot 2 (8/41) : i9-14900K/KF/14900, i7-14700KF, i5-13600KF, Ryzen 9 9900X3D, Ryzen 7 5800X3D, Ryzen 5 5500 — commit lot CPU.
- [x] Lot 3 (6/41) cartes meres : ROG Crosshair X870E Hero, PRIME A620M-K, TUF Gaming B650-Plus WiFi, B650 Gaming X AX, B850 Steel Legend WiFi, MAG Z790 Tomahawk WiFi.
- [SKIP] ROG Strix B850-F Gaming WiFi (630) : ASIN suspect (2021) pour chipset 2025 -> a revoir.
- [ ] RESTE ~21 : ROG Crosshair X870E Hero(27), RM1000x Shift(32), O11 Dynamic EVO XL(36),
      H9 Flow RGB(38), ROG Swift PG27UCDM(46), Huntsman V3 Pro TKL(53), PRIME A620M-K(75),
      Pro 16Go DDR5-5600(80), NV2 1To(89), MAG A650BN(93), Freezer 36(102), G203(116),
      MPG A1000G(225), LE520 240(243), Trident Z5 RGB 32Go 6400(20), + IDs 613-631 (CPU Intel/AMD,
      cartes mères B650/B850/Z790, RAM Dominator/Trident/Fury/Pro/Viper).
- [ ] PARTIE B : scanner frontend/images pour texte CJK et supprimer.
