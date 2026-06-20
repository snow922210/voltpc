# -*- coding: utf-8 -*-
"""Gamme processeurs VOLT PC — AMD Ryzen réellement disponibles (Amazon).

Remplace intégralement la catégorie « cpu » (cf. seed.py qui filtre puis
ajoute cette liste). Clés de compatibilité conservées : socket, tdp_w.
"""

CPU_PRODUCTS = [
    # ─── AMD Ryzen 9000 — Zen 5 / AM5 ────────────────────────────────
    {
        "name": "Ryzen 9 9950X3D", "brand": "AMD", "category": "cpu",
        "price": 719.00, "old_price": None, "stock": 6, "rating": 4.9,
        "featured": True, "badge": "Gaming",
        "description": "Le sommet absolu : 16 cœurs Zen 5 et l'énorme cache 3D, imbattable en jeu comme en création.",
        "specs": {"Socket": "AM5", "Architecture": "Zen 5", "Cœurs / Threads": "16 / 32", "Boost": "5,7 GHz", "Cache": "128 Mo L3", "TDP": "170 W", "socket": "AM5", "tdp_w": 170},
    },
    {
        "name": "Ryzen 9 9950X", "brand": "AMD", "category": "cpu",
        "price": 559.00, "old_price": None, "stock": 8, "rating": 4.8,
        "featured": False, "badge": None,
        "description": "16 cœurs Zen 5 pour les stations de travail : rendu, compilation et productivité lourde.",
        "specs": {"Socket": "AM5", "Architecture": "Zen 5", "Cœurs / Threads": "16 / 32", "Boost": "5,7 GHz", "Cache": "64 Mo L3", "TDP": "170 W", "socket": "AM5", "tdp_w": 170},
    },
    {
        "name": "Ryzen 9 9900X3D", "brand": "AMD", "category": "cpu",
        "price": 529.00, "old_price": None, "stock": 7, "rating": 4.8,
        "featured": False, "badge": "Gaming",
        "description": "12 cœurs avec cache 3D : l'équilibre parfait entre gaming d'élite et multitâche.",
        "specs": {"Socket": "AM5", "Architecture": "Zen 5", "Cœurs / Threads": "12 / 24", "Boost": "5,5 GHz", "Cache": "128 Mo L3", "TDP": "120 W", "socket": "AM5", "tdp_w": 120},
    },
    {
        "name": "Ryzen 9 9900X", "brand": "AMD", "category": "cpu",
        "price": 399.00, "old_price": None, "stock": 9, "rating": 4.7,
        "featured": False, "badge": None,
        "description": "12 cœurs Zen 5 efficaces pour créateurs et joueurs polyvalents.",
        "specs": {"Socket": "AM5", "Architecture": "Zen 5", "Cœurs / Threads": "12 / 24", "Boost": "5,6 GHz", "Cache": "64 Mo L3", "TDP": "120 W", "socket": "AM5", "tdp_w": 120},
    },
    {
        "name": "Ryzen 7 9800X3D", "brand": "AMD", "category": "cpu",
        "price": 479.00, "old_price": None, "stock": 10, "rating": 4.9,
        "featured": True, "badge": "Gaming",
        "description": "Le meilleur CPU gaming du marché : 8 cœurs Zen 5 et cache 3D, la référence des joueurs.",
        "specs": {"Socket": "AM5", "Architecture": "Zen 5", "Cœurs / Threads": "8 / 16", "Boost": "5,2 GHz", "Cache": "96 Mo L3", "TDP": "120 W", "socket": "AM5", "tdp_w": 120},
    },
    {
        "name": "Ryzen 7 9700X", "brand": "AMD", "category": "cpu",
        "price": 329.00, "old_price": None, "stock": 12, "rating": 4.7,
        "featured": False, "badge": None,
        "description": "8 cœurs Zen 5 à seulement 65 W : performant, frais et silencieux.",
        "specs": {"Socket": "AM5", "Architecture": "Zen 5", "Cœurs / Threads": "8 / 16", "Boost": "5,5 GHz", "Cache": "32 Mo L3", "TDP": "65 W", "socket": "AM5", "tdp_w": 65},
    },
    {
        "name": "Ryzen 5 9600X", "brand": "AMD", "category": "cpu",
        "price": 229.00, "old_price": None, "stock": 15, "rating": 4.7,
        "featured": False, "badge": None,
        "description": "6 cœurs Zen 5 : l'entrée moderne idéale pour le jeu en 1080p/1440p.",
        "specs": {"Socket": "AM5", "Architecture": "Zen 5", "Cœurs / Threads": "6 / 12", "Boost": "5,4 GHz", "Cache": "32 Mo L3", "TDP": "65 W", "socket": "AM5", "tdp_w": 65},
    },
    {
        "name": "Ryzen 5 9600", "brand": "AMD", "category": "cpu",
        "price": 199.00, "old_price": None, "stock": 16, "rating": 4.6,
        "featured": False, "badge": None,
        "description": "Version sage du 9600X : 6 cœurs Zen 5 à prix doux pour démarrer sur AM5.",
        "specs": {"Socket": "AM5", "Architecture": "Zen 5", "Cœurs / Threads": "6 / 12", "Boost": "5,2 GHz", "Cache": "32 Mo L3", "TDP": "65 W", "socket": "AM5", "tdp_w": 65},
    },

    # ─── AMD Ryzen 7000 / 8000G — Zen 4 / AM5 ────────────────────────
    {
        "name": "Ryzen 9 7950X3D", "brand": "AMD", "category": "cpu",
        "price": 519.00, "old_price": None, "stock": 6, "rating": 4.8,
        "featured": False, "badge": "Gaming",
        "description": "16 cœurs Zen 4 avec cache 3D : un monstre hybride jeu/création toujours d'actualité.",
        "specs": {"Socket": "AM5", "Architecture": "Zen 4", "Cœurs / Threads": "16 / 32", "Boost": "5,7 GHz", "Cache": "128 Mo L3", "TDP": "120 W", "socket": "AM5", "tdp_w": 120},
    },
    {
        "name": "Ryzen 9 7950X", "brand": "AMD", "category": "cpu",
        "price": 449.00, "old_price": None, "stock": 7, "rating": 4.7,
        "featured": False, "badge": None,
        "description": "16 cœurs Zen 4 pour la productivité intensive à un tarif désormais attractif.",
        "specs": {"Socket": "AM5", "Architecture": "Zen 4", "Cœurs / Threads": "16 / 32", "Boost": "5,7 GHz", "Cache": "64 Mo L3", "TDP": "170 W", "socket": "AM5", "tdp_w": 170},
    },
    {
        "name": "Ryzen 9 7900X3D", "brand": "AMD", "category": "cpu",
        "price": 419.00, "old_price": None, "stock": 7, "rating": 4.6,
        "featured": False, "badge": None,
        "description": "12 cœurs Zen 4 avec cache 3D, pour jouer fort tout en gardant du multithread.",
        "specs": {"Socket": "AM5", "Architecture": "Zen 4", "Cœurs / Threads": "12 / 24", "Boost": "5,6 GHz", "Cache": "128 Mo L3", "TDP": "120 W", "socket": "AM5", "tdp_w": 120},
    },
    {
        "name": "Ryzen 9 7900X", "brand": "AMD", "category": "cpu",
        "price": 349.00, "old_price": None, "stock": 9, "rating": 4.6,
        "featured": False, "badge": None,
        "description": "12 cœurs Zen 4 véloces pour les créateurs au budget maîtrisé.",
        "specs": {"Socket": "AM5", "Architecture": "Zen 4", "Cœurs / Threads": "12 / 24", "Boost": "5,6 GHz", "Cache": "64 Mo L3", "TDP": "170 W", "socket": "AM5", "tdp_w": 170},
    },
    {
        "name": "Ryzen 7 7800X3D", "brand": "AMD", "category": "cpu",
        "price": 369.00, "old_price": None, "stock": 11, "rating": 4.9,
        "featured": True, "badge": "Gaming",
        "description": "L'ancien roi du gaming, toujours redoutable : 8 cœurs Zen 4 et cache 3D, valeur sûre.",
        "specs": {"Socket": "AM5", "Architecture": "Zen 4", "Cœurs / Threads": "8 / 16", "Boost": "5,0 GHz", "Cache": "96 Mo L3", "TDP": "120 W", "socket": "AM5", "tdp_w": 120},
    },
    {
        "name": "Ryzen 7 7700X", "brand": "AMD", "category": "cpu",
        "price": 279.00, "old_price": None, "stock": 12, "rating": 4.7,
        "featured": False, "badge": None,
        "description": "8 cœurs Zen 4 nerveux, excellent pour le jeu et le travail créatif en AM5.",
        "specs": {"Socket": "AM5", "Architecture": "Zen 4", "Cœurs / Threads": "8 / 16", "Boost": "5,4 GHz", "Cache": "32 Mo L3", "TDP": "105 W", "socket": "AM5", "tdp_w": 105},
    },
    {
        "name": "Ryzen 7 7700", "brand": "AMD", "category": "cpu",
        "price": 269.00, "old_price": None, "stock": 12, "rating": 4.7,
        "featured": False, "badge": None,
        "description": "8 cœurs Zen 4 en version 65 W économe, livré avec un ventirad correct.",
        "specs": {"Socket": "AM5", "Architecture": "Zen 4", "Cœurs / Threads": "8 / 16", "Boost": "5,3 GHz", "Cache": "32 Mo L3", "TDP": "65 W", "socket": "AM5", "tdp_w": 65},
    },
    {
        "name": "Ryzen 5 7600X", "brand": "AMD", "category": "cpu",
        "price": 209.00, "old_price": None, "stock": 16, "rating": 4.7,
        "featured": False, "badge": None,
        "description": "6 cœurs Zen 4 boostés, un excellent CPU gaming d'entrée sur plateforme AM5.",
        "specs": {"Socket": "AM5", "Architecture": "Zen 4", "Cœurs / Threads": "6 / 12", "Boost": "5,3 GHz", "Cache": "32 Mo L3", "TDP": "105 W", "socket": "AM5", "tdp_w": 105},
    },
    {
        "name": "Ryzen 5 7600", "brand": "AMD", "category": "cpu",
        "price": 189.00, "old_price": None, "stock": 18, "rating": 4.7,
        "featured": False, "badge": None,
        "description": "6 cœurs Zen 4 sobres et abordables, idéal premier PC moderne en DDR5.",
        "specs": {"Socket": "AM5", "Architecture": "Zen 4", "Cœurs / Threads": "6 / 12", "Boost": "5,1 GHz", "Cache": "32 Mo L3", "TDP": "65 W", "socket": "AM5", "tdp_w": 65},
    },
    {
        "name": "Ryzen 5 7500F", "brand": "AMD", "category": "cpu",
        "price": 149.00, "old_price": None, "stock": 16, "rating": 4.6,
        "featured": False, "badge": "Petit prix",
        "description": "Le Ryzen AM5 le moins cher : 6 cœurs Zen 4 sans IGP, parfait pour une config gaming dédiée.",
        "specs": {"Socket": "AM5", "Architecture": "Zen 4", "Cœurs / Threads": "6 / 12", "Boost": "5,0 GHz", "Cache": "32 Mo L3", "TDP": "65 W", "socket": "AM5", "tdp_w": 65},
    },
    {
        "name": "Ryzen 7 8700G", "brand": "AMD", "category": "cpu",
        "price": 279.00, "old_price": None, "stock": 10, "rating": 4.6,
        "featured": False, "badge": "APU",
        "description": "APU Zen 4 avec Radeon 780M : joue en 1080p léger SANS carte graphique. Idéal mini-PC.",
        "specs": {"Socket": "AM5", "Architecture": "Zen 4 (APU)", "Cœurs / Threads": "8 / 16", "Boost": "5,1 GHz", "Cache": "16 Mo L3", "GPU intégré": "Radeon 780M", "TDP": "65 W", "socket": "AM5", "tdp_w": 65},
    },
    {
        "name": "Ryzen 5 8600G", "brand": "AMD", "category": "cpu",
        "price": 199.00, "old_price": None, "stock": 12, "rating": 4.5,
        "featured": False, "badge": "APU",
        "description": "APU Zen 4 avec Radeon 760M : une config complète sans GPU dédié, parfaite pour débuter.",
        "specs": {"Socket": "AM5", "Architecture": "Zen 4 (APU)", "Cœurs / Threads": "6 / 12", "Boost": "5,0 GHz", "Cache": "16 Mo L3", "GPU intégré": "Radeon 760M", "TDP": "65 W", "socket": "AM5", "tdp_w": 65},
    },

    # ─── AMD Ryzen 5000 — Zen 3 / AM4 (DDR4, excellent rapport prix) ──
    {
        "name": "Ryzen 9 5950X", "brand": "AMD", "category": "cpu",
        "price": 379.00, "old_price": None, "stock": 6, "rating": 4.8,
        "featured": False, "badge": None,
        "description": "16 cœurs Zen 3 sur AM4 : une bête de productivité qui reste pertinente pour pas cher.",
        "specs": {"Socket": "AM4", "Architecture": "Zen 3", "Cœurs / Threads": "16 / 32", "Boost": "4,9 GHz", "Cache": "64 Mo L3", "TDP": "105 W", "socket": "AM4", "tdp_w": 105},
    },
    {
        "name": "Ryzen 9 5900XT", "brand": "AMD", "category": "cpu",
        "price": 329.00, "old_price": None, "stock": 7, "rating": 4.7,
        "featured": False, "badge": None,
        "description": "16 cœurs Zen 3 (révision XT) : l'ultime upgrade multithread pour une carte mère AM4.",
        "specs": {"Socket": "AM4", "Architecture": "Zen 3", "Cœurs / Threads": "16 / 32", "Boost": "4,8 GHz", "Cache": "64 Mo L3", "TDP": "105 W", "socket": "AM4", "tdp_w": 105},
    },
    {
        "name": "Ryzen 9 5900X", "brand": "AMD", "category": "cpu",
        "price": 279.00, "old_price": 329.00, "stock": 8, "rating": 4.8,
        "featured": False, "badge": "Promo",
        "description": "12 cœurs / 24 threads Zen 3 pour la création à un tarif désormais imbattable.",
        "specs": {"Socket": "AM4", "Architecture": "Zen 3", "Cœurs / Threads": "12 / 24", "Boost": "4,8 GHz", "Cache": "64 Mo L3", "TDP": "105 W", "socket": "AM4", "tdp_w": 105},
    },
    {
        "name": "Ryzen 7 5800X3D", "brand": "AMD", "category": "cpu",
        "price": 269.00, "old_price": None, "stock": 9, "rating": 4.9,
        "featured": False, "badge": "Gaming",
        "description": "La légende du gaming AM4 : le cache 3D le rend redoutable face à des CPU bien plus récents.",
        "specs": {"Socket": "AM4", "Architecture": "Zen 3", "Cœurs / Threads": "8 / 16", "Boost": "4,5 GHz", "Cache": "96 Mo L3", "TDP": "105 W", "socket": "AM4", "tdp_w": 105},
    },
    {
        "name": "Ryzen 7 5700X3D", "brand": "AMD", "category": "cpu",
        "price": 199.00, "old_price": None, "stock": 12, "rating": 4.8,
        "featured": False, "badge": "Gaming",
        "description": "Le cache 3D du 5800X3D à prix cassé : le meilleur upgrade gaming possible sur AM4.",
        "specs": {"Socket": "AM4", "Architecture": "Zen 3", "Cœurs / Threads": "8 / 16", "Boost": "4,1 GHz", "Cache": "96 Mo L3", "TDP": "105 W", "socket": "AM4", "tdp_w": 105},
    },
    {
        "name": "Ryzen 7 5700X", "brand": "AMD", "category": "cpu",
        "price": 159.00, "old_price": None, "stock": 16, "rating": 4.7,
        "featured": False, "badge": None,
        "description": "8 cœurs Zen 3 à prix plancher pour du multithread sans casser la tirelire.",
        "specs": {"Socket": "AM4", "Architecture": "Zen 3", "Cœurs / Threads": "8 / 16", "Boost": "4,6 GHz", "Cache": "32 Mo L3", "TDP": "65 W", "socket": "AM4", "tdp_w": 65},
    },
    {
        "name": "Ryzen 5 5600X", "brand": "AMD", "category": "cpu",
        "price": 139.00, "old_price": None, "stock": 18, "rating": 4.8,
        "featured": False, "badge": None,
        "description": "6 cœurs Zen 3 boostés, longtemps la référence du gaming abordable et toujours excellent.",
        "specs": {"Socket": "AM4", "Architecture": "Zen 3", "Cœurs / Threads": "6 / 12", "Boost": "4,6 GHz", "Cache": "32 Mo L3", "TDP": "65 W", "socket": "AM4", "tdp_w": 65},
    },
    {
        "name": "Ryzen 5 5600G", "brand": "AMD", "category": "cpu",
        "price": 119.00, "old_price": None, "stock": 16, "rating": 4.6,
        "featured": False, "badge": "APU",
        "description": "APU Zen 3 avec Radeon Vega 7 : une config complète sans carte graphique pour un budget mini.",
        "specs": {"Socket": "AM4", "Architecture": "Zen 3 (APU)", "Cœurs / Threads": "6 / 12", "Boost": "4,4 GHz", "Cache": "16 Mo L3", "GPU intégré": "Radeon Vega 7", "TDP": "65 W", "socket": "AM4", "tdp_w": 65},
    },
    {
        "name": "Ryzen 5 5600", "brand": "AMD", "category": "cpu",
        "price": 115.00, "old_price": None, "stock": 22, "rating": 4.8,
        "featured": False, "badge": "Petit prix",
        "description": "La référence du milieu de gamme abordable : 6 cœurs efficaces et frais, idéal premier PC gaming.",
        "specs": {"Socket": "AM4", "Architecture": "Zen 3", "Cœurs / Threads": "6 / 12", "Boost": "4,4 GHz", "Cache": "32 Mo L3", "TDP": "65 W", "socket": "AM4", "tdp_w": 65},
    },
    {
        "name": "Ryzen 5 5500", "brand": "AMD", "category": "cpu",
        "price": 85.00, "old_price": None, "stock": 26, "rating": 4.4,
        "featured": False, "badge": "Petit prix",
        "description": "Le Ryzen le plus accessible : 6 cœurs / 12 threads pour une config AM4 économique en 1080p.",
        "specs": {"Socket": "AM4", "Architecture": "Zen 3", "Cœurs / Threads": "6 / 12", "Boost": "4,2 GHz", "Cache": "16 Mo L3", "TDP": "65 W", "socket": "AM4", "tdp_w": 65},
    },
]
