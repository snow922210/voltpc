# -*- coding: utf-8 -*-
"""Télécharge une photo libre (Wikimedia Commons) pour chaque produit.

Usage :  python fetch_images.py
Les images arrivent dans frontend/images/{id}.jpg ; les crédits
(attribution des auteurs, licences Commons) dans frontend/images/credits.json.
"""
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

UA = {"User-Agent": "VoltPC-Demo/1.0 (projet de demonstration educatif)"}
PAUSE = 1.5  # secondes entre chaque requête (limite de débit Commons)
OUT = Path(__file__).resolve().parent.parent.parent / "frontend" / "images"
OUT.mkdir(exist_ok=True)

# Mots-clés recherchés en priorité pour le packaging
PACKAGING_KEYWORDS = ["box", "packaging", "retail", "pack", "boxart", "emballage", "boite", "carton", "rakuten", "LDLC", "Amazon"]

# id produit -> requêtes Commons, de la plus précise à la plus générique
QUERIES = {
    1:  ["GeForce RTX 5090", "MSI GeForce RTX graphics card", "GeForce RTX 4090"],
    2:  ["GeForce RTX 5080", "ASUS TUF GeForce RTX", "GeForce RTX 4080"],
    3:  ["GeForce RTX 5070", "Gigabyte GeForce RTX graphics card", "GeForce RTX 4070"],
    4:  ["Radeon RX 9070", "Sapphire Radeon RX", "AMD Radeon graphics card"],
    5:  ["Ryzen 7 9800X3D", "AMD Ryzen 7 CPU", "AMD Ryzen processor"],
    6:  ["Ryzen 9 9950X", "AMD Ryzen 9 CPU", "AMD Ryzen processor"],
    7:  ["Intel Core Ultra 9", "Intel Core Ultra CPU", "Intel CPU LGA"],
    8:  ["Intel Core Ultra 5", "Intel Ultra CPU", "Intel processor"],
    9:  ["Ryzen 5 9600X", "AMD Ryzen 5 CPU", "AMD Ryzen processor"],
    10: ["Corsair Dominator DDR5", "Corsair DDR5 memory", "DDR5 memory module"],
    11: ["G.Skill Trident Z5", "G.Skill DDR5", "DDR5 RAM module"],
    12: ["Kingston Fury DDR5", "Kingston DDR5", "DDR5 memory module"],
    13: ["Corsair Vengeance DDR5", "Corsair DDR5 RAM", "DDR5 memory"],
    14: ["Samsung 990 Pro", "Samsung NVMe SSD", "M.2 NVMe SSD"],
    15: ["WD Black SN850", "Western Digital NVMe SSD", "M.2 SSD"],
    16: ["Crucial T700", "Crucial NVMe SSD", "M.2 NVMe SSD"],
    17: ["Samsung 990 Pro SSD", "Samsung SSD M.2", "NVMe SSD"],
    18: ["ASUS ROG Crosshair motherboard", "ASUS ROG motherboard", "AM5 motherboard"],
    19: ["MSI MAG Tomahawk motherboard", "MSI motherboard", "AM5 motherboard"],
    20: ["Gigabyte Aorus motherboard", "Gigabyte motherboard", "ATX motherboard"],
    21: ["ASUS ROG Maximus motherboard", "ASUS Z790 motherboard", "Intel motherboard"],
    22: ["MSI PRO motherboard", "MSI Z790 motherboard", "ATX motherboard"],
    23: ["Corsair RM1000x", "Corsair power supply", "modular power supply ATX"],
    24: ["be quiet Dark Power", "be quiet power supply", "ATX power supply"],
    25: ["Seasonic Focus power supply", "Seasonic PSU", "ATX power supply"],
    26: ["NZXT power supply", "modular ATX power supply", "computer power supply"],
    27: ["Lian Li O11 Dynamic", "Lian Li computer case", "PC case tempered glass"],
    28: ["Fractal Design North", "Fractal Design case", "computer case wood"],
    29: ["NZXT H9", "NZXT computer case", "PC tower case"],
    30: ["be quiet Dark Base", "be quiet computer case", "PC tower case"],
    31: ["Arctic Liquid Freezer", "AIO liquid cooler", "CPU water cooling"],
    32: ["NZXT Kraken", "AIO CPU cooler", "liquid CPU cooler"],
    33: ["Noctua NH-D15", "Noctua CPU cooler", "CPU air cooler"],
    34: ["Corsair iCUE liquid cooler", "Corsair AIO cooler", "AIO water cooler"],
}


