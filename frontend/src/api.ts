// frontend/src/api.ts
import { io, Socket } from 'socket.io-client';

const SERVER = import.meta.env.VITE_SERVER_URL || 'http://localhost:4000';
export const socket: Socket = io(SERVER, { autoConnect: false });

export function connect(email: string) {
  if (!socket.connected) socket.connect();
  socket.emit('client:join', { email });
}

export async function placeOrderREST(payload: { email: string; symbol: string; side: 'buy'|'sell'; quantity: number; type: 'market'|'limit'; price?: number }) {
  const res = await fetch(`${SERVER}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return res.json();
}

export async function fetchOrderBook(symbol: string) {
  const res = await fetch(`${SERVER}/orderbook?symbol=${encodeURIComponent(symbol)}`);
  return res.json();
}

export async function fetchTrades(symbol?: string) {
  const url = symbol ? `${SERVER}/trades?symbol=${encodeURIComponent(symbol)}` : `${SERVER}/trades`;
  const res = await fetch(url);
  return res.json();
}

export async function fetchAdminUsers(adminKey: string) {
  const res = await fetch(`${SERVER}/admin/users`, { headers: { 'x-admin-key': adminKey } });
  return res.json();
}

export async function fetchAdminSubscriptions(adminKey: string) {
  const res = await fetch(`${SERVER}/admin/subscriptions`, { headers: { 'x-admin-key': adminKey } });
  return res.json();
}

export function downloadTradesCSV(adminKey: string, symbol?: string) {
  const url = `${SERVER}/admin/trades.csv${symbol ? '?symbol=' + encodeURIComponent(symbol) : ''}`;
  const headers: any = {};
  if (adminKey) headers['x-admin-key'] = adminKey;
  // open in new tab so browser downloads the CSV
  const w = window.open('', '_blank');
  fetch(url, { headers })
    .then(r => r.blob())
    .then(blob => {
      const u = URL.createObjectURL(blob);
      if (w) {
        w.location.href = u;
      } else {
        // fallback: create link
        const a = document.createElement('a');
        a.href = u;
        a.download = `trades${symbol ? '-' + symbol : ''}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
    }).catch(err => alert('Download failed: ' + err));
}
