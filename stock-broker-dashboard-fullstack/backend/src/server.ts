// backend/src/server.ts
import express from 'express';
import http from 'http';
import { Server as IOServer } from 'socket.io';
import cors from 'cors';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Load admin key from env (set via docker-compose or env). If empty, admin endpoints require no key (dev).
const ADMIN_KEY = process.env.ADMIN_KEY || '';

const SUPPORTED = ['GOOG','TSLA','AMZN','META','NVDA'] as const;
type SymbolT = typeof SUPPORTED[number];

type Price = { price: number; updatedAt: number };

// DB path & ensure dir
const dbPath = process.env.DB_PATH || path.join(__dirname, '..', '..', 'data', 'db.sqlite');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// Create schema
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
    symbol TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id)
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

// In-memory prices
const prices: Record<SymbolT, Price> = {
  GOOG: { price: 2800, updatedAt: Date.now() },
  TSLA: { price: 700, updatedAt: Date.now() },
  AMZN: { price: 3300, updatedAt: Date.now() },
  META: { price: 330, updatedAt: Date.now() },
  NVDA: { price: 400, updatedAt: Date.now() }
};

// --- Express + Socket.IO
const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new IOServer(server, { cors: { origin: '*', methods: ['GET','POST'] } });

// Helpers
function ensureUser(email: string, isAdmin = false): number {
  const row = db.prepare('SELECT id FROM users WHERE email = ?').get(email) as { id: number } | undefined;
  if (row) return row.id;
  const res = db.prepare('INSERT INTO users (email, is_admin) VALUES (?, ?)').run(email, isAdmin ? 1 : 0);
  return Number(res.lastInsertRowid);
}

function setSubscription(userId: number, symbol: string) {
  const exists = db.prepare('SELECT id FROM subscriptions WHERE user_id = ? AND symbol = ?').get(userId, symbol);
  if (exists) return;
  db.prepare('INSERT INTO subscriptions (user_id, symbol) VALUES (?, ?)').run(userId, symbol);
}

function removeSubscription(userId: number, symbol: string) {
  db.prepare('DELETE FROM subscriptions WHERE user_id = ? AND symbol = ?').run(userId, symbol);
}

function getUserSubscriptions(userId: number): string[] {
  const rows = db.prepare('SELECT symbol FROM subscriptions WHERE user_id = ?').all(userId) as { symbol: string }[];
  return rows.map(r => r.symbol);
}

// Orders & matching engine
type OrderRow = {
  id: number;
  user_id: number;
  symbol: string;
  side: 'buy'|'sell';
  quantity: number;
  price?: number | null;
  status: string;
  created_at: number;
};

// create order (open)
function createOrder(userId: number, symbol: string, side: 'buy'|'sell', quantity: number, price?: number | null): number {
  const now = Date.now();
  const info = db.prepare(`
    INSERT INTO orders (user_id, symbol, side, quantity, price, status, created_at)
    VALUES (?, ?, ?, ?, ?, 'open', ?)
  `).run(userId, symbol, side, quantity, price ?? null, now);
  const id = Number(info.lastInsertRowid);
  // broadcast orders update
  io.emit('orders:update', { symbol, orderId: id });
  io.to(`stock:${symbol}`).emit('orders:update', { symbol, orderId: id });
  return id;
}

