import express, { Request, Response } from 'express';
import http from 'http';
import { Server as IOServer } from 'socket.io';
import cors from 'cors';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

/* =====================================================
   ENV CONFIG
===================================================== */

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
const ADMIN_KEY = process.env.ADMIN_KEY || '';
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || '*';

const SUPPORTED = ['GOOG', 'TSLA', 'AMZN', 'META', 'NVDA'] as const;
type SymbolT = typeof SUPPORTED[number];

/* =====================================================
   DATABASE SETUP
===================================================== */

const dbPath =
  process.env.DB_PATH || path.join(__dirname, '..', '..', 'data', 'db.sqlite');

// ensure db directory exists (Render-safe)
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

/* ---------- Schema ---------- */

db.prepare(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  is_admin INTEGER DEFAULT 0
)
`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  symbol TEXT NOT NULL
)
`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,
  quantity REAL NOT NULL,
  price REAL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL
)
`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  buy_order_id INTEGER,
  sell_order_id INTEGER,
  symbol TEXT NOT NULL,
  price REAL NOT NULL,
  quantity REAL NOT NULL,
  traded_at INTEGER NOT NULL
)
`).run();

/* =====================================================
   IN-MEMORY PRICES
===================================================== */

const prices: Record<SymbolT, { price: number; updatedAt: number }> = {
  GOOG: { price: 2800, updatedAt: Date.now() },
  TSLA: { price: 700, updatedAt: Date.now() },
  AMZN: { price: 3300, updatedAt: Date.now() },
  META: { price: 330, updatedAt: Date.now() },
  NVDA: { price: 400, updatedAt: Date.now() },
};

/* =====================================================
   SERVER SETUP
===================================================== */

const app = express();
app.use(express.json());
app.use(cors({ origin: FRONTEND_ORIGIN }));

const server = http.createServer(app);
const io = new IOServer(server, {
  cors: { origin: FRONTEND_ORIGIN },
});

/* =====================================================
   HELPERS
===================================================== */

function ensureUser(email: string, isAdmin = false): number {
  const row = db
    .prepare('SELECT id FROM users WHERE email = ?')
    .get(email) as { id: number } | undefined;

  if (row) return row.id;

  const result = db
    .prepare('INSERT INTO users (email, is_admin) VALUES (?, ?)')
    .run(email, isAdmin ? 1 : 0);

  return Number(result.lastInsertRowid);
}

function getSubscriptions(userId: number): string[] {
  return db
    .prepare('SELECT symbol FROM subscriptions WHERE user_id = ?')
    .all(userId)
    .map((r: any) => r.symbol);
}

/* =====================================================
   HEALTH CHECK (RENDER)
===================================================== */

app.get('/health', (_req: Request, res: Response) => {
  try {
    db.prepare('SELECT 1').get();
    res.json({ status: 'ok', time: Date.now() });
  } catch {
    res.status(500).json({ status: 'error' });
  }
});

/* =====================================================
   REST API
===================================================== */

app.get('/supported', (_req: Request, res: Response) => {
  res.json({ supported: SUPPORTED });
});

app.get('/me/subscriptions', (req: Request, res: Response) => {
  const email = String(req.query.email || '');
  if (!email) return res.json({ subscriptions: [] });

  const user = db
    .prepare('SELECT id FROM users WHERE email = ?')
    .get(email) as { id: number } | undefined;

  if (!user) return res.json({ subscriptions: [] });

  res.json({ subscriptions: getSubscriptions(user.id) });
});

/* =====================================================
   SOCKET.IO
===================================================== */

io.on('connection', (socket) => {
  console.log('🔌 Client connected:', socket.id);

  socket.on('client:join', ({ email }: { email: string }) => {
    const userId = ensureUser(email);
    (socket as any).userId = userId;

    socket.emit('prices:init', prices);
    socket.emit('subscriptions:init', getSubscriptions(userId));

    console.log(`✅ User joined: ${email}`);
  });

  socket.on('disconnect', () => {
    console.log('❌ Client disconnected:', socket.id);
  });
});

/* =====================================================
   PRICE SIMULATOR
===================================================== */

setInterval(() => {
  SUPPORTED.forEach((symbol) => {
    const drift = (Math.random() - 0.5) * 10;
    prices[symbol] = {
      price: Math.max(1, Number((prices[symbol].price + drift).toFixed(2))),
      updatedAt: Date.now(),
    };
  });

  io.emit('prices:update', prices);
}, 1000);

/* =====================================================
   GRACEFUL SHUTDOWN (RENDER SAFE)
===================================================== */

function shutdown(signal: string) {
  console.log(`⚠️ ${signal} received. Shutting down...`);
  server.close(() => {
    try {
      db.close();
    } catch {}
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

/* =====================================================
   START SERVER
===================================================== */

server.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`📦 DB Path: ${dbPath}`);
  console.log(`🌍 CORS Origin: ${FRONTEND_ORIGIN}`);
});
