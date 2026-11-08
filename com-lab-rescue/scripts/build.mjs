import { build } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
await fs.mkdir(path.join(root, 'dist'), { recursive: true });
const result = await build({
  entryPoints: [path.join(root, 'src/app.js')],
  bundle: true, write: false, format: 'iife', target: ['es2020'],
  minify: true, legalComments: 'inline',
});
const [template, rawCss, configText, regular, bold, threeLicense, fontLicense] = await Promise.all([
  fs.readFile(path.join(root,'src/template.html'),'utf8'),
  fs.readFile(path.join(root,'src/style.css'),'utf8'),
  fs.readFile(path.join(root,'config.json'),'utf8'),
  fs.readFile(path.join(root,'vendor/fonts/NotoSansThai-Regular.ttf')),
  fs.readFile(path.join(root,'vendor/fonts/NotoSansThai-Bold.ttf')),
  fs.readFile(path.join(root,'vendor/THREE-LICENSE.txt'),'utf8'),
  fs.readFile(path.join(root,'vendor/fonts/OFL.txt'),'utf8'),
]);
const css = '@font-face{font-family:"Noto Sans Thai";font-style:normal;font-weight:400;src:url(data:font/ttf;base64,'+regular.toString('base64')+') format("truetype");font-display:swap}@font-face{font-family:"Noto Sans Thai";font-style:normal;font-weight:700 900;src:url(data:font/ttf;base64,'+bold.toString('base64')+') format("truetype");font-display:swap}' + rawCss;
const config = JSON.stringify(JSON.parse(configText)).replaceAll('<', '\\u003c');
const js=result.outputFiles[0].text.replaceAll('</script', '<\\/script');
const licenses = '<!-- Bundled third-party notices\nThree.js\n'+threeLicense+'\nNoto Sans Thai\n'+fontLicense+'\n-->\n';
const html=template.replace('<!-- APP_STYLE -->', () => '<style>'+css+'</style>')
 .replace('<!-- APP_SCRIPT -->', () => licenses+'<script>window.COM_LAB_CONFIG='+config+';</script><script>'+js+'</script>');
await fs.writeFile(path.join(root,'dist/index.html'),html);
await fs.writeFile(path.join(root,'COM-LAB-RESCUE.html'),html);
console.log('Built self-contained game: '+(Buffer.byteLength(html)/1024/1024).toFixed(2)+' MB');

