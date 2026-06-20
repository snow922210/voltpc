# -*- coding: utf-8 -*-
"""Re-télécharge les images mal assorties avec des requêtes plus strictes.

Le titre du fichier Commons doit contenir au moins un des jetons `must`
(insensible à la casse) pour être accepté — ce qui élimine les rivières,
moineaux et temples hindous remontés par la recherche plein-texte.
"""
import json
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from fetch_images import OUT, api, download  # réutilise pause + retry 429

# id -> (requêtes, jetons obligatoires dans le titre)
FIXES = {
    21: (["Intel Core Ultra 9 285K", "Intel Arrow Lake CPU", "Intel Core i9 CPU"], ["intel", "core"]),
    22: (["Intel Core Ultra 5 245K", "Intel Core i5 CPU LGA", "Intel Core i5 processor"], ["intel", "core"]),
    24: (["Corsair Dominator Platinum", "Corsair Dominator DDR5 RAM"], ["dominator"]),
    25: (["G.Skill Trident Z", "G.Skill memory module", "G.Skill DDR4"], ["skill", "trident"]),
    29: (["WD Black NVMe SSD", "Western Digital Black SSD", "Western Digital SSD"], ["wd", "western"]),
    32: (["ASUS ROG Crosshair motherboard", "ASUS ROG Strix motherboard", "ASUS motherboard"], ["asus"]),
    33: (["MSI MAG B550 Tomahawk", "MSI Tomahawk motherboard", "MSI motherboard ATX"], ["msi"]),
    35: (["ASUS ROG Maximus", "ASUS Z690 motherboard", "ASUS Prime motherboard"], ["asus"]),
    38: (["be quiet Dark Power Pro", "be quiet Straight Power", "be quiet power supply unit"], ["power"]),
    39: (["Seasonic Prime power supply", "Seasonic PSU", "Seasonic"], ["seasonic"]),
    42: (["Fractal Design North case", "Fractal Design Define", "Fractal Design case"], ["fractal"]),
    43: (["NZXT H510", "NZXT H500", "NZXT case"], ["nzxt"]),
    44: (["be quiet Silent Base", "be quiet Pure Base", "be quiet case"], ["base"]),
    45: (["Arctic Liquid Freezer", "Arctic Freezer CPU cooler", "Arctic CPU cooler"], ["arctic", "freezer"]),
}

BLACKLIST = ("geograph", "sparrow", "temple", "church", "river", "weir",
             "landscape", "mountain", "booth", "stage", "chair")


def find_strict(query: str, must: list[str]):
    data = api({
        "action": "query", "format": "json", "list": "search",
        "srnamespace": 6, "srlimit": 10,
        "srsearch": f"{query} filetype:bitmap",
    })
    for hit in data.get("query", {}).get("search", []):
        title = hit["title"]
        low = title.lower()
        if not low.endswith((".jpg", ".jpeg", ".png")):
            continue
        if any(b in low for b in BLACKLIST):
            continue
        if not any(m in low for m in must):
            continue
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
    credits = json.loads(credits_path.read_text(encoding="utf-8")) if credits_path.exists() else {}
    for pid, (queries, must) in FIXES.items():
        fixed = False
        for q in queries:
            try:
                thumb, title, licence = find_strict(q, must)
                if thumb and download(thumb, OUT / f"{pid}.jpg"):
                    credits[str(pid)] = {"file": title, "license": licence, "query": q}
                    print(f"{pid:>2}: CORRIGÉ  {title[5:80]}")
                    fixed = True
                    break
            except Exception as e:
                print(f"{pid:>2}: erreur ({e})")
        if not fixed:
            print(f"{pid:>2}: pas mieux trouvé, image actuelle conservée")
    credits_path.write_text(json.dumps(credits, ensure_ascii=False, indent=1),
                            encoding="utf-8")
    print("\nTerminé.")


if __name__ == "__main__":
    main()
