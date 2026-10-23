'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseReport } = require('./parser');

test('parses numeric, flagged, and qualitative results while omitting patient details', () => {
  const text = [
    'Megnevezés', 'Érték', 'M.e.', 'Megjegyzés', 'Eltérés', 'Referencia értékek',
    'Klinikai kémia', 'Glukóz', '6,70', 'mmol/l', 'A referencia éhomi mintára vonatkozik.', '+', '4,00', '6,00',
    'Immunfehérje', 'C reaktív fehérje', '<0.60', 'mg/l', '0,00', '8,60',
    'Vizelet', 'Vizelet nitrit', 'Negatív',
    'Beteg neve: Bizalmas Minta',
  ].join('\n');

  const parsed = parseReport(text);
  assert.deepEqual(parsed.results[0], {
    name: 'Glukóz',
    value: '6,70',
    unit: 'mmol/l',
    flag: '+',
    reference: { low: '4,00', high: '6,00' },
    line: 8,
  });
  assert.equal(parsed.results[1].value, '<0.60');
  assert.equal(parsed.results[2].value, 'Negatív');
  assert.equal(JSON.stringify(parsed).includes('Bizalmas'), false);
  assert.deepEqual(parsed.warnings, []);
});

test('parses wrapped analyte names and eGFR units', () => {
  const text = [
    'Megnevezés', 'Érték', 'M.e.', 'Megjegyzés', 'Eltérés', 'Referencia értékek',
    'Klinikai kémia', 'GOT piridoxál-foszfát aktiváció', 'nélkül', '26', 'U/l', '0', '40',
    'eGFR-EPI', '88 (ml/perc)/1,', '73 m2', '-', '90', '9999',
  ].join('\n');

  const parsed = parseReport(text);
  assert.equal(parsed.results[0].name, 'GOT');
  assert.equal(parsed.results[0].value, '26');
  assert.equal(parsed.results[0].reference.high, '40');
  assert.equal(parsed.results[1].unit, '(ml/perc)/1, 73 m2');
  assert.equal(parsed.results[1].flag, '-');
});

test('distinguishes differential counts, urine units, and Mentzer interpretation text', () => {
  const text = [
    'Megnevezés', 'Érték', 'M.e.', 'Megjegyzés', 'Eltérés', 'Referencia értékek',
    'Hematológia', 'Neutrofil', '60,500', '%', '---', 'Lymfocita', '28,300', '%', '---',
    'Mentzer index', '16,45', '---', 'Vashiány gyanúja microcyter anaemia esetén:', '13,00', '99999,00',
    'Vizelet', 'Vizelet fajsúly', '1,010', '-', '1,015', '1,025',
  ].join('\n');

  const { results } = parseReport(text);
  assert.equal(results[0].name, 'Neutrofil');
  assert.equal(results[0].unit, '%');
  assert.equal(results[1].name, 'Lymfocita');
  assert.equal(results[2].reference, null);
  assert.equal(results[3].unit, '-');
  assert.deepEqual(results[3].reference, { low: '1,015', high: '1,025' });
});

test('rejects input without the expected report header', () => {
  assert.throws(() => parseReport('not a lab report'), /fejléc/);
});
