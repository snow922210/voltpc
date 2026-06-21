# -*- coding: utf-8 -*-
"""Données de démarrage du catalogue VOLT PC."""

PROMO_CODES = {
    "VOLT10": {"percent": 10, "label": "-10% sur tout le site"},
    "GAMER15": {"percent": 15, "label": "-15% offre gamer"},
    "SUMMER20": {"percent": 20, "label": "-20% soldes d'été"},
}

SEED_PRODUCTS = [
    # ─── Cartes graphiques ───────────────────────────────────────────

    {
        "name": "GeForce RTX 3060 Twin Edge",
        "brand": "Zotac", "category": "gpu", "price": 279.00, "old_price": None,
        "stock": 14, "rating": 4.5, "featured": False, "badge": None,
        "description": "Idéale pour le gaming en 1080p avec ses 12 Go de mémoire pour voir venir.",
        "specs": {"GPU": "Ampere GA106", "Mémoire": "12 Go GDDR6", "Boost": "1777 MHz", "TDP": "170 W", "Longueur": "224 mm", "tdp_w": 170, "length_mm": 224},
    },
    {
        "name": "GeForce RTX 3060 Ti Eagle",
        "brand": "Gigabyte", "category": "gpu", "price": 319.00, "old_price": 349.00,
        "stock": 9, "rating": 4.6, "featured": False, "badge": "Promo",
        "description": "Le rapport performances/prix de l'ère Ampere pour s'essayer au 1440p.",
        "specs": {"GPU": "Ampere GA104", "Mémoire": "8 Go GDDR6", "Boost": "1665 MHz", "TDP": "200 W", "Longueur": "242 mm", "tdp_w": 200, "length_mm": 242},
    },
    {
        "name": "GeForce RTX 3070 Twin Edge",
        "brand": "Zotac", "category": "gpu", "price": 389.00, "old_price": None,
        "stock": 7, "rating": 4.6, "featured": False, "badge": None,
        "description": "Une carte très équilibrée pour jouer sereinement dans d'excellentes conditions en QHD.",
        "specs": {"GPU": "Ampere GA104", "Mémoire": "8 Go GDDR6", "Boost": "1725 MHz", "TDP": "220 W", "Longueur": "232 mm", "tdp_w": 220, "length_mm": 232},
    },
    {
        "name": "GeForce RTX 3070 Ti Gaming Trio",
        "brand": "MSI", "category": "gpu", "price": 429.00, "old_price": None,
        "stock": 5, "rating": 4.5, "featured": False, "badge": None,
        "description": "Version boostée de la 3070 avec de la mémoire GDDR6X plus rapide.",
        "specs": {"GPU": "Ampere GA104", "Mémoire": "8 Go GDDR6X", "Boost": "1770 MHz", "TDP": "290 W", "Longueur": "323 mm", "tdp_w": 290, "length_mm": 323},
    },
    {
        "name": "GeForce RTX 3080 Gaming Trio",
        "brand": "MSI", "category": "gpu", "price": 499.00, "old_price": 549.00,
        "stock": 4, "rating": 4.7, "featured": False, "badge": "Promo",
        "description": "La reine déchue de la 4K qui conserve une puissance brute impressionnante en rasterisation.",
        "specs": {"GPU": "Ampere GA102", "Mémoire": "10 Go GDDR6X", "Boost": "1755 MHz", "TDP": "320 W", "Longueur": "323 mm", "tdp_w": 320, "length_mm": 323},
    },
    {
        "name": "GeForce RTX 3080 Ti Ventus",
        "brand": "MSI", "category": "gpu", "price": 599.00, "old_price": None,
        "stock": 3, "rating": 4.7, "featured": False, "badge": None,
        "description": "Des performances quasiment identiques à une 3090 avec 12 Go de VRAM.",
        "specs": {"GPU": "Ampere GA102", "Mémoire": "12 Go GDDR6X", "Boost": "1665 MHz", "TDP": "350 W", "Longueur": "305 mm", "tdp_w": 350, "length_mm": 305},
    },
    {
        "name": "GeForce RTX 3090 ROG Strix",
        "brand": "ASUS", "category": "gpu", "price": 749.00, "old_price": None,
        "stock": 2, "rating": 4.8, "featured": False, "badge": None,
        "description": "Le monstre originel et ses 24 Go de mémoire pour les créateurs de contenu exigeants.",
        "specs": {"GPU": "Ampere GA102", "Mémoire": "24 Go GDDR6X", "Boost": "1860 MHz", "TDP": "350 W", "Longueur": "318 mm", "tdp_w": 350, "length_mm": 318},
    },
    {
        "name": "GeForce RTX 3090 Ti SUPRIM",
        "brand": "MSI", "category": "gpu", "price": 849.00, "old_price": 999.00,
        "stock": 2, "rating": 4.8, "featured": False, "badge": "Promo",
        "description": "L'ultime itération de l'architecture Ampere, repoussant les limites de consommation.",
        "specs": {"GPU": "Ampere GA102", "Mémoire": "24 Go GDDR6X", "Boost": "1860 MHz", "TDP": "450 W", "Longueur": "338 mm", "tdp_w": 450, "length_mm": 338},
    },
    {
        "name": "GeForce RTX 4060 Windforce",
        "brand": "Gigabyte", "category": "gpu", "price": 319.00, "old_price": None,
        "stock": 38, "rating": 4.4, "featured": False, "badge": None,
        "description": "Consommation minuscule et accès au DLSS 3 Frame Generation pour transfigurer le 1080p.",
        "specs": {"GPU": "Ada Lovelace AD107", "Mémoire": "8 Go GDDR6", "Boost": "2475 MHz", "TDP": "115 W", "Longueur": "198 mm", "tdp_w": 115, "length_mm": 198},
    },
    {
        "name": "GeForce RTX 4060 Ti Dual",
        "brand": "ASUS", "category": "gpu", "price": 419.00, "old_price": None,
        "stock": 22, "rating": 4.4, "featured": False, "badge": None,
        "description": "Une fluidité impeccable avec toutes les technologies modernes d'upscaling pour le format compact.",
        "specs": {"GPU": "Ada Lovelace AD106", "Mémoire": "8 Go GDDR6", "Boost": "2535 MHz", "TDP": "160 W", "Longueur": "227 mm", "tdp_w": 160, "length_mm": 227},
    },
    {
        "name": "GeForce RTX 4070 Dual",
        "brand": "Palit", "category": "gpu", "price": 569.00, "old_price": 619.00,
        "stock": 19, "rating": 4.7, "featured": False, "badge": "Promo",
        "description": "Le compromis idéal de la génération 40 pour jouer confortablement en 1440p sans vider son livret A.",
        "specs": {"GPU": "Ada Lovelace AD104", "Mémoire": "12 Go GDDR6X", "Boost": "2475 MHz", "TDP": "200 W", "Longueur": "269 mm", "tdp_w": 200, "length_mm": 269},
    },
    {
        "name": "GeForce RTX 4070 Ti TUF Gaming",
        "brand": "ASUS", "category": "gpu", "price": 769.00, "old_price": None,
        "stock": 11, "rating": 4.7, "featured": False, "badge": None,
        "description": "Des performances impressionnantes frôlant les anciennes vitrines de la marque avec un refroidissement de premier ordre.",
        "specs": {"GPU": "Ada Lovelace AD104", "Mémoire": "12 Go GDDR6X", "Boost": "2610 MHz", "TDP": "285 W", "Longueur": "305 mm", "tdp_w": 285, "length_mm": 305},
    },
    {
        "name": "GeForce RTX 4080 JetStream",
        "brand": "Palit", "category": "gpu", "price": 1049.00, "old_price": None,
        "stock": 8, "rating": 4.8, "featured": False, "badge": None,
        "description": "Gros gap de performances ouvrant les portes du Ray Tracing en 4K native de façon stable.",
        "specs": {"GPU": "Ada Lovelace AD103", "Mémoire": "16 Go GDDR6X", "Boost": "2505 MHz", "TDP": "320 W", "Longueur": "328 mm", "tdp_w": 320, "length_mm": 328},
    },
    {
        "name": "GeForce RTX 4090 ROG Strix",
        "brand": "ASUS", "category": "gpu", "price": 1899.00, "old_price": None,
        "stock": 3, "rating": 5.0, "featured": True, "badge": "Flagship",
        "description": "L'ancienne vitrine absolue, encore capable de ridiculiser la majorité du marché actuel.",
        "specs": {"GPU": "Ada Lovelace AD102", "Mémoire": "24 Go GDDR6X", "Boost": "2610 MHz", "TDP": "450 W", "Longueur": "357 mm", "tdp_w": 450, "length_mm": 357},
    },
    {
        "name": "GeForce RTX 5070 Gaming",
        "brand": "Gigabyte", "category": "gpu", "price": 799.00, "old_price": None,
        "stock": 25, "rating": 4.7, "featured": False, "badge": "Nouveau",
        "description": "L'architecture Blackwell enfin accessible pour bousculer le milieu de gamme.",
        "specs": {"GPU": "Blackwell GB205", "Mémoire": "12 Go GDDR7", "Boost": "2550 MHz", "TDP": "220 W", "Longueur": "300 mm", "tdp_w": 220, "length_mm": 300},
    },
    {
        "name": "GeForce RTX 5070 Ti Gaming",
        "brand": "Gigabyte", "category": "gpu", "price": 879.00, "old_price": None,
        "stock": 26, "rating": 4.7, "featured": False, "badge": "Top vente",
        "description": "Le véritable sweet spot 1440p/4K avec les performances d'une 4090 pour la moitié du prix.",
        "specs": {"GPU": "Blackwell GB203", "Mémoire": "16 Go GDDR7", "Boost": "2482 MHz", "TDP": "300 W", "Longueur": "331 mm", "tdp_w": 300, "length_mm": 331},
    },
    {
        "name": "GeForce RTX 5080 TUF Gaming",
        "brand": "ASUS", "category": "gpu", "price": 1199.00, "old_price": 1329.00,
        "stock": 18, "rating": 4.8, "featured": True, "badge": "Promo",
        "description": "Le haut de gamme sans concession profitant du DLSS 4 Multi Frame Generation.",
        "specs": {"GPU": "Blackwell GB203", "Mémoire": "16 Go GDDR7", "Boost": "2730 MHz", "TDP": "360 W", "Longueur": "348 mm", "tdp_w": 360, "length_mm": 348},
    },
    {
        "name": "GeForce RTX 5090 Suprim",
        "brand": "MSI", "category": "gpu", "price": 2399.00, "old_price": None,
        "stock": 7, "rating": 4.9, "featured": True, "badge": "Flagship",
        "description": "La carte graphique ultime absolue. Architecture Blackwell et 32 Go GDDR7 pour le path tracing 4K sans compromis.",
        "specs": {"GPU": "Blackwell GB202", "Mémoire": "32 Go GDDR7", "Boost": "2625 MHz", "TDP": "575 W", "Longueur": "358 mm", "tdp_w": 575, "length_mm": 358},
    },

    # ─── Processeurs ─────────────────────────────────────────────────
    {
        "name": "Ryzen 7 9800X3D",
        "brand": "AMD", "category": "cpu", "price": 529.00, "old_price": None,
        "stock": 34, "rating": 4.9, "featured": True, "badge": "Top vente",
        "description": "Le roi du gaming. 8 cœurs Zen 5, 96 Mo de 3D V-Cache de seconde génération : imbattable en jeu, excellent partout ailleurs.",
        "specs": {"Socket": "AM5", "Cœurs / Threads": "8 / 16", "Boost": "5.2 GHz", "Cache": "96 Mo L3", "TDP": "120 W", "socket": "AM5", "tdp_w": 120},
    },
    {
        "name": "Ryzen 9 9950X3D",
        "brand": "AMD", "category": "cpu", "price": 779.00, "old_price": None,
        "stock": 12, "rating": 4.9, "featured": False, "badge": "Flagship",
        "description": "16 cœurs Zen 5 + 3D V-Cache : la machine absolue pour jouer, streamer et créer sans compromis.",
        "specs": {"Socket": "AM5", "Cœurs / Threads": "16 / 32", "Boost": "5.7 GHz", "Cache": "144 Mo L3", "TDP": "170 W", "socket": "AM5", "tdp_w": 170},
    },
    {
        "name": "Core Ultra 9 285K",
        "brand": "Intel", "category": "cpu", "price": 649.00, "old_price": 699.00,
        "stock": 15, "rating": 4.5, "featured": False, "badge": "Promo",
        "description": "Arrow Lake : 24 cœurs (8P+16E), NPU intégré, efficacité énergétique en net progrès. Le champion de la productivité.",
        "specs": {"Socket": "LGA1851", "Cœurs / Threads": "24 / 24", "Boost": "5.7 GHz", "Cache": "36 Mo L3", "TDP": "125 W", "socket": "LGA1851", "tdp_w": 125},
    },
    {
        "name": "Core Ultra 5 245K",
        "brand": "Intel", "category": "cpu", "price": 329.00, "old_price": None,
        "stock": 40, "rating": 4.4, "featured": False, "badge": None,
        "description": "14 cœurs Arrow Lake au prix juste : parfait pour une config milieu de gamme polyvalente et évolutive.",
        "specs": {"Socket": "LGA1851", "Cœurs / Threads": "14 / 14", "Boost": "5.2 GHz", "Cache": "24 Mo L3", "TDP": "125 W", "socket": "LGA1851", "tdp_w": 125},
    },
    {
        "name": "Ryzen 5 9600X",
        "brand": "AMD", "category": "cpu", "price": 229.00, "old_price": 279.00,
        "stock": 52, "rating": 4.6, "featured": False, "badge": "Promo",
        "description": "6 cœurs Zen 5 à 5.4 GHz : la porte d'entrée idéale sur AM5 pour le gaming 1080p/1440p.",
        "specs": {"Socket": "AM5", "Cœurs / Threads": "6 / 12", "Boost": "5.4 GHz", "Cache": "32 Mo L3", "TDP": "65 W", "socket": "AM5", "tdp_w": 65},
    },

    # ─── Mémoire ─────────────────────────────────────────────────────
    {
        "name": "Dominator Titanium RGB 64 Go DDR5-6600",
        "brand": "Corsair", "category": "ram", "price": 329.00, "old_price": None,
        "stock": 14, "rating": 4.8, "featured": False, "badge": None,
        "description": "2x32 Go CL32 : capacité massive, dissipateurs premium et 11 LED Capellix par barrette.",
        "specs": {"Capacité": "64 Go (2x32)", "Type": "DDR5", "Fréquence": "6600 MT/s", "Latence": "CL32", "Profils": "EXPO + XMP 3.0", "ram_type": "DDR5"},
    },
    {
        "name": "Trident Z5 RGB 32 Go DDR5-6400 CL30",
        "brand": "G.Skill", "category": "ram", "price": 149.00, "old_price": 169.00,
        "stock": 38, "rating": 4.8, "featured": True, "badge": "Top vente",
        "description": "Le kit de référence pour Ryzen 9000 : 2x16 Go CL30, le sweet spot absolu performance/prix.",
        "specs": {"Capacité": "32 Go (2x16)", "Type": "DDR5", "Fréquence": "6400 MT/s", "Latence": "CL30", "Profils": "EXPO + XMP 3.0", "ram_type": "DDR5"},
    },
    {
        "name": "Fury Beast 32 Go DDR5-6000",
        "brand": "Kingston", "category": "ram", "price": 109.00, "old_price": None,
        "stock": 60, "rating": 4.6, "featured": False, "badge": None,
        "description": "2x16 Go DDR5-6000 CL36 : fiable, sobre, efficace. La valeur sûre des configs équilibrées.",
        "specs": {"Capacité": "32 Go (2x16)", "Type": "DDR5", "Fréquence": "6000 MT/s", "Latence": "CL36", "Profils": "EXPO + XMP 3.0", "ram_type": "DDR5"},
    },
    {
        "name": "Vengeance RGB 48 Go DDR5-7000",
        "brand": "Corsair", "category": "ram", "price": 219.00, "old_price": None,
        "stock": 19, "rating": 4.7, "featured": False, "badge": "Nouveau",
        "description": "2x24 Go à 7000 MT/s : haute fréquence et capacité atypique pour créateurs exigeants.",
        "specs": {"Capacité": "48 Go (2x24)", "Type": "DDR5", "Fréquence": "7000 MT/s", "Latence": "CL36", "Profils": "XMP 3.0", "ram_type": "DDR5"},
    },

    # ─── Stockage ────────────────────────────────────────────────────
    {
        "name": "9100 Pro 2 To PCIe 5.0",
        "brand": "Samsung", "category": "storage", "price": 249.00, "old_price": None,
        "stock": 28, "rating": 4.8, "featured": True, "badge": "Nouveau",
        "description": "14 800 Mo/s en lecture : le NVMe Gen5 de référence, contrôleur maison Presto gravé en 5 nm.",
        "specs": {"Capacité": "2 To", "Interface": "PCIe 5.0 x4", "Lecture": "14 800 Mo/s", "Écriture": "13 400 Mo/s", "Endurance": "1200 TBW", "Format": "M.2 2280"},
    },
    {
        "name": "WD_Black SN8100 2 To Gen5",
        "brand": "Western Digital", "category": "storage", "price": 229.00, "old_price": 259.00,
        "stock": 22, "rating": 4.7, "featured": False, "badge": "Promo",
        "description": "Le SSD gaming Gen5 le plus efficient : 14 500 Mo/s sans chauffe excessive, idéal DirectStorage.",
        "specs": {"Capacité": "2 To", "Interface": "PCIe 5.0 x4", "Lecture": "14 500 Mo/s", "Écriture": "12 700 Mo/s", "Endurance": "1200 TBW", "Format": "M.2 2280"},
    },
    {
        "name": "T705 1 To PCIe 5.0",
        "brand": "Crucial", "category": "storage", "price": 149.00, "old_price": None,
        "stock": 35, "rating": 4.6, "featured": False, "badge": None,
        "description": "Le Gen5 accessible : 13 600 Mo/s pour donner un coup de fouet à n'importe quelle config AM5.",
        "specs": {"Capacité": "1 To", "Interface": "PCIe 5.0 x4", "Lecture": "13 600 Mo/s", "Écriture": "10 200 Mo/s", "Endurance": "600 TBW", "Format": "M.2 2280"},
    },
    {
        "name": "990 Pro 4 To",
        "brand": "Samsung", "category": "storage", "price": 299.00, "old_price": 349.00,
        "stock": 17, "rating": 4.9, "featured": False, "badge": "Top vente",
        "description": "4 To de fiabilité légendaire en PCIe 4.0 : la bibliothèque de jeux entière sur un seul M.2.",
        "specs": {"Capacité": "4 To", "Interface": "PCIe 4.0 x4", "Lecture": "7 450 Mo/s", "Écriture": "6 900 Mo/s", "Endurance": "2400 TBW", "Format": "M.2 2280"},
    },

    # ─── Cartes mères ────────────────────────────────────────────────
    {
        "name": "ROG Crosshair X870E Hero",
        "brand": "ASUS", "category": "motherboard", "price": 699.00, "old_price": None,
        "stock": 9, "rating": 4.8, "featured": False, "badge": "Flagship",
        "description": "AM5 sans limite : VRM 18+2+2, double USB4, 5 M.2 dont 2 Gen5, PCIe 5.0 x16 renforcé.",
        "specs": {"Socket": "AM5", "Chipset": "X870E", "Format": "ATX", "Mémoire": "4x DDR5 8000+", "M.2": "5 slots (2x Gen5)", "Réseau": "WiFi 7 + 5 GbE", "socket": "AM5", "ram_type": "DDR5", "form_factor": "ATX"},
    },
    {
        "name": "MAG X870 Tomahawk WiFi",
        "brand": "MSI", "category": "motherboard", "price": 329.00, "old_price": 359.00,
        "stock": 24, "rating": 4.7, "featured": True, "badge": "Top vente",
        "description": "Le meilleur choix AM5 milieu de gamme : VRM costaud, USB4, WiFi 7, sans fioritures inutiles.",
        "specs": {"Socket": "AM5", "Chipset": "X870", "Format": "ATX", "Mémoire": "4x DDR5 8000+", "M.2": "4 slots (1x Gen5)", "Réseau": "WiFi 7 + 2.5 GbE", "socket": "AM5", "ram_type": "DDR5", "form_factor": "ATX"},
    },
    {
        "name": "B850 Aorus Elite WiFi7",
        "brand": "Gigabyte", "category": "motherboard", "price": 219.00, "old_price": None,
        "stock": 31, "rating": 4.6, "featured": False, "badge": None,
        "description": "L'essentiel AM5 bien exécuté : PCIe 5.0 GPU + SSD, WiFi 7, parfaite pour un 9800X3D.",
        "specs": {"Socket": "AM5", "Chipset": "B850", "Format": "ATX", "Mémoire": "4x DDR5 8000+", "M.2": "3 slots (1x Gen5)", "Réseau": "WiFi 7 + 2.5 GbE", "socket": "AM5", "ram_type": "DDR5", "form_factor": "ATX"},
    },
    {
        "name": "ROG Maximus Z890 Hero",
        "brand": "ASUS", "category": "motherboard", "price": 729.00, "old_price": None,
        "stock": 6, "rating": 4.7, "featured": False, "badge": None,
        "description": "LGA1851 premium pour Core Ultra : Thunderbolt 4, 6 M.2, DDR5 9000+ en OC.",
        "specs": {"Socket": "LGA1851", "Chipset": "Z890", "Format": "ATX", "Mémoire": "4x DDR5 9000+", "M.2": "6 slots (2x Gen5)", "Réseau": "WiFi 7 + 5 GbE", "socket": "LGA1851", "ram_type": "DDR5", "form_factor": "ATX"},
    },
    {
        "name": "PRO Z890-A WiFi",
        "brand": "MSI", "category": "motherboard", "price": 259.00, "old_price": 289.00,
        "stock": 20, "rating": 4.5, "featured": False, "badge": "Promo",
        "description": "Z890 sobre et complète pour Core Ultra 200 : 4 M.2, WiFi 7, VRM 14+1+1 fiable.",
        "specs": {"Socket": "LGA1851", "Chipset": "Z890", "Format": "ATX", "Mémoire": "4x DDR5 8400+", "M.2": "4 slots (1x Gen5)", "Réseau": "WiFi 7 + 2.5 GbE", "socket": "LGA1851", "ram_type": "DDR5", "form_factor": "ATX"},
    },

    # ─── Alimentations ───────────────────────────────────────────────
    {
        "name": "RM1000x Shift ATX 3.1",
        "brand": "Corsair", "category": "psu", "price": 199.00, "old_price": None,
        "stock": 27, "rating": 4.8, "featured": False, "badge": "Top vente",
        "description": "1000 W Gold avec connecteurs latéraux brevetés : le câble management enfin simple, 12V-2x6 natif.",
        "specs": {"Puissance": "1000 W", "Certification": "80+ Gold", "Norme": "ATX 3.1", "PCIe 5.1": "1x 12V-2x6 600 W", "Modulaire": "Full", "Garantie": "10 ans", "watts": 1000},
    },
    {
        "name": "Dark Power 13 1300W",
        "brand": "be quiet!", "category": "psu", "price": 329.00, "old_price": None,
        "stock": 8, "rating": 4.9, "featured": False, "badge": "Flagship",
        "description": "Titanium 1300 W quasi inaudible : pour RTX 5090 et configs HEDT sans aucun compromis.",
        "specs": {"Puissance": "1300 W", "Certification": "80+ Titanium", "Norme": "ATX 3.0", "PCIe 5.0": "2x 12VHPWR 600 W", "Modulaire": "Full", "Garantie": "10 ans", "watts": 1300},
    },
    {
        "name": "Focus GX-850 ATX 3.1",
        "brand": "Seasonic", "category": "psu", "price": 139.00, "old_price": 159.00,
        "stock": 33, "rating": 4.7, "featured": False, "badge": "Promo",
        "description": "La fiabilité Seasonic en 850 W Gold ATX 3.1 : le choix rationnel pour 90 % des configs.",
        "specs": {"Puissance": "850 W", "Certification": "80+ Gold", "Norme": "ATX 3.1", "PCIe 5.1": "1x 12V-2x6 450 W", "Modulaire": "Full", "Garantie": "10 ans", "watts": 850},
    },
    {
        "name": "C750 Gold",
        "brand": "NZXT", "category": "psu", "price": 99.00, "old_price": None,
        "stock": 41, "rating": 4.5, "featured": False, "badge": None,
        "description": "750 W Gold full modulaire au prix plancher : parfait jusqu'à une RTX 5070 Ti.",
        "specs": {"Puissance": "750 W", "Certification": "80+ Gold", "Norme": "ATX 3.0", "PCIe": "1x 12VHPWR 450 W", "Modulaire": "Full", "Garantie": "7 ans", "watts": 750},
    },

    # ─── Boîtiers ────────────────────────────────────────────────────
    {
        "name": "O11 Dynamic EVO XL",
        "brand": "Lian Li", "category": "case", "price": 219.00, "old_price": None,
        "stock": 13, "rating": 4.9, "featured": True, "badge": "Top vente",
        "description": "La vitrine ultime : double chambre, verre panoramique, jusqu'à 3 radiateurs 360 mm.",
        "specs": {"Format": "E-ATX / ATX / mATX", "GPU max": "460 mm", "Radiateurs": "3x 360 mm", "Façade": "Verre trempé", "Baies": "4x 2.5\" + 2x 3.5\"", "max_gpu_mm": 460},
    },
    {
        "name": "North XL Charcoal",
        "brand": "Fractal Design", "category": "case", "price": 169.00, "old_price": None,
        "stock": 19, "rating": 4.8, "featured": False, "badge": "Nouveau",
        "description": "Façade en noyer véritable et mesh : le boîtier scandinave qui réconcilie salon et setup.",
        "specs": {"Format": "E-ATX / ATX / mATX", "GPU max": "413 mm", "Radiateurs": "360 + 280 mm", "Façade": "Bois + mesh", "Ventilateurs inclus": "3x 140 mm", "max_gpu_mm": 413},
    },
    {
        "name": "H9 Flow RGB",
        "brand": "NZXT", "category": "case", "price": 159.00, "old_price": 189.00,
        "stock": 25, "rating": 4.6, "featured": False, "badge": "Promo",
        "description": "Double chambre épuré avec 3 ventilateurs RGB Core inclus et vue panoramique sans montant.",
        "specs": {"Format": "ATX / mATX / ITX", "GPU max": "435 mm", "Radiateurs": "2x 360 mm", "Façade": "Verre + mesh", "Ventilateurs inclus": "3x 120 mm RGB", "max_gpu_mm": 435},
    },
    {
        "name": "Dark Base Pro 901",
        "brand": "be quiet!", "category": "case", "price": 269.00, "old_price": None,
        "stock": 7, "rating": 4.7, "featured": False, "badge": None,
        "description": "La forteresse du silence : panneaux insonorisés, façade interchangeable mesh/silence, ARGB discret.",
        "specs": {"Format": "E-ATX / ATX / mATX", "GPU max": "430 mm", "Radiateurs": "420 + 360 mm", "Façade": "Interchangeable", "Ventilateurs inclus": "3x Silent Wings 4", "max_gpu_mm": 430},
    },

    # ─── Refroidissement ─────────────────────────────────────────────
    {
        "name": "Liquid Freezer III 360 A-RGB",
        "brand": "Arctic", "category": "cooling", "price": 119.00, "old_price": 139.00,
        "stock": 36, "rating": 4.9, "featured": True, "badge": "Top vente",
        "description": "L'AIO 360 au rapport perf/prix imbattable : VRM fan intégré, montage AM5 à offset natif.",
        "specs": {"Type": "AIO 360 mm", "Sockets": "AM5 / AM4 / LGA1851 / LGA1700", "Ventilateurs": "3x P12 PWM A-RGB", "Pompe": "2800 tr/min", "TDP supporté": "350 W+", "sockets": ["AM5", "LGA1851"]},
    },
    {
        "name": "Kraken Elite 360 RGB LCD",
        "brand": "NZXT", "category": "cooling", "price": 299.00, "old_price": None,
        "stock": 11, "rating": 4.6, "featured": False, "badge": "Flagship",
        "description": "Écran LCD 2.36\" personnalisable sur la pompe : affichez températures, GIF ou monitoring en direct.",
        "specs": {"Type": "AIO 360 mm", "Sockets": "AM5 / AM4 / LGA1851 / LGA1700", "Ventilateurs": "3x F120 RGB Core", "Écran": "LCD 2.36\" 640x640", "TDP supporté": "330 W+", "sockets": ["AM5", "LGA1851"]},
    },
    {
        "name": "NH-D15 G2",
        "brand": "Noctua", "category": "cooling", "price": 149.00, "old_price": None,
        "stock": 23, "rating": 4.9, "featured": False, "badge": None,
        "description": "La légende du refroidissement à air, version 2 : 8 caloducs, deux NF-A14x25r G2, silence absolu.",
        "specs": {"Type": "Ventirad double tour", "Sockets": "AM5 / AM4 / LGA1851 / LGA1700", "Ventilateurs": "2x NF-A14x25r G2", "Hauteur": "168 mm", "TDP supporté": "300 W", "sockets": ["AM5", "LGA1851"]},
    },
    {
        "name": "iCUE Link Titan 360 RX RGB",
        "brand": "Corsair", "category": "cooling", "price": 239.00, "old_price": 259.00,
        "stock": 16, "rating": 4.7, "featured": False, "badge": "Promo",
        "description": "L'écosystème iCUE Link : un seul câble pour tout l'AIO, pompe FlowDrive et RX120 RGB chaînés.",
        "specs": {"Type": "AIO 360 mm", "Sockets": "AM5 / AM4 / LGA1851 / LGA1700", "Ventilateurs": "3x RX120 RGB", "Pompe": "FlowDrive", "TDP supporté": "350 W+", "sockets": ["AM5", "LGA1851"]},
    },

    # ─── Écrans ──────────────────────────────────────────────────────
    {
        "name": "UltraGear 27GX790A OLED 27\" 480 Hz",
        "brand": "LG", "category": "monitor", "price": 999.00, "old_price": None,
        "stock": 11, "rating": 4.8, "featured": True, "badge": "Nouveau",
        "description": "OLED 1440p à 480 Hz : le summum absolu de la fluidité compétitive, temps de réponse 0,03 ms.",
        "specs": {"Dalle": "OLED 26,5\"", "Définition": "2560 × 1440", "Fréquence": "480 Hz", "Réponse": "0,03 ms", "HDR": "DisplayHDR True Black 400", "Connectique": "DP 2.1 + 2x HDMI 2.1"},
    },
    {
        "name": "Odyssey OLED G9 49\" DQHD",
        "brand": "Samsung", "category": "monitor", "price": 1299.00, "old_price": 1499.00,
        "stock": 6, "rating": 4.7, "featured": False, "badge": "Promo",
        "description": "49 pouces incurvés QD-OLED 240 Hz : l'immersion totale, deux écrans 27\" sans bordure au milieu.",
        "specs": {"Dalle": "QD-OLED 49\" 1800R", "Définition": "5120 × 1440", "Fréquence": "240 Hz", "Réponse": "0,03 ms", "HDR": "VESA TrueBlack 400", "Connectique": "DP 2.1 + HDMI 2.1"},
    },
    {
        "name": "ROG Swift PG27UCDM 4K OLED",
        "brand": "ASUS", "category": "monitor", "price": 1099.00, "old_price": None,
        "stock": 8, "rating": 4.8, "featured": False, "badge": "Flagship",
        "description": "27\" 4K QD-OLED 240 Hz : la netteté d'un écran pro et la réactivité d'une dalle e-sport.",
        "specs": {"Dalle": "QD-OLED 26,5\"", "Définition": "3840 × 2160", "Fréquence": "240 Hz", "Réponse": "0,03 ms", "HDR": "DisplayHDR 400 TB", "Connectique": "DP 2.1a + USB-C 90 W"},
    },
    {
        "name": "Alienware AW2725DF QD-OLED 360 Hz",
        "brand": "Dell", "category": "monitor", "price": 649.00, "old_price": None,
        "stock": 17, "rating": 4.8, "featured": False, "badge": "Top vente",
        "description": "Le QD-OLED 1440p 360 Hz au prix le plus agressif du marché — le choix des joueurs compétitifs.",
        "specs": {"Dalle": "QD-OLED 26,7\"", "Définition": "2560 × 1440", "Fréquence": "360 Hz", "Réponse": "0,03 ms", "HDR": "VESA TrueBlack 400", "Connectique": "DP 1.4 + 2x HDMI 2.1"},
    },
    {
        "name": "Gaming 24G4X 24\" IPS 180 Hz",
        "brand": "AOC", "category": "monitor", "price": 149.00, "old_price": None,
        "stock": 42, "rating": 4.5, "featured": False, "badge": None,
        "description": "La référence petit budget : IPS 1080p 180 Hz, couleurs justes et latence minimale pour moins de 150 €.",
        "specs": {"Dalle": "IPS 23,8\"", "Définition": "1920 × 1080", "Fréquence": "180 Hz", "Réponse": "1 ms", "Synchro": "Adaptive-Sync", "Connectique": "DP 1.4 + 2x HDMI 2.0"},
    },
    {
        "name": "MAG 274QRF QD E2 27\" 1440p",
        "brand": "MSI", "category": "monitor", "price": 329.00, "old_price": 379.00,
        "stock": 23, "rating": 4.6, "featured": False, "badge": "Promo",
        "description": "Rapid IPS Quantum Dot 180 Hz : le 1440p polyvalent parfait entre jeu, travail et création.",
        "specs": {"Dalle": "Rapid IPS QD 27\"", "Définition": "2560 × 1440", "Fréquence": "180 Hz", "Réponse": "1 ms", "Couleurs": "147 % sRGB", "Connectique": "DP 1.4a + USB-C 65 W"},
    },

    # ─── Claviers ────────────────────────────────────────────────────
    {
        "name": "80HE analogique",
        "brand": "Wooting", "category": "keyboard", "price": 199.00, "old_price": None,
        "stock": 9, "rating": 4.9, "featured": True, "badge": "Flagship",
        "description": "Touches magnétiques à effet Hall : point d'activation réglable, rapid trigger — l'arme secrète des pros.",
        "specs": {"Format": "80 % (TKL)", "Switches": "Lekker à effet Hall", "Activation": "0,1 – 4,0 mm réglable", "Fonctions": "Rapid Trigger", "Connexion": "USB-C filaire", "Rétroéclairage": "RGB par touche"},
    },
    {
        "name": "Q1 Max QMK sans fil",
        "brand": "Keychron", "category": "keyboard", "price": 219.00, "old_price": None,
        "stock": 14, "rating": 4.7, "featured": False, "badge": None,
        "description": "Châssis aluminium CNC, montage gasket, QMK/VIA : le clavier custom prêt à l'emploi.",
        "specs": {"Format": "75 %", "Switches": "Gateron Jupiter (hot-swap)", "Châssis": "Aluminium CNC", "Connexion": "2,4 GHz + BT + USB-C", "Programmation": "QMK / VIA", "Batterie": "4000 mAh"},
    },
    {
        "name": "G915 X Lightspeed TKL",
        "brand": "Logitech", "category": "keyboard", "price": 229.00, "old_price": None,
        "stock": 18, "rating": 4.6, "featured": False, "badge": None,
        "description": "Profil bas, switches GL V2 et triple connectivité : l'élégance productive qui sait aussi jouer.",
        "specs": {"Format": "TKL profil bas", "Switches": "GL Tactile V2", "Connexion": "Lightspeed + BT + USB-C", "Batterie": "36 h RGB allumé", "Châssis": "Alliage brossé", "Rétroéclairage": "RGB Lightsync"},
    },
    {
        "name": "Huntsman V3 Pro TKL",
        "brand": "Razer", "category": "keyboard", "price": 179.00, "old_price": 219.00,
        "stock": 21, "rating": 4.6, "featured": False, "badge": "Promo",
        "description": "Switches optiques analogiques gen 2 avec rapid trigger : la réponse de Razer à l'e-sport moderne.",
        "specs": {"Format": "TKL", "Switches": "Optiques analogiques Gen-2", "Activation": "0,1 – 4,0 mm réglable", "Fonctions": "Rapid Trigger", "Connexion": "USB-C filaire", "Repose-poignets": "Magnétique inclus"},
    },

    # ─── Souris ──────────────────────────────────────────────────────
    {
        "name": "G Pro X Superlight 2",
        "brand": "Logitech", "category": "mouse", "price": 159.00, "old_price": None,
        "stock": 31, "rating": 4.8, "featured": True, "badge": "Top vente",
        "description": "60 grammes, capteur Hero 2 à 32 000 DPI, 95 h d'autonomie : la souris la plus titrée de l'e-sport.",
        "specs": {"Poids": "60 g", "Capteur": "Hero 2 — 32 000 DPI", "Boutons": "5", "Connexion": "Lightspeed 2,4 GHz", "Autonomie": "95 h", "Polling": "2000 Hz (4000 via dongle)"},
    },
    {
        "name": "Viper V3 Pro",
        "brand": "Razer", "category": "mouse", "price": 169.00, "old_price": None,
        "stock": 24, "rating": 4.8, "featured": False, "badge": None,
        "description": "54 g, polling 8000 Hz natif et capteur Focus Pro 35K : taillée pour le tir compétitif.",
        "specs": {"Poids": "54 g", "Capteur": "Focus Pro 35K Gen-2", "Boutons": "6", "Connexion": "HyperSpeed 2,4 GHz", "Autonomie": "95 h", "Polling": "8000 Hz"},
    },
    {
        "name": "EC2-CW sans fil",
        "brand": "Zowie", "category": "mouse", "price": 129.00, "old_price": None,
        "stock": 16, "rating": 4.7, "featured": False, "badge": None,
        "description": "La forme ergonomique culte de BenQ Zowie enfin sans fil — plug & play, zéro logiciel.",
        "specs": {"Poids": "77 g", "Capteur": "3370 — 3200 DPI", "Boutons": "5", "Connexion": "2,4 GHz (récepteur renforcé)", "Autonomie": "70 h", "Philosophie": "Aucun driver requis"},
    },
    {
        "name": "Aerox 5 Wireless",
        "brand": "SteelSeries", "category": "mouse", "price": 99.00, "old_price": 139.00,
        "stock": 27, "rating": 4.5, "featured": False, "badge": "Promo",
        "description": "9 boutons programmables et 74 g seulement : la polyvalente ajourée pour MOBA, MMO et FPS.",
        "specs": {"Poids": "74 g", "Capteur": "TrueMove Air — 18 000 DPI", "Boutons": "9", "Connexion": "Quantum 2.0 + BT", "Autonomie": "180 h", "Étanchéité": "AquaBarrier IP54"},
    },

    # ─── Casques audio ───────────────────────────────────────────────
    {
        "name": "Arctis Nova Pro Wireless",
        "brand": "SteelSeries", "category": "headset", "price": 349.00, "old_price": None,
        "stock": 12, "rating": 4.7, "featured": True, "badge": "Flagship",
        "description": "Double batterie échangeable à chaud, ANC, base DAC : le casque sans fil de référence absolue.",
        "specs": {"Transducteurs": "40 mm néodyme", "Connexion": "2,4 GHz + Bluetooth simultanés", "ANC": "Active 4 micros", "Autonomie": "Infinie (2 batteries)", "Micro": "ClearCast Gen 2 rétractable", "Base": "GameDAC Hi-Res"},
    },
    {
        "name": "Cloud III Wireless",
        "brand": "HyperX", "category": "headset", "price": 129.00, "old_price": None,
        "stock": 33, "rating": 4.6, "featured": False, "badge": "Top vente",
        "description": "120 h d'autonomie et le confort légendaire HyperX : le sans-fil endurance au prix juste.",
        "specs": {"Transducteurs": "53 mm inclinés", "Connexion": "2,4 GHz USB-C/A", "Autonomie": "120 h", "Micro": "10 mm antibruit amovible", "Poids": "330 g", "Compatibilité": "PC / PS5 / Switch"},
    },
    {
        "name": "G Pro X 2 Lightspeed",
        "brand": "Logitech", "category": "headset", "price": 229.00, "old_price": None,
        "stock": 15, "rating": 4.6, "featured": False, "badge": None,
        "description": "Transducteurs graphène 50 mm, DTS:X 2.0 et 50 h d'autonomie dans un châssis aluminium pivotant.",
        "specs": {"Transducteurs": "Graphène 50 mm", "Connexion": "Lightspeed + BT + jack", "Autonomie": "50 h", "Micro": "6 mm cardioïde amovible", "Surround": "DTS Headphone:X 2.0", "Poids": "345 g"},
    },
    {
        "name": "ATH-M50xSTS StreamSet",
        "brand": "Audio-Technica", "category": "headset", "price": 199.00, "old_price": None,
        "stock": 10, "rating": 4.7, "featured": False, "badge": "Nouveau",
        "description": "Le casque studio culte M50x marié à un micro broadcast 20 series : le StreamSet des créateurs.",
        "specs": {"Transducteurs": "45 mm studio", "Micro": "Cardioïde broadcast", "Connexion": "USB-C (DAC intégré) ou XLR/jack", "Retour": "Monitoring direct", "Poids": "315 g", "Usage": "Stream / studio / jeu"},
    },

    # ─── Renforts composants ─────────────────────────────────────────
    {
        "name": "Ryzen 9 9900X",
        "brand": "AMD", "category": "cpu", "price": 449.00, "old_price": None,
        "stock": 19, "rating": 4.7, "featured": False, "badge": None,
        "description": "12 cœurs Zen 5 à 120 W seulement : la puissance multi-cœur efficiente pour créer et compiler.",
        "specs": {"Socket": "AM5", "Cœurs / Threads": "12 / 24", "Boost": "5.6 GHz", "Cache": "76 Mo", "TDP": "120 W", "socket": "AM5", "tdp_w": 120},
    },
    {
        "name": "Core Ultra 7 265K",
        "brand": "Intel", "category": "cpu", "price": 449.00, "old_price": 489.00,
        "stock": 22, "rating": 4.5, "featured": False, "badge": "Promo",
        "description": "20 cœurs Arrow Lake : le cœur de gamme Intel qui excelle en productivité multitâche.",
        "specs": {"Socket": "LGA1851", "Cœurs / Threads": "20 / 20", "Boost": "5.5 GHz", "Cache": "30 Mo", "TDP": "125 W", "socket": "LGA1851", "tdp_w": 125},
    },
    {
        "name": "Flare X5 64 Go DDR5-6000 CL30",
        "brand": "G.Skill", "category": "ram", "price": 219.00, "old_price": None,
        "stock": 20, "rating": 4.8, "featured": False, "badge": None,
        "description": "2x32 Go optimisés AMD EXPO, profil bas compatible gros ventirads : la capacité sans compromis.",
        "specs": {"Capacité": "64 Go (2x32)", "Type": "DDR5", "Fréquence": "6000 MT/s", "Latence": "CL30", "Profils": "EXPO", "Hauteur": "33 mm", "ram_type": "DDR5"},
    },
    {
        "name": "P3 Plus 4 To PCIe 4.0",
        "brand": "Crucial", "category": "storage", "price": 219.00, "old_price": 249.00,
        "stock": 26, "rating": 4.5, "featured": False, "badge": "Promo",
        "description": "4 To en NVMe à prix plancher : la solution capacité pour bibliothèques de jeux gourmandes.",
        "specs": {"Capacité": "4 To", "Interface": "PCIe 4.0 x4", "Lecture": "4 800 Mo/s", "Écriture": "4 100 Mo/s", "Endurance": "800 TBW", "Format": "M.2 2280"},
    },
    {
        "name": "WD_Black SN770 1 To",
        "brand": "Western Digital", "category": "storage", "price": 79.00, "old_price": None,
        "stock": 48, "rating": 4.6, "featured": False, "badge": "Top vente",
        "description": "Le SSD gaming au meilleur rapport perf/prix : 5 150 Mo/s sans DRAM mais avec du génie.",
        "specs": {"Capacité": "1 To", "Interface": "PCIe 4.0 x4", "Lecture": "5 150 Mo/s", "Écriture": "4 900 Mo/s", "Endurance": "600 TBW", "Format": "M.2 2280"},
    },
    {
        "name": "SF750 Platinum SFX",
        "brand": "Corsair", "category": "psu", "price": 159.00, "old_price": None,
        "stock": 13, "rating": 4.8, "featured": False, "badge": None,
        "description": "750 W au format SFX pour les builds compacts : Platinum, full modulaire, ventilateur semi-passif.",
        "specs": {"Puissance": "750 W", "Certification": "80+ Platinum", "Format": "SFX", "Modulaire": "Full", "Ventilateur": "92 mm semi-passif", "Garantie": "7 ans", "watts": 750},
    },
    {
        "name": "H6 Flow RGB compact",
        "brand": "NZXT", "category": "case", "price": 119.00, "old_price": None,
        "stock": 28, "rating": 4.6, "featured": False, "badge": None,
        "description": "Double chambre compacte avec façade d'angle panoramique et 3 ventilateurs RGB de série.",
        "specs": {"Format": "ATX / mATX / ITX", "GPU max": "365 mm", "Radiateurs": "360 mm latéral + 240 mm", "Façade": "Verre d'angle", "Ventilateurs inclus": "3x 120 mm RGB", "max_gpu_mm": 365},
    },
    {
        "name": "Peerless Assassin 120 SE",
        "brand": "Thermalright", "category": "cooling", "price": 45.00, "old_price": None,
        "stock": 55, "rating": 4.8, "featured": False, "badge": "Top vente",
        "description": "Le ventirad double tour qui a humilié des AIO trois fois plus chers — le roi du rapport perf/prix.",
        "specs": {"Type": "Ventirad double tour", "Sockets": "AM5 / AM4 / LGA1851 / LGA1700", "Ventilateurs": "2x TL-C12C PWM", "Hauteur": "155 mm", "TDP supporté": "245 W", "sockets": ["AM5", "LGA1851"]},
    },
]

