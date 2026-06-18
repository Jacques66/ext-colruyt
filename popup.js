/**
 * Réglages de l'extension « Totaux par rayon — pour Collect&Go ».
 *
 * Popup d'action (icône de la barre d'outils) : une case à cocher par
 * fonctionnalité. L'état est stocké dans `chrome.storage.local` sous la clé
 * `cgSettings` (un booléen par fonction ; absent = activé par défaut). Le
 * content script écoute `chrome.storage.onChanged` et applique les changements
 * immédiatement dans le chariot ouvert, sans rechargement.
 */
'use strict';
(function () {
  var SETTINGS_KEY = 'cgSettings';

  // Langue du popup : déduite de la langue de l'interface du navigateur.
  var lang = (navigator.language || 'fr').toLowerCase().indexOf('nl') === 0
    ? 'nl' : 'fr';

  // Une entrée par fonctionnalité. Les clés correspondent à celles lues par
  // content.js (fonction `isOn`). L'ordre = l'ordre d'affichage.
  var FEATURES = [
    { key: 'categoryTotals',
      fr: { name: 'Total par rayon (liste)', hint: 'Montant en gras à côté de « X produits »' },
      nl: { name: 'Totaal per afdeling (lijst)', hint: 'Vetgedrukt bedrag naast « X producten »' } },
    { key: 'recap',
      fr: { name: 'Récapitulatif (colonne de droite)', hint: 'Bloc « Total par rayon » trié et cliquable' },
      nl: { name: 'Overzicht (rechterkolom)', hint: 'Gesorteerd, klikbaar blok « Totaal per afdeling »' } },
    { key: 'brandDetail',
      fr: { name: 'Détail par marque', hint: 'Sous-totaux par marque dans le récap' },
      nl: { name: 'Detail per merk', hint: 'Subtotalen per merk in het overzicht' } },
    { key: 'quantityTotal',
      fr: { name: 'Quantités totales', hint: 'Poids, volume et articles de tout le panier' },
      nl: { name: 'Totale hoeveelheden', hint: 'Gewicht, volume en artikelen van de hele mand' } },
    { key: 'headerAccordion',
      fr: { name: 'Quantités par rayon', hint: 'Accordéon poids/volume sur les en-têtes' },
      nl: { name: 'Hoeveelheden per afdeling', hint: 'Accordeon gewicht/volume op de hoofdingen' } },
    { key: 'categoryLink',
      fr: { name: 'Lien vers le rayon', hint: 'Ouvre la page d’assortiment dans un onglet' },
      nl: { name: 'Link naar de afdeling', hint: 'Opent de assortimentspagina in een tabblad' } },
    { key: 'collapseNative',
      fr: { name: 'Replier les blocs au départ', hint: '« Données pour le retrait » et « Code promo »' },
      nl: { name: 'Blokken inklappen bij start', hint: '« Gegevens voor afhaling » en « Promocode »' } },
    { key: 'handoverWarning',
      fr: { name: 'Alerte retrait', hint: '⚠️ si l’adresse ou l’horaire manque' },
      nl: { name: 'Afhaalwaarschuwing', hint: '⚠️ als adres of tijdslot ontbreekt' } },
    { key: 'stickySidebar',
      fr: { name: 'Colonne de droite fixe', hint: 'Reste visible pendant le défilement' },
      nl: { name: 'Vaste rechterkolom', hint: 'Blijft zichtbaar tijdens het scrollen' } }
  ];

  var UI = {
    fr: {
      title: 'Totaux par rayon',
      subtitle: 'Activez ou désactivez chaque fonction. Effet immédiat dans le chariot ouvert.',
      note: 'Extension non officielle.',
      reset: 'Tout réactiver'
    },
    nl: {
      title: 'Totaal per afdeling',
      subtitle: 'Schakel elke functie in of uit. Onmiddellijk effect in de geopende mand.',
      note: 'Niet-officiële extensie.',
      reset: 'Alles opnieuw inschakelen'
    }
  };

  // État courant (absent = activé par défaut).
  var settings = {};
  function isOn(key) { return settings[key] !== false; }

  var storage = (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local)
    ? chrome.storage.local : null;

  function load(cb) {
    if (!storage) { cb(); return; }
    try {
      storage.get(SETTINGS_KEY, function (res) {
        if (res && res[SETTINGS_KEY]) settings = res[SETTINGS_KEY];
        cb();
      });
    } catch (e) { cb(); }
  }

  function save() {
    if (!storage) return;
    try {
      var obj = {};
      obj[SETTINGS_KEY] = settings;
      storage.set(obj);
    } catch (e) { /* noop */ }
  }

  function render() {
    var ui = UI[lang];
    document.documentElement.setAttribute('lang', lang);
    document.title = ui.title + ' — ' + (lang === 'nl' ? 'instellingen' : 'réglages');
    document.getElementById('title').textContent = ui.title;
    document.getElementById('subtitle').textContent = ui.subtitle;
    document.getElementById('note').textContent = ui.note;
    var resetBtn = document.getElementById('reset');
    resetBtn.textContent = ui.reset;
    resetBtn.addEventListener('click', function () {
      settings = {};               // tout absent => tout activé
      save();
      syncInputs();
    });

    var list = document.getElementById('list');
    list.textContent = '';
    FEATURES.forEach(function (f) {
      var txt = f[lang];

      var li = document.createElement('li');

      var label = document.createElement('label');
      label.className = 'switch';
      var input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = isOn(f.key);
      input.setAttribute('data-key', f.key);
      input.setAttribute('aria-label', txt.name);
      var track = document.createElement('span');
      track.className = 'track';
      var knob = document.createElement('span');
      knob.className = 'knob';
      label.appendChild(input);
      label.appendChild(track);
      label.appendChild(knob);

      var texts = document.createElement('div');
      texts.className = 'texts';
      var name = document.createElement('div');
      name.className = 'name';
      name.textContent = txt.name;
      var hint = document.createElement('div');
      hint.className = 'hint';
      hint.textContent = txt.hint;
      texts.appendChild(name);
      texts.appendChild(hint);

      input.addEventListener('change', function () {
        if (input.checked) delete settings[f.key]; // activé = défaut => clé absente
        else settings[f.key] = false;
        save();
      });

      // Le clic sur toute la ligne bascule l'interrupteur (sauf clic direct
      // sur la case, déjà géré par le navigateur).
      li.addEventListener('click', function (e) {
        if (e.target === input) return;
        input.checked = !input.checked;
        input.dispatchEvent(new Event('change'));
      });

      li.appendChild(texts);
      li.appendChild(label);
      list.appendChild(li);
    });
  }

  function syncInputs() {
    var inputs = document.querySelectorAll('#list input[type="checkbox"]');
    Array.prototype.forEach.call(inputs, function (input) {
      input.checked = isOn(input.getAttribute('data-key'));
    });
  }

  load(render);
})();
