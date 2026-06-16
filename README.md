# Collect&Go — Totaux par catégorie

Extension Chrome qui enrichit la page panier de
[Collect&Go](https://www.collectandgo.be/fr/chariot) (et son équivalent
néerlandais `/nl/winkelwagen`).

## Fonctionnalité

Le panier est organisé en sections par catégorie. Pour chaque section,
l'extension additionne le prix total de tous les produits qu'elle contient et
affiche ce total **en gras** à côté du compteur existant :

> 7 produits **— 12,34 €**

Les totaux sont recalculés automatiquement à chaque modification du panier
(les quantités étant mises à jour dynamiquement par la réactivité Vue.js).

## Détails techniques

- **URLs ciblées** : `*://www.collectandgo.be/*/chariot` et
  `*://www.collectandgo.be/*/winkelwagen`.
- **Content script** injecté à `document_idle`.
- Lecture du prix dans `.ds-product-total-price.is-p1__bold` (version desktop
  uniquement — la version `--mobile` est ignorée), au format européen
  (`5,98 €`, virgule comme séparateur décimal).
- Structure des sections : `.category` → en-tête `.header.background-blue`
  et liste de produits ; chaque produit est un `.ds-product-list-item-container`.
- Un `MutationObserver` sur le panier relance le calcul à chaque mutation du
  DOM, avec un **debounce de ~300 ms**.
- Les compteurs `.count` déjà traités sont marqués via l'attribut
  `data-cg-total-processed` : la valeur est mise à jour plutôt que de rajouter
  un nouveau nœud à chaque recalcul.

- **Bilingue** : le site existe en FR et NL ; le libellé du récapitulatif
  s'adapte automatiquement (« Total par rayon » / « Totaal per afdeling »),
  d'après l'URL (`/fr/chariot` vs `/nl/winkelwagen`) puis l'attribut
  `<html lang>`.

L'extension n'interfère pas avec les fonctionnalités existantes de la page.

## Installation (mode développeur)

1. Ouvrir `chrome://extensions`.
2. Activer le **Mode développeur** (en haut à droite).
3. Cliquer sur **Charger l'extension non empaquetée** et sélectionner ce
   dossier.
4. Ouvrir le chariot Collect&Go : les totaux par catégorie apparaissent.
