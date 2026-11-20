const { test } = require('node:test');
const assert = require('node:assert');
const trie = require('../src/ds/trie');

test('find returns ids matching a prefix', () => {
  trie.insert(1, 'apple');
  trie.insert(2, 'application');
  trie.insert(3, 'banana');
  const ids = trie.find('app').sort((a, b) => a - b);
  assert.deepStrictEqual(ids, [1, 2]);
});

test('find is case-insensitive and ignores punctuation', () => {
  trie.insert(4, 'Hello World');
  assert.ok(trie.find('HELLO').includes(4));
  assert.ok(trie.find('hel!lo').includes(4));
});

test('later words of a multi-word value are searchable', () => {
  trie.insert(5, 'grey athletic shorts');
  assert.ok(trie.find('athletic').includes(5));
  assert.ok(trie.find('shorts').includes(5));
  assert.ok(trie.find('grey').includes(5));
});

test('find with no match returns an empty array', () => {
  assert.deepStrictEqual(trie.find('zzzz'), []);
});

test('remove takes the id out of search results', () => {
  trie.insert(6, 'temporary');
  assert.ok(trie.find('temp').includes(6));
  trie.remove(6);
  assert.ok(!trie.find('temp').includes(6));
  assert.strictEqual(trie.lookup.get(6), undefined);
});

test('re-inserting an id replaces the old value', () => {
  trie.insert(7, 'oldvalue');
  trie.insert(7, 'newvalue');
  assert.ok(!trie.find('old').includes(7));
  assert.ok(trie.find('new').includes(7));
  assert.strictEqual(trie.lookup.get(7), 'newvalue');
});

test('values with digits are searchable', () => {
  trie.insert(8, 'mp3 player');
  assert.ok(trie.find('mp3').includes(8));
});

test('findRanked orders by weight, then alphabetically', () => {
  trie.insert(101, 'wombat', 5);
  trie.insert(102, 'work', 50);
  trie.insert(103, 'world', 10);
  const ranked = trie.findRanked('wo');
  assert.deepStrictEqual(ranked.slice(0, 3), ['work', 'world', 'wombat']);
  trie.insert(104, 'worm', 0);
  trie.insert(105, 'wore', 0);
  const withZeros = trie.findRanked('wo');
  assert.ok(withZeros.indexOf('wore') < withZeros.indexOf('worm'));
});

test('incrementWeight moves a word up the ranking', () => {
  for (let i = 0; i < 100; i++) trie.incrementWeight(101);
  assert.strictEqual(trie.findRanked('wo')[0], 'wombat');
  assert.strictEqual(trie.getWeight(101), 105);
});

test('remove clears the weight', () => {
  trie.insert(107, 'tempword', 9);
  assert.strictEqual(trie.getWeight(107), 9);
  trie.remove(107);
  assert.strictEqual(trie.getWeight(107), 0);
});

test('findFuzzy finds close spellings', () => {
  trie.insert(106, 'keyboard', 3);
  assert.ok(trie.findFuzzy('keybaord').includes('keyboard'));
  assert.ok(trie.findFuzzy('keybord').includes('keyboard'));
  assert.deepStrictEqual(trie.findFuzzy('zzzzzz'), []);
});
