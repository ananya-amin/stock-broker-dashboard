// frontend/src/api.ts
import { io, Socket } from 'socket.io-client';

const SERVER =
  import.meta.env.VITE_SERVER_URL || 'http://localhost:4000';

/* ================= SOCKET ================= */

export const socket: Socket = io(SERVER, {
  autoConnect: false,
});

/* ================= AUTH / CONNECT ================= */

export function connect(email: string) {
  if (!socket.connected) socket.connect();
  socket.emit('client:join', { email });
}

/* ================= ORDERS ================= */

export async function placeOrderREST(payload: {
  email: string;
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  type: 'market' | 'limit';
  price?: number;
}) {
  const res = await fetch(`${SERVER}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error('Failed to place order');
  }

  return res.json();
}

/* ================= ORDER BOOK ================= */

export async function fetchOrderBook(symbol: string) {
  const res = await fetch(
    `${SERVER}/orderbook?symbol=${encodeURIComponent(symbol)}`
  );

  if (!res.ok) {
    throw new Error('Failed to fetch order book');
  }

  return res.json();
}

/* ================= TRADES ================= */

export async function fetchTrades(symbol?: string) {
  const url = symbol
    ? `${SERVER}/trades?symbol=${encodeURIComponent(symbol)}`
    : `${SERVER}/trades`;

  const res = await fetch(url);

  if (!res.ok) {
    throw new Error('Failed to fetch trades');
  }

  return res.json();
}

/* ================= ADMIN ================= */

export async function fetchAdminUsers(adminKey: string) {
  const res = await fetch(`${SERVER}/admin/users`, {
    headers: { 'x-admin-key': adminKey },
  });

  if (!res.ok) {
    throw new Error('Failed to fetch users');
  }

  return res.json();
}

export async function fetchAdminSubscriptions(adminKey: string) {
  const res = await fetch(`${SERVER}/admin/subscriptions`, {
    headers: { 'x-admin-key': adminKey },
  });

  if (!res.ok) {
    throw new Error('Failed to fetch subscriptions');
  }

  return res.json();
}

/* ================= CSV DOWNLOAD ================= */

export function downloadTradesCSV(adminKey: string, symbol?: string) {
  const url = `${SERVER}/admin/trades.csv${
    symbol ? `?symbol=${encodeURIComponent(symbol)}` : ''
  }`;

  const headers: Record<string, string> = {};
  if (adminKey) headers['x-admin-key'] = adminKey;

  fetch(url, { headers })
    .then((res) => {
      if (!res.ok) throw new Error('Download failed');
      return res.blob();
    })
    .then((blob) => {
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `trades${symbol ? '-' + symbol : ''}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
    })
    .catch((err) => alert(err.message));
}
