// ---- A parser (a parse.js-ből, az fs nélkül) ----

const RULES = {
  name: /Születési név:\s*\n(.+)\n/,
  birthName: /Születési név:\s*\n.+\n(.+)/,
  pob: /Születési hely, idő:\s*(.+)/,
  dob: /(\d{4}\.\d{2}\.\d{2}\.)\s*\(/,
  taj: /TAJ:\s*([\d ]+)/,
  mothersName: /Anyja neve:\s*(.+)/,
  docDate: /Vizsgálat ideje:\s*(\d{4}\.\d{2}\.\d{2}\. \d{2}\:\d{2})/,
  addr: /Lakcím:\s*(.+)/,
  dg0Text: /Beutaló Dg\.:\s*(.+).{5}$/m,
  dg0ICD: /Beutaló Dg\.:\s*.+(.{5})$/m,
};

function parseTorzs(text) {
  const t = text.replace(/\r/g, '');
  const result = {};

  for (const key in RULES) {
    const match = t.match(RULES[key]);
    if (match) {
      result[key] = match[1].trim();
    } else {
      result[key] = '';
    }
  }

  // A TAJ-ból a szóközök eltávolítása
  result.taj = result.taj.replace(/ /g, '');

  return result;
}

// ---- Az oldal elemei ----

const gombFeldolgoz = document.getElementById('feldolgoz');
const bemenet = document.getElementById('bemenet');
const uzenet = document.getElementById('uzenet');
const tablaTest = document.getElementById('tablaTest');

// ---- Feldolgozás és mentés egy lépésben ----

gombFeldolgoz.addEventListener('click', async function () {
  const szoveg = bemenet.value;

  // 1) Ha üres a mező, szólunk, és kilépünk
  if (szoveg.trim() === '') {
    uzenet.textContent = 'Előbb illessz be szöveget!';
    return;
  }

  // 2) Feldolgozzuk a szöveget
  const adat = parseTorzs(szoveg);

  // 3) A kinyert értékeket megjelenítjük a mezőkben (csak visszajelzésnek)
  for (const kulcs in adat) {
    document.getElementById(kulcs).value = adat[kulcs];
  }

  // 4) Elküldjük a szervernek
  try {
    const valasz = await fetch('/api/torzs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(adat),
    });

    const tartalom = await valasz.json();

    // 5) A válasz státusza alapján üzenünk
    if (valasz.status === 201) {
      uzenet.textContent =
        'Sikeres mentés: ' + adat.name + ' (azonosító: ' + tartalom.id + ')';

      // Megnézzük, mely mezőket nem sikerült kinyerni
      let hianyzok = '';
      for (const kulcs in adat) {
        if (adat[kulcs] === '') {
          hianyzok = hianyzok + kulcs + ' ';
        }
      }
      if (hianyzok !== '') {
        uzenet.textContent =
          uzenet.textContent + ' | Üresen maradt: ' + hianyzok;
      }

      // Kiürítjük a beillesztő mezőt, hogy jöhet a következő
      bemenet.value = '';
      listaBetoltes();
    } else {
      // 400 vagy 409: a szerver hibaüzenetét kiírjuk
      uzenet.textContent = 'Hiba: ' + tartalom.error;
    }
  } catch (hiba) {
    // Ide akkor jutunk, ha a szerver el sem érhető
    uzenet.textContent = 'A szerver nem érhető el.';
  }
});

// ---- Lista ----

async function listaBetoltes() {
  const valasz = await fetch('/api/torzs');
  const betegek = await valasz.json();

  tablaTest.innerHTML = '';

  for (let i = 0; i < betegek.length; i++) {
    const beteg = betegek[i];
    const sor = document.createElement('tr');
    const oszlopok = ['id', 'name', 'taj', 'dob', 'docDate', 'dg0ICD'];

    for (let j = 0; j < oszlopok.length; j++) {
      const cella = document.createElement('td');
      cella.textContent = beteg[oszlopok[j]];
      sor.appendChild(cella);
    }

    tablaTest.appendChild(sor);
  }
}

// Az oldal betöltésekor egyből megjelenítjük a listát
listaBetoltes();

// ---- Labor lelet ----

const laborGomb = document.getElementById('laborGomb');
const laborBemenet = document.getElementById('laborBemenet');
const laborUzenet = document.getElementById('laborUzenet');
const laborTest = document.getElementById('laborTest');
const laborFigyelmeztetesek = document.getElementById('laborFigyelmeztetesek');

laborGomb.addEventListener('click', async function () {
  const szoveg = laborBemenet.value;

  // 1) Üres mező ellenőrzése
  if (szoveg.trim() === '') {
    laborUzenet.textContent = 'Előbb illessz be szöveget!';
    return;
  }

  try {
    // 2) Elküldjük a szervernek feldolgozásra
    const valasz = await fetch('/api/labor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: szoveg }),
    });

    const tartalom = await valasz.json();

    // 3) Hiba esetén kiírjuk az üzenetet
    if (valasz.status !== 200) {
      laborUzenet.textContent = 'Hiba: ' + tartalom.error;
      return;
    }

    laborUzenet.textContent = tartalom.results.length + ' eredmény felismerve.';

    // 4) Az eredmények táblázatba írása
    laborTest.innerHTML = '';

    for (let i = 0; i < tartalom.results.length; i++) {
      const eredmeny = tartalom.results[i];
      const sor = document.createElement('tr');

      // A referencia vagy null, vagy { low, high }
      let referencia = '';
      if (eredmeny.reference !== null) {
        referencia = eredmeny.reference.low + ' – ' + eredmeny.reference.high;
      }

      // Ami null, az üres cellaként jelenjen meg
      const unit = eredmeny.unit || '';
      const flag = eredmeny.flag || '';

      const cellak = [eredmeny.name, eredmeny.value, unit, flag, referencia];

      for (let j = 0; j < cellak.length; j++) {
        const cella = document.createElement('td');
        cella.textContent = cellak[j];
        sor.appendChild(cella);
      }

      laborTest.appendChild(sor);
    }

    // 5) A figyelmeztetések kiírása
    laborFigyelmeztetesek.innerHTML = '';

    for (let i = 0; i < tartalom.warnings.length; i++) {
      const figyelmeztetes = tartalom.warnings[i];
      const elem = document.createElement('li');
      elem.textContent =
        figyelmeztetes.line +
        '. sor – ' +
        figyelmeztetes.analyte +
        ': ' +
        figyelmeztetes.message;
      laborFigyelmeztetesek.appendChild(elem);
    }
  } catch (hiba) {
    laborUzenet.textContent = 'A szerver nem érhető el.';
  }
});
