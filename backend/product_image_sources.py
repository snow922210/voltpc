# -*- coding: utf-8 -*-
"""URLs d'images officielles fournies (priorité sur Wikimedia dans gen_images.py).

Format :  "<nom exact du produit dans seed.py>": "<URL image directe>"
Les URLs Amazon m.media-amazon.com fonctionnent ; le pipeline reconstruit la
pleine résolution (_AC_SL1500_) automatiquement.
"""
OVERRIDES = {
    "GeForce RTX 5090 SUPRIM Liquid 32G": "https://m.media-amazon.com/images/I/71KAMVAMlPL._AC_SL1500_.jpg",
}
