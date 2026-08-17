const fs = require('fs');
const html = fs.readFileSync('index3d.html', 'utf8');
const three = fs.readFileSync('three.min.js', 'utf8');
const game = fs.readFileSync('game3d.js', 'utf8');
let out = html.replace('<script src="three.min.js"></script>', `<script>${three}</script>`);
out = out.replace('<script src="game3d.js"></script>', `<script>${game}</script>`);
fs.writeFileSync(process.argv[2] || 'europa-3d-v13.html', out);
console.log('built', process.argv[2] || 'europa-3d-v13.html');
