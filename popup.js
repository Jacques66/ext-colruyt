/**
 * Réglages de l'extension « Totaux par rayon — pour Collect&Go ».
 *
 * Popup d'action (icône de la barre d'outils) : une case à cocher par
 * fonctionnalité, plus un sélecteur de langue (Auto / FR / NL). L'état est
 * stocké dans `chrome.storage.local` sous la clé `cgSettings` (un booléen par
 * fonction ; absent = activé par défaut ; `lang` = 'fr'|'nl' ou absent pour
 * « Auto »). Le content script écoute `chrome.storage.onChanged` et applique
 * les changements immédiatement dans le chariot ouvert, sans rechargement.
 *
 * « Auto » suit intelligemment la langue de la page : le content script publie
 * la langue détectée du chariot sous la clé `cgSiteLang`, que ce popup lit.
 */
'use strict';
(function () {
  var SETTINGS_KEY = 'cgSettings';
  var SITE_LANG_KEY = 'cgSiteLang';

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
      langLabel: 'Langue',
      note: 'Extension non officielle.',
      reset: 'Tout réactiver',
      settings: 'réglages'
    },
    nl: {
      title: 'Totaal per afdeling',
      subtitle: 'Schakel elke functie in of uit. Onmiddellijk effect in de geopende mand.',
      langLabel: 'Taal',
      note: 'Niet-officiële extensie.',
      reset: 'Alles opnieuw inschakelen',
      settings: 'instellingen'
    }
  };

  // État courant. `settings` : réglages (clé `lang` = 'fr'|'nl' ou absent pour
  // Auto ; les autres clés sont des booléens, absent = activé). `siteLang` :
  // langue détectée du chariot, publiée par le content script.
  var settings = {};
  var siteLang = null;
  function isOn(key) { return settings[key] !== false; }

  // Langue effective d'affichage : choix explicite, sinon langue du chariot,
  // sinon langue du navigateur, sinon FR.
  function navLang() {
    return (navigator.language || 'fr').toLowerCase().indexOf('nl') === 0 ? 'nl' : 'fr';
  }
  function autoLang() {
    return (siteLang === 'fr' || siteLang === 'nl') ? siteLang : navLang();
  }
  function effectiveLang() {
    return (settings.lang === 'fr' || settings.lang === 'nl') ? settings.lang : autoLang();
  }

  var storage = (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local)
    ? chrome.storage.local : null;

  function load(cb) {
    if (!storage) { cb(); return; }
    try {
      storage.get([SETTINGS_KEY, SITE_LANG_KEY], function (res) {
        if (res && res[SETTINGS_KEY]) settings = res[SETTINGS_KEY];
        if (res && res[SITE_LANG_KEY]) siteLang = res[SITE_LANG_KEY];
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

  function renderLang() {
    var ui = UI[effectiveLang()];
    document.getElementById('lang-title').textContent = ui.langLabel;

    var seg = document.getElementById('lang-seg');
    seg.textContent = '';
    var choice = (settings.lang === 'fr' || settings.lang === 'nl') ? settings.lang : 'auto';
    // « Auto » indique la langue résolue, p. ex. « Auto · NL ».
    var options = [
      { value: 'auto', label: 'Auto · ' + autoLang().toUpperCase() },
      { value: 'fr', label: 'FR' },
      { value: 'nl', label: 'NL' }
    ];
    options.forEach(function (opt) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = opt.label;
      b.setAttribute('aria-pressed', opt.value === choice ? 'true' : 'false');
      b.addEventListener('click', function () {
        if (opt.value === 'auto') delete settings.lang;
        else settings.lang = opt.value;
        save();
        render(); // ré-affiche tout le popup dans la nouvelle langue
      });
      seg.appendChild(b);
    });
  }

  function render() {
    var lang = effectiveLang();
    var ui = UI[lang];
    document.documentElement.setAttribute('lang', lang);
    document.title = ui.title + ' — ' + ui.settings;
    document.getElementById('title').textContent = ui.title;
    document.getElementById('subtitle').textContent = ui.subtitle;
    document.getElementById('note').textContent = ui.note;
    var resetBtn = document.getElementById('reset');
    resetBtn.textContent = ui.reset;

    renderLang();

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

      // Le clic sur la zone de texte bascule l'interrupteur. Les clics sur
      // l'interrupteur lui-même (le <label>) sont déjà gérés nativement par le
      // navigateur : il ne faut donc PAS re-basculer ici, sans quoi le double
      // basculement annulerait l'action (toggle impossible à désactiver).
      li.addEventListener('click', function (e) {
        if (e.target.closest && e.target.closest('.switch')) return;
        input.checked = !input.checked;
        input.dispatchEvent(new Event('change'));
      });

      li.appendChild(texts);
      li.appendChild(label);
      list.appendChild(li);
    });
  }

  // Bouton « Tout réactiver » : réactive toutes les fonctions, en conservant le
  // choix de langue (qui n'est pas une « fonction »).
  document.getElementById('reset').addEventListener('click', function () {
    settings = (settings.lang === 'fr' || settings.lang === 'nl')
      ? { lang: settings.lang } : {};
    save();
    render();
  });

  load(render);
})();
