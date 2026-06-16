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
  var DEBOUNCE_MS = 300;

  // Libellés traduits (le site existe en FR et NL).
  var LABELS = {
    fr: { recapTitle: 'Total par rayon' },
    nl: { recapTitle: 'Totaal per afdeling' }
  };

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
      '.' + RECAP_CLASS + '__title{font-weight:700;color:#1C3661;' +
        'margin-bottom:6px;}',
      '.' + RECAP_CLASS + '__row{display:flex;justify-content:space-between;' +
        'align-items:baseline;gap:12px;color:#1C3661;padding:3px 0;' +
        'font-size:0.95em;}',
      '.' + RECAP_CLASS + '__name{overflow:hidden;text-overflow:ellipsis;' +
        'white-space:nowrap;}',
      '.' + RECAP_CLASS + '__value{font-weight:600;white-space:nowrap;}'
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

    var recap = orderTotals.querySelector('.' + RECAP_CLASS);
    if (!recap) {
      recap = document.createElement('div');
      recap.className = RECAP_CLASS;
      // Ajouté en fin de bloc => juste après la ligne « Total estimé ».
      orderTotals.appendChild(recap);
    }

    var parts = ['<div class="' + RECAP_CLASS + '__title"></div>'];
    rows.forEach(function (row) {
      parts.push(
        '<div class="' + RECAP_CLASS + '__row">' +
          '<span class="' + RECAP_CLASS + '__name"></span>' +
          '<span class="' + RECAP_CLASS + '__value"></span>' +
        '</div>'
      );
    });

    var newHtml = parts.join('');
    if (recap.getAttribute('data-cg-rows') !== String(rows.length)) {
      recap.innerHTML = newHtml;
      recap.setAttribute('data-cg-rows', String(rows.length));
    }

    // Titre (traduit, rempli via textContent).
    var titleEl = recap.querySelector('.' + RECAP_CLASS + '__title');
    var titleText = t('recapTitle');
    if (titleEl && titleEl.textContent !== titleText) {
      titleEl.textContent = titleText;
    }

    // Remplir le texte (textContent => pas d'injection HTML).
    var rowEls = recap.querySelectorAll('.' + RECAP_CLASS + '__row');
    rows.forEach(function (row, i) {
      var rowEl = rowEls[i];
      if (!rowEl) return;
      var nameEl = rowEl.querySelector('.' + RECAP_CLASS + '__name');
      var valueEl = rowEl.querySelector('.' + RECAP_CLASS + '__value');
      if (nameEl && nameEl.textContent !== row.title) nameEl.textContent = row.title;
      var valueText = formatPrice(row.total);
      if (valueEl && valueEl.textContent !== valueText) valueEl.textContent = valueText;
    });
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
      rows.push({ title: getCategoryTitle(category), total: total });
    });

    // Récap trié par montant décroissant (les libellés des compteurs dans la
    // liste, eux, restent dans l'ordre de la page).
    rows.sort(function (a, b) {
      return b.total - a.total;
    });

    renderRecap(rows);
  }

  var debounceTimer = null;
  function scheduleUpdate() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(updateTotals, DEBOUNCE_MS);
  }

  /**
   * Observe le DOM du panier et relance le calcul à chaque mutation.
   */
  function init() {
    injectStyles();

    var observer = new MutationObserver(function () {
      scheduleUpdate();
    });

    observer.observe(document.body, {
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
