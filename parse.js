const fs = require('fs');
const text = fs.readFileSync('torzs.txt', 'utf8');

const RULES = {
  name:        /Születési név:\s*\n(.+)\n/,
  birthName:   /Születési név:\s*\n.+\n(.+)/,
  pob:         /Születési hely, idő:\s*(.+)/,
  dob:         /(\d{4}\.\d{2}\.\d{2}\.)\s*\(/,
  taj:         /TAJ:\s*([\d ]+)/,
  mothersName: /Anyja neve:\s*(.+)/,
  docDate:     /Vizsgálat ideje:\s*(\d{4}\.\d{2}\.\d{2}\. \d{2}\:\d{2})/,
  addr:        /Lakcím:\s*(.+)/,
  dg0Text:      /Beutaló Dg\.:\s*(.+).{5}$/m,
  dg0ICD:       /Beutaló Dg\.:\s*.+(.{5})$/m,
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

// console.log(parseTorzs(text));

const eredmeny = parseTorzs(text);
console.log(eredmeny);
fs.writeFileSync('eredmeny.json', JSON.stringify(eredmeny, null, 2), 'utf8');