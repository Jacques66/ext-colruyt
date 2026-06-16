<div align="center">

# 🛒 Totaux par rayon — pour Collect&Go

**Extension Chrome non officielle qui enrichit la page panier de
[Collect&Go](https://www.collectandgo.be/fr/chariot) avec les totaux par
catégorie — pour savoir, d'un coup d'œil, combien coûte chaque rayon.**

[![Manifest](https://img.shields.io/badge/Manifest-V3-blue)](manifest.json)
[![Langues](https://img.shields.io/badge/langues-FR%20%2F%20NL-success)](#-bilingue-fr--nl)
[![Licence](https://img.shields.io/badge/licence-MIT-lightgrey)](#-licence)

</div>

> ⚠️ **Non affilié.** Cette extension est un projet indépendant, **non
> officiel** et **sans aucune affiliation** avec Collect&Go ni Colruyt Group.
> « Collect&Go » et « Colruyt » sont des marques de leurs titulaires respectifs,
> citées ici uniquement à des fins descriptives (compatibilité). Aucun logo de
> la marque n'est utilisé. L'extension agit côté navigateur, ne collecte ni ne
> transmet aucune donnée, et n'interagit pas avec les serveurs de Collect&Go.

---

## 📸 Aperçu

### Totaux par rayon dans la liste

| Avant | Après |
|:---:|:---:|
| ![En-tête de rayon sans total](docs/screenshots/liste-rayons-before.png) | ![En-tête de rayon avec le total ajouté](docs/screenshots/liste-rayons-after.png) |

### Récapitulatif dans la sidebar

| Avant | Après |
|:---:|:---:|
| ![Sidebar d'origine](docs/screenshots/recap-before.png) | ![Sidebar avec le récap « Total par rayon »](docs/screenshots/recap-after.png) |

---

## ✨ Fonctionnalités

| | |
|---|---|
| 🧮 **Total par rayon (dans la liste)** | Pour chaque section, la somme des prix s'affiche **en gras** à côté du compteur — sur une seule ligne. |
| 📋 **Récapitulatif (sidebar)** | Un bloc **« Total par rayon »** apparaît sous le **Total estimé**, avec le détail de chaque rayon. |
| 🏷️ **Sous-totaux par marque** | Chaque rayon du récap est un **accordéon** : un clic sur le chevron dévoile le détail par marque (ex. Boni, Duyvis, Doritos…). Une **pastille orange** repère les **marques propres** Colruyt (Boni, Everyday, Bio-Time…). |
| ↕️ **Tri au choix** | Un menu déroulant trie le récap : montant décroissant, croissant, ou ordre de la liste. Le choix est mémorisé. |
| 🔗 **Navigation en un clic** | Cliquer sur un rayon du récap fait défiler la page jusqu'à lui, qui clignote brièvement. |
| 📌 **Colonne de droite figée** | La sidebar reste visible pendant le défilement (sticky, avec défilement interne si besoin). |
| 🗂️ **Sections repliées** | Les blocs **« Données pour le retrait »** (adresse + horaire) et **« Code promo »** sont repliés au démarrage — via l'accordéon **natif du site** — pour gagner de la place. Si l'adresse ou l'horaire manque, un **⚠️** s'affiche et le titre passe en **rouge** tant que le bloc est replié. |
| 🔄 **Toujours à jour** | Les totaux se recalculent automatiquement à chaque changement de quantité (réactivité Vue.js). |

> Exemple, dans l'en-tête d'un rayon :
>
> > **Boîtes, conserves et bocaux** — 7 produits **— 16,13 €**

---

## 🌍 Bilingue (FR / NL)

Le site existe en français et en néerlandais ; l'extension s'adapte
automatiquement, d'après l'URL (`/fr/chariot` vs `/nl/winkelwagen`) puis
l'attribut `<html lang>` :

| | 🇫🇷 Français | 🇳🇱 Nederlands |
|---|---|---|
| Titre du récap | Total par rayon | Totaal per afdeling |
| Tri | Montant décroissant / croissant / Ordre de la liste | Bedrag aflopend / oplopend / Volgorde van de lijst |

---

## 🚀 Installation (mode développeur)

1. Cloner ou télécharger ce dépôt.
2. Ouvrir `chrome://extensions`.
3. Activer le **Mode développeur** (en haut à droite).
4. Cliquer sur **« Charger l'extension non empaquetée »** et sélectionner ce dossier.
5. Ouvrir le [chariot Collect&Go](https://www.collectandgo.be/fr/chariot) — les totaux apparaissent. ✅

---

## ⚙️ Comment ça marche

- **Pages ciblées** : `*://www.collectandgo.be/*/chariot` et
  `*://www.collectandgo.be/*/winkelwagen`.
- **Content script** injecté à `document_idle`.
- **Lecture des prix** : `.ds-product-total-price.is-p1__bold` — version desktop
  uniquement (la variante `--mobile` est ignorée), au format européen
  (`5,98 €`, virgule décimale).
- **Marques** : déduites du libellé produit (`.ds-product-tag`) — le **token en
  majuscules en tête** sert de marque (ex. « BONI ananas… » → `BONI`) ; à défaut,
  les produits sont regroupés sous « Sans marque ». L'accordéon est proposé pour
  **chaque rayon** (par cohérence, même mono-marque).
- **Sections** : `.category` → en-tête `.header.background-blue` + liste de
  produits ; chaque produit est un `.ds-product-list-item-container`.
- **Recalcul** : un `MutationObserver` ciblé sur le wrapper Vue
  (`page-content`, avec repli sur `.basket` puis `body`) relance le calcul à
  chaque changement (quantité, suppression, promo…). La temporisation regroupe
  les mutations rapprochées (**~250 ms**) tout en garantissant une exécution
  au plus tard après **~800 ms** — pour ne pas être « affamée » par les
  mutations continues des scripts tiers de la page (chat, Tealium…).
- **Idempotence** : les compteurs `.count` traités sont marqués
  (`data-cg-total-processed`) ; la valeur est mise à jour en place plutôt que de
  rajouter un nœud. Les libellés sont écrits via `textContent` (pas d'injection HTML).
- **Non intrusif** : l'extension n'altère aucune fonctionnalité existante de la page.

---

## 📁 Structure du projet

```
ext-colruyt/
├── manifest.json     # Manifest V3 (content script, URLs ciblées)
├── content.js        # Toute la logique : calculs, récap, tri, scroll, styles
├── icons/            # Icônes 16 / 48 / 128 px
└── README.md
```

---

## 👤 Crédits

Développé par **InZeMobile SRL** — [www.inzemobile.com](https://www.inzemobile.com).

Projet indépendant, non affilié à Collect&Go ni à Colruyt Group.

---

## 🤝 Bonne foi & respect de la marque

Ce projet est né d'une **appréciation sincère du service Collect&Go** et n'a
qu'un seul objectif : améliorer le confort de l'utilisateur de son chariot.

- **Indépendant et non officiel** — aucune affiliation avec Collect&Go ni
  Colruyt Group, aucun logo de la marque utilisé.
- **Respectueux de la page** — lecture du DOM déjà affiché, **aucun appel
  serveur**, **aucune donnée** collectée ni transmise ; les composants
  existants ne sont pas altérés.
- **Fidèle au design, sans ralentir la page** — nous avons veillé à **ne pas
  trahir le _look & feel_** de Collect&Go (couleurs, typographie, composants
  natifs), par respect pour le travail de leurs équipes, et à **ne pas
  ralentir la page** (calculs regroupés, observation ciblée du seul panier,
  reconstruction du DOM uniquement quand les données changent vraiment). Nos
  ajouts s'intègrent discrètement.
- **Auditable** — code source ouvert, facile à relire pour une équipe sécurité.

> Ce respect de l'utilisateur et des sites tiers — confidentialité absolue,
> non-intrusion, transparence — est le **fondement éthique d'InZeMobile SRL**,
> appliqué à **tous** ses produits, qu'ils soient libres ou commerciaux.

Nous portons le plus grand respect à Collect&Go et à Colruyt Group. **À la
demande des titulaires de droits, nous adapterons ou retirerons volontiers**
tout élément concerné — il suffit d'ouvrir une *issue* sur ce dépôt ou de
contacter InZeMobile SRL.

---

## 📝 Licence

[MIT](LICENSE) — © InZeMobile SRL. Utilisez, modifiez et partagez librement.
