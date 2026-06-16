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

  var SORT_KEY = 'cgSortMode';

  // Libellés traduits (le site existe en FR et NL).
  var LABELS = {
    fr: {
      recapTitle: 'Total par rayon',
      sortDesc: 'Montant décroissant',
      sortAsc: 'Montant croissant',
      sortPage: 'Ordre de la liste',
      noBrand: 'Sans marque',
      toggleBrands: 'Afficher / masquer le détail par marque'
    },
    nl: {
      recapTitle: 'Totaal per afdeling',
      sortDesc: 'Bedrag aflopend',
      sortAsc: 'Bedrag oplopend',
      sortPage: 'Volgorde van de lijst',
      noBrand: 'Geen merk',
      toggleBrands: 'Detail per merk tonen / verbergen'
    }
  };

  // Rayons dont l'accordéon (détail par marque) est déplié (mémorisé en session).
  var expandedBrands = {};

  // État des accordéons de la sidebar (retrait / code promo). Repliés par défaut.
  var accCollapsed = { handover: true, promo: true };

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

  /**
   * Convertit un prix au format européen ("5,98 €" / "1 234,56 €") en nombre.
   * Retourne null si aucun nombre n'est trouvé.
   */
  function parsePrice(text) {
    if (!text) return null;
    // Conserver uniquement chiffres, virgules, points et signe négatif.
    var cleaned = text.replace(/[^0-9,.\-]/g, '').trim();
    if (!cleaned) return null;
    // Séparateur décimal = virgule. Supprimer les séparateurs de milliers (points).
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    var value = parseFloat(cleaned);
    return isNaN(value) ? null : value;
  }

  /**
   * Formate un nombre en prix européen ("12,34 €").
   */
  function formatPrice(value) {
    return value.toFixed(2).replace('.', ',') + ' €';
  }

  /**
   * Affiche une marque en casse de titre (BONI -> Boni) pour atténuer l'effet
   * « tout en majuscules ». Le regroupement reste basé sur la forme majuscule.
   */
  function displayBrand(brand) {
    if (!brand) return brand;
    return brand.charAt(0).toUpperCase() + brand.slice(1).toLowerCase();
  }

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
      '.' + RECAP_CLASS + '__sort{font:inherit;font-size:0.85em;color:#1C3661;' +
        'background:#fff;border:1px solid #d9dde6;border-radius:4px;' +
        'padding:2px 4px;cursor:pointer;max-width:55%;}',
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
        'cursor:pointer;transition:transform .12s ease;}',
      '.' + RECAP_CLASS + '__toggle[aria-expanded="true"]{transform:rotate(90deg);}',
      '.' + RECAP_CLASS + '__spacer{flex:0 0 auto;width:14px;}',
      /* Détail par marque (sous-totaux) : indenté, avec trait guide. */
      '.' + RECAP_CLASS + '__brands{margin:2px 0 6px 9px;padding-left:13px;' +
        'border-left:2px solid #e2e4ed;}',
      '.' + RECAP_CLASS + '__brand{display:flex;justify-content:space-between;' +
        'gap:12px;color:#63708a;font-size:0.82em;padding:1px 4px;}',
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
      /* Accordéons « repliés par défaut » (retrait + code promo). */
      '.cg-acc .header.collapsible{display:none !important;}',
      '.cg-acc.cg-collapsed .collapsible-content{display:none !important;}',
      '.cg-acc-header{display:flex;align-items:center;gap:8px;cursor:pointer;' +
        'padding:12px 0;-webkit-user-select:none;user-select:none;}',
      '.cg-acc-header__chevron{flex:0 0 auto;color:#1C3661;font-size:0.8em;' +
        'line-height:1;transition:transform .12s ease;}',
      '.cg-acc:not(.cg-collapsed) .cg-acc-header__chevron{transform:rotate(90deg);}',
      '.cg-acc-header__title{flex:1 1 auto;font-weight:700;color:#1C3661;}',
      '.cg-acc-header__title.cg-warn{color:#CB0000;}',
      '.cg-acc-header__warn{flex:0 0 auto;}'
    ].join('');
    (document.head || document.documentElement).appendChild(style);
  }

  /**
   * Extrait la marque d'un libellé produit : le token de tête s'il est en
   * majuscules (ex. « BONI ananas… » -> « BONI », « DUYVIS CRAC-A-NUT… » ->
   * « DUYVIS »). Retourne null sinon (ex. « Abricot rouge 500g »).
   */
  function extractBrand(title) {
    if (!title) return null;
    var first = (title.trim().split(/\s+/)[0] || '');
    if (first.length >= 2 && /[A-ZÀ-Ý]/.test(first) && first === first.toUpperCase()) {
      return first;
    }
    return null;
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
   * Calcule, pour une catégorie, le total et les sous-totaux par marque.
   * Retourne { total, brands:[{brand,total}] } (brands trié décroissant),
   * ou null si aucun prix n'a été trouvé.
   */
  function computeCategory(category) {
    var items = category.querySelectorAll('.ds-product-list-item-container');
    var total = 0;
    var found = false;
    var brandMap = {};

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
    });

    if (!found) return null;

    // Ordre d'apparition (Object.keys conserve l'ordre d'insertion) ; le tri
    // effectif est appliqué ensuite selon le mode choisi.
    var brands = Object.keys(brandMap).map(function (b) {
      return { brand: b, total: brandMap[b] };
    });

    return { total: total, brands: brands };
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
        var bn = document.createElement('span');
        bn.className = RECAP_CLASS + '__brand-name';
        bn.textContent = displayBrand(b.brand);
        var bv = document.createElement('span');
        bv.className = RECAP_CLASS + '__brand-value';
        bv.textContent = formatPrice(b.total);
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

    // Dropdown de tri.
    var select = document.createElement('select');
    select.className = RECAP_CLASS + '__sort';
    [['desc', 'sortDesc'], ['asc', 'sortAsc'], ['page', 'sortPage']].forEach(
      function (opt) {
        var option = document.createElement('option');
        option.value = opt[0];
        option.textContent = t(opt[1]);
        if (opt[0] === sortMode) option.selected = true;
        select.appendChild(option);
      }
    );
    select.addEventListener('change', function () {
      sortMode = select.value;
      saveSortMode(sortMode);
      updateTotals();
    });
    // Évite que le clic sur le select ne déclenche un scroll.
    select.addEventListener('click', function (e) { e.stopPropagation(); });

    header.appendChild(title);
    header.appendChild(select);

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
   * Accordéons de la sidebar (retrait + code promo), repliés par défaut. *
   * On remplace l'en-tête du site par le nôtre pour piloter l'état nous- *
   * mêmes (sans désynchroniser le chevron de Vue), de façon idempotente. *
   * ------------------------------------------------------------------ */

  function getAccTitle(headerEl) {
    var el = headerEl.querySelector('.handover-info-title, .promo-code-title');
    return el ? el.textContent.trim() : '';
  }

  function isTimeslotMissing(wrapper) {
    return !!wrapper.querySelector('.no-slot-text');
  }

  function isAddressMissing(wrapper) {
    var a = wrapper.querySelector('.vue-address');
    return !a || !a.textContent.trim();
  }

  function applyCollapsed(wrapper, collapsed) {
    if (collapsed) wrapper.classList.add('cg-collapsed');
    else wrapper.classList.remove('cg-collapsed');
  }

  /**
   * Met à jour le ⚠️ et le titre rouge (rouge uniquement quand replié).
   */
  function updateAccWarning(wrapper, myHeader, isHandover, collapsed) {
    var warnEl = myHeader.querySelector('.cg-acc-header__warn');
    var titleEl = myHeader.querySelector('.cg-acc-header__title');
    var missing = isHandover &&
      (isAddressMissing(wrapper) || isTimeslotMissing(wrapper));
    if (warnEl) warnEl.hidden = !missing;
    if (titleEl) {
      if (missing && collapsed) titleEl.classList.add('cg-warn');
      else titleEl.classList.remove('cg-warn');
    }
  }

  function buildAccHeader(titleText, id, wrapper, isHandover) {
    var h = document.createElement('div');
    h.className = 'cg-acc-header';

    var chevron = document.createElement('span');
    chevron.className = 'cg-acc-header__chevron';
    chevron.textContent = '▸';

    var title = document.createElement('span');
    title.className = 'cg-acc-header__title';
    title.textContent = titleText;

    var warn = document.createElement('span');
    warn.className = 'cg-acc-header__warn';
    warn.textContent = '⚠️';
    warn.hidden = true;

    h.appendChild(chevron);
    h.appendChild(title);
    h.appendChild(warn);

    h.addEventListener('click', function () {
      accCollapsed[id] = !accCollapsed[id];
      applyCollapsed(wrapper, accCollapsed[id]);
      updateAccWarning(wrapper, h, isHandover, accCollapsed[id]);
    });

    return h;
  }

  /**
   * (Re)pose nos en-têtes d'accordéon sur les blocs « retrait » et
   * « code promo » de la sidebar. Idempotent : ré-applicable à chaque recalcul.
   */
  function ensureSidebarAccordions() {
    var headers = document.querySelectorAll('.sidebar .header.collapsible');
    headers.forEach(function (headerEl) {
      var wrapper = headerEl.parentElement;
      if (!wrapper) return;
      if (!wrapper.querySelector('.collapsible-content')) return;

      var isHandover = !!headerEl.querySelector('.handover-info-title');
      var isPromo = !!headerEl.querySelector('.promo-code-title');
      if (!isHandover && !isPromo) return;
      var id = isHandover ? 'handover' : 'promo';

      wrapper.classList.add('cg-acc');
      applyCollapsed(wrapper, accCollapsed[id]);

      var myHeader = wrapper.querySelector('.cg-acc-header');
      if (!myHeader) {
        myHeader = buildAccHeader(getAccTitle(headerEl), id, wrapper, isHandover);
        wrapper.insertBefore(myHeader, wrapper.firstChild);
      } else {
        // Garde le titre synchrone (langue / changement de libellé).
        var titleEl = myHeader.querySelector('.cg-acc-header__title');
        var titleText = getAccTitle(headerEl);
        if (titleEl && titleText && titleEl.textContent !== titleText) {
          titleEl.textContent = titleText;
        }
      }

      updateAccWarning(wrapper, myHeader, isHandover, accCollapsed[id]);
    });
  }

  /**
   * Recalcule l'ensemble : libellés par catégorie + récapitulatif sidebar.
   */
  function updateTotals() {
    var categories = document.querySelectorAll('.category');
    var rows = [];

    categories.forEach(function (category) {
      var info = computeCategory(category);
      if (info === null) return;
      updateCountLabel(category, formatPrice(info.total));
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
