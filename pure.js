/**
 * Fonctions « pures » (sans DOM) de l'extension — extraites pour être testables.
 *
 * Ce fichier fonctionne dans les deux mondes :
 *  - injecté comme content script (avant content.js), il expose `CGPure` dans
 *    le monde isolé de l'extension ;
 *  - requis en Node (`require('./pure.js')`), il exporte les fonctions pour les
 *    tests unitaires.
 */
;(function (global) {
  'use strict';

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
    // Espace insécable (U+00A0) avant le symbole €, comme sur la page.
    return value.toFixed(2).replace('.', ',') + '\u00A0\u20AC';
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
   * Affiche une marque en casse de titre (BONI -> Boni) pour atténuer l'effet
   * « tout en majuscules ». Le regroupement reste basé sur la forme majuscule.
   */
  function displayBrand(brand) {
    if (!brand) return brand;
    return brand.charAt(0).toUpperCase() + brand.slice(1).toLowerCase();
  }

  var api = {
    parsePrice: parsePrice,
    formatPrice: formatPrice,
    extractBrand: extractBrand,
    displayBrand: displayBrand
  };

  // Node (tests) : export CommonJS.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  // Content script : exposer dans le monde isolé.
  if (global) {
    global.CGPure = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
