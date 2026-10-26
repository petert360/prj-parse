#!/usr/bin/env node
//Claude által tesztelt és javított kód

'use strict';

const fs = require('node:fs');

const analytes = [
  ['Neutrofil abszolút értéke', 'neutrofil abszolút értéke'],
  ['Lymfocita abszolút értéke', 'lymfocita abszolút értéke'],
  ['Monocyta abszolút értéke', 'monocyta abszolút értéke'],
  ['Eosinofil abszolút értéke', 'eosinofil abszolút értéke'],
  ['Basofil abszolút értéke', 'basofil abszolút értéke'],
  ['RDW', 'rdw (vvt eloszl. görbe szélessége)', 'rdw'],
  ['MCV', 'mcv'],
  ['MCHC', 'mchc (átl. hgb koncentráció)', 'mchc'],
  ['MCH', 'mch'],
  ['MPV', 'mpv (átlagos trombocyta térfogat)', 'mpv (átlagos thrombocyta térfogat)', 'mpv'],
  ['eGFR-EPI', 'egfr-epi'],
  ['K-vitamin antagonista', 'k-vitamin antagonista'],
  ['Aktivált parciális thromboplasztin idő', 'aktivált parciális thromboplasztin idő', 'aktivált parciális thromboplasztin'],
  ['Thrombin idő meghat.', 'thrombin idő meghat.'],
  ['Prothrombin-idő', 'prothrombin-idő'],
  ['Vizelet urobilinogén', 'vizelet urobilinogén'],
  ['Vizelet bilirubin', 'vizelet bilirubin'],
  ['Vizelet fajsúly', 'vizelet fajsúly'],
  ['Vizelet leukocyta', 'vizelet leukocyta'],
  ['Vizelet nitrit', 'vizelet nitrit'],
  ['Vizelet pH', 'vizelet ph'],
  ['Vizelet erytrocyta', 'vizelet erytrocyta'],
  ['Vizelet fehérje', 'vizelet fehérje'],
  ['Vizelet cukor', 'vizelet cukor'],
  ['Vizelet keton', 'vizelet keton'],
  ['Fehérvérsejtszám', 'fehérvérsejtszám'],
  ['C reaktív fehérje', 'c reaktív fehérje'],
  ['Kreatinin', 'kreatinin jaffé-módszerrel', 'kreatinin'],
  ['Össz. bilirubin', 'össz. bilirubin'],
  ['Összfehérje', 'összfehérje'],
  ['Alkalikus foszfatáz', 'alkalikus foszfatáz'],
  ['Gamma-glutamil-transzferáz', 'gamma-glutamil-transzferáz'],
  ['Hematokrit', 'hematokrit'],
  ['Haemoglobin', 'haemoglobin'],
  ['Vörösvértest', 'vörösvértest'],
  ['Trombocita', 'trombocita'],
  ['Glukóz', 'glukóz'],
  ['Karbamid', 'karbamid'],
  ['Nátrium', 'nátrium'],
  ['Kálium', 'kálium'],
  ['Húgysav', 'húgysav'],
  ['Albumin', 'albumin'],
  ['Mentzer index', 'mentzer index'],
  ['Neutrofil', 'neutrofil'],
  ['Lymfocita', 'lymfocita'],
  ['Monocyta', 'monocyta'],
  ['Eosinofil', 'eosinofil'],
  ['Basofil', 'basofil'],
  ['INR', 'inr'],
  ['Heparin', 'heparin'],
  ['DOAC', 'doac'],
  ['GOT', 'got', 'got piridoxál-foszfát aktiváció'],
  ['GPT', 'gpt', 'gpt piridoxál-foszfát aktiváció'],
  ['LDH', 'ldh'],
  ['Lipémia', 'lipémia'],
  ['Ikterusz', 'ikterusz'],
  ['Hemolízis', 'hemolízis'],
].map(([name, ...aliases]) => ({ name, aliases: aliases.map(normalize) }))
  .sort((a, b) => Math.max(...b.aliases.map(x => x.length)) - Math.max(...a.aliases.map(x => x.length)));

