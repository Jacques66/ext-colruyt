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
| 🧮&nbsp;**Totaux&nbsp;en&nbsp;liste** | Pour chaque section, la somme des prix s'affiche **en gras** à côté du compteur — sur une seule ligne. |
| 📋&nbsp;**Récap&nbsp;sidebar** | Un bloc **« Total par rayon »** apparaît sous le **Total estimé**, avec le détail de chaque rayon. |
| 🏷️&nbsp;**Détail&nbsp;par&nbsp;marque** | Chaque rayon du récap est un **accordéon** : un clic sur le chevron dévoile le détail par marque (ex. Boni, Duyvis, Doritos…). Une **pastille orange** repère les **marques propres** Colruyt (Boni, Everyday, Bio-Time…). |
| ↕️&nbsp;**Tri&nbsp;au&nbsp;choix** | Un menu déroulant trie le récap : montant décroissant, croissant, ou ordre de la liste. Le choix est mémorisé. |
| 🔗&nbsp;**Navigation&nbsp;rapide** | Cliquer sur un rayon du récap fait défiler la page jusqu'à lui, qui clignote brièvement. |
| 📌&nbsp;**Sidebar&nbsp;figée** | La colonne de droite reste visible pendant le défilement (sticky, avec défilement interne si besoin). |
| 🗂️&nbsp;**Sections&nbsp;repliées** | Les blocs **« Données pour le retrait »** (adresse + horaire) et **« Code promo »** sont repliés au démarrage — via l'accordéon **natif du site** — pour gagner de la place. Si l'adresse ou l'horaire manque, un **⚠️** s'affiche et le titre passe en **rouge** tant que le bloc est replié. |
| 🔄&nbsp;**Toujours&nbsp;à&nbsp;jour** | Les totaux se recalculent automatiquement à chaque changement de quantité (réactivité Vue.js). |
| 🛡️&nbsp;**Sûr&nbsp;si&nbsp;la&nbsp;page&nbsp;change** | Au chargement, l'extension vérifie la structure attendue. Si la page Collect&Go a évolué, elle **se désactive** et affiche un **bandeau** (à la place du détail dans la sidebar, ou en **rouge tout en haut** si l'ancrage a disparu) — jamais de totaux erronés. |

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
- **Auto-test de structure** : au chargement, l'extension vérifie que la page
  expose toujours ce dont elle a besoin (sections, compteur, prix lisible). En
  cas de changement, elle **se désactive** et affiche un bandeau (sidebar, ou
  rouge en haut si l'ancrage a disparu) plutôt que de risquer des totaux faux.
  La détection patiente quelques cycles pour éviter les faux positifs pendant
  le rendu de la SPA.
- **Non intrusif** : l'extension n'altère aucune fonctionnalité existante de la page.

---

## 📁 Structure du projet

```
ext-colruyt/
├── manifest.json     # Manifest V3 (content scripts, URLs ciblées)
├── pure.js           # Fonctions pures testables (parsePrice, formatPrice, …)
├── content.js        # Logique DOM : calculs, récap, tri, scroll, accordéons, styles
├── test/             # Tests unitaires (node:test) des fonctions pures
├── package.json      # « npm test »
├── icons/            # Icônes 16 / 48 / 128 px
└── README.md
```

---

## 🧪 Tests

Les fonctions pures (sans DOM) — analyse/format des prix, détection de marque —
sont isolées dans `pure.js` et couvertes par des tests unitaires, **sans aucune
dépendance** (`node:test`, intégré à Node) :

```bash
npm test
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
- **Fidèle au design** — nous avons veillé à **ne pas trahir le _look & feel_**
  de la page Collect&Go (couleurs, typographie, composants natifs), par respect
  pour le travail de leurs équipes ; nos ajouts s'y intègrent discrètement.
- **Léger** — nous avons veillé à **ne pas ralentir la page** : calculs
  regroupés (debounce), observation ciblée du seul panier, et reconstruction
  du DOM uniquement lorsque les données changent réellement.
- **Auditable** — code source ouvert, facile à relire pour une équipe sécurité.

> Ce respect de l'utilisateur et des sites tiers — confidentialité absolue,
> non-intrusion, transparence — est le **fondement éthique d'InZeMobile SRL**,
> appliqué à **tous** ses produits, qu'ils soient libres ou commerciaux.

Nous portons le plus grand respect à Collect&Go et à Colruyt Group. **À la
demande des titulaires de droits, nous adapterons ou retirerons volontiers**
tout élément concerné — il suffit d'ouvrir une *issue* sur ce dépôt ou de
contacter InZeMobile SRL.

Et bien sûr, **conformément à la licence MIT**, Colruyt Group est libre de
**réutiliser tout ou partie de ce code**, tel quel ou modifié. Nous demandons
seulement à en être **informés**, afin d'adapter ce qui deviendrait obsolète
dans le projet — voire de le retirer entièrement si l'idée est intégralement
reprise (une collaboration est d'ailleurs toujours possible 😉).

---

## ⚖️ Garantie & maintenance

Ce projet est fourni **« tel quel » (_as-is_)**, sans aucune garantie d'aucune
sorte.
InZeMobile SRL **ne saurait être tenue responsable**, de quelque manière que ce
soit, des conséquences de son utilisation — notamment, mais pas seulement,
d'éventuels dysfonctionnements liés aux **modifications futures de la page
Collect&Go**, qui peut évoluer à tout moment.

Nous **ne nous engageons pas** à maintenir ou à mettre à jour l'extension à
l'avenir. Cela dit, comme nous l'utilisons nous-mêmes au quotidien, c'est un
bon indice que nous ne traînerons pas pour la corriger 😉

---

## 📝 Licence

[MIT](LICENSE) — © InZeMobile SRL. Utilisez, modifiez et partagez librement.
