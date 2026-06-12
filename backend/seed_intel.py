# -*- coding: utf-8 -*-
"""Gamme processeurs Intel — Core i3/i5/i7/i9 (LGA1700) + Core Ultra (LGA1851).

Ajouté au catalogue via SEED_PRODUCTS.extend(INTEL_PRODUCTS) (cf. seed.py),
APRÈS le filtre des CPU pour rester présent. Clés de compat : socket, tdp_w.
"""

INTEL_PRODUCTS = [
    # ─── Core i3 — LGA1700 ───────────────────────────────────────────
    {
        "name": "Core i3-12100F", "brand": "Intel", "category": "cpu",
        "price": 79.00, "old_price": None, "stock": 28, "rating": 4.5,
        "featured": False, "badge": "Petit prix",
        "description": "Le roi du budget : 4 cœurs largement suffisants pour le jeu en 1080p sans se ruiner.",
        "specs": {"Socket": "LGA1700", "Architecture": "Alder Lake", "Cœurs / Threads": "4 (4P) / 8", "Boost": "4,3 GHz", "Cache": "12 Mo L3", "TDP": "58 W", "socket": "LGA1700", "tdp_w": 58},
    },
    {
        "name": "Core i3-14100F", "brand": "Intel", "category": "cpu",
        "price": 119.00, "old_price": None, "stock": 24, "rating": 4.5,
        "featured": False, "badge": None,
        "description": "Le quad-core le plus récent d'Intel : véloce et idéal pour une machine d'appoint réactive.",
        "specs": {"Socket": "LGA1700", "Architecture": "Raptor Lake Refresh", "Cœurs / Threads": "4 (4P) / 8", "Boost": "4,7 GHz", "Cache": "12 Mo L3", "TDP": "60 W", "socket": "LGA1700", "tdp_w": 60},
    },

    # ─── Core i5 — LGA1700 ───────────────────────────────────────────
    {
        "name": "Core i5-12400F", "brand": "Intel", "category": "cpu",
        "price": 135.00, "old_price": 159.00, "stock": 22, "rating": 4.8,
        "featured": False, "badge": "Promo",
        "description": "L'un des meilleurs rapports perf/prix gaming : 6 cœurs qui tiennent encore très bien la route.",
        "specs": {"Socket": "LGA1700", "Architecture": "Alder Lake", "Cœurs / Threads": "6 (6P) / 12", "Boost": "4,4 GHz", "Cache": "18 Mo L3", "TDP": "65 W", "socket": "LGA1700", "tdp_w": 65},
    },
    {
        "name": "Core i5-13400F", "brand": "Intel", "category": "cpu",
        "price": 185.00, "old_price": None, "stock": 18, "rating": 4.7,
        "featured": False, "badge": None,
        "description": "10 cœurs hybrides pour jouer et multitâcher confortablement sans exploser le budget.",
        "specs": {"Socket": "LGA1700", "Architecture": "Raptor Lake", "Cœurs / Threads": "10 (6P+4E) / 16", "Boost": "4,6 GHz", "Cache": "20 Mo L3", "TDP": "65 W", "socket": "LGA1700", "tdp_w": 65},
    },
    {
        "name": "Core i5-14600KF", "brand": "Intel", "category": "cpu",
        "price": 289.00, "old_price": None, "stock": 14, "rating": 4.7,
        "featured": False, "badge": None,
        "description": "14 cœurs débridés (K) : un excellent compromis jeu/création à un tarif raisonnable.",
        "specs": {"Socket": "LGA1700", "Architecture": "Raptor Lake Refresh", "Cœurs / Threads": "14 (6P+8E) / 20", "Boost": "5,3 GHz", "Cache": "24 Mo L3", "TDP": "125 W", "socket": "LGA1700", "tdp_w": 125},
    },

    # ─── Core i7 — LGA1700 ───────────────────────────────────────────
    {
        "name": "Core i7-13700F", "brand": "Intel", "category": "cpu",
        "price": 289.00, "old_price": None, "stock": 12, "rating": 4.7,
        "featured": False, "badge": None,
        "description": "16 cœurs hybrides pour le multitâche lourd et le montage, à prix doux en LGA1700.",
        "specs": {"Socket": "LGA1700", "Architecture": "Raptor Lake", "Cœurs / Threads": "16 (8P+8E) / 24", "Boost": "5,2 GHz", "Cache": "30 Mo L3", "TDP": "65 W", "socket": "LGA1700", "tdp_w": 65},
    },
    {
        "name": "Core i7-14700KF", "brand": "Intel", "category": "cpu",
        "price": 399.00, "old_price": None, "stock": 9, "rating": 4.8,
        "featured": False, "badge": None,
        "description": "20 cœurs survitaminés : une bête de travail et de jeu, le i7 le plus puissant de la gen.",
        "specs": {"Socket": "LGA1700", "Architecture": "Raptor Lake Refresh", "Cœurs / Threads": "20 (8P+12E) / 28", "Boost": "5,6 GHz", "Cache": "33 Mo L3", "TDP": "125 W", "socket": "LGA1700", "tdp_w": 125},
    },

    # ─── Core i9 — LGA1700 ───────────────────────────────────────────
    {
        "name": "Core i9-14900F", "brand": "Intel", "category": "cpu",
        "price": 449.00, "old_price": None, "stock": 7, "rating": 4.7,
        "featured": False, "badge": None,
        "description": "24 cœurs en version non-K économe : la puissance d'un i9 sans la facture de la dernière gen.",
        "specs": {"Socket": "LGA1700", "Architecture": "Raptor Lake Refresh", "Cœurs / Threads": "24 (8P+16E) / 32", "Boost": "5,8 GHz", "Cache": "36 Mo L3", "TDP": "65 W", "socket": "LGA1700", "tdp_w": 65},
    },
    {
        "name": "Core i9-14900K", "brand": "Intel", "category": "cpu",
        "price": 549.00, "old_price": None, "stock": 6, "rating": 4.7,
        "featured": False, "badge": None,
        "description": "24 cœurs débridés jusqu'à 6,0 GHz : le sommet de la plateforme LGA1700 pour l'extrême.",
        "specs": {"Socket": "LGA1700", "Architecture": "Raptor Lake Refresh", "Cœurs / Threads": "24 (8P+16E) / 32", "Boost": "6,0 GHz", "Cache": "36 Mo L3", "TDP": "125 W", "socket": "LGA1700", "tdp_w": 125},
    },

    # ─── Core Ultra 200 — LGA1851 (Arrow Lake, DDR5) ─────────────────
    {
        "name": "Core Ultra 5 245K", "brand": "Intel", "category": "cpu",
        "price": 329.00, "old_price": None, "stock": 12, "rating": 4.5,
        "featured": False, "badge": None,
        "description": "14 cœurs Arrow Lake débridés et économes : la nouvelle plateforme Intel LGA1851 abordable.",
        "specs": {"Socket": "LGA1851", "Architecture": "Arrow Lake", "Cœurs / Threads": "14 (6P+8E) / 14", "Boost": "5,2 GHz", "Cache": "24 Mo L3", "TDP": "125 W", "socket": "LGA1851", "tdp_w": 125},
    },
    {
        "name": "Core Ultra 7 265K", "brand": "Intel", "category": "cpu",
        "price": 449.00, "old_price": None, "stock": 9, "rating": 4.6,
        "featured": False, "badge": None,
        "description": "20 cœurs Arrow Lake très efficaces : un excellent processeur création/productivité de dernière gen.",
        "specs": {"Socket": "LGA1851", "Architecture": "Arrow Lake", "Cœurs / Threads": "20 (8P+12E) / 20", "Boost": "5,5 GHz", "Cache": "30 Mo L3", "TDP": "125 W", "socket": "LGA1851", "tdp_w": 125},
    },
    {
        "name": "Core Ultra 9 285K", "brand": "Intel", "category": "cpu",
        "price": 649.00, "old_price": None, "stock": 6, "rating": 4.6,
        "featured": True, "badge": None,
        "description": "Le fer de lance d'Intel : 24 cœurs Arrow Lake et une efficacité énergétique en nette hausse.",
        "specs": {"Socket": "LGA1851", "Architecture": "Arrow Lake", "Cœurs / Threads": "24 (8P+16E) / 24", "Boost": "5,7 GHz", "Cache": "36 Mo L3", "TDP": "125 W", "socket": "LGA1851", "tdp_w": 125},
    },
]
