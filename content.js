/**
 * Totaux par rayon — pour Collect&Go (extension non officielle)
 *
 * 1. Pour chaque section de catégorie du chariot, additionne le prix total de
 *    chaque produit et ajoute ce total en gras à côté du compteur
 *    « X produits » (sur une seule ligne).
 * 2. Affiche un récapitulatif « Total par rayon » dans la sidebar, juste
 *    après le « Total estimé », avec tri (dropdown) et clic-pour-scroller.
 * 3. Chaque rayon du récap est un accordéon qui dévoile les sous-totaux par
 *    marque (la marque = le token en majuscules en tête de libellé produit).
 *
 * Le calcul est relancé à chaque mutation du DOM du panier (réactivité Vue.js),
 * avec un debounce (~250ms, exécution garantie sous ~800ms). Les compteurs
 * déjà traités sont marqués via un attribut data- pour mettre à jour la valeur
 * plutôt que d'ajouter un nouveau nœud.
 */
(function () {
  'use strict';

  var PROCESSED_ATTR = 'data-cg-total-processed';
  var TOTAL_CLASS = 'cg-category-total';
  var RECAP_CLASS = 'cg-category-recap';
  var STYLE_ID = 'cg-category-total-styles';
  var DEBOUNCE_MS = 250;
  // Délai maximal : garantit un recalcul même si la page mute en continu
  // (chat, Tealium, timers…) et repousserait sinon indéfiniment le debounce.
  var MAX_WAIT_MS = 800;

  // Auto-test de structure : si la page Collect&Go a changé, on désactive les
  // fonctionnalités et on affiche un bandeau. On patiente quelques cycles avant
  // de conclure (anti-faux-positif pendant le rendu de la SPA).
  var BANNER_ID = 'cg-disabled-banner';
  var STRUCTURE_FAIL_LIMIT = 4;
  var featuresDisabled = false;
  var structureFailStreak = 0;

  var SORT_KEY = 'cgSortMode';

  // Libellés traduits (le site existe en FR et NL).
  var LABELS = {
    fr: {
      recapTitle: 'Total par rayon',
      sortDesc: 'Montant décroissant',
      sortAsc: 'Montant croissant',
      sortPage: 'Ordre de la liste',
      noBrand: 'Sans marque',
      toggleBrands: 'Afficher / masquer le détail par marque',
      ownBrand: 'Marque propre',
      handoverMissing: 'Adresse ou plage horaire manquante',
      disabledMsg: 'Extension « Totaux par rayon » désactivée : la structure de ' +
        'la page Collect&Go a changé. L\'extension doit être mise à jour.',
      article: 'article',
      articles: 'articles',
      qArticles: 'Articles',
      qWeight: 'Poids',
      qVolume: 'Volume'
    },
    nl: {
      recapTitle: 'Totaal per afdeling',
      sortDesc: 'Bedrag aflopend',
      sortAsc: 'Bedrag oplopend',
      sortPage: 'Volgorde van de lijst',
      noBrand: 'Geen merk',
      toggleBrands: 'Detail per merk tonen / verbergen',
      ownBrand: 'Eigen merk',
      handoverMissing: 'Adres of tijdslot ontbreekt',
      disabledMsg: 'Extensie « Totaal per afdeling » uitgeschakeld: de structuur ' +
        'van de Collect&Go-pagina is gewijzigd. De extensie moet worden bijgewerkt.',
      article: 'artikel',
      articles: 'artikelen',
      qArticles: 'Artikelen',
      qWeight: 'Gewicht',
      qVolume: 'Volume'
    }
  };

  // Marques propres Colruyt (clés = token de tête en majuscules). Éditable.
  var OWN_BRANDS = {
    BONI: 1,        // Boni Selection, Boni Bio, Boni Plan'T…
    EVERYDAY: 1,
    'BIO-TIME': 1,
    BIOTIME: 1
  };

  function isOwnBrand(brand) {
    return !!OWN_BRANDS[brand];
  }

  // Rayons dont l'accordéon (détail par marque) est déplié (mémorisé en session).
  var expandedBrands = {};

  // En-têtes de gauche dont l'accordéon « quantités » est déplié.
  var expandedHeaders = {};

  // Repli initial (une fois) des accordéons natifs de la sidebar.
  var accAutoCollapsed = { handover: false, promo: false };
  var cgStartTime = Date.now();
  // Fenêtre pendant laquelle on tente le repli initial (le temps que la
  // sidebar Vue se rende), après quoi on n'y touche plus (respect de l'usager).
  var AUTO_COLLAPSE_WINDOW_MS = 6000;

  // Mode de tri courant du récap (mémorisé entre les recalculs / rechargements).
  var sortMode = loadSortMode();

  function loadSortMode() {
    try {
      var v = window.localStorage.getItem(SORT_KEY);
      if (v === 'desc' || v === 'asc' || v === 'page') return v;
    } catch (e) { /* localStorage indisponible */ }
    return 'desc';
  }

  function saveSortMode(mode) {
    try { window.localStorage.setItem(SORT_KEY, mode); } catch (e) { /* noop */ }
  }

  // Options du tri (valeur + clé de libellé) pour le dropdown custom.
  var SORT_OPTIONS = [
    { value: 'desc', key: 'sortDesc' },
    { value: 'asc', key: 'sortAsc' },
    { value: 'page', key: 'sortPage' }
  ];
  function sortLabelKey(mode) {
    for (var i = 0; i < SORT_OPTIONS.length; i++) {
      if (SORT_OPTIONS[i].value === mode) return SORT_OPTIONS[i].key;
    }
    return SORT_OPTIONS[0].key;
  }
  // Ferme tout menu de tri ouvert (clic extérieur / Échap), posé une seule fois.
  var sortDocBound = false;
  function closeAllSortMenus() {
    var menus = document.querySelectorAll('.' + RECAP_CLASS + '__sort-menu');
    Array.prototype.forEach.call(menus, function (m) {
      if (m.hidden) return;
      m.hidden = true;
      var btn = m.parentElement &&
        m.parentElement.querySelector('.' + RECAP_CLASS + '__sort-button');
      if (btn) btn.setAttribute('aria-expanded', 'false');
    });
  }

  /**
   * Trie (en place) une liste d'objets ayant une propriété `total`, selon le
   * mode courant. 'page' conserve l'ordre d'origine (DOM / apparition).
   */
  function applySort(list) {
    if (sortMode === 'desc') {
      list.sort(function (a, b) { return b.total - a.total; });
    } else if (sortMode === 'asc') {
      list.sort(function (a, b) { return a.total - b.total; });
    }
    return list;
  }

  /**
   * Détecte la langue de la page (fr par défaut).
   * S'appuie sur l'URL (/nl/…/winkelwagen vs /fr/…/chariot) puis sur <html lang>.
   */
  function detectLang() {
    var path = location.pathname.toLowerCase();
    if (path.indexOf('/nl/') !== -1 || path.indexOf('winkelwagen') !== -1) {
      return 'nl';
    }
    if (path.indexOf('/fr/') !== -1 || path.indexOf('chariot') !== -1) {
      return 'fr';
    }
    var htmlLang = (document.documentElement.getAttribute('lang') || '').toLowerCase();
    return htmlLang.indexOf('nl') === 0 ? 'nl' : 'fr';
  }

  function t(key) {
    var lang = detectLang();
    return (LABELS[lang] && LABELS[lang][key]) || LABELS.fr[key];
  }

  // Fonctions pures (sans DOM) fournies par pure.js (injecté avant ce fichier).
  // Voir pure.js + test/pure.test.js.
  var parsePrice = CGPure.parsePrice;
  var formatPrice = CGPure.formatPrice;
  var extractBrand = CGPure.extractBrand;
  var displayBrand = CGPure.displayBrand;
  var parseQuantityFromName = CGPure.parseQuantityFromName;

  /**
   * Injecte une seule fois la feuille de style de l'extension.
   */
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      /* Compteur de catégorie sur une seule ligne. */
      '.category-heading .count{white-space:nowrap;}',
      '.' + TOTAL_CLASS + '{white-space:nowrap;}',
      /* Récapitulatif « Total par rayon » dans la sidebar. */
      '.' + RECAP_CLASS + '{margin-top:12px;padding-top:12px;' +
        'border-top:1px solid #d9dde6;}',
      '.' + RECAP_CLASS + '__header{display:flex;align-items:center;' +
        'justify-content:space-between;gap:8px;margin-bottom:6px;}',
      '.' + RECAP_CLASS + '__title{font-weight:700;color:#1C3661;}',
      /* Dropdown de tri custom. */
      '.' + RECAP_CLASS + '__sort{position:relative;}',
      '.' + RECAP_CLASS + '__sort-button{display:inline-flex;align-items:center;' +
        'gap:6px;font:inherit;font-size:0.8em;color:#1C3661;background:#fff;' +
        'border:1px solid #cbd2e0;border-radius:5px;padding:3px 8px;' +
        'line-height:1.2;cursor:pointer;' +
        'transition:border-color .12s ease,box-shadow .12s ease;}',
      '.' + RECAP_CLASS + '__sort-button:hover{border-color:#0055A2;}',
      '.' + RECAP_CLASS + '__sort-button[aria-expanded="true"]{' +
        'border-color:#0055A2;box-shadow:0 0 0 3px rgba(0,85,162,.15);}',
      '.' + RECAP_CLASS + '__sort-caret{font-size:0.9em;line-height:1;' +
        'transition:transform .12s ease;}',
      '.' + RECAP_CLASS + '__sort-button[aria-expanded="true"] .' +
        RECAP_CLASS + '__sort-caret{transform:rotate(180deg);}',
      '.' + RECAP_CLASS + '__sort-menu{position:absolute;top:calc(100% + 4px);' +
        'right:0;z-index:30;margin:0;padding:4px;list-style:none;' +
        'min-width:100%;background:#fff;border:1px solid #e2e4ed;' +
        'border-radius:8px;box-shadow:0 8px 24px rgba(28,54,97,.16);}',
      '.' + RECAP_CLASS + '__sort-option{padding:6px 10px;border-radius:5px;' +
        'font-size:0.82em;color:#1C3661;white-space:nowrap;cursor:pointer;}',
      '.' + RECAP_CLASS + '__sort-option:hover{background:#eef3fb;}',
      '.' + RECAP_CLASS + '__sort-option[aria-selected="true"]{font-weight:700;' +
        'color:#0055A2;}',
      '.' + RECAP_CLASS + '__row{display:flex;justify-content:space-between;' +
        'align-items:baseline;gap:12px;color:#1C3661;padding:3px 4px;' +
        'font-size:0.95em;cursor:pointer;border-radius:4px;' +
        'transition:background-color .12s ease;}',
      '.' + RECAP_CLASS + '__row:hover{background-color:#eef3fb;}',
      '.' + RECAP_CLASS + '__row:hover .' + RECAP_CLASS + '__name{' +
        'text-decoration:underline;}',
      '.' + RECAP_CLASS + '__name{flex:1 1 auto;min-width:0;overflow:hidden;' +
        'text-overflow:ellipsis;white-space:nowrap;}',
      '.' + RECAP_CLASS + '__value{flex:0 0 auto;font-weight:600;' +
        'white-space:nowrap;}',
      /* Chevron de l'accordéon « détail par marque ». */
      '.' + RECAP_CLASS + '__toggle{flex:0 0 auto;width:14px;padding:0;' +
        'border:0;background:none;color:#1C3661;font-size:0.8em;line-height:1;' +
        'cursor:pointer;transform:scale(1.5);transform-origin:center;' +
        'transition:transform .12s ease;}',
      '.' + RECAP_CLASS + '__toggle[aria-expanded="true"]{' +
        'transform:scale(1.5) rotate(90deg);}',
      '.' + RECAP_CLASS + '__spacer{flex:0 0 auto;width:14px;}',
      /* Détail par marque (sous-totaux) : indenté, avec trait guide. */
      '.' + RECAP_CLASS + '__brands{margin:2px 0 6px 9px;padding-left:13px;' +
        'border-left:2px solid #e2e4ed;}',
      '.' + RECAP_CLASS + '__brand{display:flex;align-items:center;gap:6px;' +
        'color:#63708a;font-size:0.82em;padding:1px 4px;}',
      /* Pastille « marque propre » (slot réservé pour garder l\'alignement). */
      '.' + RECAP_CLASS + '__brand-badge{flex:0 0 auto;width:7px;height:7px;' +
        'border-radius:50%;background:transparent;}',
      '.' + RECAP_CLASS + '__brand-badge.cg-own{background:#F5782D;}',
      '.' + RECAP_CLASS + '__brand-name{flex:1 1 auto;min-width:0;' +
        'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.' + RECAP_CLASS + '__brand-value{flex:0 0 auto;white-space:nowrap;}',
      /* Décalage pour ne pas masquer le rayon sous l'en-tête au scroll. */
      '.category{scroll-margin-top:100px;}',
      /* Flash visuel sur le rayon ciblé. */
      '@keyframes cg-flash{0%{background-color:rgba(5,135,199,.25);}' +
        '100%{background-color:transparent;}}',
      '.cg-flash{animation:cg-flash 1.2s ease-out;}',
      /* Garde la colonne de droite visible au scroll (avec défilement */
      /* interne si elle dépasse la hauteur de l'écran). */
      '.basket .sidebar{position:sticky;top:16px;align-self:flex-start;' +
        'max-height:calc(100vh - 32px);overflow-y:auto;}',
      /* Alerte sur l'en-tête « Données pour le retrait » du site. */
      '.cg-acc-warn{color:#CB0000 !important;}',
      '.cg-warn-badge{margin-left:6px;}',
      /* Accordéon « quantités » sur les en-têtes de rayon (à gauche). */
      '.header.background-blue.cg-hdr{cursor:pointer;}',
      '.cg-hdr-chevron{display:inline-flex;align-items:center;margin-left:8px;' +
        'color:currentColor;transition:transform .12s ease;}',
      '.header.background-blue[aria-expanded="true"] .cg-hdr-chevron{' +
        'transform:rotate(180deg);}',
      '.cg-hdr-panel{padding:8px 16px;font-size:0.85em;color:#1C3661;' +
        'background:#eef3fb;border-top:1px solid #dbe3ef;}',
      '.cg-hdr-grid{display:grid;grid-template-columns:auto 1fr auto;' +
        'gap:3px 18px;align-items:baseline;}',
      '.cg-hdr-k{color:#63708a;}',
      '.cg-hdr-v{text-align:right;white-space:nowrap;}',
      '.cg-hdr-u{text-align:right;white-space:nowrap;color:#63708a;}',
      /* Bandeau « extension désactivée » (auto-test de structure). */
      '.cg-banner{display:flex;align-items:flex-start;gap:8px;font:inherit;' +
        'font-size:0.9em;line-height:1.35;box-sizing:border-box;}',
      '.cg-banner__icon{flex:0 0 auto;}',
      '.cg-banner--sidebar{margin-top:12px;padding:10px 12px;' +
        'background:#fdecec;border:1px solid #f3c2c2;color:#b3261e;' +
        'border-radius:8px;}',
      '.cg-banner--top{position:fixed;top:0;left:0;right:0;' +
        'z-index:2147483647;padding:10px 16px;background:#CB0000;color:#fff;' +
        'justify-content:center;text-align:left;' +
        'box-shadow:0 2px 8px rgba(0,0,0,.25);}'
    ].join('');
    (document.head || document.documentElement).appendChild(style);
  }

  /**
   * Récupère le prix total (desktop) d'un produit.
   */
  function getItemPrice(item) {
    var priceEls = item.querySelectorAll('.ds-product-total-price.is-p1__bold');
    var price = null;
    priceEls.forEach(function (priceEl) {
      // Version desktop uniquement : exclure la version --mobile.
      if (priceEl.classList.contains('--mobile')) return;
      var value = parsePrice(priceEl.textContent);
      if (value !== null) price = (price || 0) + value;
    });
    return price;
  }

  /**
   * Prix unitaire principal d'un produit (sr-only « Prix: 1,70 € … »).
   */
  function readMainPrice(item) {
    var sr = item.querySelector('.ds-product-price__price .sr-only');
    return sr ? parsePrice(sr.textContent) : null;
  }

  /**
   * Détermine la base de prix d'un produit et les prix au kg / au litre.
   * Retourne { mainUnit:'pce'|'kg'|'l'|null, perKg, perL }.
   */
  function readUnitPrices(item) {
    var mainUnit = null;
    var unitEl = item.querySelector('.ds-product-price__price .ds-product-price__unit');
    if (unitEl) {
      var u = unitEl.textContent.replace('/', '').trim().toLowerCase();
      if (u.indexOf('pce') === 0 || u === 'pc') mainUnit = 'pce';
      else if (u === 'kg') mainUnit = 'kg';
      else if (u === 'l') mainUnit = 'l';
    }
    var perKg = null;
    var perL = null;
    var sec = item.querySelector('.ds-product-price__unit-price .sr-only') ||
      item.querySelector('.ds-product-price__unit-price');
    if (sec) {
      var txt = sec.textContent;
      var val = parsePrice(txt);
      if (val !== null) {
        if (/kg|kilogramme/i.test(txt)) perKg = val;
        else if (/litre|\bl\b|\/l/i.test(txt)) perL = val;
      }
    }
    if (mainUnit === 'kg' && perKg === null) perKg = readMainPrice(item);
    if (mainUnit === 'l' && perL === null) perL = readMainPrice(item);
    return { mainUnit: mainUnit, perKg: perKg, perL: perL };
  }

  /**
   * Nombre réel d'unités d'un produit (lecture du stepper × taille de pack).
   * Retourne { value, isArticle } — isArticle=false pour le vrac au poids.
   */
  function readUnits(item) {
    var input = item.querySelector('input.ds-input--number');
    var val = input ? parseFloat(String(input.value || '').replace(',', '.')) : NaN;
    if (isNaN(val)) val = 0;
    var packEl = item.querySelector('.ds-input--number-append_pack');
    var packSize = packEl ? parseInt(packEl.textContent, 10) : NaN;
    if (!isNaN(packSize)) return { value: val * packSize, isArticle: true };
    if (item.querySelector('.ds-input--number-unit')) {
      return { value: val, isArticle: true }; // unité « pce/pcs »
    }
    return { value: val, isArticle: false };   // vrac au poids
  }

  /**
   * Calcule, pour une catégorie, le total, les sous-totaux par marque et les
   * agrégats de quantité (articles, poids, volume). Retourne null si aucun prix.
   */
  function computeCategory(category) {
    var items = category.querySelectorAll('.ds-product-list-item-container');
    var total = 0;
    var found = false;
    var brandMap = {};
    var q = { units: 0, grams: 0, gramsPrice: 0, ml: 0, mlPrice: 0 };

    items.forEach(function (item) {
      var price = getItemPrice(item);
      if (price === null) return;
      total += price;
      found = true;

      var titleEl = item.querySelector('.ds-product-tag span[role="heading"]') ||
        item.querySelector('.ds-product-tag span');
      var name = titleEl
        ? (titleEl.getAttribute('title') || titleEl.textContent || '').trim()
        : '';
      var brand = extractBrand(name) || t('noBrand');
      brandMap[brand] = (brandMap[brand] || 0) + price;

      // Quantités.
      var units = readUnits(item);
      var up = readUnitPrices(item);
      var qn = parseQuantityFromName(name);

      if (units.isArticle) q.units += units.value;

      var grams = null;
      if (qn.grams != null && units.isArticle) grams = units.value * qn.grams;
      else if (up.mainUnit === 'kg' && up.perKg) grams = (price / up.perKg) * 1000;
      if (grams) { q.grams += grams; q.gramsPrice += price; }

      var ml = null;
      if (qn.ml != null && units.isArticle) ml = units.value * qn.ml;
      else if (up.mainUnit === 'l' && up.perL) ml = (price / up.perL) * 1000;
      if (ml) { q.ml += ml; q.mlPrice += price; }
    });

    if (!found) return null;

    // Ordre d'apparition (Object.keys conserve l'ordre d'insertion) ; le tri
    // effectif est appliqué ensuite selon le mode choisi.
    var brands = Object.keys(brandMap).map(function (b) {
      return { brand: b, total: brandMap[b] };
    });

    return { total: total, brands: brands, quantities: q };
  }

  /**
   * Met à jour le total affiché à côté du compteur « X produits ».
   */
  function updateCountLabel(category, totalText) {
    var countEl = category.querySelector('.category-heading .count');
    if (!countEl) return;

    if (countEl.getAttribute(PROCESSED_ATTR) === '1') {
      var existing = countEl.querySelector('.' + TOTAL_CLASS);
      if (existing) {
        if (existing.textContent !== totalText) {
          existing.textContent = totalText;
        }
        return;
      }
    }

    // Première fois (ou nœud disparu) : ajouter le total au compteur.
    var totalEl = document.createElement('strong');
    totalEl.className = TOTAL_CLASS;
    totalEl.textContent = totalText;

    countEl.appendChild(document.createTextNode(' — '));
    countEl.appendChild(totalEl);
    countEl.setAttribute(PROCESSED_ATTR, '1');
  }

  /**
   * Récupère le libellé d'une catégorie.
   */
  function getCategoryTitle(category) {
    var titleEl = category.querySelector('.category-heading .title');
    return titleEl ? titleEl.textContent.trim() : '';
  }

  /**
   * Construit / met à jour le récapitulatif « Total par rayon » dans la sidebar,
   * juste après le bloc « Total estimé ».
   */
  function renderRecap(rows) {
    // Ancrage : le bloc des totaux de la sidebar (Produits, Réductions, …).
    var orderTotals = document.querySelector('.sidebar .order-totals');
    if (!orderTotals) return;

    var recap = ensureRecap(orderTotals);

    // Titre traduit (au cas où la langue serait détectée après coup).
    var titleEl = recap.querySelector('.' + RECAP_CLASS + '__title');
    if (titleEl && titleEl.textContent !== t('recapTitle')) {
      titleEl.textContent = t('recapTitle');
    }

    // On ne reconstruit la liste que si les données ont réellement changé
    // (sinon le survol clignoterait, la page mutant en continu). L'état déplié
    // des accordéons est restauré via `expandedBrands`.
    var list = recap.querySelector('.' + RECAP_CLASS + '__list');
    var signature = recapSignature(rows);
    if (list.getAttribute('data-cg-sig') === signature && list.firstChild) {
      return;
    }
    list.setAttribute('data-cg-sig', signature);
    list.textContent = '';
    rows.forEach(function (row) {
      list.appendChild(buildRecapItem(row));
    });
  }

  /**
   * Signature des données du récap (titres, totaux, marques, tri) : sert à
   * éviter toute reconstruction inutile du DOM (et donc le scintillement).
   */
  function recapSignature(rows) {
    var parts = [sortMode];
    rows.forEach(function (r) {
      parts.push(r.title + '=' + r.total.toFixed(2));
      if (r.brands) {
        r.brands.forEach(function (b) {
          parts.push(b.brand + ':' + b.total.toFixed(2));
        });
      }
      parts.push('#');
    });
    return parts.join('|');
  }

  /**
   * Construit un item du récap : ligne (chevron + nom + total) et, si plus
   * d'une marque, le panneau accordéon des sous-totaux par marque.
   */
  function buildRecapItem(row) {
    // Accordéon disponible pour tout rayon ayant au moins une marque
    // (donc tous) — par cohérence, même les rayons mono-marque.
    var hasBrands = row.brands && row.brands.length > 0;
    var expanded = hasBrands && expandedBrands[row.title] === true;

    var item = document.createElement('div');
    item.className = RECAP_CLASS + '__item';
    item.setAttribute('data-cg-cat', row.title);

    var rowEl = document.createElement('div');
    rowEl.className = RECAP_CLASS + '__row';
    // Référence vers le rayon (pour le scroll au clic sur le nom).
    rowEl.__cgCategory = row.category;

    // Chevron (ou simple espace pour aligner les rayons mono-marque).
    if (hasBrands) {
      var toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = RECAP_CLASS + '__toggle';
      toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      toggle.setAttribute('aria-label', t('toggleBrands'));
      toggle.textContent = '▸';
      rowEl.appendChild(toggle);
    } else {
      var spacer = document.createElement('span');
      spacer.className = RECAP_CLASS + '__spacer';
      rowEl.appendChild(spacer);
    }

    var name = document.createElement('span');
    name.className = RECAP_CLASS + '__name';
    name.textContent = row.title;
    rowEl.appendChild(name);

    var value = document.createElement('span');
    value.className = RECAP_CLASS + '__value';
    value.textContent = formatPrice(row.total);
    rowEl.appendChild(value);

    item.appendChild(rowEl);

    if (hasBrands) {
      var panel = document.createElement('div');
      panel.className = RECAP_CLASS + '__brands';
      panel.hidden = !expanded;
      row.brands.forEach(function (b) {
        var line = document.createElement('div');
        line.className = RECAP_CLASS + '__brand';

        var badge = document.createElement('span');
        badge.className = RECAP_CLASS + '__brand-badge';
        if (isOwnBrand(b.brand)) {
          badge.className += ' cg-own';
          badge.setAttribute('title', t('ownBrand'));
          badge.setAttribute('aria-label', t('ownBrand'));
        }

        var bn = document.createElement('span');
        bn.className = RECAP_CLASS + '__brand-name';
        bn.textContent = displayBrand(b.brand);

        var bv = document.createElement('span');
        bv.className = RECAP_CLASS + '__brand-value';
        bv.textContent = formatPrice(b.total);

        line.appendChild(badge);
        line.appendChild(bn);
        line.appendChild(bv);
        panel.appendChild(line);
      });
      item.appendChild(panel);
    }

    return item;
  }

  /**
   * Déplie / replie l'accordéon des marques d'un item.
   */
  function toggleRecapItem(item) {
    var title = item.getAttribute('data-cg-cat');
    var open = !(expandedBrands[title] === true);
    if (open) expandedBrands[title] = true;
    else delete expandedBrands[title];

    var panel = item.querySelector('.' + RECAP_CLASS + '__brands');
    var toggle = item.querySelector('.' + RECAP_CLASS + '__toggle');
    if (panel) panel.hidden = !open;
    if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  /**
   * Construit (une seule fois) la structure du récap : en-tête (titre +
   * dropdown de tri) et conteneur de lignes. Pose aussi les listeners.
   */
  function ensureRecap(orderTotals) {
    var recap = orderTotals.querySelector('.' + RECAP_CLASS);
    if (recap) return recap;

    recap = document.createElement('div');
    recap.className = RECAP_CLASS;

    var header = document.createElement('div');
    header.className = RECAP_CLASS + '__header';

    var title = document.createElement('div');
    title.className = RECAP_CLASS + '__title';
    title.textContent = t('recapTitle');

    // Dropdown de tri custom (menu homogène, identique sur tous les navigateurs).
    var sort = document.createElement('div');
    sort.className = RECAP_CLASS + '__sort';

    var sortBtn = document.createElement('button');
    sortBtn.type = 'button';
    sortBtn.className = RECAP_CLASS + '__sort-button';
    sortBtn.setAttribute('aria-haspopup', 'listbox');
    sortBtn.setAttribute('aria-expanded', 'false');

    var sortLabel = document.createElement('span');
    sortLabel.className = RECAP_CLASS + '__sort-label';
    sortLabel.textContent = t(sortLabelKey(sortMode));

    var caret = document.createElement('span');
    caret.className = RECAP_CLASS + '__sort-caret';
    caret.textContent = '▾';
    caret.setAttribute('aria-hidden', 'true');

    sortBtn.appendChild(sortLabel);
    sortBtn.appendChild(caret);

    var menu = document.createElement('ul');
    menu.className = RECAP_CLASS + '__sort-menu';
    menu.setAttribute('role', 'listbox');
    menu.hidden = true;

    SORT_OPTIONS.forEach(function (opt) {
      var li = document.createElement('li');
      li.className = RECAP_CLASS + '__sort-option';
      li.setAttribute('role', 'option');
      li.setAttribute('data-value', opt.value);
      li.setAttribute('aria-selected', opt.value === sortMode ? 'true' : 'false');
      li.textContent = t(opt.key);
      menu.appendChild(li);
    });

    // Ouvre/ferme le menu (stopPropagation pour ne pas fermer aussitôt).
    sortBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      var willOpen = menu.hidden;
      closeAllSortMenus();
      if (willOpen) {
        menu.hidden = false;
        sortBtn.setAttribute('aria-expanded', 'true');
      }
    });

    // Sélection d'une option.
    menu.addEventListener('click', function (e) {
      e.stopPropagation();
      var li = e.target.closest
        ? e.target.closest('.' + RECAP_CLASS + '__sort-option')
        : null;
      if (li) {
        var val = li.getAttribute('data-value');
        if (val && val !== sortMode) {
          sortMode = val;
          saveSortMode(sortMode);
          sortLabel.textContent = t(sortLabelKey(sortMode));
          Array.prototype.forEach.call(
            menu.querySelectorAll('.' + RECAP_CLASS + '__sort-option'),
            function (o) {
              o.setAttribute(
                'aria-selected',
                o.getAttribute('data-value') === sortMode ? 'true' : 'false'
              );
            }
          );
          updateTotals();
        }
      }
      closeAllSortMenus();
    });

    // Fermeture au clic extérieur / Échap (posée une seule fois).
    if (!sortDocBound) {
      sortDocBound = true;
      document.addEventListener('click', closeAllSortMenus);
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeAllSortMenus();
      });
    }

    sort.appendChild(sortBtn);
    sort.appendChild(menu);

    header.appendChild(title);
    header.appendChild(sort);

    var list = document.createElement('div');
    list.className = RECAP_CLASS + '__list';
    // Listener délégué : chevron => (dé)plie le détail par marque ;
    // clic sur le nom => scroll vers le rayon.
    list.addEventListener('click', function (e) {
      if (!e.target.closest) return;
      var toggle = e.target.closest('.' + RECAP_CLASS + '__toggle');
      if (toggle) {
        var item = toggle.closest('.' + RECAP_CLASS + '__item');
        if (item) toggleRecapItem(item);
        return;
      }
      var rowEl = e.target.closest('.' + RECAP_CLASS + '__row');
      if (rowEl && rowEl.__cgCategory) scrollToCategory(rowEl.__cgCategory);
    });

    recap.appendChild(header);
    recap.appendChild(list);
    // Ajouté en fin de bloc => juste après la ligne « Total estimé ».
    orderTotals.appendChild(recap);
    return recap;
  }

  /**
   * Fait défiler la page jusqu'au rayon ciblé et le met brièvement en évidence.
   */
  function scrollToCategory(category) {
    if (!category) return;
    category.scrollIntoView({ behavior: 'smooth', block: 'start' });
    category.classList.remove('cg-flash');
    // Force un reflow pour pouvoir relancer l'animation si on reclique.
    void category.offsetWidth;
    category.classList.add('cg-flash');
    setTimeout(function () {
      category.classList.remove('cg-flash');
    }, 1300);
  }

  /* ------------------------------------------------------------------ *
   * Sidebar : on replie une fois (au démarrage) les blocs « retrait » et *
   * « code promo » via le mécanisme natif du site, et on ajoute ⚠️ + rouge *
   * sur l'en-tête « Données pour le retrait » si adresse/horaire manquent. *
   * ------------------------------------------------------------------ */

  function isTimeslotMissing(wrapper) {
    return !!wrapper.querySelector('.no-slot-text');
  }

  function isAddressMissing(wrapper) {
    var a = wrapper.querySelector('.vue-address');
    return !a || !a.textContent.trim();
  }

  /**
   * Le bloc collapsible du site est-il ouvert (contenu visible) ?
   */
  function isCollapsibleOpen(wrapper) {
    var c = wrapper.querySelector('.collapsible-content');
    return !!(c && c.offsetHeight > 0);
  }

  /**
   * Ajoute ⚠️ et passe le titre en rouge (rouge uniquement quand replié)
   * sur l'en-tête « Données pour le retrait » du site.
   */
  function updateHandoverWarning(headerEl, wrapper) {
    var titleEl = headerEl.querySelector('.handover-info-title');
    if (!titleEl) return;
    var container = headerEl.querySelector('.title-and-chevron') || headerEl;

    var missing = isAddressMissing(wrapper) || isTimeslotMissing(wrapper);
    var warn = container.querySelector('.cg-warn-badge');
    if (missing && !warn) {
      warn = document.createElement('span');
      warn.className = 'cg-warn-badge';
      warn.textContent = '⚠️';
      warn.setAttribute('title', t('handoverMissing'));
      warn.setAttribute('aria-label', t('handoverMissing'));
      var chevron = container.querySelector('.header-chevron');
      if (chevron) container.insertBefore(warn, chevron);
      else container.appendChild(warn);
    } else if (warn) {
      warn.hidden = !missing;
    }

    // Titre en rouge tant qu'il manque l'adresse ou l'horaire (ouvert ou fermé).
    if (missing) titleEl.classList.add('cg-acc-warn');
    else titleEl.classList.remove('cg-acc-warn');
  }

  /**
   * Replie une fois (au démarrage) les accordéons du site et entretient
   * l'alerte du bloc « retrait ». Idempotent : ré-appelable à chaque recalcul.
   */
  function ensureSidebarAccordions() {
    var headers = document.querySelectorAll('.sidebar .header.collapsible');
    headers.forEach(function (headerEl) {
      var wrapper = headerEl.parentElement;
      if (!wrapper || !wrapper.querySelector('.collapsible-content')) return;

      var isHandover = !!headerEl.querySelector('.handover-info-title');
      var isPromo = !!headerEl.querySelector('.promo-code-title');
      if (!isHandover && !isPromo) return;
      var id = isHandover ? 'handover' : 'promo';

      // Replier une seule fois, avec le mécanisme du site (chevron + contenu
      // restent cohérents). On réessaie tant que le bloc n'est pas encore
      // rendu/ouvert ; passé la fenêtre, on n'y touche plus (respect de
      // l'usager, qui reste libre de replier/déplier ensuite).
      if (!accAutoCollapsed[id]) {
        if (isCollapsibleOpen(wrapper)) {
          var clicker = headerEl.querySelector('.title-and-chevron') || headerEl;
          clicker.click();
          accAutoCollapsed[id] = true;
        } else if (Date.now() - cgStartTime > AUTO_COLLAPSE_WINDOW_MS) {
          accAutoCollapsed[id] = true;
        }
      }

      if (isHandover) updateHandoverWarning(headerEl, wrapper);
    });
  }

  /* ------------------------------------------------------------------ *
   * Accordéon « quantités » sur les en-têtes de rayon (à gauche).        *
   * On enrobe l'en-tête du site en accordéon (chevron + panneau), sans   *
   * toucher à son contenu ; le panneau résume articles / poids / volume. *
   * ------------------------------------------------------------------ */

  function formatInt(n) { return String(Math.round(n)); }

  function formatWeight(grams) {
    if (grams < 1000) return Math.round(grams) + ' g';
    return (grams / 1000).toFixed(1).replace('.', ',') + ' kg';
  }

  function formatVolume(ml) {
    if (ml < 1000) return Math.round(ml) + ' ml';
    var l = ml / 1000;
    var s = (Math.round(l * 10) % 10 === 0) ? String(Math.round(l))
      : l.toFixed(1).replace('.', ',');
    return s + ' L';
  }

  /**
   * Construit le résumé quantités d'un rayon (« 23 articles • ≈ 19,6 kg ·
   * 2,21 €/kg • 12 L · 0,55 €/L »), ne gardant que les parties disponibles.
   */
  /**
   * Lignes du panneau quantités : [{ label, value, unit }], une par métrique
   * disponible (articles / poids / volume). Colonnes : libellé · quantité · €.
   */
  function buildQuantityRows(q) {
    if (!q) return [];
    var rows = [];
    if (q.units > 0) {
      rows.push({ label: t('qArticles'), value: formatInt(q.units), unit: '' });
    }
    if (q.grams > 0) {
      rows.push({
        label: t('qWeight'),
        value: '≈ ' + formatWeight(q.grams),
        unit: q.gramsPrice > 0
          ? formatPrice(q.gramsPrice / (q.grams / 1000)) + '/kg' : ''
      });
    }
    if (q.ml > 0) {
      rows.push({
        label: t('qVolume'),
        value: formatVolume(q.ml),
        unit: q.mlPrice > 0
          ? formatPrice(q.mlPrice / (q.ml / 1000)) + '/L' : ''
      });
    }
    return rows;
  }

  function headerTitleOf(header) {
    var el = header.querySelector('.title');
    return el ? el.textContent.trim() : '';
  }

  /**
   * Synchronise l'état (déplié/replié) d'un en-tête avec `expandedHeaders`.
   */
  function applyHeaderState(header) {
    var title = headerTitleOf(header);
    var open = expandedHeaders[title] === true;
    header.setAttribute('aria-expanded', open ? 'true' : 'false');
    var parent = header.parentNode;
    var panel = parent && parent.querySelector
      ? parent.querySelector('.cg-hdr-panel') : null;
    if (panel) panel.hidden = !open;
  }

  /**
   * (Re)pose l'accordéon « quantités » sur l'en-tête d'un rayon et met à jour
   * son panneau. Idempotent. N'altère pas le contenu existant de l'en-tête.
   */
  function ensureHeaderAccordion(category, q) {
    var header = category.querySelector('.header.background-blue');
    if (!header) return;
    var qrows = buildQuantityRows(q);

    // Panneau (frère, juste après l'en-tête).
    var parent = header.parentNode;
    if (!parent) return;
    var panel = parent.querySelector('.cg-hdr-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.className = 'cg-hdr-panel';
      panel.hidden = true;
      parent.insertBefore(panel, header.nextSibling);
    }

    // Grille label · quantité · prix (reconstruite seulement si ça change).
    var sig = JSON.stringify(qrows);
    if (panel.getAttribute('data-cg-qsig') !== sig) {
      panel.setAttribute('data-cg-qsig', sig);
      panel.textContent = '';
      var grid = document.createElement('div');
      grid.className = 'cg-hdr-grid';
      qrows.forEach(function (r) {
        var k = document.createElement('span');
        k.className = 'cg-hdr-k';
        k.textContent = r.label;
        var v = document.createElement('span');
        v.className = 'cg-hdr-v';
        v.textContent = r.value;
        var u = document.createElement('span');
        u.className = 'cg-hdr-u';
        u.textContent = r.unit;
        grid.appendChild(k);
        grid.appendChild(v);
        grid.appendChild(u);
      });
      panel.appendChild(grid);
    }

    // Chevron (dans .title-and-chevron, l'emplacement prévu par le site).
    var tac = header.querySelector('.title-and-chevron') || header;
    var chevron = tac.querySelector('.cg-hdr-chevron');
    if (!chevron) {
      chevron = document.createElement('span');
      chevron.className = 'cg-hdr-chevron';
      chevron.setAttribute('aria-hidden', 'true');
      // Chevron natif du site (même tracé que ses menus déroulants d'en-tête).
      chevron.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" ' +
        'fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 10L12 14L16 10" ' +
        'stroke="currentColor" stroke-width="1.5" stroke-linecap="round" ' +
        'stroke-linejoin="round"></path></svg>';
      tac.appendChild(chevron);
    }

    // Pas de données : on n'affiche pas l'accordéon.
    var hasData = qrows.length > 0;
    chevron.style.display = hasData ? '' : 'none';
    if (hasData) header.classList.add('cg-hdr');
    else header.classList.remove('cg-hdr');
    if (!hasData) { expandedHeaders[headerTitleOf(header)] = false; }

    // Clic = (dé)plier (listener posé une seule fois sur l'en-tête).
    if (!header.__cgHdrBound) {
      header.__cgHdrBound = true;
      header.addEventListener('click', function () {
        if (!header.classList.contains('cg-hdr')) return; // pas de données
        var title = headerTitleOf(header);
        expandedHeaders[title] = !(expandedHeaders[title] === true);
        applyHeaderState(header);
      });
    }

    applyHeaderState(header);
  }

  /* ------------------------------------------------------------------ *
   * Auto-test de structure : vérifie que la page expose toujours ce dont *
   * l'extension a besoin ; sinon, désactive et affiche un bandeau.       *
   * ------------------------------------------------------------------ */

  /**
   * Le premier prix « desktop » trouvé est-il lisible (format intact) ?
   */
  function firstDesktopPriceReadable(scope) {
    var els = scope.querySelectorAll('.ds-product-total-price.is-p1__bold');
    for (var i = 0; i < els.length; i++) {
      if (els[i].classList.contains('--mobile')) continue;
      return parsePrice(els[i].textContent) !== null;
    }
    return false;
  }

  /**
   * Construit un bandeau d'alerte (sidebar ou pleine largeur en haut).
   */
  function buildBanner(isTop, message) {
    var div = document.createElement('div');
    div.id = BANNER_ID;
    div.className = 'cg-banner ' + (isTop ? 'cg-banner--top' : 'cg-banner--sidebar');
    div.setAttribute('role', 'alert');
    var icon = document.createElement('span');
    icon.className = 'cg-banner__icon';
    icon.textContent = '⚠️';
    var text = document.createElement('span');
    text.textContent = message;
    div.appendChild(icon);
    div.appendChild(text);
    return div;
  }

  /**
   * Affiche (une seule fois) le bandeau « désactivée » : à la place du détail
   * ajouté (dans la sidebar) si possible, sinon en rouge tout en haut de la page.
   */
  function ensureDisabledBanner() {
    if (document.getElementById(BANNER_ID)) return;

    // Retire notre récap éventuel (on n'affiche plus de détail potentiellement faux).
    var recap = document.querySelector('.' + RECAP_CLASS);
    if (recap && recap.parentNode) recap.parentNode.removeChild(recap);

    var message = t('disabledMsg');
    var anchor = document.querySelector('.sidebar .order-totals') ||
      document.querySelector('.sidebar');
    if (anchor) {
      anchor.appendChild(buildBanner(false, message));
    } else {
      // Plus aucun ancrage : bandeau rouge tout en haut de la page.
      document.body.insertBefore(buildBanner(true, message), document.body.firstChild);
    }
  }

  /**
   * Vérifie la structure attendue. Retourne true si l'extension peut opérer.
   * Ne conclut à un changement de structure que si des produits sont présents
   * mais que les éléments attendus manquent (anti-faux-positif au chargement).
   */
  function verifyStructure() {
    if (featuresDisabled) {
      ensureDisabledBanner();
      return false;
    }

    var basket = document.querySelector('.simple-basket');
    if (!basket) {
      // Panier pas encore rendu (ou vide via une autre vue) : on patiente.
      structureFailStreak = 0;
      return false;
    }

    var items = basket.querySelectorAll('.ds-product-list-item-container');
    if (items.length === 0) {
      // Panier sans produits : rien à faire, ce n'est pas une erreur.
      structureFailStreak = 0;
      return false;
    }

    // Des produits existent : on doit retrouver sections, compteur et prix lisible.
    var ok = !!basket.querySelector('.category') &&
      !!basket.querySelector('.category-heading .count') &&
      firstDesktopPriceReadable(basket);

    if (ok) {
      structureFailStreak = 0;
      return true;
    }

    // Échec : on attend quelques cycles avant de désactiver (anti-transitoire).
    structureFailStreak++;
    if (structureFailStreak >= STRUCTURE_FAIL_LIMIT) {
      featuresDisabled = true;
      ensureDisabledBanner();
    }
    return false;
  }

  /**
   * Recalcule l'ensemble : libellés par catégorie + récapitulatif sidebar.
   */
  function updateTotals() {
    if (!verifyStructure()) return;

    var categories = document.querySelectorAll('.category');
    var rows = [];

    categories.forEach(function (category) {
      var info = computeCategory(category);
      if (info === null) return;
      updateCountLabel(category, formatPrice(info.total));
      ensureHeaderAccordion(category, info.quantities);
      // Le tri s'applique aussi aux marques au sein de chaque rayon.
      applySort(info.brands);
      rows.push({
        title: getCategoryTitle(category),
        total: info.total,
        brands: info.brands,
        category: category
      });
    });

    // Récap trié selon le choix de l'utilisateur (les libellés des compteurs
    // dans la liste, eux, restent toujours dans l'ordre de la page).
    applySort(rows);

    renderRecap(rows);

    // Accordéons de la sidebar (retrait + code promo).
    ensureSidebarAccordions();
  }

  // Debounce avec délai maximal : on regroupe les mutations rapprochées, mais
  // on garantit une exécution au plus tard toutes les MAX_WAIT_MS.
  var debounceTimer = null;
  var maxWaitTimer = null;

  function runUpdate() {
    if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
    if (maxWaitTimer) { clearTimeout(maxWaitTimer); maxWaitTimer = null; }
    updateTotals();
  }

  function scheduleUpdate() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(runUpdate, DEBOUNCE_MS);
    if (!maxWaitTimer) {
      maxWaitTimer = setTimeout(runUpdate, MAX_WAIT_MS);
    }
  }

  /**
   * Choisit le conteneur à observer : le wrapper Vue (`page-content`) si
   * présent — il englobe la liste et la sidebar tout en excluant les widgets
   * tiers (chat, etc.) — sinon `.basket`, sinon le `body` en dernier recours.
   */
  function getObserveTarget() {
    return (
      document.querySelector('page-content') ||
      document.querySelector('.basket') ||
      document.body
    );
  }

  /**
   * Observe le DOM du panier et relance le calcul à chaque mutation
   * (changement de quantité, suppression de produit, promo appliquée…).
   */
  function init() {
    injectStyles();

    var observer = new MutationObserver(scheduleUpdate);
    observer.observe(getObserveTarget(), {
      childList: true,
      subtree: true,
      characterData: true
    });

    // Calcul initial.
    updateTotals();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
