'use strict';

const fs = require('node:fs');

const SECTIONS = new Set([
  'Klinikai kémia',
  'Immunfehérje',
  'Hematológia',
  'Véralvadás',
  'Vizelet',
]);
const NO_REFERENCE_NAMES = new Set(['Mentzer index']);

const KNOWN_UNITS = new Set([
  'mmol/l',
  'µmol/l',
  'umol/l',
  'mg/l',
  'G/l',
  '%',
  'g/l',
  'U/l',
  'sec',
  'fl',
  'pg',
  'T/l',
  'L/l',
  '-',
  '---',
]);

const REFERENCE_ONLY_LABEL = /^(?:Vashiány gyanúja|Thalassaemia gyanúja|Normál érték normocyter)/i;
const NUMBER_PATTERN = /^[<>]?\s*\d+(?:[.,]\d+)?$/;
const REFERENCE_PATTERN = /^(?:\d+(?:[.,]\d+)?|---)$/;
const TEXT_RESULT_PATTERN = /^(?:Negatív|Pozitív|normál|Nem(?:\s+\(.*\))?|Igen)$/i;
const REFERENCE_NOTE = /^(?:A referencia\b|éhomi mintára\b|vonatkozik\.|Csak a K-|vitamin\b|antagonisták\b|monitorozására\b|alkalmas érték\.)/i;

function isNumber(value) {
  return NUMBER_PATTERN.test(value);
}

function isReference(value) {
  return REFERENCE_PATTERN.test(value);
}

function looksLikeMalformedNumber(value) {
  return /^[<>]?\s?\d[\d.,]*$/.test(value) && !isNumber(value);
}

function isPreReferenceMetadata(line, unit) {
  const normalized = line.replace(/^[+-]{1,2}\s*/, '');
  return line === '+' || line === '-'
    || KNOWN_UNITS.has(line)
    || (unit.endsWith(',') && /^\d+\s*m2$/i.test(line))
    || REFERENCE_NOTE.test(normalized);
}

function toNumber(value) {
  if (!value || value === '---' || value.startsWith('<') || value.startsWith('>')) {
    return null;
  }
  const number = Number(value.replace(',', '.'));
  return Number.isFinite(number) ? number : null;
}

function parseValueLine(line) {
  const match = line.match(/^([<>]?\s*\d+(?:[.,]\d+)?)(?:\s+(.+))?$/);
  if (!match) return null;
  return {
    text: match[1].trim(),
    inlineUnit: (match[2] || '').trim(),
  };
}

