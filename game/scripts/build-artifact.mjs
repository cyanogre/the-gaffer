// Empaqueta el juego en una sola página autocontenida (CSS y JS en línea) para publicarla.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dist = join(process.cwd(), 'dist');
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const css = readFileSync(join(dist, 'game.css'), 'utf8');
const js = readFileSync(join(dist, 'game.js'), 'utf8').replace(/<\/script/gi, '<\\/script');
const body = html.split('<!--GAME-START-->')[1].split('<!--GAME-END-->')[0];
const fonts =
  'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700;800&family=Barlow:wght@400;600;700&family=Bowlby+One&family=Silkscreen&display=swap';
const page = `<title>The Gaffer</title>
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="${fonts}">
<style>${css}</style>
${body}
<script type="module">${js}</script>
`;
mkdirSync(join(process.cwd(), 'artifact'), { recursive: true });
writeFileSync(join(process.cwd(), 'artifact', 'the-gaffer.html'), page);
console.log(`artifact/the-gaffer.html · ${(page.length / 1024).toFixed(0)} KB`);
