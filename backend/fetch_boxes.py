# -*- coding: utf-8 -*-
"""Télécharge pour chaque produit une photo propre, en privilégiant
les photos d'emballage / studio (les fichiers « Verpackung », « box »
et les exports RAW studio de Commons sont les plus propres).

Aligné sur la numérotation actuelle de seed.py (48 produits).
Usage :  python fetch_boxes.py
"""
import json
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from fetch_images import OUT, api, download  # pause + retry 429 inclus

# id -> (requêtes, jetons dont l'un doit figurer dans le titre)
PRODUCTS = {
    1:  (["GeForce RTX 3060 Verpackung", "GeForce RTX 3060 box", "GeForce RTX 3060"], ["3060"]),
    2:  (["GeForce RTX 3060 Ti Verpackung", "GeForce RTX 3060 Ti"], ["3060"]),
    3:  (["Zotac GeForce RTX 3070", "Nvidia GeForce RTX 3070 Founders", "GeForce RTX 3070 graphics card"], ["3070"]),
    4:  (["GeForce RTX 3070 Ti Verpackung", "GeForce RTX 3070 Ti graphics card", "GeForce RTX 3070 Ti"], ["3070"]),
    5:  (["GeForce RTX 3080 Verpackung", "GeForce RTX 3080"], ["3080"]),
    6:  (["GeForce RTX 3080 Ti Verpackung", "GeForce RTX 3080 Ti graphics card", "GeForce RTX 3080 Ti"], ["3080"]),
    7:  (["ASUS ROG Strix RTX 3090", "GeForce RTX 3090 Verpackung", "GeForce RTX 3090"], ["3090"]),
    8:  (["MSI GeForce RTX 3090 Ti", "RTX 3090 Founders Edition", "GeForce RTX 3090 graphics card"], ["3090"]),
    9:  (["Gigabyte GeForce RTX 4060", "Inno3D GeForce RTX 4060", "GeForce RTX 4060 graphics card"], ["4060"]),
    10: (["ASUS GeForce RTX 4060 Ti", "GeForce RTX 4060 Ti graphics card", "GeForce RTX 4060 Ti"], ["4060"]),
    11: (["Gigabyte GeForce RTX 4070 Aero", "Palit GeForce RTX 4070", "GeForce RTX 4070 graphics card"], ["4070"]),
    12: (["ASUS TUF GeForce RTX 4070 Ti", "GeForce RTX 4070 Ti graphics card", "GeForce RTX 4070 Ti"], ["4070"]),
    13: (["Palit GeForce RTX 4080", "GeForce RTX 4080 Founders", "GeForce RTX 4080 graphics card"], ["4080"]),
    14: (["ASUS ROG Strix RTX 4090", "GeForce RTX 4090 Verpackung", "GeForce RTX 4090"], ["4090"]),
    15: (["GeForce RTX 5070 Verpackung", "GeForce RTX 5070"], ["5070"]),
    16: (["GeForce RTX 5070 Ti Verpackung", "GeForce RTX 5070 Ti"], ["5070"]),
    17: (["GeForce RTX 5080 Verpackung", "Nvidia GeForce RTX 5080", "RTX 5080 Founders Edition"], ["5080"]),
    18: (["GeForce RTX 5090 Verpackung", "MSI GeForce RTX 5090", "GeForce RTX 5090"], ["5090"]),
    19: (["Ryzen 7 9800X3D Verpackung", "Ryzen 7 9800X3D box", "Ryzen 7 9800X3D"], ["9800"]),
    20: (["Ryzen 9 9950X3D Verpackung", "Ryzen 9 9950X", "AMD Ryzen 9 box"], ["9950"]),
    21: (["Core Ultra 9 285K Verpackung", "Intel Core Ultra 9 285K", "Intel Core Ultra box"], ["285k", "ultra"]),
    22: (["Intel Core Ultra 5 245K", "Intel Core i5 CPU", "Intel Core processor LGA"], ["intel"]),
    23: (["Ryzen 5 9600X Verpackung", "Ryzen 5 9600X", "AMD Ryzen 5 box"], ["9600"]),
    24: (["Corsair Dominator Verpackung", "Corsair Dominator Platinum", "Corsair Dominator"], ["dominator"]),
    25: (["G.Skill Trident Z5 Verpackung", "G.Skill Trident Z5", "G.Skill Trident"], ["trident"]),
    26: (["Kingston Fury Beast DDR5", "Kingston Fury RAM", "Kingston HyperX RAM"], ["kingston"]),
    27: (["Corsair Vengeance DDR5 Verpackung", "Corsair Vengeance RGB DDR5", "Corsair Vengeance"], ["vengeance"]),
    28: (["Samsung 9100 Pro Verpackung", "Samsung 9100 Pro SSD", "Samsung 990 Pro Verpackung"], ["9100", "990"]),
    29: (["WD Black SN850X Verpackung", "WD Black box", "WD Black NVMe"], ["wd", "western"]),
    30: (["Crucial T705 Verpackung", "Crucial T700 SSD", "Crucial NVMe SSD"], ["crucial"]),
    31: (["Samsung 990 Pro Verpackung", "Samsung 990 Pro box", "Samsung 990 PRO"], ["990"]),
    32: (["ASUS ROG Crosshair X870E", "ASUS ROG Crosshair Verpackung", "ASUS ROG Crosshair"], ["crosshair"]),
    33: (["MSI MAG B550 Tomahawk", "MSI MAG motherboard", "MSI gaming motherboard"], ["msi"]),
    34: (["Gigabyte B850 Aorus", "Gigabyte Aorus Verpackung", "Gigabyte Aorus Elite"], ["aorus"]),
    35: (["ASUS ROG Maximus Z890", "ASUS ROG Maximus Verpackung", "ASUS ROG Maximus"], ["maximus"]),
    36: (["MSI PRO Z890", "MSI PRO motherboard Verpackung", "MSI motherboard"], ["msi"]),
    37: (["Corsair RM1000x Verpackung", "Corsair RM1000x", "Corsair RMx power supply"], ["rm1000", "rmx", "corsair"]),
    38: (["be quiet Dark Power 13", "be quiet Dark Power Verpackung", "be quiet Straight Power 12"], ["power"]),
    39: (["Seasonic Focus Verpackung", "Seasonic Focus GX", "Seasonic PSU boxes"], ["seasonic"]),
    40: (["NZXT power supply", "Full modular ATX power supply", "ATX power supply unit"], ["power"]),
    41: (["Lian Li O11 Dynamic Verpackung", "Lian Li O11 Dynamic EVO", "Lian Li O11"], ["o11", "lian"]),
    42: (["Fractal Design North", "Fractal Design Define", "Fractal Design Meshify"], ["fractal design"]),
    43: (["NZXT H9 Verpackung", "NZXT H9 Flow", "NZXT H500i case"], ["nzxt"]),
    44: (["be quiet Dark Base 900", "be quiet Dark Base 700", "be quiet Silent Base"], ["dark base", "silent base"]),
    45: (["Arctic Liquid Freezer III Verpackung", "Arctic Liquid Freezer III", "Arctic Liquid Freezer"], ["freezer"]),
    46: (["NZXT Kraken Elite Verpackung", "NZXT Kraken Elite", "NZXT Kraken"], ["kraken"]),
    47: (["Noctua NH-D15 G2 Verpackung", "Noctua NH-D15 G2", "Noctua NH-D15"], ["nh-d15", "noctua"]),
    48: (["Corsair iCUE Link Titan Verpackung", "Corsair iCUE Link AIO", "Corsair Wasserkühlung"], ["corsair"]),
    # Écrans
    49: (["LG UltraGear monitor", "LG UltraGear OLED", "LG gaming monitor"], ["ultragear", "lg "]),
    50: (["Samsung Odyssey G9", "Samsung Odyssey monitor", "Samsung curved monitor"], ["odyssey"]),
    51: (["ASUS ROG Swift monitor", "ASUS ROG Swift OLED", "ASUS gaming monitor"], ["swift", "rog"]),
    52: (["Alienware monitor", "Dell Alienware AW", "Alienware QD-OLED"], ["alienware"]),
    53: (["AOC gaming monitor", "AOC monitor 24", "AOC Agon monitor"], ["aoc"]),
    54: (["MSI MAG monitor", "MSI gaming monitor", "MSI Optix monitor"], ["msi"]),
    # Claviers
    55: (["Wooting keyboard", "Wooting 60HE", "Wooting two"], ["wooting"]),
    56: (["Keychron Q1", "Keychron keyboard", "Keychron mechanical"], ["keychron"]),
    57: (["Logitech G915", "Logitech G keyboard", "Logitech mechanical keyboard"], ["logitech"]),
    58: (["Razer Huntsman keyboard", "Razer BlackWidow keyboard", "Razer keyboard"], ["razer"]),
    # Souris
    59: (["Logitech G Pro X Superlight", "Logitech G Pro mouse", "Logitech gaming mouse"], ["logitech"]),
    60: (["Razer Viper mouse", "Razer Viper Ultimate", "Razer gaming mouse"], ["viper", "razer"]),
    61: (["Zowie EC2 mouse", "BenQ Zowie mouse", "Zowie mouse"], ["zowie"]),
    62: (["SteelSeries Aerox mouse", "SteelSeries Rival mouse", "SteelSeries mouse"], ["steelseries"]),
    # Casques
    63: (["SteelSeries Arctis headset", "SteelSeries Arctis Nova", "SteelSeries Arctis Pro"], ["arctis", "steelseries"]),
    64: (["HyperX Cloud headset", "HyperX Cloud II", "HyperX headset"], ["hyperx"]),
    65: (["Logitech G Pro X headset", "Logitech G headset", "Logitech gaming headset"], ["logitech"]),
    66: (["Audio-Technica ATH-M50x", "Audio-Technica headphones", "ATH-M50 headphones"], ["audio-technica", "ath-m50"]),
    # Renforts composants
    67: (["Ryzen 9 9900X", "AMD Ryzen 9 Verpackung", "AMD Ryzen 9 CPU"], ["9900", "ryzen 9"]),
    68: (["Intel Core Ultra 7 265K", "Intel Core Ultra 7", "Intel Core i7 CPU"], ["265k", "ultra 7", "core i7"]),
    69: (["G.Skill Flare X5", "G.Skill DDR5 RAM", "G.Skill memory"], ["skill"]),
    70: (["Crucial P3 SSD", "Crucial NVMe SSD", "Crucial SSD"], ["crucial"]),
    71: (["WD Black SN770", "WD Black NVMe", "Western Digital Black SSD"], ["wd", "western"]),
    72: (["Corsair SF750", "Corsair SFX power supply", "Corsair power supply"], ["corsair"]),
    73: (["NZXT H6 Flow", "NZXT H5 case", "NZXT computer case"], ["nzxt"]),
    74: (["Thermalright Peerless Assassin", "Thermalright cooler", "Thermalright CPU cooler"], ["thermalright"]),
}