SEED_REVIEWS = [
    ("GeForce RTX 5090 Suprim Liquid 32G", "Maxime R.", 5, "Monstrueuse. Cyberpunk en path tracing 4K à 120 fps avec DLSS 4, et l'AIO la garde sous 60°C. Aucun regret."),
    ("GeForce RTX 5090 Suprim Liquid 32G", "Léa D.", 5, "Pour la 3D et l'IA en local, les 32 Go changent tout. Silencieuse, énorme, parfaite."),
    ("GeForce RTX 3060 Twin Edge", "Lucas M.", 4, "Très bonne carte pour le 1080p. Les 12 Go de VRAM rassurent pour l'avenir, même si elle commence à fatiguer sur les derniers triples A."),
    ("GeForce RTX 3060 Ti Eagle", "Valentin G.", 5, "Le roi du rapport performances/prix de sa génération. Fait encore tourner la majorité de mes jeux en 1440p sans problème."),
    ("GeForce RTX 3070 Twin Edge", "Thomas B.", 4, "Parfaite en 1440p. Elle chauffe un peu dans ce format compact mais les performances globales restent super stables."),
    ("GeForce RTX 3070 Ti Gaming Trio", "Alexandre M.", 4, "Excellentes performances mais attention à la consommation. Le système à triple ventilateur de MSI fait bien son travail."),
    ("GeForce RTX 3080 Gaming Trio", "Julien V.", 5, "Une bête de course en rasterisation brute. En 1440p ultra ou 4K avec concessions, elle encaisse encore tout très bien."),
    ("GeForce RTX 3080 Ti Ventus", "Sébastien L.", 5, "Quasiment les performances d'une 3090 pour le jeu. Les 12 Go de VRAM sont parfaits pour le modding sur de nombreux jeux."),
    ("GeForce RTX 3090 ROG Strix", "Nicolas P.", 5, "Achetée principalement pour du montage vidéo lourd et de la 3D, les 24 Go sont indispensables. Le refroidissement Strix est massif."),
    ("GeForce RTX 3090 Ti SUPRIM", "Guillaume F.", 5, "Une puissance colossale pour clore la génération Ampere. Un peu bruyante à pleine charge mais aucun ralentissement."),
    ("GeForce RTX 4060 Windforce", "Sarah K.", 4, "Consommation ridicule, elle ne chauffe pas du tout. Le DLSS 3 fait de véritables miracles sur les jeux gourmands en 1080p."),
    ("GeForce RTX 4060 Ti Dual", "Maxime B.", 4, "Idéale pour un petit boîtier ITX. Les technologies de génération de frames sauvent la mise sur les titres récents."),
    ("GeForce RTX 4070 Dual", "Antoine L.", 5, "Le meilleur compromis pour jouer en QHD. Silencieuse, sobre et compatible avec toutes les dernières innovations de Nvidia."),
    ("GeForce RTX 4070 Ti TUF Gaming", "Hugo J.", 5, "La construction TUF est ultra robuste. Les températures restent extrêmement basses même après de longues sessions de jeu."),
    ("GeForce RTX 4080 JetStream", "Mathieu G.", 5, "La 4K native avec Ray Tracing devient enfin fluide et agréable sans concession. Design sobre sans trop de RGB."),
    ("GeForce RTX 4090 ROG Strix", "Romain D.", 5, "Une puissance brute hallucinante. C'est cher et gigantesque, mais ça encaisse absolument tout en 4K ultra sans sourciller."),
    ("GeForce RTX 5070 Gaming", "Chloé M.", 5, "Excellente surprise pour cette architecture Blackwell. Moins gourmande et des performances très solides grâce à la GDDR7."),
    ("GeForce RTX 5070 Ti Gaming", "Arthur P.", 5, "Le véritable point d'équilibre de cette année. Des perfs stratosphériques pour un tarif qui reste cohérent par rapport à la 5090."),
    ("GeForce RTX 5080 TUF Gaming", "Damien R.", 5, "Le DLSS 4 est bluffant sur les moteurs récents. La carte est magnifiquement construite, lourde mais refroidie à la perfection."),
    ("GeForce RTX 5090 Suprim", "Maxime R.", 5, "Monstrueuse. Cyberpunk en path tracing 4K à plus de 120 fps stables, la carte ne tremble jamais. Un autre monde."),
    ("Ryzen 7 9800X3D", "Thomas B.", 5, "Upgrade depuis un 5800X3D : +40% de fps en simu. Le meilleur CPU gaming, point."),
    ("Ryzen 7 9800X3D", "Sarah K.", 5, "Monté avec une Tomahawk X870, EXPO activé, zéro souci. Il chauffe même moins que prévu."),
    ("Trident Z5 RGB 32 Go DDR5-6400 CL30", "Hugo M.", 5, "Le kit recommandé partout pour Ryzen 9000, et c'est mérité. EXPO stable du premier coup."),
    ("Liquid Freezer III 360 A-RGB", "Antoine P.", 5, "Refroidit un 9950X3D sans broncher pour le prix d'un ventirad premium. Imbattable."),
    ("O11 Dynamic EVO XL", "Julie V.", 5, "Montage d'une config full watercooling un régal. La visibilité est incroyable."),
    ("9100 Pro 2 To PCIe 5.0", "Nicolas F.", 4, "Débits hallucinants en bench. En usage réel, ça reste un SSD, mais quel SSD."),
    ("MAG X870 Tomahawk WiFi", "Romain G.", 5, "BIOS clair, VRM froids, USB4 en standard. Le meilleur rapport qualité/prix AM5."),
    ("Focus GX-850 ATX 3.1", "Camille T.", 5, "Seasonic, 10 ans de garantie, câble 12V-2x6 natif. On signe où ?"),
]

# Gammes abordables (generations precedentes / entree de gamme)
from seed_budget import BUDGET_PRODUCTS  # noqa: E402
SEED_PRODUCTS.extend(BUDGET_PRODUCTS)

# Remplacement complet de la gamme processeurs (Ryzen reels)
from seed_cpu import CPU_PRODUCTS  # noqa: E402
SEED_PRODUCTS[:] = [p for p in SEED_PRODUCTS if p['category'] != 'cpu'] + CPU_PRODUCTS

# Gamme processeurs Intel (Core i3/i5/i7/i9 + Core Ultra)
from seed_intel import INTEL_PRODUCTS  # noqa: E402
SEED_PRODUCTS.extend(INTEL_PRODUCTS)

# Extension massive du catalogue (toutes categories)
from seed_extra import EXTRA_PRODUCTS  # noqa: E402
SEED_PRODUCTS.extend(EXTRA_PRODUCTS)

# Assortiment "vrai revendeur" : ajouts sur toutes les categories
from seed_catalog_plus import CATALOG_PLUS_PRODUCTS  # noqa: E402
SEED_PRODUCTS.extend(CATALOG_PLUS_PRODUCTS)