const sectionNames = new Set([
  'klinikai kémia',
  'immunfehérje',
  'hematológia',
  'véralvadás',
  'vizelet',
]);
const qualitativeValue = /^(?:negatív|pozitív|normál|nem(?:\s*\(.*\))?|igen)$/i;
const numberAtStart = /^\s*([<>]=?\s*)?(-?\d+(?:[.,]\d+)?)(?=$|\s|\()/;
const standaloneNumber = /^\s*[<>]?=?\s*-?\d+(?:[.,]\d+)?\s*$/;
const unitLine = /^(?:%|mmol\/l|µmol\/l|umol\/l|mg\/l|g\/l|t\/l|u\/l|l\/l|fl|pg|sec|ml\/perc(?:\/\s*1,?)?|(?:\d+\s+)?m2)$/i;
const sectionLine = /^(?:klin(i|í)kai kémia|immunfehérje|hematológia|véralvadás|vizelet)$/i;
const skipLine = /^(?:megnevezés|érték|m\.e\.|megjegyzés|eltérés|referencia értékek)$/i;

function normalize(value) {
  return value.normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/^[\s\-–—]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchAnalyte(line) {
  const normalized = normalize(line);
  return analytes.find(analyte =>
    analyte.aliases.some(alias =>
      normalized === alias || normalized.startsWith(`${alias}(`),
    ),
  );
}

function parseResultValue(line) {
  const numeric = line.match(numberAtStart);
  if (numeric) {
    return {
      value: `${numeric[1] || ''}${numeric[2]}`,
      trailingUnit: line.slice(numeric[0].length).trim(),
    };
  }
  if (qualitativeValue.test(line.trim())) {
    return { value: line.trim(), trailingUnit: '' };
  }
  return null;
}

// Megkeresi azokat a sorokat, amik vizsgálatnévnek látszanak, de nincsenek a listában.
// Egy sor akkor gyanús, ha:
//   - nagybetűvel kezdődik és nem túl hosszú,
//   - nem ismert vizsgálat, nem fejléc, nem mértékegység, és nem végződik kettősponttal,
//   - utána (legfeljebb egy kisbetűs folytatósor után) értéksor jön,
//   - és az értéket mértékegység, "---", jelzés vagy szám követi.
function findUnknownRows(lines, knownIndexes) {
  const unknown = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    if (!line || knownIndexes.has(i)) continue;
    if (!/^[A-ZÁÉÍÓÖŐÚÜŰ]/.test(line)) continue;
    if (line.length > 60 || line.endsWith(':')) continue;
    if (skipLine.test(line) || sectionLine.test(line) || unitLine.test(line)) continue;

    // A következő nem üres sor megkeresése
    let next = i + 1;
    while (next < lines.length && lines[next] === '') next += 1;
    if (next >= lines.length) continue;

    // Ha a név két sorba tört (pl. "...thromboplasztin" / "idő"), átlépjük a második felét
    if (/^[a-záéíóöőúüű]/.test(lines[next]) && !parseResultValue(lines[next])) {
      next += 1;
      while (next < lines.length && lines[next] === '') next += 1;
      if (next >= lines.length) continue;
    }

    const value = parseResultValue(lines[next]);
    if (!value) continue;

    // Az oldalláb ("2852 / 2026.03.16.") nem eredmény
    if (/^\d+\s*\/\s*\d{4}\.\d{2}\.\d{2}\.$/.test(lines[next])) continue;

    // Minőségi érték (pl. "Negatív") elég önmagában
    let looksLikeResult = !/^[<>]?=?\s*-?\d/.test(lines[next]);

    // Számértéknél kell még valami: mértékegység, "---", jelzés vagy szám
    if (!looksLikeResult) {
      if (value.trailingUnit !== '') {
        looksLikeResult = true;
      } else {
        let after = next + 1;
        while (after < lines.length && lines[after] === '') after += 1;
        const afterLine = after < lines.length ? lines[after] : '';
        if (unitLine.test(afterLine) || /^\S{1,12}\/\S{1,12}$/.test(afterLine) || afterLine === '%'
            || afterLine === '---' || /^(?:\+{1,2}|-)$/.test(afterLine)
            || /^\s*-?\d+(?:[.,]\d+)?\s*$/.test(afterLine)) {
          looksLikeResult = true;
        }
      }
    }

    if (looksLikeResult) {
      unknown.push({ line: i + 1, text: line, value: value.value });
    }
  }

  return unknown;
}

function parseReport(text) {
  if (typeof text !== 'string') {
    throw new TypeError('A lelet tartalma szöveg kell legyen.');
  }

  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).map(line => line.trim());
  const header = lines.slice(0, 20).some(line => normalize(line) === 'megnevezes')
    && lines.slice(0, 20).some(line => normalize(line) === 'ertek');
  if (!header) {
    throw new Error('Nem található a várt laborlelet-táblázat fejléce (Megnevezés, Érték).');
  }

  const rows = [];
  for (let index = 0; index < lines.length; index += 1) {
    const analyte = matchAnalyte(lines[index]);
    if (analyte) rows.push({ index, analyte });
  }

  const results = [];
  const warnings = [];
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const end = rows[rowIndex + 1]?.index ?? lines.length;
    let valueIndex = -1;
    let parsedValue = null;

    for (let index = row.index; index < end; index += 1) {
      const line = lines[index];
      const normalized = normalize(line);
      if (!line || skipLine.test(line) || sectionNames.has(normalized) || sectionLine.test(line)) continue;
      if (row.analyte.name === 'RDW' && /nem értékelhető/i.test(line)) {
        valueIndex = index;
        parsedValue = { value: 'Nem értékelhető', trailingUnit: '' };
        break;
      }
      parsedValue = parseResultValue(line);
      if (parsedValue) {
        valueIndex = index;
        break;
      }
    }

    if (!parsedValue) {
      warnings.push({ line: row.index + 1, analyte: row.analyte.name, message: 'Nem található érték.' });
      continue;
    }

    let unit = parsedValue.trailingUnit;
    let flag = null;
    const referenceValues = [];
    for (let index = valueIndex + 1; index < end; index += 1) {
      const line = lines[index];
      if (!line) continue;
      if (line === '---') continue;
      if (!unit && unitLine.test(line)) {
        unit = line;
        continue;
      }
      if (/^(?:\+{1,2}|-)$/u.test(line)) {
        flag = line;
        continue;
      }
      if (row.analyte.name !== 'Mentzer index'
          && standaloneNumber.test(line) && referenceValues.length < 2) {
        referenceValues.push(line);
      }
    }

    const result = {
      name: row.analyte.name,
      value: parsedValue.value,
      unit: unit || null,
      flag,
      reference: referenceValues.length === 2
        ? { low: referenceValues[0], high: referenceValues[1] }
        : null,
      line: row.index + 1,
    };

    // eGFR is printed with its unit split across two lines in these reports.
    if (row.analyte.name === 'eGFR-EPI' && /ml\/perc/i.test(unit)) {
      const continuation = lines.slice(valueIndex + 1, end).find(line => /^\d+\s+m2$/i.test(line));
      if (continuation) result.unit = `${unit}${continuation}`;
    }

    results.push(result);
  }

  // Ismeretlen, de vizsgálatnak látszó sorok: figyelmeztetés, hogy ne vesszenek el csendben
  const knownIndexes = new Set(rows.map(row => row.index));
  for (const item of findUnknownRows(lines, knownIndexes)) {
    warnings.push({
      line: item.line,
      analyte: item.text,
      message: `Ismeretlen vizsgálat (nincs a listában), kihagyva. Talált érték: ${item.value}`,
    });
  }

  if (results.length === 0) {
    throw new Error('A leletben nem sikerült ismert laboreredményt felismerni.');
  }

  return { results, warnings };
}

function main(argv) {
  const filePath = argv[2];
  if (!filePath || argv.length > 3) {
    process.stderr.write('Használat: node parser.js <lelet.txt>\n');
    return 2;
  }

  try {
    const text = fs.readFileSync(filePath, 'utf8');
    const parsed = parseReport(text);
    process.stdout.write(`${JSON.stringify(parsed, null, 2)}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`Hiba: ${error.message}\n`);
    return 1;
  }
}

if (require.main === module) {
  process.exitCode = main(process.argv);
}

module.exports = { parseReport };
