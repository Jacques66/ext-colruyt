'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { parsePrice, formatPrice, extractBrand, displayBrand } = require('../pure.js');

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
