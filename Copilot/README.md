# Laborlelet-parser

Node.js-es parancssori parser a mintákban szereplő, szöveges formátumú laborleletekhez. Külső csomagot nem igényel.

```text
node parser.js lelet.txt
```

A `lelet.txt` UTF-8 kódolású, sorokra bontott szöveg legyen (például PDF-ből kinyert szöveg). Az eredmény JSON-ként a standard kimenetre kerül. A parser megőrzi a leletben szereplő értékeket és referenciaértékeket szövegként; nem alakítja át őket számmá, nem végez orvosi értelmezést, és nem olvas ki beteg- vagy validálóadatokat.

A parser a mintákban azonosított laborvizsgálatokat dolgozza fel. A nem felismert vizsgálatokat nem következteti ki; az ismert, de érték nélkül maradt sorokat a `warnings` mező jelzi. Új leletformátumnál ellenőrizni kell az eredményt, és szükség esetén bővíteni az ismert vizsgálatok listáját a `parser.js` fájlban. A parser a leletadatokat nem küldi hálózatra és nem ír fájlba.

A beépített tesztek futtatása Node.js 18 vagy újabb verzióval:

```text
node --test parser.test.js
```
