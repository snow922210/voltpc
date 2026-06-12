# -*- coding: utf-8 -*-
"""Score de performance par produit — pour le tri « performance » du catalogue.

Renvoie un nombre (plus haut = plus performant). Là où la performance se lit
dans les specs (CPU, RAM, stockage, alim, écran, refroidissement, carte mère),
on la calcule ; sinon on retombe sur le prix, excellent proxy de performance
au sein d'une même catégorie (GPU, boîtier, périphériques).
"""
import re

_CHIPSET_TIER = {
    "A520": 1, "A620": 1, "B450": 2, "B550": 3, "B650": 4, "B760": 4,
    "B850": 5, "B860": 5, "X570": 6, "Z790": 7, "X670": 7, "Z890": 8,
    "X870": 8, "X670E": 8, "X870E": 9,
}


def _num(s, default=0.0):
    """Premier nombre trouvé dans une chaîne (gère espaces et virgule décimale)."""
    m = re.search(r"\d[\d\s.]*", str(s).replace(",", "."))
    return float(m.group(0).replace(" ", "").rstrip(".")) if m else default


def _threads(s):
    """« 16 (8P+16E) / 32 » → 32 ; « 8 / 16 » → 16."""
    m = re.search(r"/\s*(\d+)", str(s))
    return float(m.group(1)) if m else _num(s)


def perf_score(category, specs, price, name=""):
    s = specs or {}
    try:
        if category == "cpu":
            th = _threads(s.get("Cœurs / Threads", ""))
            boost = _num(s.get("Boost", ""))
            cache = _num(s.get("Cache", ""))
            x3d = 400 if "X3D" in (name or "") else 0
            return th * 120 + boost * 150 + cache * 2 + x3d
        if category == "ram":
            cap = _num(s.get("Capacité", ""))
            freq = _num(s.get("Fréquence", ""))
            return cap * 200 + freq / 5
        if category == "storage":
            iface = str(s.get("Interface", ""))
            gen = 500 if "5.0" in iface else 400 if "4.0" in iface else 300 if "3.0" in iface else 100
            read = _num(s.get("Lecture", "")) or 50
            cap_raw = str(s.get("Capacité", ""))
            cap = _num(cap_raw)
            cap_to = cap if "To" in cap_raw else cap / 1000
            return gen + read / 50 + cap_to * 30
        if category == "psu":
            return _num(s.get("Puissance", ""))
        if category == "monitor":
            nums = re.findall(r"\d+", str(s.get("Définition", "")).replace(" ", ""))
            px = (int(nums[0]) * int(nums[1])) / 1_000_000 if len(nums) >= 2 else 2
            hz = _num(s.get("Fréquence", ""))
            oled = 200 if "OLED" in str(s.get("Dalle", "")) else 0
            return px * 60 + hz + oled
        if category == "cooling":
            return _num(s.get("TDP supporté", ""))
        if category == "motherboard":
            return _CHIPSET_TIER.get(str(s.get("Chipset", "")), 0) * 100 + (price or 0) / 10
    except Exception:
        pass
    # gpu, case, keyboard, mouse, headset → le prix est le meilleur proxy dispo
    return float(price or 0)
