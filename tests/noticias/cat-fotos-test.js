// Triagem e créditos das fotos de categoria (sem rede). Rodar da raiz: node tests/noticias/cat-fotos-test.js
const fs = require('fs'), os = require('os'), path = require('path');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'catf-'));
fs.copyFileSync(path.join(__dirname, '..', '..', 'CREDITOS-IMAGENS.md'), path.join(tmp, 'CREDITOS-IMAGENS.md'));
process.env.PHOTOS_ROOT = tmp;
const C = require('../../scripts/cat-photos');
let bad = 0; const t = (n, c) => { if (!c) bad++; console.log(c ? 'OK   ' : 'FALHA', n); };
const foto = (o) => ({ id: 'a1', width: 3000, height: 2000, alt_description: 'apartment building facade', tags: [], user: { name: 'Fulana', links: { html: 'https://unsplash.com/@fulana' } }, links: { html: 'https://unsplash.com/photos/a1' }, ...o });
t('triagem: fachada sem gente passa', C.ok(foto({})));
t('triagem: foto com pessoa no texto é descartada', !C.ok(foto({ alt_description: 'woman standing near building' })));
t('triagem: marca/logo no texto é descartada', !C.ok(foto({ tags: [{ title: 'logo' }] })));
t('triagem: foto pequena ou vertical é descartada', !C.ok(foto({ width: 1000 })) && !C.ok(foto({ width: 2000, height: 3000 })));
C.credito('imoveis', foto({}), 'q'); C.credito('imoveis', foto({ id: 'b2', links: { html: 'https://unsplash.com/photos/b2' } }), 'q');
const md = fs.readFileSync(path.join(tmp, 'CREDITOS-IMAGENS.md'), 'utf8');
t('créditos: autor e página com utm, sem linha pendente e sem duplicar a categoria', /Fulana\]\(https:\/\/unsplash\.com\/@fulana\?utm_source=erase-revisional/.test(md) && !/pendente/.test(md) && md.split('\n').filter((l) => l.startsWith('| imoveis |')).length === 1 && /b2/.test(md));
process.exit(bad ? 1 : 0);