// mark filled and create trade
function recordTrade(buyOrderId: number | null, sellOrderId: number | null, symbol: string, price: number, quantity: number) {
  const now = Date.now();
  const info = db.prepare(`
    INSERT INTO trades (buy_order_id, sell_order_id, symbol, price, quantity, traded_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(buyOrderId, sellOrderId, symbol, price, quantity, now);
  const trade = {
    id: Number(info.lastInsertRowid),
    buy_order_id: buyOrderId,
    sell_order_id: sellOrderId,
    symbol,
    price,
    quantity,
    traded_at: now
  };
  // emit
  io.emit('trades:update', trade);
  io.to(`stock:${symbol}`).emit('trades:update', trade);
  return trade;
}

// Simple orderbook retrieval
function getOrderBook(symbol: string) {
  return db.prepare('SELECT * FROM orders WHERE symbol = ? AND status = ? ORDER BY created_at ASC').all(symbol, 'open');
}

// Matching engine: match limit orders against opposite side open orders (FIFO) at price constraints
function attemptMatchLimitOrder(orderId: number) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as OrderRow;
  if (!order || order.status !== 'open') return;

  const symbol = order.symbol;
  const side = order.side;
  const qtyRemaining = order.quantity;

  // Opposite side
  const oppositeSide = side === 'buy' ? 'sell' : 'buy';

  // Fetch potential matches: open orders on opposite side that satisfy price
  // For buy order, want lowest priced sells with price <= buy.price
  // For sell order, want highest priced buys with price >= sell.price
  // If one side or both are market orders (price is null), treat accordingly
  const candidates = db.prepare('SELECT * FROM orders WHERE symbol = ? AND side = ? AND status = ? ORDER BY created_at ASC').all(symbol, oppositeSide, 'open') as OrderRow[];

  let remaining = qtyRemaining;
  for (const cand of candidates) {
    if (remaining <= 0) break;

    const candPrice = cand.price;
    const orderPrice = order.price;

    // Price check: if both have prices enforce crossing, if one is market allow, otherwise do not match
    let priceToUse: number | null = null;
    if (orderPrice == null && candPrice == null) {
      // both market -> use current market price
      priceToUse = prices[symbol as SymbolT].price;
    } else if (orderPrice == null) {
      priceToUse = candPrice ?? prices[symbol as SymbolT].price;
    } else if (candPrice == null) {
      priceToUse = orderPrice;
    } else {
      // both limit orders — ensure they cross
      if (side === 'buy') {
        // buy.price >= sell.price
        if ((orderPrice as number) < (candPrice as number)) continue;
        priceToUse = candPrice!;
      } else {
        // sell.price <= buy.price
        if ((orderPrice as number) > (candPrice as number)) continue;
        priceToUse = candPrice!;
      }
    }

    // execute quantity = min(remaining, cand.quantity)
    const execQty = Math.min(remaining, cand.quantity);
    // create trade (mark cand and maybe mark remaining accordingly)
    // reduce cand.quantity or mark filled
    if (execQty >= cand.quantity - 1e-9) {
      // fill candidate
      db.prepare('UPDATE orders SET status = ? WHERE id = ?').run('filled', cand.id);
    } else {
      // partially fill candidate -> reduce qty
      db.prepare('UPDATE orders SET quantity = ? WHERE id = ?').run(cand.quantity - execQty, cand.id);
    }

    remaining -= execQty;

    // if order fully filled, mark
    if (remaining <= 1e-9) {
      db.prepare('UPDATE orders SET status = ? WHERE id = ?').run('filled', order.id);
    } else {
      // reduce the incoming order quantity
      db.prepare('UPDATE orders SET quantity = ? WHERE id = ?').run(remaining, order.id);
    }

    // record trade
    const buyId = side === 'buy' ? order.id : cand.id;
    const sellId = side === 'sell' ? order.id : cand.id;
    recordTrade(buyId, sellId, symbol, priceToUse ?? prices[symbol as SymbolT].price, execQty);
  }

  // if nothing matched, leave order open
  return;
}

// Market order execution: execute at current price, create trade, mark order filled
function executeMarketOrder(userId: number, symbol: string, side: 'buy'|'sell', quantity: number) {
  const current = prices[symbol as SymbolT].price;
  const id = createOrder(userId, symbol, side, quantity, null);
  // immediately fill
  db.prepare('UPDATE orders SET status = ? WHERE id = ?').run('filled', id);
  const trade = recordTrade(side === 'buy' ? id : null, side === 'sell' ? id : null, symbol, current, quantity);
  return { orderId: id, trade };
}

// --- REST endpoints

app.get('/supported', (_req, res) => res.json({ supported: SUPPORTED }));

app.get('/me/subscriptions', (req, res) => {
  const email = String(req.query.email || '');
  if (!email) return res.status(400).json({ error: 'email required' });
  const u = db.prepare('SELECT id FROM users WHERE email = ?').get(email) as { id: number } | undefined;
  if (!u) return res.json({ subscriptions: [] });
  res.json({ subscriptions: getUserSubscriptions(u.id) });
});

// place order (REST)
app.post('/orders', (req, res) => {
  const { email, symbol, side, quantity, type, price } = req.body;
  if (!email || !symbol || !side || !quantity) return res.status(400).json({ error: 'missing fields' });
  if (!SUPPORTED.includes(symbol)) return res.status(400).json({ error: 'unsupported symbol' });
  const userId = ensureUser(email);
  if (type === 'market') {
    const result = executeMarketOrder(userId, symbol, side, Number(quantity));
    return res.json({ orderId: result.orderId, trade: result.trade });
  } else {
    const id = createOrder(userId, symbol, side, Number(quantity), Number(price ?? null));
    // attempt match immediately (limit matching)
    attemptMatchLimitOrder(id);
    return res.json({ orderId: id, status: 'open' });
  }
});

app.get('/orderbook', (req, res) => {
  const symbol = String(req.query.symbol || '');
  if (!symbol) return res.status(400).json({ error: 'symbol required' });
  res.json({ orderbook: getOrderBook(symbol) });
});

app.get('/trades', (req, res) => {
  const symbol = String(req.query.symbol || '') || undefined;
  if (symbol) {
    const rows = db.prepare('SELECT * FROM trades WHERE symbol = ? ORDER BY traded_at DESC LIMIT 200').all(symbol);
    return res.json({ trades: rows });
  }
  const rows = db.prepare('SELECT * FROM trades ORDER BY traded_at DESC LIMIT 200').all();
  res.json({ trades: rows });
});

// Admin endpoints — simple API key via header 'x-admin-key' (or env ADMIN_KEY disabled in dev)
function requireAdminKey(req: express.Request, res: express.Response): boolean {
  if (!ADMIN_KEY) return true; // if not set, allow for dev
  const key = (req.headers['x-admin-key'] || '') as string;
  if (key === ADMIN_KEY) return true;
  res.status(401).json({ error: 'unauthorized' });
  return false;
}

app.get('/admin/users', (req, res) => {
  if (!requireAdminKey(req, res)) return;
  const rows = db.prepare('SELECT id, email, is_admin FROM users ORDER BY id DESC').all();
  res.json({ users: rows });
});

app.get('/admin/subscriptions', (req, res) => {
  if (!requireAdminKey(req, res)) return;
  const rows = db.prepare('SELECT u.email, s.symbol FROM subscriptions s JOIN users u ON u.id = s.user_id ORDER BY u.email').all();
  res.json({ subscriptions: rows });
});

// CSV export of trades
app.get('/admin/trades.csv', (req, res) => {
  if (!requireAdminKey(req, res)) return;
  const symbol = String(req.query.symbol || '');
  const rows = symbol ? db.prepare('SELECT * FROM trades WHERE symbol = ? ORDER BY traded_at DESC').all(symbol) : db.prepare('SELECT * FROM trades ORDER BY traded_at DESC').all();
  // build CSV
  const header = ['id','buy_order_id','sell_order_id','symbol','price','quantity','traded_at'];
  const lines = rows.map((r:any) => header.map(h => (r[h] == null ? '' : String(r[h]))).join(','));
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="trades${symbol?('-'+symbol):''}.csv"`);
  res.send([header.join(','), ...lines].join('\n'));
});

