// Petit service local utilisé pour fabriquer les captures du tutoriel :
// la page POSTe une image (dataURL) et elle est écrite dans captures/.
//   node docs/tutoriel/serveur-captures.cjs
const http = require('http');
const fs = require('fs');
const path = require('path');

const dossier = path.join(__dirname, 'captures');
fs.mkdirSync(dossier, { recursive: true });

http
  .createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.end('ok');
    if (req.method !== 'POST') return res.end('pret');
    const nom = (req.url || '/capture').replace(/[^a-zA-Z0-9._-]/g, '') || 'capture';
    const morceaux = [];
    req.on('data', (m) => morceaux.push(m));
    req.on('end', () => {
      const base64 = Buffer.concat(morceaux).toString().replace(/^data:image\/\w+;base64,/, '');
      const fichier = path.join(dossier, nom.endsWith('.png') ? nom : nom + '.png');
      fs.writeFileSync(fichier, Buffer.from(base64, 'base64'));
      console.log('écrit :', fichier, fs.statSync(fichier).size, 'octets');
      res.end('ok');
    });
  })
  .listen(4599, () => console.log('service de captures prêt sur 4599'));
