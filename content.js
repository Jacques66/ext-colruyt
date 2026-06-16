/**
 * Collect&Go — Totaux par catégorie
 *
 * 1. Pour chaque section de catégorie du chariot, additionne le prix total de
 *    chaque produit et ajoute ce total en gras à côté du compteur
 *    « X produits » (sur une seule ligne).
 * 2. Affiche un récapitulatif « Total par rayon » dans la sidebar, juste
 *    après le « Total estimé ».
 *
 * Le calcul est relancé à chaque mutation du DOM (réactivité Vue.js) avec un
 * debounce de ~300ms. Les compteurs déjà traités sont marqués via un attribut
 * data- pour mettre à jour la valeur plutôt que d'ajouter un nouveau nœud.
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
      sortPage: 'Ordre de la liste'
    },
    nl: {
      recapTitle: 'Totaal per afdeling',
      sortDesc: 'Bedrag aflopend',
      sortAsc: 'Bedrag oplopend',
      sortPage: 'Volgorde van de lijst'
    }
  };

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
   * Trie (en place) les lignes du récap selon le mode courant.
   * 'page' conserve l'ordre du DOM (ordre de la grande liste).
   */
  function applySort(rows) {
    if (sortMode === 'desc') {
      rows.sort(function (a, b) { return b.total - a.total; });
    } else if (sortMode === 'asc') {
      rows.sort(function (a, b) { return a.total - b.total; });
    }
    return rows;
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
      '.' + RECAP_CLASS + '__name{overflow:hidden;text-overflow:ellipsis;' +
        'white-space:nowrap;}',
      '.' + RECAP_CLASS + '__value{font-weight:600;white-space:nowrap;}',
      /* Décalage pour ne pas masquer le rayon sous l'en-tête au scroll. */
      '.category{scroll-margin-top:100px;}',
      /* Flash visuel sur le rayon ciblé. */
      '@keyframes cg-flash{0%{background-color:rgba(5,135,199,.25);}' +
        '100%{background-color:transparent;}}',
      '.cg-flash{animation:cg-flash 1.2s ease-out;}',
      /* Garde la colonne de droite visible au scroll (avec défilement */
      /* interne si elle dépasse la hauteur de l'écran). */
      '.basket .sidebar{position:sticky;top:16px;align-self:flex-start;' +
        'max-height:calc(100vh - 32px);overflow-y:auto;}'
    ].join('');
    (document.head || document.documentElement).appendChild(style);
  }

  /**
   * Calcule le total d'une catégorie (somme des prix produits desktop).
   * Retourne null si aucun prix n'a été trouvé.
   */
  function computeCategoryTotal(category) {
    var items = category.querySelectorAll('.ds-product-list-item-container');
    var total = 0;
    var found = false;

    items.forEach(function (item) {
      // Version desktop uniquement : exclure la version --mobile.
      var priceEls = item.querySelectorAll('.ds-product-total-price.is-p1__bold');
      priceEls.forEach(function (priceEl) {
        if (priceEl.classList.contains('--mobile')) return;
        var value = parsePrice(priceEl.textContent);
        if (value !== null) {
          total += value;
          found = true;
        }
      });
    });

    return found ? total : null;
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

    // Liste des lignes : on ne reconstruit le HTML que si le nombre change.
    var list = recap.querySelector('.' + RECAP_CLASS + '__list');
    if (list.getAttribute('data-cg-rows') !== String(rows.length)) {
      var parts = [];
      for (var i = 0; i < rows.length; i++) {
        parts.push(
          '<div class="' + RECAP_CLASS + '__row">' +
            '<span class="' + RECAP_CLASS + '__name"></span>' +
            '<span class="' + RECAP_CLASS + '__value"></span>' +
          '</div>'
        );
      }
      list.innerHTML = parts.join('');
      list.setAttribute('data-cg-rows', String(rows.length));
    }

    // Remplir / réordonner les lignes (textContent => pas d'injection HTML).
    var rowEls = list.querySelectorAll('.' + RECAP_CLASS + '__row');
    rows.forEach(function (row, i) {
      var rowEl = rowEls[i];
      if (!rowEl) return;
      // Référence vers le rayon (l'ordre change selon le tri choisi).
      rowEl.__cgCategory = row.category;
      var nameEl = rowEl.querySelector('.' + RECAP_CLASS + '__name');
      var valueEl = rowEl.querySelector('.' + RECAP_CLASS + '__value');
      if (nameEl && nameEl.textContent !== row.title) nameEl.textContent = row.title;
      var valueText = formatPrice(row.total);
      if (valueEl && valueEl.textContent !== valueText) valueEl.textContent = valueText;
    });
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
    // Clic sur une ligne => scroll vers le rayon (listener délégué).
    list.addEventListener('click', function (e) {
      var rowEl = e.target.closest
        ? e.target.closest('.' + RECAP_CLASS + '__row')
        : null;
      if (!rowEl || !rowEl.__cgCategory) return;
      scrollToCategory(rowEl.__cgCategory);
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

  /**
   * Recalcule l'ensemble : libellés par catégorie + récapitulatif sidebar.
   */
  function updateTotals() {
    var categories = document.querySelectorAll('.category');
    var rows = [];

    categories.forEach(function (category) {
      var total = computeCategoryTotal(category);
      if (total === null) return;
      var totalText = formatPrice(total);
      updateCountLabel(category, totalText);
      rows.push({
        title: getCategoryTitle(category),
        total: total,
        category: category
      });
    });

    // Récap trié selon le choix de l'utilisateur (les libellés des compteurs
    // dans la liste, eux, restent toujours dans l'ordre de la page).
    applySort(rows);

    renderRecap(rows);
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
