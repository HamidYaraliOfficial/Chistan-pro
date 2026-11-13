#!/usr/bin/env node
/*
 * Export ready-made puzzles to JSON files.
 *
 *   node tools/export-puzzles.js                       # levels 1-20, one puzzle each, both languages
 *   node tools/export-puzzles.js --levels=1-100        # the first hundred levels
 *   node tools/export-puzzles.js --levels=1-20,500,9999 --lang=en
 *   node tools/export-puzzles.js --lang=fa --per-level=3
 *   node tools/export-puzzles.js --out=./my-puzzles --seed=2026
 *
 * Options
 *   --lang=fa|en|both   language(s) to export          (default: both)
 *   --levels=LIST       levels to export, from 1 to 9999: single numbers and
 *                       ranges separated by commas, e.g. 1-20,100,5000-5010
 *                       (default: 1-20)
 *   --per-level=N       puzzles for each chosen level  (default: 1)
 *   --out=DIR           output folder                  (default: ./puzzles)
 *   --seed=N            base seed, same seed = same output (default: 1)
 *
 * Every exported puzzle is validated, and no two puzzles in one file share a
 * layout. The generator avoids reusing the same words back to back.
 */
'use strict';
var fs = require('fs');
var path = require('path');
var C = require(path.join(__dirname, '..', 'js', 'generator.js'));
global.CHISTAN_WORDS = {
  fa: require(path.join(__dirname, '..', 'js', 'words-fa.js')),
  en: require(path.join(__dirname, '..', 'js', 'words-en.js'))
};

var opt = { lang: 'both', levels: '1-20', 'per-level': '1', out: path.join(__dirname, '..', 'puzzles'), seed: '1' };
process.argv.slice(2).forEach(function (a) {
  var m = /^--([\w-]+)=(.*)$/.exec(a);
  if (m) opt[m[1]] = m[2];
});
var langs = opt.lang === 'both' ? ['fa', 'en'] : [opt.lang];
if (langs.some(function (l) { return l !== 'fa' && l !== 'en'; })) { console.error('--lang must be fa, en or both'); process.exit(1); }

function parseLevels(text) {
  var out = [], seen = {};
  String(text).split(',').forEach(function (part) {
    part = part.trim(); if (!part) return;
    var m = /^(\d+)(?:-(\d+))?$/.exec(part);
    if (!m) { console.error('Bad --levels part: "' + part + '"'); process.exit(1); }
    var a = parseInt(m[1], 10), b = m[2] ? parseInt(m[2], 10) : a;
    if (a < 1 || b > C.MAX_LEVEL || b < a) { console.error('--levels must stay within 1-' + C.MAX_LEVEL + ' (got "' + part + '")'); process.exit(1); }
    for (var n = a; n <= b; n++) if (!seen[n]) { seen[n] = true; out.push(n); }
  });
  if (!out.length) { console.error('--levels is empty'); process.exit(1); }
  return out;
}
var levels = parseLevels(opt.levels);
var perLevel = Math.max(1, parseInt(opt['per-level'], 10) || 1);
var baseSeed = parseInt(opt.seed, 10) || 1;
var outDir = path.resolve(opt.out);
fs.mkdirSync(outDir, { recursive: true });

function publicPuzzle(p, index) {
  return {
    id: p.lang + '-L' + ('000' + p.level).slice(-4) + '-' + (index + 1),
    lang: p.lang, level: p.level, rows: p.rows, cols: p.cols, seed: p.seed,
    grid: p.grid.map(function (r) { return r.map(function (c) { return c || null; }); }),
    words: p.words.map(function (w) {
      return { number: w.num, direction: w.dir, row: w.r, col: w.c, length: w.len, answer: w.answer, clue: w.clue };
    })
  };
}

langs.forEach(function (lang) {
  var bank = global.CHISTAN_WORDS[lang], avoid = [], sigs = [], list = [];
  for (var round = 0; round < perLevel; round++) {
    levels.forEach(function (level) {
      var cfg = C.levelConfig(level);
      var p = C.generate({
        lang: lang, level: level, avoid: avoid, seen: sigs,
        seed: (baseSeed * 7919 + level * 104729 + round * 1299709 + (lang === 'fa' ? 11 : 23)) >>> 0
      });
      var errs = C.validate(p);
      if (errs.length) throw new Error('Invalid puzzle (' + lang + ' level ' + level + '): ' + errs[0]);
      if (p.words.length < cfg.words) throw new Error('Puzzle ' + lang + ' level ' + level + ' is short of words');
      list.push(publicPuzzle(p, round));
      avoid = avoid.concat(p.words.map(function (w) { return w.answer; })).slice(-Math.floor(bank.length * 0.6));
      sigs.push(p.signature);
    });
  }
  var file = path.join(outDir, 'sample-' + lang + '.json');
  fs.writeFileSync(file, JSON.stringify({ language: lang, count: list.length, puzzles: list }, null, 1) + '\n');
  var uniq = {}; list.forEach(function (p) { uniq[JSON.stringify(p.grid)] = true; });
  console.log(lang + ': wrote ' + list.length + ' puzzles (' + Object.keys(uniq).length + ' distinct layouts) to ' + path.relative(process.cwd(), file));
});
