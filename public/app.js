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

const feldolgozGomb = document.getElementById('feldolgoz');
const bemenet = document.getElementById('bemenet');
const uzenet = document.getElementById('uzenet');

// ---- feldolgozGomb kattintás ----

feldolgozGomb.addEventListener('click', function () {
  const szoveg = bemenet.value;

  // Ha üres a mező, szólunk, és kilépünk
  if (szoveg.trim() === '') {
    uzenet.textContent = 'Előbb illessz be szöveget!';
    return;
  }

  // 1) Feldolgozzuk a szöveget
  const eredmeny = parseTorzs(szoveg);

  // 2) Minden kinyert értéket beírunk a megfelelő mezőbe
  //    (a kulcs neve megegyezik a mező id-jával)
  for (const kulcs in eredmeny) {
    document.getElementById(kulcs).value = eredmeny[kulcs];
  }

  // 3) Megnézzük, mely mezőket nem sikerült kinyerni
  let hianyzok = '';
  for (const kulcs in eredmeny) {
    if (eredmeny[kulcs] === '') {
      hianyzok = hianyzok + kulcs + ' ';
    }
  }

  if (hianyzok === '') {
    uzenet.textContent = 'Minden mező kitöltve.';
  } else {
    uzenet.textContent = 'Ezeket nem találtam: ' + hianyzok;
  }
});

// ---- Mentés ----

const mentesGomb = document.getElementById('mentes');
const mentesUzenet = document.getElementById('mentesUzenet');

mentesGomb.addEventListener('click', async function () {
  // 1) Összegyűjtjük a mezők aktuális értékét egy objektumba
  const adat = {};
  for (const kulcs in RULES) {
    adat[kulcs] = document.getElementById(kulcs).value;
  }

  // 2) Elküldjük a szervernek
  try {
    const valasz = await fetch('/api/torzs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(adat),
    });

    const tartalom = await valasz.json();

    // 3) A válasz státusza alapján üzenünk a felhasználónak
    if (valasz.status === 201) {
      mentesUzenet.textContent = 'Sikeres mentés! Azonosító: ' + tartalom.id;
      listaBetoltes();
    } else {
      // 400 vagy 409: a szerver hibaüzenetét kiírjuk
      mentesUzenet.textContent = 'Hiba: ' + tartalom.error;
    }
  } catch (hiba) {
    // Ide akkor jutunk, ha a szerver el sem érhető
    mentesUzenet.textContent = 'A szerver nem érhető el.';
  }
});

// ---- Lista ----

const tablaTest = document.getElementById('tablaTest');

async function listaBetoltes() {
  // 1) Lekérjük az összes beteget a szervertől
  const valasz = await fetch('/api/torzs');
  const betegek = await valasz.json();

  // 2) Kiürítjük a táblázat törzsét, hogy ne duplázódjanak a sorok
  tablaTest.innerHTML = '';

  // 3) Minden beteghez készítünk egy sort
  for (let i = 0; i < betegek.length; i++) {
    const beteg = betegek[i];

    const sor = document.createElement('tr');

    // Ezeket az oszlopokat írjuk ki, ebben a sorrendben
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