# Jamais : paysages, animaux, salons/stands, captures vidéo, logos
BLACKLIST = ("geograph", "sparrow", "temple", "church", "river", "weir",
             "landscape", "mountain", "booth", "stage", "chair", "running",
             "video zum", "fps vp9", "kbit", "wnętrze", "geekerwan",
             "vergleich", "video über", "debüt", "评测", "badge", "logo",
             "birds", "icon")

# Bonus : prises studio façon Amazon (fond blanc, détouré, emballage)
STUDIO_HINTS = ("freisteller", "white background", "transparent", "cutout",
                "cut out", "product photo", "studio")
CLEAN_HINTS = ("verpackung", "box", "retail", "raw-export", "hdr", "packaging")


def find_clean(query: str, must: list[str]):
    """Cherche et classe les résultats : studio fond blanc > emballage > reste."""
    data = api({
        "action": "query", "format": "json", "list": "search",
        "srnamespace": 6, "srlimit": 12,
        "srsearch": f"{query} filetype:bitmap",
    })
    candidates = []
    for rank, hit in enumerate(data.get("query", {}).get("search", [])):
        title = hit["title"]
        low = title.lower()
        if not low.endswith((".jpg", ".jpeg", ".png")):
            continue
        if any(b in low for b in BLACKLIST):
            continue
        if not any(m in low for m in must):
            continue
        bonus = 0
        if any(h in low for h in STUDIO_HINTS):
            bonus += 20          # détouré / fond blanc : exactement le style Amazon
        if any(h in low for h in CLEAN_HINTS):
            bonus += 10          # photo d'emballage / studio
        if low.endswith(".png"):
            bonus += 3           # les PNG sont souvent des détourés
        candidates.append((-bonus, rank, title))
    candidates.sort()
    for _, _, title in candidates[:3]:
        info = api({
            "action": "query", "format": "json", "titles": title,
            "prop": "imageinfo", "iiprop": "url|size|extmetadata",
            "iiurlwidth": 700,
        })
        for page in info["query"]["pages"].values():
            ii = (page.get("imageinfo") or [{}])[0]
            thumb = ii.get("thumburl")
            if thumb and ii.get("width", 0) >= 400 and ii.get("height", 0) >= 300:
                meta = ii.get("extmetadata", {})
                licence = (meta.get("LicenseShortName", {}) or {}).get("value", "")
                return thumb, title, licence
    return None, None, None


def main():
    credits_path = OUT / "credits.json"
    credits = (json.loads(credits_path.read_text(encoding="utf-8"))
               if credits_path.exists() else {})
    missing = []
    for pid, (queries, must) in PRODUCTS.items():
        if (OUT / f"{pid}.jpg").exists():
            print(f"{pid:>2}: déjà présent, ignoré")
            continue
        found = False
        for q in queries:
            try:
                thumb, title, licence = find_clean(q, must)
                if thumb and download(thumb, OUT / f"{pid}.jpg"):
                    credits[str(pid)] = {"file": title, "license": licence, "query": q}
                    print(f"{pid:>2}: OK   {title[5:80]}")
                    found = True
                    break
            except Exception as e:
                print(f"{pid:>2}: erreur ({e})")
        if not found:
            missing.append(pid)
            print(f"{pid:>2}: AUCUNE IMAGE (fallback SVG)")
    credits_path.write_text(
        json.dumps(credits, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\nTerminé : {len(credits)} téléchargées, {len(missing)} manquantes {missing or ''}")


if __name__ == "__main__":
    main()
