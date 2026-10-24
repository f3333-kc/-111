require('dotenv').config();

const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3').verbose();
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'local-development-secret';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'guard.db');
const DATABASE_URL = process.env.DATABASE_URL || '';
const LEGACY_DATA_FILE = path.join(__dirname, 'data.json');

function resolveDatabaseMode() {
  return (process.env.DATABASE_URL || DATABASE_URL) ? 'postgres' : 'sqlite';
}

let sqliteDb = null;
let postgresPool = null;

if (resolveDatabaseMode() === 'sqlite') {
  sqliteDb = new sqlite3.Database(DB_PATH, (error) => {
    if (error) {
      console.error('Database connection failed:', error.message);
    }
  });
} else {
  postgresPool = new Pool({
    connectionString: DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  postgresPool.on('error', (error) => {
    console.error('Postgres pool error:', error.message);
  });
}

const DEFAULT_PLAY_TYPES = [
  '大坝单保',
  '大坝双保',
  '航天双保',
  '航天护航',
  '瘴气沼泽满编'
];

function normalizeOrder(order = {}) {
  return {
    id: order.id ?? Date.now(),
    player_name: order.player_name ?? order.playerName ?? '',
    customer_name: order.customer_name ?? order.customerName ?? '',
    amount: Number(order.amount ?? 0),
    play_type: order.play_type ?? order.playType ?? '',
    remark: order.remark ?? '',
    created_at: order.created_at ?? order.createdAt ?? new Date().toLocaleString('zh-CN')
  };
}

function normalizeStats(raw = {}) {
  const byPlayer = Array.isArray(raw.byPlayer) ? raw.byPlayer : (Array.isArray(raw.by_player) ? raw.by_player : []);
  const byCustomer = Array.isArray(raw.byCustomer) ? raw.byCustomer : (Array.isArray(raw.by_customer) ? raw.by_customer : []);
  const byPlayType = Array.isArray(raw.byPlayType) ? raw.byPlayType : (Array.isArray(raw.by_play_type) ? raw.by_play_type : []);

  return {
    total_orders: Number(raw.totalOrders ?? raw.total_orders ?? 0),
    total_amount: Number(raw.totalAmount ?? raw.total_amount ?? 0),
    by_player: byPlayer.map((item) => ({
      name: item.name || '',
      count: Number(item.count || 0),
      total: Number(item.total || 0)
    })),
    by_customer: byCustomer.map((item) => ({
      name: item.name || '',
      count: Number(item.count || 0),
      total: Number(item.total || 0)
    })),
    by_play_type: byPlayType.map((item) => ({
      name: item.name || '',
      count: Number(item.count || 0),
      total: Number(item.total || 0)
    }))
  };
}

function normalizeConfig(raw = {}) {
  return {
    players: Array.isArray(raw.players) ? raw.players : [],
    playTypes: Array.isArray(raw.playTypes) ? raw.playTypes : []
  };
}

function getDefaultData() {
  return {
    orders: [],
    players: [],
    playTypes: [...DEFAULT_PLAY_TYPES]
  };
}

function readDbAsync(sql, params = []) {
  if (resolveDatabaseMode() === 'postgres') {
    return postgresPool.query(sql, params).then((result) => result.rows);
  }

  return new Promise((resolve, reject) => {
    sqliteDb.all(sql, params, (error, rows) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(rows);
    });
  });
}

function runDbAsync(sql, params = []) {
  if (resolveDatabaseMode() === 'postgres') {
    return postgresPool.query(sql, params).then((result) => ({
      id: result.rows[0]?.id ?? null,
      changes: result.rowCount ?? 0
    }));
  }

  return new Promise((resolve, reject) => {
    sqliteDb.run(sql, params, function onRun(error) {
      if (error) {
        reject(error);
        return;
      }
      resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function deriveConfigFromOrders(orders = []) {
  const players = [...new Set((orders || []).map((order) => order.player_name || order.playerName || '').filter(Boolean))];
  const playTypes = [...new Set((orders || []).map((order) => order.play_type || order.playType || '').filter(Boolean))];

  return {
    players,
    playTypes: [...new Set([...DEFAULT_PLAY_TYPES, ...playTypes])]
  };
}

async function migrateLegacyJson() {
  if (!fs.existsSync(LEGACY_DATA_FILE)) {
    return;
  }

  const raw = JSON.parse(fs.readFileSync(LEGACY_DATA_FILE, 'utf8') || '{}');
  const orders = Array.isArray(raw.orders) ? raw.orders : [];

  if (!orders.length) {
    return;
  }

  const existingRows = await readDbAsync('SELECT COUNT(*) AS count FROM orders');
  if (Number(existingRows[0]?.count || 0) > 0) {
    return;
  }

  for (const order of orders) {
    const insertSql = resolveDatabaseMode() === 'postgres'
      ? 'INSERT INTO orders (player_name, customer_name, amount, play_type, remark, created_at) VALUES ($1, $2, $3, $4, $5, $6)'
      : 'INSERT INTO orders (player_name, customer_name, amount, play_type, remark, created_at) VALUES (?, ?, ?, ?, ?, ?)';
    await runDbAsync(
      insertSql,
      [
        order.player_name ?? order.playerName ?? '',
        order.customer_name ?? order.customerName ?? '',
        Number(order.amount ?? 0),
        order.play_type ?? order.playType ?? '',
        order.remark ?? '',
        order.created_at ?? order.createdAt ?? new Date().toLocaleString('zh-CN')
      ]
    );
  }
}

async function initializeDatabase() {
  if (resolveDatabaseMode() === 'postgres') {
    await postgresPool.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        player_name TEXT,
        customer_name TEXT,
        amount REAL,
        play_type TEXT,
        remark TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await migrateLegacyJson();
    return;
  }

  await new Promise((resolve, reject) => {
    sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        player_name TEXT,
        customer_name TEXT,
        amount REAL,
        play_type TEXT,
        remark TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

  await migrateLegacyJson();
}

function validateStartupConfiguration(env = process.env) {
  if (env.NODE_ENV !== 'production') {
    return;
  }

  const missing = [];
  if (!env.ADMIN_USERNAME || env.ADMIN_USERNAME === 'admin') missing.push('ADMIN_USERNAME');
  if (!env.ADMIN_PASSWORD || env.ADMIN_PASSWORD.length < 12 || env.ADMIN_PASSWORD === 'admin123') {
    missing.push('ADMIN_PASSWORD (at least 12 characters)');
  }
  if (!env.JWT_SECRET || env.JWT_SECRET.length < 32 || env.JWT_SECRET === 'guard-admin-secret') {
    missing.push('JWT_SECRET (at least 32 characters)');
  }
  if (!env.DATABASE_URL) missing.push('DATABASE_URL (persistent PostgreSQL database)');

  if (missing.length) {
    throw new Error(`Production configuration is incomplete: ${missing.join(', ')}`);
  }
}

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

app.use(express.json({ limit: '50kb' }));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/index.html', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get(['/app.js', '/styles.css', '/config.js'], (req, res) => {
  res.sendFile(path.join(__dirname, req.path.slice(1)));
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: '用户名和密码都必填' });
  }

  if (!safeEqual(username, ADMIN_USERNAME) || !safeEqual(password, ADMIN_PASSWORD)) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }

  const token = jwt.sign({ username, role: 'admin' }, JWT_SECRET, { expiresIn: '7d' });
  return res.json({ token, username });
});

app.get('/api/stats', requireAuth, asyncHandler(async (req, res) => {
  const rows = await readDbAsync('SELECT * FROM orders ORDER BY id DESC');
  const orders = rows.map((row) => normalizeOrder(row));
  const totalOrders = orders.length;
  const totalAmount = orders.reduce((sum, order) => sum + Number(order.amount || 0), 0);

  const summarizeBy = (fieldName) => {
    const map = new Map();

    for (const order of orders) {
      const key = order[fieldName] || '未知';
      if (!map.has(key)) {
        map.set(key, { name: key, count: 0, total: 0 });
      }

      const item = map.get(key);
      item.count += 1;
      item.total += Number(order.amount || 0);
    }

    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  };

  return res.json({
    totalOrders,
    totalAmount,
    byPlayer: summarizeBy('player_name'),
    byCustomer: summarizeBy('customer_name'),
    byPlayType: summarizeBy('play_type')
  });
}));

app.get('/api/orders', requireAuth, asyncHandler(async (req, res) => {
  const rows = await readDbAsync('SELECT * FROM orders ORDER BY id DESC');
  res.json(rows.map((row) => normalizeOrder(row)));
}));

app.post('/api/orders', requireAuth, asyncHandler(async (req, res) => {
  const { playerName, customerName, amount, playType, remark } = req.body || {};
  const numericAmount = Number(amount);

  if (!String(playerName || '').trim() || !String(customerName || '').trim() ||
      amount === '' || amount === null || amount === undefined ||
      !Number.isFinite(numericAmount) || numericAmount < 0 || !String(playType || '').trim()) {
    return res.status(400).json({ error: '打手名、客户名、金额、玩法都必须填写' });
  }

  const now = new Date().toLocaleString('zh-CN');
  const insertSql = resolveDatabaseMode() === 'postgres'
    ? 'INSERT INTO orders (player_name, customer_name, amount, play_type, remark, created_at) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id'
    : 'INSERT INTO orders (player_name, customer_name, amount, play_type, remark, created_at) VALUES (?, ?, ?, ?, ?, ?)';

  const result = await runDbAsync(insertSql, [
    String(playerName).trim(),
    String(customerName).trim(),
    numericAmount,
    String(playType).trim(),
    String(remark || '').trim(),
    now
  ]);

  const inserted = normalizeOrder({
    id: result.id,
    player_name: String(playerName).trim(),
    customer_name: String(customerName).trim(),
    amount: numericAmount,
    play_type: String(playType).trim(),
    remark: String(remark || '').trim(),
    created_at: now
  });

  return res.status(201).json(inserted);
}));

app.put('/api/orders/:id', requireAuth, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { playerName, customerName, amount, playType, remark } = req.body || {};
  const numericAmount = Number(amount);

  if (!String(playerName || '').trim() || !String(customerName || '').trim() ||
      amount === '' || amount === null || amount === undefined ||
      !Number.isFinite(numericAmount) || numericAmount < 0 || !String(playType || '').trim()) {
    return res.status(400).json({ error: '打手名、客户名、金额、玩法都必须填写' });
  }

  if (!/^\d+$/.test(id)) return res.status(400).json({ error: '订单编号无效' });

  const findSql = resolveDatabaseMode() === 'postgres'
    ? 'SELECT * FROM orders WHERE id = $1'
    : 'SELECT * FROM orders WHERE id = ?';
  const existing = await readDbAsync(findSql, [Number(id)]);
  if (!existing.length) {
    return res.status(404).json({ error: '订单不存在' });
  }

  const updateSql = resolveDatabaseMode() === 'postgres'
    ? 'UPDATE orders SET player_name = $1, customer_name = $2, amount = $3, play_type = $4, remark = $5 WHERE id = $6'
    : 'UPDATE orders SET player_name = ?, customer_name = ?, amount = ?, play_type = ?, remark = ? WHERE id = ?';

  await runDbAsync(updateSql, [
    String(playerName).trim(),
    String(customerName).trim(),
    numericAmount,
    String(playType).trim(),
    String(remark || '').trim(),
    Number(id)
  ]);

  return res.json({ success: true });
}));