// Socket.IO
io.on('connection', (socket) => {
  console.log('client connected', socket.id);

  socket.on('client:join', ({ email }: { email: string }) => {
    if (!email) return;
    const userId = ensureUser(email);
    (socket as any).userId = userId;

    socket.emit('prices:init', { supported: SUPPORTED, prices });
    socket.emit('subscriptions:init', getUserSubscriptions(userId));
    socket.emit('trades:init', db.prepare('SELECT * FROM trades ORDER BY traded_at DESC LIMIT 100').all());
    console.log(`user ${email} joined with id ${userId}`);
  });

  socket.on('subscribe', ({ symbol }: { symbol: string }) => {
    const userId = (socket as any).userId;
    if (!userId) return;
    if (!SUPPORTED.includes(symbol as SymbolT)) return;
    setSubscription(userId, symbol);
    socket.join(`stock:${symbol}`);
    socket.emit('subscriptions:update', getUserSubscriptions(userId));
  });

  socket.on('unsubscribe', ({ symbol }: { symbol: string }) => {
    const userId = (socket as any).userId;
    if (!userId) return;
    removeSubscription(userId, symbol);
    socket.leave(`stock:${symbol}`);
    socket.emit('subscriptions:update', getUserSubscriptions(userId));
  });

  socket.on('place:order', ({ email, symbol, side, quantity, type, price }) => {
    const userId = ensureUser(email);
    if (type === 'market') {
      const result = executeMarketOrder(userId, symbol, side, Number(quantity));
      socket.emit('order:placed', { orderId: result.orderId, trade: result.trade });
    } else {
      const id = createOrder(userId, symbol, side, Number(quantity), Number(price ?? null));
      attemptMatchLimitOrder(id); // try to match immediately
      socket.emit('order:placed', { orderId: id, status: 'open' });
    }
  });

  socket.on('disconnect', () => {
    console.log('client disconnected', socket.id);
  });
});

// Price tick generator
setInterval(() => {
  (SUPPORTED as readonly string[]).forEach(sym => {
    const drift = (Math.random() - 0.5) * (sym === 'NVDA' ? 20 : 10);
    const cur = prices[sym as SymbolT].price;
    const next = Math.max(0.01, Number((cur + drift).toFixed(2)));
    prices[sym as SymbolT] = { price: next, updatedAt: Date.now() };
  });
  io.emit('prices:update', prices);
}, 1000);

// Start
const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
server.listen(PORT, () => {
  console.log(`✅ Server listening on ${PORT}`);
});
