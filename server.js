const express = require('express');
const Database = require('better-sqlite3');
const { parseReport } = require('./parser2');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// Az adatbázis megnyitása (ha a torzs.db fájl nincs meg, létrehozza)
const db = new Database('torzs.db');

// A tábla létrehozása, ha még nem létezik
// A taj oszlop UNIQUE: ugyanaz a TAJ csak egyszer szerepelhet
db.exec(`
  CREATE TABLE IF NOT EXISTS torzs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT,
    birthName   TEXT,
    pob         TEXT,
    dob         TEXT,
    taj         TEXT UNIQUE,
    mothersName TEXT,
    docDate     TEXT,
    addr        TEXT,
    dg0Text     TEXT,
    dg0ICD      TEXT,
    createdAt   TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);

// 1) Új adat mentése
app.post('/api/torzs', (req, res) => {
  const d = req.body;

  // Legalább a név és a TAJ legyen meg
  if (!d.name || !d.taj) {
    return res.status(400).json({ error: 'A name és a taj kötelező' });
  }

  // A TAJ-ból kikerül minden, ami nem számjegy (pl. "062 878 142" -> "062878142")
  const taj = String(d.taj).replace(/\D/g, '');
  if (taj.length !== 9) {
    return res.status(400).json({ error: 'A TAJ 9 számjegyből áll' });
  }

  const insert = db.prepare(`
    INSERT INTO torzs (name, birthName, pob, dob, taj, mothersName, docDate, addr, dg0Text, dg0ICD)
    VALUES (@name, @birthName, @pob, @dob, @taj, @mothersName, @docDate, @addr, @dg0Text, @dg0ICD)
  `);

  try {
    const result = insert.run({
      name: d.name || '',
      birthName: d.birthName || '',
      pob: d.pob || '',
      dob: d.dob || '',
      taj: taj,
      mothersName: d.mothersName || '',
      docDate: d.docDate || '',
      addr: d.addr || '',
      dg0Text: d.dg0Text || '',
      dg0ICD: d.dg0ICD || '',
    });

    res.status(201).json({ id: result.lastInsertRowid });
  } catch (err) {
    // Ha ez a TAJ már szerepel az adatbázisban
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res
        .status(409)
        .json({ error: 'Ilyen TAJ-jal már van beteg az adatbázisban' });
    }
    throw err;
  }
});

// 2) Az összes mentett adat lekérése
app.get('/api/torzs', (req, res) => {
  const rows = db.prepare('SELECT * FROM torzs ORDER BY id DESC').all();
  res.json(rows);
});

// 3) Egy adat lekérése az id alapján
app.get('/api/torzs/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM torzs WHERE id = ?').get(req.params.id);

  if (!row) {
    return res.status(404).json({ error: 'Nincs ilyen id' });
  }

  res.json(row);
});

// 4) Labor lelet feldolgozása (még nem ment adatbázisba, csak visszaadja az eredményt)
app.post('/api/labor', (req, res) => {
  const szoveg = req.body.text;

  if (!szoveg) {
    return res.status(400).json({ error: 'Nincs szöveg' });
  }

  try {
    const eredmeny = parseReport(szoveg);
    res.json(eredmeny);
  } catch (err) {
    // A parseReport hibát dob, ha nem laborlelet a szöveg
    res.status(400).json({ error: err.message });
  }
});

// Indítás: csak erről a gépről érhető el (127.0.0.1)
app.listen(3000, '127.0.0.1', () => {
  console.log('A szerver fut: http://127.0.0.1:3000');
});
