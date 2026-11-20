const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');

const PORT = 3210;
const BASE = `http://localhost:${PORT}`;
let server;

async function waitForHealth() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return;
    } catch (err) {}
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error('server did not start');
}

before(async () => {
  server = spawn('node', ['src/server.js'], {
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env,
      PORT: String(PORT),
      MONGO_URI: process.env.MONGO_URI || 'mongodb://localhost:27017/autocomplete_test',
      REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
      ADMIN_TOKEN: ''
    },
    stdio: 'ignore'
  });
  await waitForHealth();
  const items = [
    { itemId: 9101, value: 'questword' },
    { itemId: 9102, value: 'questline' },
    { itemId: 9103, value: 'questmark' }
  ];
  for (const item of items) {
    await fetch(`${BASE}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item)
    });
  }
});

after(async () => {
  for (const id of [9101, 9102, 9103]) {
    await fetch(`${BASE}/items/${id}`, { method: 'DELETE' }).catch(() => {});
  }
  if (server) server.kill();
});

test('autocomplete returns prefix matches', async () => {
  const res = await fetch(`${BASE}/autocomplete?q=quest`);
  const json = await res.json();
  assert.strictEqual(json.data.length, 3);
  assert.ok(json.data.includes('questword'));
});

test('tracked selections move a word to the top', async () => {
  for (let i = 0; i < 3; i++) {
    const res = await fetch(`${BASE}/track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: 'questmark' })
    });
    assert.strictEqual(res.status, 200);
  }
  const res = await fetch(`${BASE}/autocomplete?q=quest`);
  const json = await res.json();
  assert.strictEqual(json.data[0], 'questmark');
});

test('fuzzy fallback finds a misspelling', async () => {
  const res = await fetch(`${BASE}/autocomplete?q=questwrod`);
  const json = await res.json();
  assert.strictEqual(json.fuzzy, true);
  assert.ok(json.data.includes('questword'));
});

test('limit caps the number of results', async () => {
  const res = await fetch(`${BASE}/autocomplete?q=quest&limit=2`);
  const json = await res.json();
  assert.strictEqual(json.data.length, 2);
});

test('missing query returns 400', async () => {
  const res = await fetch(`${BASE}/autocomplete`);
  assert.strictEqual(res.status, 400);
});

test('health and stats respond', async () => {
  const health = await (await fetch(`${BASE}/health`)).json();
  assert.strictEqual(health.status, 'ok');
  const stats = await (await fetch(`${BASE}/stats`)).json();
  assert.ok(stats.requests >= 1);
  assert.ok(stats.tracks >= 3);
});
