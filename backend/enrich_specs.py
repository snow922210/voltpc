"""Enrichit les specs produits avec des caractéristiques supplémentaires
EXACTES (dérivées des données existantes) — base live (voltpc.db) + seed.py.

Idempotent : relançable sans dupliquer. Les nouvelles clés sont ajoutées
seulement si absentes. Lance simplement :  python enrich_specs.py
"""
import json
import re
import sqlite3
import shutil
from pathlib import Path

HERE = Path(__file__).parent
DB = HERE / "voltpc.db"
SEED = HERE / "seed.py"


def _pcie_gpu(specs):
    arch = str(specs.get("GPU", ""))
    new = any(t in arch for t in ("Blackwell", "RDNA 4", "Navi 48", "Navi 44"))
    return "PCIe 5.0 ×16" if new else "PCIe 4.0 ×16"


def _socket(specs):
    return str(specs.get("Socket", specs.get("socket", "")))


def enrich(category, specs):
    """Retourne la liste des (clé, valeur) à AJOUTER pour ce produit.
    Uniquement des specs exactes/dérivées ; garantie = standard marché.
    """
    add = []
    sock = _socket(specs)

    if category == "gpu":
        add.append(("Interface", _pcie_gpu(specs)))
        add.append(("Sorties", "1× HDMI 2.1 + 3× DisplayPort"))
        add.append(("Garantie", "2 ans"))

    elif category == "cpu":
        if "AM5" in sock or "1700" in sock or "1851" in sock:
            add.append(("Mémoire", "DDR5"))
            add.append(("PCIe", "PCIe 5.0"))
        elif "AM4" in sock:
            add.append(("Mémoire", "DDR4"))
            add.append(("PCIe", "PCIe 4.0"))
        add.append(("Garantie", "3 ans"))

    elif category == "motherboard":
        chip = str(specs.get("Chipset", ""))
        old = any(c in chip for c in ("B550", "X570", "B450", "A520", "B560", "Z590", "H510"))
        add.append(("PCIe", "PCIe 4.0" if old else "PCIe 5.0"))
        add.append(("Garantie", "3 ans"))

    elif category == "ram":
        add.append(("Format", "DIMM"))
        typ = str(specs.get("Type", ""))
        add.append(("Tension", "1,1 V" if "DDR5" in typ else "1,35 V"))
        add.append(("Garantie", "À vie"))

    elif category == "storage":
        add.append(("Garantie", "5 ans"))

    elif category == "psu":
        # 'Garantie' déjà présente sur les PSU
        add.append(("Protections", "OVP / OCP / SCP / OTP"))

    elif category == "cooling":
        add.append(("Garantie", "6 ans" if "AIO" in str(specs.get("Type", "")) or "Watercooling" in str(specs.get("Type", "")) else "6 ans"))

    elif category == "case":
        add.append(("Garantie", "2 ans"))

    elif category == "monitor":
        add.append(("Garantie", "3 ans"))

    else:  # accessoires / périphériques
        add.append(("Garantie", "2 ans"))

    return add


def patch_db():
    con = sqlite3.connect(DB)
    rows = con.execute("SELECT id, category, specs FROM products").fetchall()
    changed = 0
    for pid, cat, raw in rows:
        try:
            specs = json.loads(raw)
        except Exception:
            continue
        before = len(specs)
        for k, v in enrich(cat, specs):
            if k not in specs:
                specs[k] = v
        if len(specs) != before:
            con.execute("UPDATE products SET specs = ? WHERE id = ?",
                        (json.dumps(specs, ensure_ascii=False), pid))
            changed += 1
    con.commit()
    con.close()
    print(f"DB : {changed} produits enrichis")


def patch_seed():
    text = SEED.read_text(encoding="utf-8")
    shutil.copy(SEED, SEED.with_suffix(".py.bak"))
    out = []
    changed = 0
    for line in text.splitlines(keepends=True):
        m = re.search(r'"category":\s*"(\w+)"', line)
        sm = line.find('"specs":')
        if not m or sm == -1:
            out.append(line)
            continue
        cat = m.group(1)
        start = line.index("{", sm)
        depth = 0
        end = None
        for i in range(start, len(line)):
            if line[i] == "{":
                depth += 1
            elif line[i] == "}":
                depth -= 1
                if depth == 0:
                    end = i + 1
                    break
        if end is None:
            out.append(line)
            continue
        specs = json.loads(line[start:end])
        before = len(specs)
        for k, v in enrich(cat, specs):
            if k not in specs:
                specs[k] = v
        if len(specs) != before:
            changed += 1
        new_specs = json.dumps(specs, ensure_ascii=False)
        out.append(line[:start] + new_specs + line[end:])
    SEED.write_text("".join(out), encoding="utf-8")
    print(f"seed.py : {changed} produits enrichis (sauvegarde .py.bak)")


if __name__ == "__main__":
    patch_db()
    patch_seed()
    print("Terminé.")