app.delete('/api/orders/:id', requireAuth, asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!/^\d+$/.test(id)) return res.status(400).json({ error: '订单编号无效' });

  const deleteSql = resolveDatabaseMode() === 'postgres'
    ? 'DELETE FROM orders WHERE id = $1'
    : 'DELETE FROM orders WHERE id = ?';

  const result = await runDbAsync(deleteSql, [Number(id)]);
  if (!result.changes) return res.status(404).json({ error: '订单不存在' });
  return res.json({ success: true });
}));

app.get('/api/config', requireAuth, asyncHandler(async (req, res) => {
  const rows = await readDbAsync('SELECT player_name, play_type FROM orders');
  const config = deriveConfigFromOrders(rows);
  return res.json(normalizeConfig(config));
}));

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API not found' });
  }

  return res.status(404).send('Not found');
});

app.use((error, req, res, next) => {
  console.error('Request failed:', error.message);
  if (res.headersSent) return next(error);
  return res.status(500).json({ error: '服务器暂时无法处理请求，请稍后重试' });
});

async function startServer(port = PORT) {
  validateStartupConfiguration();
  await initializeDatabase();
  return new Promise((resolve) => {
    const server = app.listen(port, () => {
      console.log(`在线后台已启动：http://localhost:${port}`);
      resolve(server);
    });
  });
}

if (require.main === module) {
  startServer(PORT).catch((error) => {
    console.error('Server startup failed:', error.message);
    process.exit(1);
  });
}

module.exports = {
  app,
  startServer,
  initializeDatabase,
  readDbAsync,
  runDbAsync,
  resolveDatabaseMode,
  normalizeOrder,
  normalizeStats,
  normalizeConfig,
  getDefaultData,
  validateStartupConfiguration,
  DEFAULT_PLAY_TYPES,
  ADMIN_USERNAME,
  ADMIN_PASSWORD,
  PORT,
  DATABASE_URL
};
