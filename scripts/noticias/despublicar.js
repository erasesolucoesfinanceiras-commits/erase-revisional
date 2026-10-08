#!/usr/bin/env node
// Tira um texto do ar: sai do site, da home, do Radar e do sitemap, e entra em data/despublicados.json para o robô não republicar o assunto.
//   ENDERECO="https://revisional.eraseconsulta.com.br/noticias/slug" MOTIVO="opcional" node scripts/noticias/despublicar.js
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const F = (n) => path.join(ROOT, 'data', n);
const ler = (f, vazio) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return vazio; throw e; } };
const gravar = (f, v) => fs.writeFileSync(f, JSON.stringify(v, null, 2) + '\n');
const endereco = String(process.env.ENDERECO || '').trim();
const motivo = String(process.env.MOTIVO || '').trim().slice(0, 200);

// aceita: https://site/noticias/slug  ·  /noticias/slug.html  ·  slug  ·  https://site/radar#id-da-nota  ·  #id-da-nota
const sem = endereco.split('?')[0];
const mArt = /\/noticias\/([a-z0-9-]+)(?:\.html)?\/?(?:#.*)?$/i.exec(sem);
const mNota = /#([a-z0-9-]+)$/i.exec(sem);
const chave = mArt ? mArt[1] : mNota ? mNota[1] : /^[a-z0-9-]+$/i.test(sem) ? sem : '';
if (!chave) { console.error(`Endereço não reconhecido: "${endereco}". Use o endereço do artigo (…/noticias/nome-do-artigo) ou da nota (…/radar#id).`); process.exit(1); }

const artigos = ler(F('articles.json'), []), notas = ler(F('notas.json'), []), desp = ler(F('despublicados.json'), []);
const ia = artigos.findIndex((a) => a.slug === chave), inota = notas.findIndex((n) => n.id === chave);
if (ia < 0 && inota < 0) { console.error(`Nenhum artigo ou nota com o identificador "${chave}". Confira o endereço.`); process.exit(1); }

let item, tipo;
if (ia >= 0) {
  [item] = artigos.splice(ia, 1); tipo = 'artigo';
  fs.rmSync(path.join(ROOT, 'noticias', `${item.slug}.html`), { force: true });
  const dir = path.join(ROOT, 'assets', 'img', 'news');
  if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) if (f.startsWith(item.slug + '-')) fs.rmSync(path.join(dir, f), { force: true });
  gravar(F('articles.json'), artigos);
} else {
  [item] = notas.splice(inota, 1); tipo = 'nota';
  gravar(F('notas.json'), notas);
}
desp.push({ tipo, id: item.slug || item.id, titulo: item.titulo, resumo: item.resumo || item.texto, data: item.data, categoria: item.categoria, despublicadoEm: new Date().toISOString().slice(0, 10), motivo, urls: (item.fontes || (item.fonte ? [item.fonte] : [])).map((f) => f.url).filter(Boolean) });
gravar(F('despublicados.json'), desp);
fs.appendFileSync(F('noticias-log.jsonl'), JSON.stringify({ quando: new Date().toISOString(), data: new Date().toISOString().slice(0, 10), evento: 'despublicado', tipo, titulo: item.titulo, id: item.slug || item.id, motivo }) + '\n');
execFileSync('node', [path.join(__dirname, '..', 'build.js')], { stdio: 'inherit' });
console.log(`Despublicado (${tipo}): ${item.titulo}`);
