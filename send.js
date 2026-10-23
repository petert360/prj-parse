const fs = require('fs');

// Az eredmeny.json beolvasása
const adat = JSON.parse(fs.readFileSync('eredmeny.json', 'utf8'));

async function kuldes() {
  const valasz = await fetch('http://127.0.0.1:3000/api/torzs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(adat),
  });

  const tartalom = await valasz.json();
  console.log('Státusz:', valasz.status);
  console.log('Válasz:', tartalom);
}

kuldes();
