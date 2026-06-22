# -*- coding: utf-8 -*-
"""Enrichit la description d'un produit à partir de ses specs réelles.

Principe : on garde la phrase d'accroche écrite à la main dans seed.py
(unique et spécifique à chaque produit) comme amorce, puis on ajoute 1 à 2
phrases construites uniquement à partir des specs de CE produit (VRAM, TDP,
socket, Hz, capacité…). Le texte reste donc spécifique, jamais générique.

Appliqué à l'import de seed.py via :  p["description"] = enrich(p)

Idempotent : part toujours de l'accroche courte, donc le résultat est
déterministe quel que soit le nombre d'appels.
"""
import re


_EMPTY = {None, "", "—", "-", "Non", "non", "Aucun", "aucun"}


def _g(specs, *keys, default=""):
    """Premier spec significatif parmi `keys` (ignore vide / 'Non')."""
    for k in keys:
        v = specs.get(k)
        if v not in _EMPTY:
            return str(v)
    return default


def _cap(text):
    """Met la première lettre en capitale sans casser un sigle (iGPU…)."""
    if not text:
        return text
    if text[:1].islower() and text[1:2].isupper():  # iGPU, eSPORT… : on garde
        return text
    return text[0].upper() + text[1:]


def _high_freq(s):
    """'4,3 / 5,7 GHz' -> '5,7 GHz' ; sinon renvoie la chaîne telle quelle."""
    parts = re.findall(r"[\d,]+", s)
    if parts:
        unit = "GHz" if "GHz" in s else ("MHz" if "MHz" in s else "")
        return f"{parts[-1]} {unit}".strip()
    return s


