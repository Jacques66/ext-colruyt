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

  /**
   * Normalise un nom de rayon pour la comparaison : minuscules, sans accents,
   * ponctuation/espaces réduits à un seul espace. Permet de faire correspondre
   * le libellé du chariot au libellé de la page d'assortiment malgré les
   * différences de casse, d'accents ou de ponctuation.
   */
  function normalizeCategoryKey(name) {
    if (!name) return '';
    var s = String(name).toLowerCase();
    if (typeof s.normalize === 'function') {
      s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }
    return s.replace(/[^a-z0-9]+/g, ' ').trim();
  }

  // Rayons de tête de l'assortiment Collect&Go : id stable (rootCategoryId) +
  // libellé/slug par langue. Sert à transformer le nom du rayon (en-tête du
  // chariot) en lien vers la page d'assortiment correspondante.
  // NB : seuls les libellés FR sont renseignés (la page NL n'a pas pu être
  // récupérée). Une entrée NL { name, slug } peut être ajoutée par rayon ;
  // sans correspondance, aucun lien n'est posé (dégradation silencieuse).
  var ASSORTMENT_BASE = 'https://www.collectandgo.be/';
  var CATEGORY_LINKS = [
    { id: '20001', fr: { name: 'Fruits, légumes, pommes de terres et noix', slug: 'fruits-legumes' } },
    { id: '20002', fr: { name: 'Viande, charcuterie, poisson et veggie', slug: 'viande-charcuterie-poisson-veggie' } },
    { id: '20003', fr: { name: 'Plats cuisinés et préparations fraîches', slug: 'plats-prepares-frais-salades-wraps' } },
    { id: '20005', fr: { name: 'Crèmerie et alternatives végétales', slug: 'cremerie-alternatives-vegetales' } },
    { id: '20014', fr: { name: 'Surgelés', slug: 'surgeles' } },
    { id: '72024', fr: { name: 'Eau, boissons gazeuses, jus de fruits et boissons chaudes', slug: 'eau-boissons-gazeuses-jus-de-fruits-boissons-chaudes' } },
    { id: '72025', fr: { name: 'Vin et bulles, bière, apéritifs et spiritueux, boissons non alcoolisées', slug: 'vins-bulles-bieres-aperitifs-spritueux' } },
    { id: '20007', fr: { name: 'Pain, céréales, farines et produits pour pâtisserie', slug: 'pain-cereales-farines-patisserie' } },
    { id: '20008', fr: { name: 'Tartinades et garnitures', slug: 'tartinades-garniture' } },
    { id: '20009', fr: { name: 'Chips, snacks et bouchées apéritives', slug: 'chips-snacks-bouchees' } },
    { id: '20010', fr: { name: 'Biscuits, chocolats, en-cas energétiques et confiserie', slug: 'biscuits-chocolats-en-cas-energetiques-confiserie' } },
    { id: '20011', fr: { name: 'Épices, sucre, huile et sauces', slug: 'epices-sucre-huile-sauces' } },
    { id: '20012', fr: { name: 'Pâtes, riz, graines et cuisine du monde', slug: 'pates-riz-graines-cuisine-du-monde' } },
    { id: '20013', fr: { name: 'Boîtes, conserves et bocaux', slug: 'boites-conserves-bocaux' } },
    { id: '20015', fr: { name: 'Bébé', slug: 'bebe' } },
    { id: '20016', fr: { name: 'Soins, hygiène et santé', slug: 'soin-pour-le-corps-hygiene-personnelle' } },
    { id: '20017', fr: { name: 'Entretien et ménage', slug: 'entretien-menage' } },
    { id: '20018', fr: { name: 'Animaux', slug: 'animaux' } },
    { id: '20019', fr: { name: 'Dans et autour de la maison', slug: 'dans-autour-de-la-maison' } }
  ];

  /**
   * URL d'assortiment correspondant à un nom de rayon, pour la langue donnée
   * ('fr' / 'nl'). Retourne null si le rayon n'est pas connu dans cette langue.
   */
  function assortmentHref(categoryName, lang) {
    var l = (lang === 'nl') ? 'nl' : 'fr';
    var key = normalizeCategoryKey(categoryName);
    if (!key) return null;
    for (var i = 0; i < CATEGORY_LINKS.length; i++) {
      var info = CATEGORY_LINKS[i][l];
      if (!info) continue;
      if (normalizeCategoryKey(info.name) === key) {
        return ASSORTMENT_BASE + l + '/assortiment/' + info.slug +
          '?rootCategoryId=' + CATEGORY_LINKS[i].id;
      }
    }
    return null;
  }

  var api = {
    parsePrice: parsePrice,
    formatPrice: formatPrice,
    extractBrand: extractBrand,
    displayBrand: displayBrand,
    parseQuantityFromName: parseQuantityFromName,
    normalizeCategoryKey: normalizeCategoryKey,
    assortmentHref: assortmentHref
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
