'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  parsePrice, formatPrice, extractBrand, displayBrand, parseQuantityFromName,
  normalizeCategoryKey, assortmentHref
} = require('../pure.js');

const NBSP = '\u00A0';

test('parsePrice : formats européens', () => {
  assert.strictEqual(parsePrice('5,98 €'), 5.98);
  assert.strictEqual(parsePrice('85,43/kg'), 85.43);
  assert.strictEqual(parsePrice('1 234,56 €'), 1234.56); // espace = séparateur de milliers
  assert.strictEqual(parsePrice('-19,73 €'), -19.73);
});

test('parsePrice : entrées vides ou non numériques', () => {
  assert.strictEqual(parsePrice(''), null);
  assert.strictEqual(parsePrice(null), null);
  assert.strictEqual(parsePrice('—'), null);
});

test('formatPrice : virgule décimale + espace insécable + €', () => {
  assert.strictEqual(formatPrice(5.98), '5,98' + NBSP + '€');
  assert.strictEqual(formatPrice(1234.5), '1234,50' + NBSP + '€');
  assert.strictEqual(formatPrice(0), '0,00' + NBSP + '€');
});

test('parsePrice ∘ formatPrice : aller-retour', () => {
  assert.strictEqual(parsePrice(formatPrice(16.13)), 16.13);
});

test('extractBrand : token de tête en majuscules', () => {
  assert.strictEqual(extractBrand('BONI ananas morceaux au jus cons. 567g'), 'BONI');
  assert.strictEqual(extractBrand('DUYVIS CRAC-A-NUT paprika 200g'), 'DUYVIS');
  assert.strictEqual(extractBrand("BONI PLAN'T lentilles blondes 265g"), 'BONI');
  assert.strictEqual(extractBrand('Abricot rouge 500g'), null);
  assert.strictEqual(extractBrand(''), null);
});

test('displayBrand : casse de titre', () => {
  assert.strictEqual(displayBrand('BONI'), 'Boni');
  assert.strictEqual(displayBrand('EVERYDAY'), 'Everyday');
  assert.strictEqual(displayBrand(''), '');
});

test('parseQuantityFromName : poids (g/kg)', () => {
  assert.deepStrictEqual(parseQuantityFromName('BONI fraises 1kg'), { grams: 1000, ml: null });
  assert.deepStrictEqual(parseQuantityFromName('BONI dés de légumes 1,5kg'), { grams: 1500, ml: null });
  assert.deepStrictEqual(parseQuantityFromName('FRISK XL blackmint 35g'), { grams: 35, ml: null });
  assert.deepStrictEqual(parseQuantityFromName('BONI bananes ±1kg'), { grams: 1000, ml: null });
  assert.deepStrictEqual(parseQuantityFromName('EVERYDAY p.d.t. à chair ferme 5kg'), { grams: 5000, ml: null });
});

test('parseQuantityFromName : volume (ml/cl/l)', () => {
  assert.deepStrictEqual(parseQuantityFromName('BONI eau plate 2L'), { grams: null, ml: 2000 });
  assert.deepStrictEqual(parseQuantityFromName('BONI BIO cidre pomme 750ml'), { grams: null, ml: 750 });
  assert.deepStrictEqual(parseQuantityFromName('EVERYDAY crème 30%mg brique 20cl'), { grams: null, ml: 200 });
  assert.deepStrictEqual(parseQuantityFromName('DETTOL add.mach. laver désinfectant 2,5L'), { grams: null, ml: 2500 });
});

test('parseQuantityFromName : multiplicateur', () => {
  assert.deepStrictEqual(parseQuantityFromName('EVERYDAY bouillon légumes 12x10g'), { grams: 120, ml: null });
});

test('parseQuantityFromName : pièces (ignoré) / vide', () => {
  assert.deepStrictEqual(parseQuantityFromName('BONI Royal Gala 6pc'), { grams: null, ml: null });
  assert.deepStrictEqual(parseQuantityFromName('EVERYDAY bouillon poule 12pc'), { grams: null, ml: null });
  assert.deepStrictEqual(parseQuantityFromName('PAPILLON oranges'), { grams: null, ml: null });
  assert.deepStrictEqual(parseQuantityFromName(''), { grams: null, ml: null });
});

test('normalizeCategoryKey : casse, accents, ponctuation', () => {
  assert.strictEqual(
    normalizeCategoryKey('Épices, sucre, huile et sauces'),
    'epices sucre huile et sauces'
  );
  assert.strictEqual(normalizeCategoryKey('Bébé'), 'bebe');
  assert.strictEqual(normalizeCategoryKey('  Animaux  '), 'animaux');
  assert.strictEqual(normalizeCategoryKey(''), '');
  assert.strictEqual(normalizeCategoryKey(null), '');
});

test('assortmentHref : nom de rayon FR -> URL d\'assortiment', () => {
  assert.strictEqual(
    assortmentHref('Boîtes, conserves et bocaux', 'fr'),
    'https://www.collectandgo.be/fr/assortiment/boites-conserves-bocaux?rootCategoryId=20013'
  );
  // Tolérant à la casse / aux accents / aux espaces.
  assert.strictEqual(
    assortmentHref('  epices, SUCRE, huile et sauces ', 'fr'),
    'https://www.collectandgo.be/fr/assortiment/epices-sucre-huile-sauces?rootCategoryId=20011'
  );
});

test('assortmentHref : rayon inconnu ou langue non renseignée -> null', () => {
  assert.strictEqual(assortmentHref('Rayon imaginaire', 'fr'), null);
  assert.strictEqual(assortmentHref('', 'fr'), null);
  // Pas (encore) de libellés NL : aucune correspondance, donc pas de lien.
  assert.strictEqual(assortmentHref('Boîtes, conserves et bocaux', 'nl'), null);
});
