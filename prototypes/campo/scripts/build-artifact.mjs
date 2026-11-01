// Empaqueta el laboratorio en una sola página autocontenida (CSS y JS en línea) para publicarla.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dist = join(process.cwd(), 'dist');
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const css = readFileSync(join(dist, 'lab.css'), 'utf8');
const js = readFileSync(join(dist, 'lab.js'), 'utf8').replace(/<\/script/gi, '<\\/script');
const body = html.split('<!--LAB-START-->')[1].split('<!--LAB-END-->')[0];
const fonts =
  'https://fonts.googleapis.com/css2?family=Bangers&family=Barlow+Condensed:ital,wght@0,500;0,600;0,700;0,800;1,600&family=Barlow:wght@400;600;700&family=Bowlby+One&family=Silkscreen&display=swap';
const page = `<title>Laboratorio de The Gaffer</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="${fonts}">
<style>${css}</style>
${body}
<script type="module">${js}</script>
`;
mkdirSync(join(process.cwd(), 'artifact'), { recursive: true });
writeFileSync(join(process.cwd(), 'artifact', 'laboratorio-campo.html'), page);
console.log(`artifact/laboratorio-campo.html · ${(page.length / 1024).toFixed(0)} KB`);
