const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { after, before, test } = require('node:test');
const { createApp } = require('../src/app');
const { createDatabase } = require('../src/database');

let baseUrl;
let cookie;
let database;
let server;
let temporaryDirectory;

const config = {
  username: 'operator',
  password: 'correct horse battery staple',
  webhookToken: 'test-webhook-secret',
  sessionSecret: 'test-session-secret',
  offlineAfterMinutes: 15,
  trustProxy: false,
  secureCookies: false,
};

before(async () => {
  temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'homelab-beacon-test-'));
  database = createDatabase(path.join(temporaryDirectory, 'test.db'));
  server = createApp({ config, database }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  database.close();
  fs.rmSync(temporaryDirectory, { recursive: true });
});

test('health endpoint responds without authentication', async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, 'ok');
});

test('serves the dashboard with restrictive browser headers', async () => {
  const response = await fetch(`${baseUrl}/`);
  const body = await response.text();
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-security-policy'), /default-src 'self'/);
  assert.match(body, /Homelab Beacon/);
});

test('hosts endpoint rejects unauthenticated requests', async () => {
  const response = await fetch(`${baseUrl}/api/hosts`);
  assert.equal(response.status, 401);
});

test('login rejects bad credentials and accepts configured credentials', async () => {
  const badResponse = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'operator', password: 'wrong' }),
  });
  assert.equal(badResponse.status, 401);

  const response = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: config.username, password: config.password }),
  });
  assert.equal(response.status, 200);
  cookie = response.headers.get('set-cookie').split(';')[0];
  assert.match(cookie, /^homelab_session=/);
});

test('webhook validates its token and payload', async () => {
  const unauthorized = await fetch(`${baseUrl}/api/webhook/not-the-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hostname: 'node-one' }),
  });
  assert.equal(unauthorized.status, 401);

  const invalid = await fetch(`${baseUrl}/api/webhook/${config.webhookToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hostname: 'bad host!', ipv4: '999.1.1.1' }),
  });
  assert.equal(invalid.status, 400);
});

test('webhook creates and then updates one record per hostname', async () => {
  const first = await fetch(`${baseUrl}/api/webhook`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.webhookToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      hostname: 'node-one.local',
      ipv4: '198.51.100.4',
      ipv6: '2001:db8::4',
      uptime: 120,
      load_average: [0.2, 0.3, 0.4],
      rack: 'closet',
    }),
  });
  assert.equal(first.status, 202);

  const second = await fetch(`${baseUrl}/api/webhook/${config.webhookToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hostname: 'node-one.local', ipv4: '198.51.100.8', load: '0.7 0.5 0.4' }),
  });
  assert.equal(second.status, 202);

  const hostsResponse = await fetch(`${baseUrl}/api/hosts`, { headers: { Cookie: cookie } });
  assert.equal(hostsResponse.status, 200);
  const { hosts } = await hostsResponse.json();
  assert.equal(hosts.length, 1);
  assert.equal(hosts[0].hostname, 'node-one.local');
  assert.equal(hosts[0].ipv4, '198.51.100.8');
  assert.equal(hosts[0].load_1, 0.7);
});

test('authenticated operator can remove a host', async () => {
  const response = await fetch(`${baseUrl}/api/hosts/node-one.local`, {
    method: 'DELETE',
    headers: { Cookie: cookie },
  });
  assert.equal(response.status, 204);
  assert.equal(database.list().length, 0);
});
