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

  function toGramsMl(val, unit) {
    switch (unit) {
      case 'kg': return { grams: val * 1000, ml: null };
      case 'g':  return { grams: val, ml: null };
      case 'l':  return { grams: null, ml: val * 1000 };
      case 'cl': return { grams: null, ml: val * 10 };
      case 'ml': return { grams: null, ml: val };
    }
    return { grams: null, ml: null };
  }

  /**
   * Extrait une quantité (poids ou volume) d'un libellé produit, de façon
   * heuristique. Retourne { grams, ml } (l'un des deux, ou les deux à null).
   * Gère les multiplicateurs (« 12x10g »), les décimales à la virgule
   * (« 1,5kg ») et ignore les comptages en pièces (« 6pc »).
   */
  function parseQuantityFromName(name) {
    if (!name) return { grams: null, ml: null };
    var s = name.toLowerCase().replace(/,/g, '.');
    var mult = s.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(kg|g|cl|ml|l)\b/);
    if (mult) {
      return toGramsMl(parseFloat(mult[1]) * parseFloat(mult[2]), mult[3]);
    }
    var m = s.match(/(\d+(?:\.\d+)?)\s*(kg|g|cl|ml|l)\b/);
    if (m) {
      return toGramsMl(parseFloat(m[1]), m[2]);
    }
    return { grams: null, ml: null };
  }

  var api = {
    parsePrice: parsePrice,
    formatPrice: formatPrice,
    extractBrand: extractBrand,
    displayBrand: displayBrand,
    parseQuantityFromName: parseQuantityFromName
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
