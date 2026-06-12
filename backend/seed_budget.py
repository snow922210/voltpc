# -*- coding: utf-8 -*-
"""Gammes plus abordables (générations précédentes / entrée de gamme).

Ajouté au catalogue via `SEED_PRODUCTS.extend(BUDGET_PRODUCTS)` (cf. seed.py).
Les clés de compatibilité du configurateur sont conservées :
  cpu → socket, tdp_w  ·  motherboard → socket, ram_type, form_factor
  ram → ram_type  ·  cooling → sockets[]  ·  case → max_gpu_mm
  gpu → tdp_w, length_mm  ·  psu → watts
"""

BUDGET_PRODUCTS = [
    # ─── Processeurs — Intel LGA1700 (12e/13e/14e gen) ───────────────
    {
        "name": "Core i3-12100F", "brand": "Intel", "category": "cpu",
        "price": 79.00, "old_price": None, "stock": 30, "rating": 4.5,
        "featured": False, "badge": "Petit prix",
        "description": "Le roi du budget : 4 cœurs largement suffisants pour le jeu en 1080p sans se ruiner.",
        "specs": {"Socket": "LGA1700", "Cœurs / Threads": "4 / 8", "Boost": "4.3 GHz", "Cache": "12 Mo L3", "TDP": "58 W", "socket": "LGA1700", "tdp_w": 58},
    },
    {
        "name": "Core i3-14100F", "brand": "Intel", "category": "cpu",
        "price": 119.00, "old_price": None, "stock": 25, "rating": 4.5,
        "featured": False, "badge": None,
        "description": "La version la plus récente du i3 : un quad-core véloce, parfait pour une machine d'appoint réactive.",
        "specs": {"Socket": "LGA1700", "Cœurs / Threads": "4 / 8", "Boost": "4.7 GHz", "Cache": "12 Mo L3", "TDP": "60 W", "socket": "LGA1700", "tdp_w": 60},
    },
    {
        "name": "Core i5-12400F", "brand": "Intel", "category": "cpu",
        "price": 135.00, "old_price": 159.00, "stock": 22, "rating": 4.8,
        "featured": False, "badge": "Promo",
        "description": "L'un des meilleurs rapports perf/prix pour le gaming : 6 cœurs qui tiennent encore très bien la route.",
        "specs": {"Socket": "LGA1700", "Cœurs / Threads": "6 / 12", "Boost": "4.4 GHz", "Cache": "18 Mo L3", "TDP": "65 W", "socket": "LGA1700", "tdp_w": 65},
    },
    {
        "name": "Core i5-13400F", "brand": "Intel", "category": "cpu",
        "price": 185.00, "old_price": None, "stock": 18, "rating": 4.7,
        "featured": False, "badge": None,
        "description": "10 cœurs hybrides pour jouer et multitâcher confortablement, sans exploser le budget.",
        "specs": {"Socket": "LGA1700", "Cœurs / Threads": "10 / 16", "Boost": "4.6 GHz", "Cache": "20 Mo L3", "TDP": "65 W", "socket": "LGA1700", "tdp_w": 65},
    },
    {
        "name": "Core i5-14600KF", "brand": "Intel", "category": "cpu",
        "price": 279.00, "old_price": None, "stock": 14, "rating": 4.7,
        "featured": False, "badge": None,
        "description": "14 cœurs débridés (K) : un excellent compromis jeu/création à un tarif raisonnable.",
        "specs": {"Socket": "LGA1700", "Cœurs / Threads": "14 / 20", "Boost": "5.3 GHz", "Cache": "24 Mo L3", "TDP": "125 W", "socket": "LGA1700", "tdp_w": 125},
    },
    {
        "name": "Core i7-12700F", "brand": "Intel", "category": "cpu",
        "price": 229.00, "old_price": None, "stock": 12, "rating": 4.6,
        "featured": False, "badge": None,
        "description": "12 cœurs hybrides pour le multitâche lourd et le montage, à prix doux en LGA1700.",
        "specs": {"Socket": "LGA1700", "Cœurs / Threads": "12 / 20", "Boost": "4.9 GHz", "Cache": "25 Mo L3", "TDP": "65 W", "socket": "LGA1700", "tdp_w": 65},
    },
    {
        "name": "Core i7-13700KF", "brand": "Intel", "category": "cpu",
        "price": 349.00, "old_price": 399.00, "stock": 9, "rating": 4.7,
        "featured": False, "badge": "Promo",
        "description": "16 cœurs survitaminés : une bête de travail et de jeu pour les configs musclées sans aller au i9.",
        "specs": {"Socket": "LGA1700", "Cœurs / Threads": "16 / 24", "Boost": "5.4 GHz", "Cache": "30 Mo L3", "TDP": "125 W", "socket": "LGA1700", "tdp_w": 125},
    },
    {
        "name": "Core i9-14900F", "brand": "Intel", "category": "cpu",
        "price": 449.00, "old_price": None, "stock": 7, "rating": 4.7,
        "featured": False, "badge": None,
        "description": "24 cœurs en version non-K économe : la puissance d'un i9 sans la facture de la dernière génération.",
        "specs": {"Socket": "LGA1700", "Cœurs / Threads": "24 / 32", "Boost": "5.8 GHz", "Cache": "36 Mo L3", "TDP": "65 W", "socket": "LGA1700", "tdp_w": 65},
    },

    # ─── Processeurs — AMD AM4 (DDR4, excellent rapport prix) ─────────
    {
        "name": "Ryzen 5 5500", "brand": "AMD", "category": "cpu",
        "price": 89.00, "old_price": None, "stock": 28, "rating": 4.4,
        "featured": False, "badge": "Petit prix",
        "description": "6 cœurs / 12 threads pour une config AM4 économique et toujours pertinente en 1080p.",
        "specs": {"Socket": "AM4", "Cœurs / Threads": "6 / 12", "Boost": "4.2 GHz", "Cache": "16 Mo L3", "TDP": "65 W", "socket": "AM4", "tdp_w": 65},
    },
    {
        "name": "Ryzen 5 5600", "brand": "AMD", "category": "cpu",
        "price": 125.00, "old_price": None, "stock": 24, "rating": 4.8,
        "featured": False, "badge": None,
        "description": "La référence du milieu de gamme abordable : 6 cœurs efficaces et frais, idéal premier PC gaming.",
        "specs": {"Socket": "AM4", "Cœurs / Threads": "6 / 12", "Boost": "4.4 GHz", "Cache": "32 Mo L3", "TDP": "65 W", "socket": "AM4", "tdp_w": 65},
    },
    {
        "name": "Ryzen 7 5700X", "brand": "AMD", "category": "cpu",
        "price": 169.00, "old_price": None, "stock": 16, "rating": 4.7,
        "featured": False, "badge": None,
        "description": "8 cœurs à prix plancher pour les joueurs et créateurs qui veulent du multithread sans casser la tirelire.",
        "specs": {"Socket": "AM4", "Cœurs / Threads": "8 / 16", "Boost": "4.6 GHz", "Cache": "32 Mo L3", "TDP": "65 W", "socket": "AM4", "tdp_w": 65},
    },
    {
        "name": "Ryzen 7 5800X3D", "brand": "AMD", "category": "cpu",
        "price": 279.00, "old_price": None, "stock": 10, "rating": 4.9,
        "featured": False, "badge": "Gaming",
        "description": "La légende du gaming sur AM4 : son énorme cache 3D le rend redoutable, même face à des CPU bien plus récents.",
        "specs": {"Socket": "AM4", "Cœurs / Threads": "8 / 16", "Boost": "4.5 GHz", "Cache": "96 Mo L3", "TDP": "105 W", "socket": "AM4", "tdp_w": 105},
    },
    {
        "name": "Ryzen 9 5900X", "brand": "AMD", "category": "cpu",
        "price": 289.00, "old_price": 329.00, "stock": 8, "rating": 4.8,
        "featured": False, "badge": "Promo",
        "description": "12 cœurs / 24 threads pour la création et la productivité lourde à un tarif désormais imbattable.",
        "specs": {"Socket": "AM4", "Cœurs / Threads": "12 / 24", "Boost": "4.8 GHz", "Cache": "64 Mo L3", "TDP": "105 W", "socket": "AM4", "tdp_w": 105},
    },

    # ─── Processeurs — AMD AM5 d'entrée (DDR5) ───────────────────────
    {
        "name": "Ryzen 5 7600", "brand": "AMD", "category": "cpu",
        "price": 199.00, "old_price": None, "stock": 15, "rating": 4.7,
        "featured": False, "badge": None,
        "description": "L'entrée sur la plateforme moderne AM5/DDR5 : 6 cœurs Zen 4 sobres et évolutifs.",
        "specs": {"Socket": "AM5", "Cœurs / Threads": "6 / 12", "Boost": "5.1 GHz", "Cache": "32 Mo L3", "TDP": "65 W", "socket": "AM5", "tdp_w": 65},
    },
    {
        "name": "Ryzen 7 7700", "brand": "AMD", "category": "cpu",
        "price": 299.00, "old_price": None, "stock": 11, "rating": 4.7,
        "featured": False, "badge": None,
        "description": "8 cœurs Zen 4 en version non-X économe : du muscle pour le jeu et le travail sur AM5.",
        "specs": {"Socket": "AM5", "Cœurs / Threads": "8 / 16", "Boost": "5.3 GHz", "Cache": "32 Mo L3", "TDP": "65 W", "socket": "AM5", "tdp_w": 65},
    },
    {
        "name": "Ryzen 9 7900", "brand": "AMD", "category": "cpu",
        "price": 399.00, "old_price": None, "stock": 8, "rating": 4.7,
        "featured": False, "badge": None,
        "description": "12 cœurs Zen 4 à 65 W : une efficacité remarquable pour les stations de travail compactes.",
        "specs": {"Socket": "AM5", "Cœurs / Threads": "12 / 24", "Boost": "5.4 GHz", "Cache": "64 Mo L3", "TDP": "65 W", "socket": "AM5", "tdp_w": 65},
    },

    # ─── Cartes mères — LGA1700 (DDR4 & DDR5) ────────────────────────
    {
        "name": "H610M-K DDR4", "brand": "ASUS", "category": "motherboard",
        "price": 79.00, "old_price": None, "stock": 20, "rating": 4.3,
        "featured": False, "badge": "Petit prix",
        "description": "Carte mère mATX économique pour une config Intel d'entrée fiable en DDR4.",
        "specs": {"Socket": "LGA1700", "Chipset": "H610", "Format": "Micro-ATX", "Mémoire": "2x DDR4 3200", "M.2": "1 slot Gen3", "Réseau": "1 GbE", "socket": "LGA1700", "ram_type": "DDR4", "form_factor": "mATX"},
    },
    {
        "name": "PRO B760M-A DDR4", "brand": "MSI", "category": "motherboard",
        "price": 115.00, "old_price": None, "stock": 16, "rating": 4.5,
        "featured": False, "badge": None,
        "description": "Le bon plan B760 en DDR4 : VRM sérieux et connectique complète pour un i5 sans surcoût mémoire.",
        "specs": {"Socket": "LGA1700", "Chipset": "B760", "Format": "Micro-ATX", "Mémoire": "4x DDR4 5333", "M.2": "2 slots Gen4", "Réseau": "2.5 GbE", "socket": "LGA1700", "ram_type": "DDR4", "form_factor": "mATX"},
    },
    {
        "name": "TUF Gaming B760-Plus WiFi DDR5", "brand": "ASUS", "category": "motherboard",
        "price": 159.00, "old_price": None, "stock": 12, "rating": 4.6,
        "featured": False, "badge": None,
        "description": "ATX robuste en DDR5 avec WiFi : la base idéale pour un i5/i7 13e ou 14e génération.",
        "specs": {"Socket": "LGA1700", "Chipset": "B760", "Format": "ATX", "Mémoire": "4x DDR5 7200", "M.2": "3 slots Gen4", "Réseau": "WiFi 6 + 2.5 GbE", "socket": "LGA1700", "ram_type": "DDR5", "form_factor": "ATX"},
    },
    {
        "name": "MAG Z790 Tomahawk WiFi DDR5", "brand": "MSI", "category": "motherboard",
        "price": 239.00, "old_price": 279.00, "stock": 8, "rating": 4.7,
        "featured": False, "badge": "Promo",
        "description": "Le Z790 overclocking : VRM costauds pour pousser un i7/i9 K en DDR5 à pleine vitesse.",
        "specs": {"Socket": "LGA1700", "Chipset": "Z790", "Format": "ATX", "Mémoire": "4x DDR5 7800", "M.2": "4 slots Gen4", "Réseau": "WiFi 6E + 2.5 GbE", "socket": "LGA1700", "ram_type": "DDR5", "form_factor": "ATX"},
    },

    # ─── Cartes mères — AM4 (DDR4) ───────────────────────────────────
    {
        "name": "A520M-HVS", "brand": "ASRock", "category": "motherboard",
        "price": 65.00, "old_price": None, "stock": 18, "rating": 4.2,
        "featured": False, "badge": "Petit prix",
        "description": "La carte mère AM4 la plus accessible pour un Ryzen 5500/5600 en DDR4.",
        "specs": {"Socket": "AM4", "Chipset": "A520", "Format": "Micro-ATX", "Mémoire": "2x DDR4 4600", "M.2": "1 slot Gen3", "Réseau": "1 GbE", "socket": "AM4", "ram_type": "DDR4", "form_factor": "mATX"},
    },
    {
        "name": "B550-A PRO", "brand": "MSI", "category": "motherboard",
        "price": 119.00, "old_price": None, "stock": 14, "rating": 4.6,
        "featured": False, "badge": None,
        "description": "Le B550 incontournable : PCIe 4.0, VRM solides et grande compatibilité Ryzen 5000.",
        "specs": {"Socket": "AM4", "Chipset": "B550", "Format": "ATX", "Mémoire": "4x DDR4 4400", "M.2": "2 slots Gen4/Gen3", "Réseau": "2.5 GbE", "socket": "AM4", "ram_type": "DDR4", "form_factor": "ATX"},
    },
    {
        "name": "X570S Aorus Elite AX", "brand": "Gigabyte", "category": "motherboard",
        "price": 179.00, "old_price": None, "stock": 9, "rating": 4.6,
        "featured": False, "badge": None,
        "description": "Haut de gamme AM4 sans ventilateur de chipset : parfaite pour un 5800X3D ou 5900X.",
        "specs": {"Socket": "AM4", "Chipset": "X570S", "Format": "ATX", "Mémoire": "4x DDR4 5100", "M.2": "3 slots Gen4", "Réseau": "WiFi 6 + 2.5 GbE", "socket": "AM4", "ram_type": "DDR4", "form_factor": "ATX"},
    },

    # ─── Cartes mères — AM5 d'entrée (DDR5) ──────────────────────────
    {
        "name": "PRIME A620M-K", "brand": "ASUS", "category": "motherboard",
        "price": 99.00, "old_price": None, "stock": 14, "rating": 4.3,
        "featured": False, "badge": "Petit prix",
        "description": "La porte d'entrée AM5 en DDR5 : sobre et fiable pour un Ryzen 7600.",
        "specs": {"Socket": "AM5", "Chipset": "A620", "Format": "Micro-ATX", "Mémoire": "2x DDR5 6400", "M.2": "1 slot Gen4", "Réseau": "1 GbE", "socket": "AM5", "ram_type": "DDR5", "form_factor": "mATX"},
    },
    {
        "name": "PRO B650-P WiFi", "brand": "MSI", "category": "motherboard",
        "price": 169.00, "old_price": None, "stock": 11, "rating": 4.6,
        "featured": False, "badge": None,
        "description": "B650 équilibrée avec WiFi et PCIe 5.0 NVMe : évolutive pour toute la gamme Ryzen AM5.",
        "specs": {"Socket": "AM5", "Chipset": "B650", "Format": "ATX", "Mémoire": "4x DDR5 6400", "M.2": "2 slots (1x Gen5)", "Réseau": "WiFi 6E + 2.5 GbE", "socket": "AM5", "ram_type": "DDR5", "form_factor": "ATX"},
    },

    # ─── Mémoire — DDR4 & DDR5 abordables ────────────────────────────
    {
        "name": "Vengeance LPX 16 Go DDR4-3200", "brand": "Corsair", "category": "ram",
        "price": 39.00, "old_price": None, "stock": 40, "rating": 4.7,
        "featured": False, "badge": "Petit prix",
        "description": "Le kit DDR4 le plus populaire : 2x8 Go fiables pour toute config AM4 ou LGA1700 DDR4.",
        "specs": {"Capacité": "16 Go (2x8)", "Type": "DDR4", "Fréquence": "3200 MT/s", "Latence": "CL16", "Profils": "XMP 2.0", "ram_type": "DDR4"},
    },
    {
        "name": "Ripjaws V 32 Go DDR4-3600", "brand": "G.Skill", "category": "ram",
        "price": 74.00, "old_price": None, "stock": 26, "rating": 4.8,
        "featured": False, "badge": None,
        "description": "32 Go DDR4 rapides et tendus en CL16 : le sweet spot pour un Ryzen 5000.",
        "specs": {"Capacité": "32 Go (2x16)", "Type": "DDR4", "Fréquence": "3600 MT/s", "Latence": "CL16", "Profils": "XMP 2.0", "ram_type": "DDR4"},
    },
    {
        "name": "Fury Beast 16 Go DDR4-3200", "brand": "Kingston", "category": "ram",
        "price": 42.00, "old_price": None, "stock": 32, "rating": 4.6,
        "featured": False, "badge": None,
        "description": "Kit DDR4 16 Go au look sobre, plug-and-play pour démarrer une config gaming.",
        "specs": {"Capacité": "16 Go (2x8)", "Type": "DDR4", "Fréquence": "3200 MT/s", "Latence": "CL16", "Profils": "XMP 2.0", "ram_type": "DDR4"},
    },
    {
        "name": "Pro 16 Go DDR5-5600", "brand": "Crucial", "category": "ram",
        "price": 52.00, "old_price": None, "stock": 30, "rating": 4.6,
        "featured": False, "badge": None,
        "description": "Le ticket d'entrée DDR5 : 16 Go à 5600 MT/s pour une plateforme moderne sans surcoût.",
        "specs": {"Capacité": "16 Go (2x8)", "Type": "DDR5", "Fréquence": "5600 MT/s", "Latence": "CL46", "Profils": "EXPO + XMP 3.0", "ram_type": "DDR5"},
    },
    {
        "name": "Vengeance 32 Go DDR5-6000", "brand": "Corsair", "category": "ram",
        "price": 99.00, "old_price": 119.00, "stock": 20, "rating": 4.8,
        "featured": False, "badge": "Promo",
        "description": "Le kit DDR5 recommandé pour Ryzen et Intel récents : 32 Go à 6000 MT/s CL30.",
        "specs": {"Capacité": "32 Go (2x16)", "Type": "DDR5", "Fréquence": "6000 MT/s", "Latence": "CL30", "Profils": "EXPO + XMP 3.0", "ram_type": "DDR5"},
    },

    # ─── Cartes graphiques — entrée de gamme ─────────────────────────
    {
        "name": "GeForce GT 1030 2 Go", "brand": "MSI", "category": "gpu",
        "price": 75.00, "old_price": None, "stock": 25, "rating": 4.1,
        "featured": False, "badge": "Petit prix",
        "description": "Carte d'affichage silencieuse pour bureautique et multimédia, idéale pour dépanner ou un HTPC.",
        "specs": {"GPU": "Pascal GP108", "Mémoire": "2 Go GDDR5", "Boost": "1468 MHz", "TDP": "30 W", "Longueur": "150 mm", "tdp_w": 30, "length_mm": 150},
    },
    {
        "name": "Radeon RX 6400 4 Go", "brand": "Sapphire", "category": "gpu",
        "price": 99.00, "old_price": None, "stock": 18, "rating": 4.2,
        "featured": False, "badge": None,
        "description": "Petite carte basse consommation sans alim PCIe : un vrai gain face à un GPU intégré.",
        "specs": {"GPU": "RDNA 2 Navi 24", "Mémoire": "4 Go GDDR6", "Boost": "2321 MHz", "TDP": "53 W", "Longueur": "169 mm", "tdp_w": 53, "length_mm": 169},
    },
    {
        "name": "Arc A580 8 Go", "brand": "Intel", "category": "gpu",
        "price": 179.00, "old_price": None, "stock": 12, "rating": 4.3,
        "featured": False, "badge": None,
        "description": "Le challenger d'Intel : du 1080p musclé et un excellent encodeur AV1 pour les créateurs.",
        "specs": {"GPU": "Xe-HPG ACM-G10", "Mémoire": "8 Go GDDR6", "Boost": "1700 MHz", "TDP": "185 W", "Longueur": "270 mm", "tdp_w": 185, "length_mm": 270},
    },
    {
        "name": "GeForce RTX 3050 8 Go", "brand": "Gigabyte", "category": "gpu",
        "price": 199.00, "old_price": None, "stock": 14, "rating": 4.4,
        "featured": False, "badge": None,
        "description": "Pour jouer en 1080p avec DLSS et le ray tracing en prime, sans grosse alimentation.",
        "specs": {"GPU": "Ampere GA106", "Mémoire": "8 Go GDDR6", "Boost": "1777 MHz", "TDP": "130 W", "Longueur": "200 mm", "tdp_w": 130, "length_mm": 200},
    },
    {
        "name": "Radeon RX 6600 8 Go", "brand": "ASRock", "category": "gpu",
        "price": 209.00, "old_price": 239.00, "stock": 13, "rating": 4.6,
        "featured": False, "badge": "Promo",
        "description": "La reine du 1080p à petit prix : fraîche, sobre et performante dans tous les jeux récents.",
        "specs": {"GPU": "RDNA 2 Navi 23", "Mémoire": "8 Go GDDR6", "Boost": "2491 MHz", "TDP": "132 W", "Longueur": "200 mm", "tdp_w": 132, "length_mm": 200},
    },

    # ─── Stockage — abordable ────────────────────────────────────────
    {
        "name": "BX500 480 Go SATA", "brand": "Crucial", "category": "storage",
        "price": 32.00, "old_price": None, "stock": 45, "rating": 4.5,
        "featured": False, "badge": "Petit prix",
        "description": "SSD SATA 2.5\" pour redonner vie à un vieux PC ou ajouter du stockage rapide à moindre coût.",
        "specs": {"Capacité": "480 Go", "Interface": "SATA III", "Lecture": "540 Mo/s", "Écriture": "500 Mo/s", "Format": "2.5\""},
    },
    {
        "name": "P3 1 To PCIe 3.0", "brand": "Crucial", "category": "storage",
        "price": 55.00, "old_price": None, "stock": 35, "rating": 4.6,
        "featured": False, "badge": None,
        "description": "Un NVMe 1 To généreux et abordable, parfait comme disque système rapide.",
        "specs": {"Capacité": "1 To", "Interface": "PCIe 3.0 x4", "Lecture": "3500 Mo/s", "Écriture": "3000 Mo/s", "Endurance": "220 TBW", "Format": "M.2 2280"},
    },
    {
        "name": "NV2 1 To PCIe 4.0", "brand": "Kingston", "category": "storage",
        "price": 59.00, "old_price": None, "stock": 30, "rating": 4.5,
        "featured": False, "badge": None,
        "description": "NVMe Gen4 économique : de bons débits pour le prix d'un Gen3, idéal premier montage.",
        "specs": {"Capacité": "1 To", "Interface": "PCIe 4.0 x4", "Lecture": "3500 Mo/s", "Écriture": "2800 Mo/s", "Endurance": "320 TBW", "Format": "M.2 2280"},
    },
    {
        "name": "Blue SN580 2 To PCIe 4.0", "brand": "Western Digital", "category": "storage",
        "price": 119.00, "old_price": None, "stock": 18, "rating": 4.7,
        "featured": False, "badge": None,
        "description": "2 To Gen4 silencieux et endurant pour héberger une grosse logithèque de jeux.",
        "specs": {"Capacité": "2 To", "Interface": "PCIe 4.0 x4", "Lecture": "4150 Mo/s", "Écriture": "4150 Mo/s", "Endurance": "900 TBW", "Format": "M.2 2280"},
    },
    {
        "name": "BarraCuda 2 To 7200 tr/min", "brand": "Seagate", "category": "storage",
        "price": 54.00, "old_price": None, "stock": 28, "rating": 4.4,
        "featured": False, "badge": None,
        "description": "Disque dur 3.5\" 2 To pour archiver photos, vidéos et sauvegardes à très bas coût au To.",
        "specs": {"Capacité": "2 To", "Interface": "SATA III", "Vitesse": "7200 tr/min", "Cache": "256 Mo", "Format": "3.5\""},
    },

    # ─── Alimentations — abordables ──────────────────────────────────
    {
        "name": "CV550 550 W Bronze", "brand": "Corsair", "category": "psu",
        "price": 49.00, "old_price": None, "stock": 30, "rating": 4.4,
        "featured": False, "badge": "Petit prix",
        "description": "550 W certifiée 80+ Bronze pour alimenter sereinement une config bureautique ou GPU d'entrée.",
        "specs": {"Puissance": "550 W", "Certification": "80+ Bronze", "Norme": "ATX", "Modulaire": "Non", "Garantie": "3 ans", "watts": 550},
    },
    {
        "name": "MAG A650BN 650 W Bronze", "brand": "MSI", "category": "psu",
        "price": 64.00, "old_price": None, "stock": 24, "rating": 4.5,
        "featured": False, "badge": None,
        "description": "650 W fiable pour un PC gaming milieu de gamme (RX 6600, RTX 3050/3060).",
        "specs": {"Puissance": "650 W", "Certification": "80+ Bronze", "Norme": "ATX", "Modulaire": "Non", "Garantie": "5 ans", "watts": 650},
    },
    {
        "name": "MWE 600 White V2", "brand": "Cooler Master", "category": "psu",
        "price": 55.00, "old_price": None, "stock": 22, "rating": 4.3,
        "featured": False, "badge": None,
        "description": "600 W 80+ White au tarif serré, suffisante pour les configs sans GPU énergivore.",
        "specs": {"Puissance": "600 W", "Certification": "80+ White", "Norme": "ATX", "Modulaire": "Non", "Garantie": "3 ans", "watts": 600},
    },
    {
        "name": "System Power 10 750 W Gold", "brand": "be quiet!", "category": "psu",
        "price": 89.00, "old_price": None, "stock": 16, "rating": 4.7,
        "featured": False, "badge": None,
        "description": "750 W 80+ Gold silencieuse et endurante : la marge idéale pour un GPU milieu/haut de gamme.",
        "specs": {"Puissance": "750 W", "Certification": "80+ Gold", "Norme": "ATX 3.0", "Modulaire": "Semi", "Garantie": "5 ans", "watts": 750},
    },
    {
        "name": "Focus GX-850 ATX 3.1", "brand": "Seasonic", "category": "psu",
        "price": 129.00, "old_price": None, "stock": 12, "rating": 4.8,
        "featured": False, "badge": None,
        "description": "850 W full modulaire 80+ Gold avec câble 12V-2x6 natif : du Seasonic garanti 10 ans.",
        "specs": {"Puissance": "850 W", "Certification": "80+ Gold", "Norme": "ATX 3.1", "Modulaire": "Full", "Garantie": "10 ans", "watts": 850},
    },

    # ─── Boîtiers — abordables ───────────────────────────────────────
    {
        "name": "MasterBox Q300L", "brand": "Cooler Master", "category": "case",
        "price": 45.00, "old_price": None, "stock": 26, "rating": 4.4,
        "featured": False, "badge": "Petit prix",
        "description": "Micro-ATX compact et modulaire avec façade maillée, parfait pour un premier montage soigné.",
        "specs": {"Format": "Micro-ATX", "GPU max": "360 mm", "Ventilateurs": "Jusqu'à 4", "Façade": "Maille", "Baies": "2x 2.5\" + 1x 3.5\"", "max_gpu_mm": 360},
    },
    {
        "name": "AIR 903 BASE", "brand": "Montech", "category": "case",
        "price": 79.00, "old_price": None, "stock": 20, "rating": 4.6,
        "featured": False, "badge": None,
        "description": "Boîtier très aéré livré avec ventilateurs, un excellent flux d'air pour pas cher.",
        "specs": {"Format": "ATX", "GPU max": "380 mm", "Radiateurs": "2x 360 mm", "Façade": "Maille", "Baies": "2x 2.5\" + 2x 3.5\"", "max_gpu_mm": 380},
    },
    {
        "name": "Pure Base 500 DX", "brand": "be quiet!", "category": "case",
        "price": 89.00, "old_price": None, "stock": 15, "rating": 4.7,
        "featured": False, "badge": None,
        "description": "Le silence be quiet! avec un bon flux d'air et 3 ventilateurs ARGB inclus.",
        "specs": {"Format": "ATX", "GPU max": "369 mm", "Radiateurs": "2x 360 mm", "Façade": "Maille + verre", "Baies": "2x 2.5\" + 2x 3.5\"", "max_gpu_mm": 369},
    },
    {
        "name": "4000D Airflow", "brand": "Corsair", "category": "case",
        "price": 89.00, "old_price": 99.00, "stock": 17, "rating": 4.8,
        "featured": False, "badge": "Promo",
        "description": "Le best-seller du montage : flux d'air exemplaire, gestion câbles au top, verre trempé.",
        "specs": {"Format": "ATX", "GPU max": "360 mm", "Radiateurs": "2x 360 mm", "Façade": "Maille", "Baies": "2x 2.5\" + 2x 3.5\"", "max_gpu_mm": 360},
    },
    {
        "name": "H5 Flow 2024", "brand": "NZXT", "category": "case",
        "price": 99.00, "old_price": None, "stock": 13, "rating": 4.6,
        "featured": False, "badge": None,
        "description": "Le design épuré NZXT avec un flux d'air revu, idéal pour une config propre et fraîche.",
        "specs": {"Format": "ATX", "GPU max": "365 mm", "Radiateurs": "2x 280 mm", "Façade": "Maille", "Baies": "2x 2.5\" + 1x 3.5\"", "max_gpu_mm": 365},
    },

    # ─── Refroidissement — abordable (sockets larges) ────────────────
    {
        "name": "Freezer 36", "brand": "Arctic", "category": "cooling",
        "price": 35.00, "old_price": None, "stock": 30, "rating": 4.7,
        "featured": False, "badge": "Petit prix",
        "description": "Ventirad double tour ultra efficace pour son prix, parfait pour les i5 et Ryzen 5/7.",
        "specs": {"Type": "Ventirad air", "Sockets": "AM5 / AM4 / LGA1700", "Ventilateurs": "2x P12 PWM", "Hauteur": "159 mm", "TDP supporté": "200 W", "sockets": ["AM5", "AM4", "LGA1700", "LGA1851"]},
    },
    {
        "name": "Hyper 212 Black Edition", "brand": "Cooler Master", "category": "cooling",
        "price": 39.00, "old_price": None, "stock": 28, "rating": 4.5,
        "featured": False, "badge": None,
        "description": "Le ventirad le plus vendu de l'histoire : valeur sûre et silencieuse pour CPU milieu de gamme.",
        "specs": {"Type": "Ventirad air", "Sockets": "AM5 / AM4 / LGA1700", "Ventilateurs": "1x 120 mm PWM", "Hauteur": "159 mm", "TDP supporté": "150 W", "sockets": ["AM5", "AM4", "LGA1700", "LGA1851"]},
    },
    {
        "name": "Pure Rock 2", "brand": "be quiet!", "category": "cooling",
        "price": 45.00, "old_price": None, "stock": 22, "rating": 4.6,
        "featured": False, "badge": None,
        "description": "Ventirad silencieux et soigné, un classique fiable pour les configs sobres.",
        "specs": {"Type": "Ventirad air", "Sockets": "AM5 / AM4 / LGA1700", "Ventilateurs": "1x 120 mm Pure Wings 2", "Hauteur": "155 mm", "TDP supporté": "150 W", "sockets": ["AM5", "AM4", "LGA1700", "LGA1851"]},
    },
    {
        "name": "AK620", "brand": "DeepCool", "category": "cooling",
        "price": 59.00, "old_price": None, "stock": 16, "rating": 4.7,
        "featured": False, "badge": None,
        "description": "Gros double tour qui rivalise avec des AIO 240 mm, pour i7/i9 et Ryzen 9 sans pompe.",
        "specs": {"Type": "Ventirad air", "Sockets": "AM5 / AM4 / LGA1700", "Ventilateurs": "2x 120 mm PWM", "Hauteur": "160 mm", "TDP supporté": "260 W", "sockets": ["AM5", "AM4", "LGA1700", "LGA1851"]},
    },
    {
        "name": "Liquid Freezer III 240 A-RGB", "brand": "Arctic", "category": "cooling",
        "price": 89.00, "old_price": None, "stock": 14, "rating": 4.8,
        "featured": False, "badge": None,
        "description": "AIO 240 mm très performant et abordable : du watercooling fiable pour la plupart des CPU.",
        "specs": {"Type": "AIO 240 mm", "Sockets": "AM5 / AM4 / LGA1700", "Ventilateurs": "2x P12 PWM A-RGB", "Pompe": "2800 tr/min", "TDP supporté": "300 W", "sockets": ["AM5", "AM4", "LGA1700", "LGA1851"]},
    },

    # ─── Écrans — abordables ─────────────────────────────────────────
    {
        "name": "24G2 24\" 144 Hz IPS", "brand": "AOC", "category": "monitor",
        "price": 129.00, "old_price": None, "stock": 22, "rating": 4.7,
        "featured": False, "badge": "Petit prix",
        "description": "L'écran gaming d'entrée par excellence : 144 Hz, dalle IPS et couleurs justes à petit prix.",
        "specs": {"Dalle": "IPS 23,8\"", "Définition": "1920 × 1080", "Fréquence": "144 Hz", "Réponse": "1 ms", "HDR": "Non", "Connectique": "DP + 2x HDMI"},
    },
    {
        "name": "Pulse G24F-2 24\" 165 Hz", "brand": "Koorui", "category": "monitor",
        "price": 99.00, "old_price": None, "stock": 18, "rating": 4.4,
        "featured": False, "badge": None,
        "description": "165 Hz pour moins de 100 € : idéal pour démarrer l'e-sport sans se ruiner.",
        "specs": {"Dalle": "VA 23,8\"", "Définition": "1920 × 1080", "Fréquence": "165 Hz", "Réponse": "1 ms", "HDR": "Non", "Connectique": "DP + 2x HDMI"},
    },
    {
        "name": "G244F E2 24\" 170 Hz", "brand": "MSI", "category": "monitor",
        "price": 149.00, "old_price": None, "stock": 16, "rating": 4.6,
        "featured": False, "badge": None,
        "description": "Dalle Rapid IPS 170 Hz très réactive, le bon choix pour les jeux compétitifs en 1080p.",
        "specs": {"Dalle": "Rapid IPS 23,8\"", "Définition": "1920 × 1080", "Fréquence": "170 Hz", "Réponse": "1 ms", "HDR": "Non", "Connectique": "DP + 2x HDMI"},
    },
    {
        "name": "S2425H 24\" 100 Hz", "brand": "Dell", "category": "monitor",
        "price": 119.00, "old_price": None, "stock": 20, "rating": 4.5,
        "featured": False, "badge": None,
        "description": "Écran bureautique IPS élégant avec haut-parleurs intégrés, parfait pour le travail et le multimédia.",
        "specs": {"Dalle": "IPS 23,8\"", "Définition": "1920 × 1080", "Fréquence": "100 Hz", "Réponse": "4 ms", "HDR": "Non", "Connectique": "2x HDMI"},
    },
    {
        "name": "G27Q 27\" 1440p 165 Hz", "brand": "Gigabyte", "category": "monitor",
        "price": 239.00, "old_price": 269.00, "stock": 12, "rating": 4.7,
        "featured": False, "badge": "Promo",
        "description": "Le passage au 1440p haute fréquence à prix doux : grande dalle IPS et 165 Hz.",
        "specs": {"Dalle": "IPS 27\"", "Définition": "2560 × 1440", "Fréquence": "165 Hz", "Réponse": "1 ms", "HDR": "HDR400", "Connectique": "DP + 2x HDMI + USB hub"},
    },

    # ─── Claviers — abordables ───────────────────────────────────────
    {
        "name": "K552 Kumara RGB", "brand": "Redragon", "category": "keyboard",
        "price": 35.00, "old_price": None, "stock": 30, "rating": 4.4,
        "featured": False, "badge": "Petit prix",
        "description": "Clavier mécanique TKL rétroéclairé à prix mini, robuste avec son cadre métal.",
        "specs": {"Format": "TKL", "Switches": "Outemu mécaniques", "Connexion": "USB filaire", "Rétroéclairage": "RGB", "Châssis": "Plaque métal"},
    },
    {
        "name": "G213 Prodigy", "brand": "Logitech", "category": "keyboard",
        "price": 44.00, "old_price": None, "stock": 24, "rating": 4.4,
        "featured": False, "badge": None,
        "description": "Clavier membrane gaming résistant aux éclaboussures, touches dédiées média et RGB par zones.",
        "specs": {"Format": "Full-size", "Switches": "Mech-Dome membrane", "Connexion": "USB filaire", "Rétroéclairage": "RGB 5 zones", "Étanchéité": "Anti-éclaboussures"},
    },
    {
        "name": "Cynosa V2", "brand": "Razer", "category": "keyboard",
        "price": 49.00, "old_price": None, "stock": 20, "rating": 4.5,
        "featured": False, "badge": None,
        "description": "Membrane silencieuse avec RGB par touche (Chroma), confortable pour jouer et travailler.",
        "specs": {"Format": "Full-size", "Switches": "Membrane silencieuse", "Connexion": "USB filaire", "Rétroéclairage": "RGB Chroma par touche", "Étanchéité": "Anti-éclaboussures"},
    },
    {
        "name": "K6 sans-fil", "brand": "Keychron", "category": "keyboard",
        "price": 69.00, "old_price": None, "stock": 16, "rating": 4.6,
        "featured": False, "badge": None,
        "description": "Compact 65 % mécanique et sans-fil, compatible Mac et Windows : un best-seller polyvalent.",
        "specs": {"Format": "65 %", "Switches": "Gateron mécaniques", "Connexion": "Bluetooth + USB-C", "Rétroéclairage": "RGB", "Autonomie": "Jusqu'à 240 h"},
    },

    # ─── Souris — abordables ─────────────────────────────────────────
    {
        "name": "G203 LIGHTSYNC", "brand": "Logitech", "category": "mouse",
        "price": 29.00, "old_price": None, "stock": 40, "rating": 4.7,
        "featured": False, "badge": "Petit prix",
        "description": "La souris gaming filaire incontournable à petit prix : capteur précis et RGB.",
        "specs": {"Poids": "85 g", "Capteur": "8 000 DPI", "Boutons": "6", "Connexion": "USB filaire", "Rétroéclairage": "RGB LIGHTSYNC"},
    },
    {
        "name": "DeathAdder Essential", "brand": "Razer", "category": "mouse",
        "price": 29.00, "old_price": None, "stock": 35, "rating": 4.6,
        "featured": False, "badge": None,
        "description": "La forme ergonomique légendaire de Razer, fiable et confortable pour de longues sessions.",
        "specs": {"Poids": "96 g", "Capteur": "6 400 DPI", "Boutons": "5", "Connexion": "USB filaire", "Rétroéclairage": "Vert mono"},
    },
    {
        "name": "G305 LIGHTSPEED", "brand": "Logitech", "category": "mouse",
        "price": 39.00, "old_price": None, "stock": 26, "rating": 4.7,
        "featured": False, "badge": None,
        "description": "Sans-fil Lightspeed fiable avec une autonomie record sur une simple pile AA.",
        "specs": {"Poids": "99 g", "Capteur": "Hero 12 000 DPI", "Boutons": "6", "Connexion": "Lightspeed 2,4 GHz", "Autonomie": "250 h"},
    },
    {
        "name": "Model O 2", "brand": "Glorious", "category": "mouse",
        "price": 49.00, "old_price": None, "stock": 18, "rating": 4.6,
        "featured": False, "badge": None,
        "description": "Ultra-légère et nerveuse, un excellent choix pour l'e-sport sans casser sa tirelire.",
        "specs": {"Poids": "59 g", "Capteur": "BAMF 2.0 26 000 DPI", "Boutons": "6", "Connexion": "USB filaire", "Rétroéclairage": "RGB"},
    },

    # ─── Casques — abordables ────────────────────────────────────────
    {
        "name": "Cloud Stinger 2", "brand": "HyperX", "category": "headset",
        "price": 44.00, "old_price": None, "stock": 30, "rating": 4.5,
        "featured": False, "badge": "Petit prix",
        "description": "Casque filaire léger et confortable avec son surround DTS, le bon plan pour débuter.",
        "specs": {"Transducteurs": "50 mm", "Connexion": "Jack 3,5 mm", "Surround": "DTS Headphone:X", "Micro": "À tige basculante", "Poids": "275 g"},
    },
    {
        "name": "Kraken X", "brand": "Razer", "category": "headset",
        "price": 49.00, "old_price": None, "stock": 24, "rating": 4.4,
        "featured": False, "badge": None,
        "description": "Surround 7.1 et coussinets mémoire de forme pour un confort prolongé à petit prix.",
        "specs": {"Transducteurs": "40 mm", "Connexion": "Jack 3,5 mm", "Surround": "7.1 virtuel", "Micro": "Cardioïde flexible", "Poids": "250 g"},
    },
    {
        "name": "HS55 Stereo", "brand": "Corsair", "category": "headset",
        "price": 59.00, "old_price": None, "stock": 20, "rating": 4.5,
        "featured": False, "badge": None,
        "description": "Casque confortable et bien fini, son clair et micro détachable certifié Discord.",
        "specs": {"Transducteurs": "50 mm néodyme", "Connexion": "Jack 3,5 mm", "Surround": "Stéréo", "Micro": "Détachable, anti-bruit", "Poids": "266 g"},
    },
    {
        "name": "G435 LIGHTSPEED", "brand": "Logitech", "category": "headset",
        "price": 59.00, "old_price": None, "stock": 18, "rating": 4.4,
        "featured": False, "badge": None,
        "description": "Sans-fil ultra-léger (165 g), Bluetooth et 2,4 GHz, pensé pour les longues sessions.",
        "specs": {"Transducteurs": "40 mm", "Connexion": "Lightspeed 2,4 GHz + Bluetooth", "Surround": "Stéréo", "Micro": "Doubles micros intégrés", "Poids": "165 g"},
    },
]
