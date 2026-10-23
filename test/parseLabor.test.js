'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { parseLabor } = require('../parseLabor');

const expectedCounts = [18, 35, 43, 34, 39, 40, 41, 39, 43];

test('feldolgozza mind a kilenc mintát, és csak eredményeket ad vissza', () => {
  for (let sample = 1; sample <= expectedCounts.length; sample++) {
    const rawText = fs.readFileSync(path.join(__dirname, '..', 'docs', String(sample)), 'utf8');
    const parsed = parseLabor(rawText);
    const serialized = JSON.stringify(parsed);

    assert.equal(parsed.ertekek.length, expectedCounts[sample - 1], `minta: ${sample}`);
    assert.deepEqual(parsed.hibak, [], `minta: ${sample}`);
    assert.equal(parsed.rendben, sample !== 1, `minta: ${sample}`);
    assert.equal(Object.hasOwn(parsed, 'name'), false);
    assert.equal(Object.hasOwn(parsed, 'taj'), false);
    assert.equal(Object.hasOwn(parsed, 'mintaIdo'), false);

    const pageHeaderName = rawText.match(/\r?\n([^\r\n]+)\r?\n\d+\s*\/\s*\d{4}\.\d{2}\.\d{2}\./)?.[1];
    if (pageHeaderName) {
      assert.equal(serialized.includes(pageHeaderName), false, `személyes adat a ${sample}. mintában`);
    }
  }
});

test('megőrzi a mérési értéket, mértékegységet, referenciaértéket és szöveges eredményt', () => {
  const chemistry = parseLabor(fs.readFileSync(path.join(__dirname, '..', 'docs', '3'), 'utf8'));
  const urine = parseLabor(fs.readFileSync(path.join(__dirname, '..', 'docs', '2'), 'utf8'));
  const glucose = chemistry.ertekek.find(result => result.vizsgalat === 'Glukóz');
  const leukocytes = urine.ertekek.find(result => result.vizsgalat === 'Vizelet leukocyta');
  const urineBlood = urine.ertekek.find(result => result.vizsgalat === 'Vizelet erytrocyta');
  const platelets = urine.ertekek.find(result => result.vizsgalat === 'Trombocita');

  assert.deepEqual(
    { value: glucose.ertek, unit: glucose.egyseg, min: glucose.refAlso, max: glucose.refFelso, flag: glucose.jelzes },
    { value: 6.4, unit: 'mmol/l', min: 4, max: 6, flag: '+' },
  );
  assert.equal(leukocytes.ertekSzoveg, 'Negatív');
  assert.match(urineBlood.megjegyzes, /hemoglobin és\/vagy mioglobin/);
  assert.equal(platelets.ertek, 320);
  assert.equal(platelets.refFelso, 400);
});

test('kezeli az összehasonlító jelet, a több soros egységet és a kétféle véralvadási adatot', () => {
  const quantified = parseLabor(fs.readFileSync(path.join(__dirname, '..', 'docs', '6'), 'utf8'));
  const coagulation = parseLabor(fs.readFileSync(path.join(__dirname, '..', 'docs', '3'), 'utf8'));
  const crp = quantified.ertekek.find(result => result.vizsgalat === 'C reaktív fehérje');
  const egfr = coagulation.ertekek.find(result => result.vizsgalat === 'eGFR-EPI');
  const doac = coagulation.ertekek.find(result => result.vizsgalat === 'DOAC');
  const inr = coagulation.ertekek.find(result => result.vizsgalat === 'INR');

  assert.equal(crp.relacio, '<');
  assert.equal(crp.ertek, null);
  assert.equal(crp.ertekSzoveg, '< 0,6');
  assert.match(egfr.egyseg, /73 m2/);
  assert.equal(doac.ertekSzoveg, 'Nem');
  assert.equal(inr.refAlso, 0.85);
});

test('hiányzó táblázatnál hibát ad, és visszautasítja a hibás bemenetet', () => {
  const parsed = parseLabor('nincs laboreredmény');
  assert.equal(parsed.rendben, false);
  assert.deepEqual(parsed.ertekek, []);
  assert.equal(parsed.hibak.length, 1);
  assert.throws(() => parseLabor(null), TypeError);
  assert.throws(() => parseLabor('x'.repeat(2_000_001)), RangeError);
});

test('hiányzó referencia-tartománynál figyelmeztet, és nem használja a következő vizsgálatét', () => {
  const rawText = [
    'Referencia értékek',
    'Klinikai kémia',
    'Első vizsgálat',
    '12',
    'U/l',
    'Második vizsgálat',
    '2',
    'U/l',
    '1',
    '3',
    'Budapest, 2026. október 23.',
  ].join('\n');
  const parsed = parseLabor(rawText);

  assert.equal(parsed.ertekek[0].vizsgalat, 'Első vizsgálat');
  assert.equal(parsed.ertekek[0].refAlso, null);
  assert.equal(parsed.ertekek[1].vizsgalat, 'Második vizsgálat');
  assert.equal(parsed.ertekek[1].refAlso, 1);
  assert.equal(parsed.rendben, false);
  assert.match(parsed.figyelmeztetesek[0], /Első vizsgálat/);
});

test('a személyes fejléc nem kerül a kimenetbe', () => {
  const rawText = [
    'Név:',
    'Teszt Személy',
    'TAJ: 123 456 789',
    'Referencia értékek',
    'Klinikai kémia',
    'Glukóz',
    '5,1',
    'mmol/l',
    '4,0',
    '6,0',
    'Budapest, 2026. október 23.',
  ].join('\n');
  const serialized = JSON.stringify(parseLabor(rawText));

  assert.equal(serialized.includes('Teszt Személy'), false);
  assert.equal(serialized.includes('123456789'), false);
});
