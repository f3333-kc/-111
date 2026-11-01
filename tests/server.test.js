const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.NODE_ENV = 'test';
process.env.DB_PATH = path.join(__dirname, 'tmp-test.db');
process.env.ADMIN_USERNAME = 'admin';
process.env.ADMIN_PASSWORD = 'SecurePassword123';
process.env.JWT_SECRET = 'abcdefghijklmnopqrstuvwxyz1234567890';
process.env.DATABASE_URL = '';

const { app, initializeDatabase, validateStartupConfiguration } = require('../server.js');

let server;
let baseUrl;
let token;

async function login() {
  const response = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'admin',
      password: 'SecurePassword123'
    })
  });

  const data = await response.json();
  assert.equal(response.status, 200, data.error || 'login failed');
  return data.token;
}

test.before(async () => {
  await initializeDatabase();
  server = app.listen(0);
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
  token = await login();
});

test.after(async () => {
  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }

  const dbPath = process.env.DB_PATH;
  if (dbPath) {
    fs.rmSync(dbPath, { force: true });
  }
});

test('validateStartupConfiguration rejects incomplete production config', () => {
  assert.throws(() => validateStartupConfiguration({
    NODE_ENV: 'production',
    ADMIN_USERNAME: 'admin',
    ADMIN_PASSWORD: 'short',
    JWT_SECRET: 'short',
    DATABASE_URL: ''
  }), /Production configuration is incomplete/);
});

test('login endpoint returns token for valid credentials', async () => {
  const response = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'admin',
      password: 'SecurePassword123'
    })
  });

  const data = await response.json();
  assert.equal(response.status, 200);
  assert.ok(data.token);
});

test('create, read, update and delete order flow works', async () => {
  const createResponse = await fetch(`${baseUrl}/api/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      playerName: '张三',
      customerName: '王老板',
      amount: 1500,
      playType: '大坝单保',
      remark: '测试订单'
    })
  });

  const created = await createResponse.json();
  assert.equal(createResponse.status, 201, created.error || 'create order failed');
  assert.ok(created.id);

  const listResponse = await fetch(`${baseUrl}/api/orders`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const orders = await listResponse.json();
  assert.equal(listResponse.status, 200);
  assert.ok(Array.isArray(orders));
  assert.ok(orders.some((order) => Number(order.id) === Number(created.id)));

  const statsResponse = await fetch(`${baseUrl}/api/stats`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const stats = await statsResponse.json();
  assert.equal(statsResponse.status, 200);
  assert.ok(stats.totalOrders >= 1);
  assert.ok(stats.totalAmount >= 1500);

  const updateResponse = await fetch(`${baseUrl}/api/orders/${created.id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      playerName: '张三',
      customerName: '王老板',
      amount: 2000,
      playType: '航天护航',
      remark: '更新后测试'
    })
  });

  assert.equal(updateResponse.status, 200, 'update order failed');

  const deleteResponse = await fetch(`${baseUrl}/api/orders/${created.id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });

  assert.equal(deleteResponse.status, 200, 'delete order failed');
});
