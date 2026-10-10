#!/usr/bin/env node
// Verificação diária: falha (run vermelho) se o artigo mais recente tem mais de MAX_DIAS dias (padrão 3).
const fs = require('fs');
const path = require('path');
const MAX_DIAS = Number(process.env.MAX_DIAS || 3);
const arq = process.env.ARTIGOS || path.join(__dirname, '..', '..', 'data', 'articles.json');
const hoje = process.env.DATA || new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10); // data de Brasília
const ultimo = JSON.parse(fs.readFileSync(arq, 'utf8')).reduce((m, a) => (a.data > m ? a.data : m), '');
const dias = ultimo ? Math.floor((Date.parse(hoje) - Date.parse(ultimo)) / 864e5) : Infinity;
console.log(`Artigo mais recente: ${ultimo || 'nenhum'} (${dias} dia(s) atrás; limite ${MAX_DIAS}).`);
if (dias > MAX_DIAS) { console.error(`::error::Nenhum artigo novo há ${dias} dias (último: ${ultimo}). Veja data/noticias-log.jsonl e o run "Notícias automáticas".`); process.exit(1); }
