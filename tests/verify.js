#!/usr/bin/env node
/*
 * Chistan self-test.  Run with:  node tests/verify.js   (or: npm test)
 *
 *  1. Word banks: valid letters, unique answers, sensible lengths, clues present.
 *  2. Level table: all 9,999 levels exist, word count and grid size never shrink,
 *     and the count grows slowly (at most one word per level).
 *  3. Sample levels across the whole range, both languages, several seeds: the
 *     puzzle is valid, reaches its word target and fits its size.
 *  4. Session simulation: many puzzles in a row with the same history rules the
 *     app uses; no repeated puzzle and little word reuse between neighbours.
 *
 * Options:  --runs=N  (seeds per sample level, default 4)   --quick (1 seed per level)
 */
'use strict';
var path = require('path');
var C = require(path.join(__dirname, '..', 'js', 'generator.js'));
var FA = require(path.join(__dirname, '..', 'js', 'words-fa.js'));
var EN = require(path.join(__dirname, '..', 'js', 'words-en.js'));

var args = process.argv.slice(2);
var quick = args.indexOf('--quick') >= 0;
var runsArg = args.filter(function (a) { return a.indexOf('--runs=') === 0; })[0];
var RUNS = quick ? 1 : (runsArg ? parseInt(runsArg.split('=')[1], 10) : 4);

var failures = 0;
function fail(msg) { failures++; console.log('  FAIL  ' + msg); }
function pad(s, n) { s = String(s); while (s.length < n) s += ' '; return s; }

/* ---------- 1. word banks ---------- */
var FA_ALPHABET = 'ابپتثجچحخدذرزژسشصضطظعغفقکگلمنوهیآ';
function checkBank(name, bank, lang) {
  console.log('Word bank [' + name + ']: ' + bank.length + ' entries');
  var seen = {}, lenHist = {};
  bank.forEach(function (e) {
    var word = e[0], clue = e[1];
    var letters = Array.from(word);
    if (seen[word]) fail(name + ': duplicate answer "' + word + '"');
    seen[word] = true;
    if (!clue || clue.length < 3) fail(name + ': missing clue for "' + word + '"');
    if (lang === 'fa') {
      letters.forEach(function (ch) {
        if (FA_ALPHABET.indexOf(ch) < 0) fail(name + ': invalid letter U+' + ch.charCodeAt(0).toString(16) + ' in "' + word + '"');
      });
    } else if (!/^[A-Z]+$/.test(word)) {
      fail(name + ': answer must be A-Z only: "' + word + '"');
    }
    if (letters.length < 3 || letters.length > 9) fail(name + ': length out of 3..9: "' + word + '"');
    lenHist[letters.length] = (lenHist[letters.length] || 0) + 1;
  });
  console.log('  length histogram: ' + Object.keys(lenHist).sort().map(function (k) { return k + ':' + lenHist[k]; }).join('  '));
  if (bank.length < 600) fail(name + ': fewer than 600 entries (the biggest levels need a large bank)');
}
checkBank('fa', FA, 'fa');
checkBank('en', EN, 'en');

/* ---------- 2. the level table ---------- */
function checkLevelTable() {
  console.log('\nLevel table: ' + C.MAX_LEVEL + ' levels');
  if (C.MAX_LEVEL !== 9999) fail('MAX_LEVEL should be 9999, got ' + C.MAX_LEVEL);
  var prev = null, steps = 0, maxJump = 0, tiers = {}, firstAt = {};
  for (var n = 1; n <= C.MAX_LEVEL; n++) {
    var cfg = C.levelConfig(n);
    if (cfg.level !== n) fail('levelConfig(' + n + ').level is ' + cfg.level);
    if (!(cfg.words >= 4) || !(cfg.size >= 6) || cfg.minLen < 3 || cfg.maxLen > 9) fail('level ' + n + ': odd config ' + JSON.stringify(cfg));
    if (prev) {
      if (cfg.words < prev.words) fail('word count shrinks at level ' + n);
      if (cfg.size < prev.size) fail('grid size shrinks at level ' + n);
      var jump = cfg.words - prev.words;
      if (jump > 0) steps++;
      if (jump > maxJump) maxJump = jump;
    }
    var t = C.tierOf(n);
    if (!(t >= 1 && t <= C.TIER_COUNT)) fail('tierOf(' + n + ') = ' + t);
    tiers[t] = (tiers[t] || 0) + 1;
    if (!firstAt[t]) firstAt[t] = n;
    prev = cfg;
  }
  var last = C.levelConfig(C.MAX_LEVEL), first = C.levelConfig(1);
  console.log('  level 1: ' + first.words + ' words on ' + first.size + 'x' + first.size +
    '   level ' + C.MAX_LEVEL + ': ' + last.words + ' words on up to ' + last.size + 'x' + last.size);
  console.log('  levels where the word count goes up: ' + steps + '   biggest single jump: ' + maxJump);
  console.log('  tiers begin at: ' + Object.keys(firstAt).map(function (k) { return k + ':L' + firstAt[k]; }).join('  '));
  if (maxJump > 4) fail('word count jumps by more than 4 between two levels');
  if (Object.keys(tiers).length !== C.TIER_COUNT) fail('not every tier is used');
  ['0', '-3', '10000', '1.5e4'].forEach(function (bad) {
    var threw = false;
    try { C.levelConfig(Number(bad)); } catch (e) { threw = true; }
    if (!threw) fail('levelConfig(' + bad + ') should throw');
  });
}
checkLevelTable();

