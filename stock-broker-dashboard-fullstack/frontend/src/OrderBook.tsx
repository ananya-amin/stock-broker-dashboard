import React, { useEffect, useState } from 'react';
import { placeOrderREST, fetchOrderBook } from './api';
import { socket } from './api';

export default function OrderBook({ email, symbol }: { email: string; symbol: string }) {
  const [orderbook, setOrderbook] = useState<any[]>([]);
  const [qty, setQty] = useState<number>(1);
  const [side, setSide] = useState<'buy'|'sell'>('buy');
  const [price, setPrice] = useState<number | ''>('');

  async function refresh() {
    const res = await fetchOrderBook(symbol);
    setOrderbook(res.orderbook || []);
  }

  useEffect(() => {
    refresh();
    socket.on('orders:update', (payload: any) => {
      if (!payload || payload.symbol !== symbol) return;
      refresh();
    });
    return () => { socket.off('orders:update'); };
  }, [symbol]);

  async function place(type: 'market'|'limit') {
    const payload: any = { email, symbol, side, quantity: qty, type };
    if (type === 'limit') payload.price = Number(price);
    const data = await placeOrderREST(payload);
    alert('Order response: ' + JSON.stringify(data));
    refresh();
  }

  return (
    <div className="bg-slate-900 p-4 rounded-lg">
      <h3 className="font-semibold mb-2">Order Book — {symbol}</h3>
      <div className="flex gap-2 mb-3">
        <input type="number" className="w-20 p-2 rounded bg-slate-800" value={qty} onChange={e=>setQty(Number(e.target.value))} />
        <select className="p-2 rounded bg-slate-800" value={side} onChange={e=>setSide(e.target.value as any)}>
          <option value="buy">Buy</option>
          <option value="sell">Sell</option>
        </select>
        <input type="number" placeholder="limit price" className="w-28 p-2 rounded bg-slate-800" value={price} onChange={e=>setPrice(e.target.value === '' ? '' : Number(e.target.value))} />
        <button onClick={() => place('market')} className="bg-emerald-600 px-3 rounded">Market</button>
        <button onClick={() => place('limit')} className="bg-amber-600 px-3 rounded">Limit</button>
      </div>

      <div className="text-sm text-slate-400 mb-2">Open orders (oldest first)</div>
      <div className="space-y-2 max-h-48 overflow-auto">
        {orderbook.map(o=>(
          <div key={o.id} className="p-2 bg-slate-800 rounded flex justify-between text-sm">
            <div>{o.side.toUpperCase()} {Number(o.quantity).toFixed(2)} @ {o.price == null ? 'MKT' : Number(o.price).toFixed(2)}</div>
            <div className="text-slate-400">{new Date(o.created_at).toLocaleTimeString()}</div>
          </div>
        ))}
        {orderbook.length===0 && <div className="text-slate-500">No open orders</div>}
      </div>
    </div>
  );
}