def http_get(url: str, timeout: int = 25) -> bytes:
    """GET avec respect du rate-limit : pause systématique + retry sur 429."""
    for attempt in range(5):
        time.sleep(PAUSE)
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < 4:
                wait = int(e.headers.get("Retry-After") or 0) or 15 * (attempt + 1)
                print(f"    … 429, pause {wait}s")
                time.sleep(wait)
                continue
            raise
    raise RuntimeError("trop de tentatives")


def api(params: dict) -> dict:
    url = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode(params)
    return json.loads(http_get(url))


def find_image(query: str):
    """Cherche en priorité un emballage, sinon se replie sur le composant nu."""
    data = api({
        "action": "query", "format": "json", "list": "search",
        "srnamespace": 6, "srlimit": 8,
        "srsearch": f"{query} filetype:bitmap",
    })
    
    hits = data.get("query", {}).get("search", [])
    
    # ─── PASSE 1 : Recherche de la boîte (Strict) ───
    for hit in hits:
        title = hit["title"]
        if not title.lower().endswith((".jpg", ".jpeg", ".png")):
            continue
            
        title_lower = title.lower()
        if any(keyword in title_lower for keyword in PACKAGING_KEYWORDS):
            # Boîte trouvée ! Extraction des métadonnées
            thumb, artist, licence = fetch_image_metadata(title)
            if thumb:
                return thumb, title, artist, licence
                
    # ─── PASSE 2 : Repli sur le composant nu (Si aucune boîte n'existe) ───
    for hit in hits:
        title = hit["title"]
        if not title.lower().endswith((".jpg", ".jpeg", ".png")):
            continue
            
        # On prend la première image valide disponible sans filtrer sur le nom
        thumb, artist, licence = fetch_image_metadata(title)
        if thumb:
            return thumb, title, artist, licence
            
    return None, None, None, None


def fetch_image_metadata(title: str):
    """Fonction utilitaire pour récupérer les détails d'une image spécifique."""
    try:
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
                artist = (meta.get("Artist", {}) or {}).get("value", "")
                licence = (meta.get("LicenseShortName", {}) or {}).get("value", "")
                return thumb, artist, licence
    except Exception:
        pass
    return None, None, None


def download(url: str, dest: Path) -> bool:
    data = http_get(url, timeout=40)
    if len(data) < 6000:  # trop petit = probablement cassé
        return False
    dest.write_bytes(data)
    return True


def main():
    credits = {}
    missing = []
    for pid, queries in QUERIES.items():
        dest = OUT / f"{pid}.jpg"
        if dest.exists():
            print(f"{pid:>2}: déjà présent, ignoré")
            continue
        found = False
        for q in queries:
            try:
                thumb, title, artist, licence = find_image(q)
                if thumb and download(thumb, dest):
                    credits[str(pid)] = {"file": title, "license": licence,
                                         "query": q}
                    print(f"{pid:>2}: OK   {title[:70]}")
                    found = True
                    break
            except Exception as e:
                print(f"{pid:>2}: erreur ({e})")
        if not found:
            missing.append(pid)
            print(f"{pid:>2}: AUCUNE IMAGE (fallback SVG)")
    (OUT / "credits.json").write_text(
        json.dumps(credits, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\nTerminé : {len(credits)} téléchargées, {len(missing)} manquantes {missing or ''}")


if __name__ == "__main__":
    main()