function parseLabor(rawText) {
  if (typeof rawText !== 'string') {
    throw new TypeError('A laborlelet szövegének stringnek kell lennie.');
  }
  if (rawText.length > 2_000_000) {
    throw new RangeError('A laborlelet túl nagy a feldolgozáshoz (legfeljebb 2 MB).');
  }

  const result = {
    ertekek: [],
    megjegyzesek: [],
    kihagyva: [],
    figyelmeztetesek: [],
    hibak: [],
    rendben: false,
  };

  const allLines = rawText.replace(/\uFEFF/g, '').split(/\r?\n/).map(line => line.trim());
  const tableStart = allLines.findIndex(line => line === 'Referencia értékek');
  if (tableStart === -1) {
    result.hibak.push('Nem található a táblázat kezdete ("Referencia értékek").');
    return result;
  }

  let tableEnd = allLines.length;
  let hasFooter = false;
  for (let i = tableStart + 1; i < allLines.length; i++) {
    if (tableEnd === allLines.length
      && (allLines[i].startsWith('A következő csövek') || /^Budapest,\s+\d{4}\./.test(allLines[i]))) {
      tableEnd = i;
    }
    if (/^Budapest,\s+\d{4}\./.test(allLines[i])) hasFooter = true;
  }

  const lines = allLines.slice(tableStart + 1, tableEnd).filter(Boolean);
  const rows = [];

  // A PDF ismétli a beteg nevét és a nyomtatási adatokat az oldaltörésnél;
  // a blokkot teljesen eltávolítjuk, mielőtt bármi kimenetbe kerülne.
  for (let i = 0; i < lines.length; i++) {
    if (/^\d+\s*\/\s*\d{4}\.\d{2}\.\d{2}\.$/.test(lines[i])) {
      const precedingLine = rows[rows.length - 1];
      if (precedingLine
        && !isNumber(precedingLine)
        && !isReference(precedingLine)
        && !KNOWN_UNITS.has(precedingLine)
        && precedingLine !== '+'
        && precedingLine !== '-') {
        rows.pop();
      }
      let headerEnd = i + 1;
      if (/^\d+$/.test(lines[headerEnd] || '')) headerEnd++;
      if ((lines[headerEnd] || '').startsWith('Nyomtatva:')) headerEnd++;
      i = headerEnd - 1;
      continue;
    }
    rows.push(lines[i]);
  }

  let name = '';
  let section = '';

  function addTextResult(testName, valueText) {
    result.ertekek.push({
      vizsgalat: testName,
      csoport: section,
      ertekSzoveg: valueText,
      ertek: null,
      relacio: '',
      egyseg: '',
      refAlso: null,
      refFelso: null,
      jelzes: '',
      megjegyzes: '',
    });
  }

  function attachComment(comment) {
    const previous = result.ertekek[result.ertekek.length - 1];
    if (previous) {
      previous.megjegyzes = [previous.megjegyzes, comment].filter(Boolean).join(' ').trim();
    } else {
      result.megjegyzesek.push(comment);
    }
  }

  for (let i = 0; i < rows.length;) {
    const line = rows[i];

    if (SECTIONS.has(line)) {
      section = line;
      name = '';
      i++;
      continue;
    }

    if (line === 'Megjegyzés') {
      const noteLines = [];
      let j = i + 1;
      while (j < rows.length && noteLines.length < 6 && !SECTIONS.has(rows[j])) {
        if (isNumber(rows[j]) || TEXT_RESULT_PATTERN.test(rows[j])) break;
        noteLines.push(rows[j++]);
        if (noteLines[noteLines.length - 1].endsWith('.')) break;
      }
      if (noteLines.length) {
        attachComment(noteLines.join(' '));
        i = j;
      } else {
        result.figyelmeztetesek.push(`Üres megjegyzésblokk a ${i + 1}. táblázatsornál.`);
        i++;
      }
      continue;
    }

    if (REFERENCE_ONLY_LABEL.test(line)) {
      result.kihagyva.push('Vizsgálathoz tartozó referencia-magyarázat');
      i += 1;
      while (i < rows.length && isReference(rows[i]) && i < rows.length) i++;
      name = '';
      continue;
    }

    if (line.startsWith('- ')) {
      name = line.slice(2).trim();
      i++;
      continue;
    }

    const value = parseValueLine(line);
    if (name && value) {
      const parsed = readNumericResult(rows, i, name, section, value);
      result.ertekek.push(parsed.measurement);
      if (!parsed.hasReference && !NO_REFERENCE_NAMES.has(name)) {
        result.figyelmeztetesek.push(`Nem található referencia-tartomány ehhez: ${name}.`);
      }
      i = parsed.nextIndex;
      name = '';
      continue;
    }

    if (name && TEXT_RESULT_PATTERN.test(line)) {
      addTextResult(name, line);
      name = '';
      i++;
      continue;
    }

    if (name && looksLikeMalformedNumber(line)) {
      result.figyelmeztetesek.push(`Hibás számformátum a ${i + 1}. táblázatsornál.`);
      name = '';
      i++;
      continue;
    }

    // A "Nem értékelhető" a vizsgálat neve mögött is állhat.
    const notEvaluable = line.match(/^(.*\S)\s+(Nem értékelhető\.?)$/i);
    if (!name && notEvaluable) {
      const parsed = readNumericResult(rows, i, notEvaluable[1], section, {
        text: notEvaluable[2],
        inlineUnit: '',
      });
      result.ertekek.push(parsed.measurement);
      if (!parsed.hasReference && !NO_REFERENCE_NAMES.has(notEvaluable[1])) {
        result.figyelmeztetesek.push(`Nem található referencia-tartomány ehhez: ${notEvaluable[1]}.`);
      }
      i = parsed.nextIndex;
      continue;
    }

    if (name && (line === '+' || line === '-' || isReference(line))) {
      result.figyelmeztetesek.push(`Nem besorolható érték a ${i + 1}. táblázatsornál.`);
      i++;
      continue;
    }

    if (name) {
      name = `${name} ${line}`.trim();
    } else {
      name = line;
    }
    i++;
  }

  if (name) {
    result.figyelmeztetesek.push('A táblázat végén maradt feldolgozatlan sor.');
  }
  if (!hasFooter) {
    result.figyelmeztetesek.push('A lelet vége (Budapest, dátum) nem található; ellenőrizd, hogy a szöveg teljes-e.');
  }
  if (result.ertekek.length === 0) {
    result.hibak.push('Egyetlen eredményt sem sikerült kinyerni.');
  }

  result.rendben = result.hibak.length === 0 && result.figyelmeztetesek.length === 0;
  return result;
}

