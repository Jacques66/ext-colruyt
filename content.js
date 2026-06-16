/**
 * Collect&Go — Totaux par catégorie
 *
 * Pour chaque section de catégorie du chariot, additionne le prix total de
 * chaque produit et ajoute ce total en gras à côté du compteur « X produits ».
 *
 * Le calcul est relancé à chaque mutation du DOM (réactivité Vue.js) avec un
 * debounce de ~300ms. Les compteurs déjà traités sont marqués via un attribut
 * data- pour mettre à jour la valeur plutôt que d'ajouter un nouveau nœud.
 */
(function () {
  'use strict';

  var PROCESSED_ATTR = 'data-cg-total-processed';
  var TOTAL_CLASS = 'cg-category-total';
  var DEBOUNCE_MS = 300;

  /**
   * Convertit un prix au format européen ("5,98 €" / "1 234,56 €") en nombre.
   * Retourne null si aucun nombre n'est trouvé.
   */
  function parsePrice(text) {
    if (!text) return null;
    // Conserver uniquement chiffres, virgules, points et signe négatif.
    var cleaned = text
      .replace(/ /g, ' ')
      .replace(/[^0-9,.\-]/g, '')
      .trim();
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
   * Calcule et affiche le total pour chaque catégorie présente dans le panier.
   */
  function updateTotals() {
    var categories = document.querySelectorAll('.category');

    categories.forEach(function (category) {
      var countEl = category.querySelector('.category-heading .count');
      if (!countEl) return;

      var items = category.querySelectorAll('.ds-product-list-item-container');
      var total = 0;
      var found = false;

      items.forEach(function (item) {
        // Version desktop uniquement : exclure la version --mobile.
        var priceEls = item.querySelectorAll(
          '.ds-product-total-price.is-p1__bold'
        );
        priceEls.forEach(function (priceEl) {
          if (priceEl.classList.contains('--mobile')) return;
          var value = parsePrice(priceEl.textContent);
          if (value !== null) {
            total += value;
            found = true;
          }
        });
      });

      if (!found) return;

      var totalText = formatPrice(total);

      if (countEl.getAttribute(PROCESSED_ATTR) === '1') {
        // Mettre à jour le nœud total existant.
        var existing = countEl.querySelector('.' + TOTAL_CLASS);
        if (existing) {
          if (existing.textContent !== totalText) {
            existing.textContent = totalText;
          }
          return;
        }
      }

      // Première fois (ou nœud disparu) : ajouter le total à côté du compteur.
      var totalEl = document.createElement('strong');
      totalEl.className = TOTAL_CLASS;
      totalEl.textContent = totalText;

      var separator = document.createTextNode(' — ');
      separator.nodeValue = ' — ';

      countEl.appendChild(separator);
      countEl.appendChild(totalEl);
      countEl.setAttribute(PROCESSED_ATTR, '1');
    });
  }

  var debounceTimer = null;
  function scheduleUpdate() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(updateTotals, DEBOUNCE_MS);
  }

  /**
   * Observe le conteneur du panier (ou le body en attendant son apparition)
   * et relance le calcul à chaque mutation.
   */
  function init() {
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
