# -*- coding: utf-8 -*-
import sys
import time
import urllib.request
from pathlib import Path

# Force le terminal à afficher correctement les messages
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

print("ℹ️ [ETAPE 1] Le script se lance correctement...")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
}

# Dossier cible
OUT = Path(__file__).resolve().parent.parent.parent / "frontend" / "images"
OUT.mkdir(exist_ok=True)

# 💡 LIEN DE TEST PROPRE (Une photo Unsplash libre et accessible sans blocage)
PRODUCT_URLS = {
    1: "https://cdn.idealo.com/folder/Product/203811/1/203811169/s4_produktbild_gross/asus-geforce-rtx-4080-super-tuf-gaming-oc.jpg", 
    2: "https://cdn.idealo.com/folder/Product/203811/1/203811169/s4_produktbild_gross_1/asus-geforce-rtx-4080-super-tuf-gaming-oc.jpg", 
    3: "https://cdn.idealo.com/folder/Product/203811/1/203811169/s4_produktbild_gross_2/asus-geforce-rtx-4080-super-tuf-gaming-oc.jpg",
} 

print(f"ℹ [ETAPE 2] Dossier cible vérifié. {len(PRODUCT_URLS)} produit(s) en attente.")

for pid, url in PRODUCT_URLS.items():
    print(f"📦 [ETAPE 3] Tentative sur l'ID {pid}...")
    try:
        req = urllib.request.Request(url, headers=HEADERS)
        print("   -> Connexion au serveur de l'image...")
        
        with urllib.request.urlopen(req, timeout=15) as response:
            data = response.read()
            print(f"   -> Données reçues avec succès ({len(data)} octets) !")
            
            dest = OUT / f"{pid}.jpg"
            dest.write_bytes(data)
            print(f"   ✅ [SUCCÈS] Image enregistrée ici : {dest}")
            
    except Exception as e:
        print(f"   ❌ [ÉCHEC] Erreur sur l'ID {pid} : {e}")

print("✨ [FIN] Le script a terminé son exécution.")