/* ---------- 3. sample levels across the range ---------- */
var SAMPLE = [];
for (var i = 1; i <= 20; i++) SAMPLE.push(i);
SAMPLE.push(21, 25, 30, 40, 50, 75, 100, 150, 250, 400, 600, 1000, 1500, 2500, 4000, 5000, 7000, 9000, 9998, 9999);

function runLevels(lang) {
  console.log('\nSample levels [' + lang + '] (' + RUNS + ' seeds each)');
  console.log('  ' + pad('lvl', 6) + pad('size', 7) + pad('target', 8) + pad('words(min/avg)', 16) + pad('largest', 9) + pad('ms avg/max', 12) + 'valid');
  var allMs = [];
  SAMPLE.forEach(function (level) {
    var cfg = C.levelConfig(level);
    var minW = 999, sumW = 0, maxDim = 0, sumMs = 0, maxMs = 0, bad = 0;
    for (var s = 0; s < RUNS; s++) {
      var t0 = Date.now();
      var p = C.generate({ lang: lang, level: level, seed: 1000 * level + s * 7919 + 13 });
      var ms = Date.now() - t0;
      sumMs += ms; if (ms > maxMs) maxMs = ms; allMs.push(ms);
      var errs = C.validate(p);
      if (errs.length) { bad++; fail('level ' + level + ' seed ' + p.seed + ': ' + errs.slice(0, 3).join('; ')); }
      if (p.words.length < cfg.words) fail('level ' + level + ' seed ' + p.seed + ': only ' + p.words.length + '/' + cfg.words + ' words');
      if (p.rows > cfg.size || p.cols > cfg.size) fail('level ' + level + ': grid ' + p.rows + 'x' + p.cols + ' exceeds size ' + cfg.size);
      minW = Math.min(minW, p.words.length); sumW += p.words.length;
      maxDim = Math.max(maxDim, p.rows, p.cols);
    }
    console.log('  ' + pad(level, 6) + pad(cfg.size + 'x' + cfg.size, 7) + pad(cfg.words, 8) +
      pad(minW + ' / ' + (sumW / RUNS).toFixed(1), 16) + pad(maxDim, 9) +
      pad(Math.round(sumMs / RUNS) + ' / ' + maxMs, 12) + (bad ? 'NO' : 'yes'));
  });
  allMs.sort(function (a, b) { return a - b; });
  console.log('  generation time: median ' + allMs[Math.floor(allMs.length / 2)] + ' ms, max ' + allMs[allMs.length - 1] + ' ms');
}
runLevels('fa');
runLevels('en');

/* ---------- 4. session simulation ---------- */
function simulate(lang, bankSize) {
  var count = quick ? 40 : 120;
  var ladder = [1, 5, 10, 15, 20, 40, 100, 400, 1500, 5000, 9999];
  var avoid = [], sigs = [], seen = {}, dupes = 0, overlapSum = 0, overlapN = 0, prev = null;
  for (var i = 0; i < count; i++) {
    var level = ladder[i % ladder.length];
    var p = C.generate({ lang: lang, level: level, avoid: avoid, seen: sigs });
    if (seen[p.signature]) dupes++;
    seen[p.signature] = true;
    var answers = p.words.map(function (w) { return w.answer; });
    if (prev) {
      var shared = answers.filter(function (a) { return prev.indexOf(a) >= 0; }).length;
      overlapSum += shared / answers.length; overlapN++;
    }
    prev = answers;
    avoid = avoid.concat(answers).slice(-Math.floor(bankSize * 0.6));
    sigs = sigs.concat([p.signature]).slice(-400);
  }
  console.log('\nSession simulation [' + lang + ']: ' + count + ' puzzles in a row, levels 1 to 9999 mixed');
  console.log('  identical puzzles: ' + dupes + '   average word overlap with the previous puzzle: ' + (100 * overlapSum / overlapN).toFixed(1) + '%');
  if (dupes) fail('session simulation produced repeated puzzles in ' + lang);
}
simulate('fa', FA.length);
simulate('en', EN.length);

/* ---------- 5. replaying the same level many times ---------- */
function replay(lang, level, times, bankSize) {
  var avoid = [], sigs = [], seen = {}, dupes = 0;
  for (var i = 0; i < times; i++) {
    var p = C.generate({ lang: lang, level: level, avoid: avoid, seen: sigs });
    if (seen[p.signature]) dupes++;
    seen[p.signature] = true;
    avoid = avoid.concat(p.words.map(function (w) { return w.answer; })).slice(-Math.floor(bankSize * 0.6));
    sigs = sigs.concat([p.signature]).slice(-400);
  }
  console.log('Replay [' + lang + '] level ' + level + ' x' + times + ': ' + dupes + ' repeated layouts');
  if (dupes) fail('level ' + level + ' repeated a layout in ' + lang);
}
console.log('');
[1, 20, 500, 9999].forEach(function (lv) {
  replay('fa', lv, quick ? 15 : 40, FA.length);
  replay('en', lv, quick ? 15 : 40, EN.length);
});

console.log('\n' + (failures ? failures + ' check(s) FAILED' : 'All checks passed'));
process.exit(failures ? 1 : 0);