def _reco_psu(tdp_w):
    """Alim conseillée : ~2× le TDP carte, arrondi à 50 W, plancher 450 W."""
    try:
        w = int(tdp_w)
    except (TypeError, ValueError):
        return None
    reco = max(450, ((w * 2 + 49) // 50) * 50)
    return reco


# ─────────────────────────── générateurs par catégorie ───────────────────────
def _gpu(s):
    out = []
    mem, boost = _g(s, "Mémoire"), _g(s, "Boost")
    if mem:
        phrase = f"Sous le capot, {mem}"
        if boost:
            phrase += f" et une fréquence Boost jusqu'à {boost}"
        out.append(phrase + ".")
    psu = _reco_psu(s.get("tdp_w"))
    length = s.get("length_mm")
    tail = []
    if psu:
        tail.append(f"prévoyez une alimentation d'environ {psu} W")
    if length:
        try:
            L = int(length)
            tail.append(f"et {L} mm de dégagement dans le boîtier"
                        + (" (grand format, plutôt grande tour)" if L >= 320
                           else " (format compact, compatible SFF)" if L <= 200 else ""))
        except (TypeError, ValueError):
            pass
    if tail:
        out.append("Côté intégration, " + " ".join(tail) + ".")
    return out


def _cpu(s):
    out = []
    cores, freq, socket, cache = _g(s, "Cœurs"), _g(s, "Fréquence"), _g(s, "Socket"), _g(s, "Cache")
    seg = []
    if cores:
        seg.append(cores)
    if freq:
        seg.append(f"jusqu'à {_high_freq(freq)}")
    if socket:
        seg.append(f"sur socket {socket}")
    if seg:
        line = " ".join(seg)
        if cache:
            line += f", {cache} de cache"
        out.append(line[0].upper() + line[1:] + ".")
    gpu = _g(s, "Graphique")
    tdp = s.get("TDP", "")
    if gpu and ("RDNA" in gpu or "Graphics" in gpu or "CU" in gpu):
        out.append(f"iGPU {gpu} intégré : un affichage possible sans carte graphique dédiée.")
    if any(w in tdp for w in ("170 W", "125 W", "120 W", "105 W")):
        out.append("Prévoyez un refroidissement performant (gros ventirad ou watercooling AIO).")
    elif any(w in tdp for w in ("65 W", "35 W")):
        out.append("Le ventirad fourni suffit pour un usage classique.")
    return out


def _ram(s):
    out = []
    cap, typ, freq, lat = _g(s, "Capacité"), _g(s, "Type"), _g(s, "Fréquence"), _g(s, "Latence")
    seg = [x for x in (cap, typ, f"à {freq}" if freq else "", f"latence {lat}" if lat else "") if x]
    if seg:
        out.append(", ".join(seg) + ".")
    profils = _g(s, "Profils")
    rt = (s.get("ram_type") or "").upper()
    tail = []
    if profils:
        tail.append(f"profil {profils} pour activer la pleine fréquence en un clic dans le BIOS")
    if rt:
        tail.append(f"compatible cartes mères {rt}")
    if tail:
        out.append(_cap(tail[0]) + (", " + tail[1] if len(tail) > 1 else "") + ".")
    return out


def _storage(s):
    out = []
    cap, fmt, itf = _g(s, "Capacité"), _g(s, "Format"), _g(s, "Interface")
    rd, wr = _g(s, "Lecture"), _g(s, "Écriture")
    head = [x for x in (cap, fmt, itf) if x]
    line = " ".join(head[:1])
    if len(head) > 1:
        line += " en " + " ".join(head[1:])
    if rd:
        line += f", jusqu'à {rd} en lecture" + (f" et {wr} en écriture" if wr else "")
    if line:
        out.append(line + ".")
    endur = _g(s, "Endurance")
    if "Gen5" in itf or "Gen4" in itf or "PCIe" in itf or "NVMe" in fmt:
        use = "Idéal en disque système pour le démarrage, les jeux et le montage vidéo"
    else:
        use = "Parfait en disque secondaire pour étendre le stockage à moindre coût"
    if endur:
        use += f", endurance annoncée {endur}"
    out.append(use + ".")
    return out


def _motherboard(s):
    out = []
    chip, fmt, socket = _g(s, "Chipset"), _g(s, "Format"), _g(s, "Socket")
    mem, m2, net = _g(s, "Mémoire"), _g(s, "M.2"), _g(s, "Réseau")
    seg = [x for x in (f"chipset {chip}" if chip else "", f"format {fmt}" if fmt else "",
                       f"socket {socket}" if socket else "") if x]
    if seg:
        line = ", ".join(seg)
        if mem:
            line += f", jusqu'à {mem}"
        out.append(line[0].upper() + line[1:] + ".")
    tail = []
    if m2:
        tail.append(f"{m2} en M.2")
    if net:
        tail.append(net)
    if tail:
        out.append("Connectivité : " + ", ".join(tail) + ".")
    return out


def _psu(s):
    out = []
    p, cert, modu = _g(s, "Puissance"), _g(s, "Certification"), _g(s, "Modulaire")
    seg = [x for x in (p, f"certifiée {cert}" if cert else "", modu) if x]
    if seg:
        out.append(", ".join(seg) + ".")
    norme, gar = _g(s, "Norme"), _g(s, "Garantie")
    tail = [x for x in (f"conforme {norme}" if norme else "", f"garantie {gar}" if gar else "") if x]
    try:
        w = int(s.get("watts"))
        if w >= 850:
            tail.append("de la marge pour alimenter un GPU haut de gamme")
    except (TypeError, ValueError):
        pass
    if tail:
        out.append(_cap(tail[0]) + (", " + ", ".join(tail[1:]) if len(tail) > 1 else "") + ".")
    return out


def _case(s):
    out = []
    fmt, gpu, faç = _g(s, "Format"), _g(s, "GPU max"), _g(s, "Façade")
    seg = [x for x in (f"boîtier {fmt}" if fmt else "", f"jusqu'à {gpu} de carte graphique" if gpu else "",
                       f"façade {faç}" if faç else "") if x]
    if seg:
        out.append(_cap(seg[0]) + (", " + ", ".join(seg[1:]) if len(seg) > 1 else "") + ".")
    vent, baies = _g(s, "Ventilateurs"), _g(s, "Stockage")
    tail = [x for x in (f"{vent} préinstallés" if vent else "", baies) if x]
    if tail:
        out.append("Refroidissement et stockage : " + ", ".join(tail) + ".")
    return out


def _cooling(s):
    out = []
    typ, rad, haut = _g(s, "Type"), _g(s, "Radiateur"), _g(s, "Hauteur")
    socks, tdp = _g(s, "Sockets"), _g(s, "TDP supporté")
    seg = [x for x in (typ, f"radiateur {rad}" if rad else "", f"hauteur {haut}" if haut else "") if x]
    if seg:
        out.append(_cap(seg[0]) + (", " + ", ".join(seg[1:]) if len(seg) > 1 else "") + ".")
    tail = [x for x in (f"compatible {socks}" if socks else "", f"jusqu'à {tdp} dissipés" if tdp else "") if x]
    if tail:
        out.append(_cap(tail[0]) + (", " + ", ".join(tail[1:]) if len(tail) > 1 else "") + ".")
    return out


def _monitor(s):
    out = []
    dalle, defi, freq, rep = _g(s, "Dalle"), _g(s, "Définition"), _g(s, "Fréquence"), _g(s, "Réponse")
    seg = [x for x in (f"dalle {dalle}" if dalle else "", defi, f"à {freq}" if freq else "",
                       f"temps de réponse {rep}" if rep else "") if x]
    if seg:
        out.append(_cap(seg[0]) + (", " + ", ".join(seg[1:]) if len(seg) > 1 else "") + ".")
    hdr, conn = _g(s, "HDR"), _g(s, "Connectique")
    tail = [x for x in (f"HDR {hdr}" if hdr and hdr.lower() != "non" else "", conn) if x]
    if tail:
        out.append("Image et connectique : " + ", ".join(tail) + ".")
    return out


def _keyboard(s):
    fmt, sw, conn = _g(s, "Format"), _g(s, "Switches"), _g(s, "Connexion")
    retro, etan = _g(s, "Rétroéclairage"), _g(s, "Étanchéité")
    seg = [x for x in (f"format {fmt}" if fmt else "", f"switches {sw}" if sw else "",
                       f"connexion {conn}" if conn else "") if x]
    out = []
    if seg:
        out.append(_cap(seg[0]) + (", " + ", ".join(seg[1:]) if len(seg) > 1 else "") + ".")
    tail = [x for x in (f"rétroéclairage {retro}" if retro else "", etan) if x]
    if tail:
        out.append(_cap(tail[0]) + (", " + ", ".join(tail[1:]) if len(tail) > 1 else "") + ".")
    return out


def _mouse(s):
    poids, capt, bt, conn = _g(s, "Poids"), _g(s, "Capteur"), _g(s, "Boutons"), _g(s, "Connexion")
    seg = [x for x in (f"capteur {capt}" if capt else "", f"{bt} boutons" if bt else "",
                       f"{poids}" if poids else "", f"connexion {conn}" if conn else "") if x]
    out = []
    if seg:
        out.append(_cap(seg[0]) + (", " + ", ".join(seg[1:]) if len(seg) > 1 else "") + ".")
    return out


def _headset(s):
    trans, conn, surr, mic = _g(s, "Transducteurs"), _g(s, "Connexion"), _g(s, "Surround"), _g(s, "Micro")
    seg = [x for x in (f"transducteurs {trans}" if trans else "", f"connexion {conn}" if conn else "",
                       f"son surround {surr}" if surr and surr.lower() != "non" else "") if x]
    out = []
    if seg:
        out.append(_cap(seg[0]) + (", " + ", ".join(seg[1:]) if len(seg) > 1 else "") + ".")
    if mic:
        out.append(f"Micro : {mic}.")
    return out


def _fan(s):
    taille, debit, bruit, rgb = _g(s, "Taille"), _g(s, "Débit"), _g(s, "Bruit"), _g(s, "RGB")
    seg = [x for x in (taille, f"débit {debit}" if debit else "", f"{bruit} de bruit" if bruit else "") if x]
    out = []
    if seg:
        out.append(_cap(seg[0]) + (", " + ", ".join(seg[1:]) if len(seg) > 1 else "") + ".")
    if rgb and rgb.lower() != "non":
        out.append(f"Éclairage RGB {rgb} adressable pour s'accorder à votre configuration.")
    return out


def _thermal(s):
    cond, vol, typ = _g(s, "Conductivité"), _g(s, "Volume"), _g(s, "Type")
    seg = [x for x in (typ, f"conductivité {cond}" if cond else "", vol) if x]
    out = []
    if seg:
        out.append(_cap(seg[0]) + (", " + ", ".join(seg[1:]) if len(seg) > 1 else "") + ".")
    return out


def _webcam(s):
    res, fps, champ = _g(s, "Résolution"), _g(s, "FPS"), _g(s, "Champ")
    seg = [x for x in (res, f"{fps}" if fps else "", f"champ {champ}" if champ else "") if x]
    out = []
    if seg:
        out.append(_cap(seg[0]) + (", " + ", ".join(seg[1:]) if len(seg) > 1 else "") + ".")
    return out


def _microphone(s):
    typ, direc, ech, conn = _g(s, "Type"), _g(s, "Directivité"), _g(s, "Échantillonnage"), _g(s, "Connexion")
    seg = [x for x in (typ, direc, ech, f"connexion {conn}" if conn else "") if x]
    out = []
    if seg:
        out.append(_cap(seg[0]) + (", " + ", ".join(seg[1:]) if len(seg) > 1 else "") + ".")
    return out


def _speaker(s):
    p, conf, conn = _g(s, "Puissance"), _g(s, "Config"), _g(s, "Connexion")
    seg = [x for x in (conf, p, f"connexion {conn}" if conn else "") if x]
    out = []
    if seg:
        out.append(_cap(seg[0]) + (", " + ", ".join(seg[1:]) if len(seg) > 1 else "") + ".")
    return out


def _mousepad(s):
    dim, surf, ep = _g(s, "Dimensions"), _g(s, "Surface"), _g(s, "Épaisseur")
    seg = [x for x in (dim, f"surface {surf}" if surf else "", f"épaisseur {ep}" if ep else "") if x]
    out = []
    if seg:
        out.append(_cap(seg[0]) + (", " + ", ".join(seg[1:]) if len(seg) > 1 else "") + ".")
    return out


def _chair(s):
    typ, charge, regl, rev = _g(s, "Type"), _g(s, "Charge max"), _g(s, "Réglages"), _g(s, "Revêtement")
    seg = [x for x in (typ, rev, f"charge max {charge}" if charge else "") if x]
    out = []
    if seg:
        out.append(_cap(seg[0]) + (", " + ", ".join(seg[1:]) if len(seg) > 1 else "") + ".")
    if regl:
        out.append(f"Réglages : {regl}.")
    return out


_BUILDERS = {
    "gpu": _gpu, "cpu": _cpu, "ram": _ram, "storage": _storage,
    "motherboard": _motherboard, "psu": _psu, "case": _case, "cooling": _cooling,
    "monitor": _monitor, "keyboard": _keyboard, "mouse": _mouse, "headset": _headset,
    "fan": _fan, "thermal": _thermal, "webcam": _webcam, "microphone": _microphone,
    "speaker": _speaker, "mousepad": _mousepad, "chair": _chair,
}


def enrich(product):
    """Renvoie la description enrichie : accroche d'origine + 1-2 phrases specs."""
    lead = (product.get("description") or "").strip()
    builder = _BUILDERS.get(product.get("category"))
    extra = builder(product.get("specs", {})) if builder else []
    parts = [lead] + [e for e in extra if e and e.strip()]
    text = " ".join(p.rstrip() for p in parts if p)
    return re.sub(r"\s+", " ", text).strip()
