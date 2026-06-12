# -*- coding: utf-8 -*-
import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "voltpc.db"

conn = sqlite3.connect(DB_PATH)

# Met à jour absolument TOUS les produits d'un coup
cursor = conn.execute("UPDATE products SET stock = 1 WHERE stock != 1")
updated = cursor.rowcount

conn.commit()
conn.close()

print(f"Terminé ! {updated} produits ont vu leur stock passer à 1.")