function readNumericResult(rows, valueIndex, testName, section, value) {
  let unit = value.inlineUnit;
  let flag = '';
  const comments = [];
  let refMin = null;
  let refMax = null;
  let nextIndex = valueIndex + 1;

  // A leletben az egység, az eltérésjelzés és a megjegyzés változó sorrendben
  // követheti az értéket. A referencia-párt csak rövid, korlátozott ablakban keressük.
  let pairIndex = -1;
  let metadataEnd = valueIndex + 1;
  for (let i = valueIndex + 1; i < rows.length && i <= valueIndex + 9; i++) {
    if (REFERENCE_ONLY_LABEL.test(rows[i])) break;
    if (isReference(rows[i]) && isReference(rows[i + 1] || '')) {
      pairIndex = i;
      break;
    }
    if (!isPreReferenceMetadata(rows[i], unit)) break;
    metadataEnd = i + 1;
  }

  if (pairIndex !== -1) metadataEnd = pairIndex;
  for (let i = valueIndex + 1; i < metadataEnd; i++) {
    const extra = rows[i];
    if (extra === '+' || extra === '-') {
      flag = extra;
    } else if (unit.endsWith(',')) {
      unit += extra;
    } else if (!unit && KNOWN_UNITS.has(extra)) {
      unit = extra;
    } else if (!unit && /^\d+\s*m2$/i.test(extra) && i > valueIndex + 1) {
      unit = extra;
    } else {
      comments.push(extra.replace(/^[+-]{1,2}\s*/, ''));
    }
  }

  if (pairIndex !== -1) {
    if (rows[pairIndex] !== '---') refMin = toNumber(rows[pairIndex]);
    if (rows[pairIndex + 1] !== '---') refMax = toNumber(rows[pairIndex + 1]);
    nextIndex = pairIndex + 2;

    // Az eGFR-hez tartozó magyarázat és ismételt referencia a PDF-ben a
    // táblázatsor után jelenik meg; csak a felismerhető magyarázó blokkot nyeljük el.
    if (testName === 'eGFR-EPI' && rows[nextIndex] && /^Nem javasolt az eGFR/i.test(rows[nextIndex])) {
      const note = [];
      while (nextIndex < rows.length && note.length < 4 && !isReference(rows[nextIndex])) {
        note.push(rows[nextIndex++]);
      }
      if (isReference(rows[nextIndex] || '') && isReference(rows[nextIndex + 1] || '')) {
        comments.push(note.join(' '));
        nextIndex += 2;
      } else {
        nextIndex -= note.length;
      }
    }
  } else {
    // Néhány eredménynek nincs referencia-tartománya, de a nyomtatás
    // üres egységként "---" sort ad hozzá (pl. Mentzer-index).
    nextIndex = metadataEnd;
  }

  const valueText = value.text;
  const isNumeric = isNumber(valueText);
  return {
    measurement: {
      vizsgalat: testName,
      csoport: section,
      ertekSzoveg: valueText,
      ertek: isNumeric ? toNumber(valueText.replace(/\s/g, '')) : null,
      relacio: valueText.startsWith('<') ? '<' : valueText.startsWith('>') ? '>' : '',
      egyseg: unit === '-' || unit === '---' ? '' : unit,
      refAlso: refMin,
      refFelso: refMax,
      jelzes: flag,
      megjegyzes: comments.join(' ').trim(),
    },
    nextIndex,
    hasReference: pairIndex !== -1,
  };
}

module.exports = { parseLabor };

if (require.main === module) {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Használat: node parseLabor.js <lelet.txt>');
    process.exitCode = 2;
  } else {
    try {
      const rawText = fs.readFileSync(filePath, 'utf8');
      const parsed = parseLabor(rawText);
      process.stdout.write(`${JSON.stringify(parsed, null, 2)}\n`);
      if (!parsed.rendben) process.exitCode = 1;
    } catch (error) {
      console.error(`A lelet feldolgozása nem sikerült: ${error.message}`);
      process.exitCode = 1;
    }
  }
}
