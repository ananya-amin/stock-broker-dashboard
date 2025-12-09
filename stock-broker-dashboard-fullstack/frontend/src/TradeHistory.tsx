import React, { useEffect, useState } from 'react';
import { fetchTrades, downloadTradesCSV } from './api';
import { socket } from './api';

export default function TradeHistory({ symbol }: { symbol?: string }) {
  const [trades, setTrades] = useState<any[]>([]);
  const [adminKey, setAdminKey] = useState<string>('');

  async function load() {
    const res = await fetchTrades(symbol);
    setTrades(res.trades || []);
  }

  useEffect(() => {
    load();
    function onTrade(trade: any) {
      if (!symbol || trade.symbol === symbol) setTrades(prev => [trade, ...prev].slice(0, 200));
    }
    socket.on('trades:update', onTrade);
    return () => { socket.off('trades:update', onTrade); };
  }, [symbol]);

  function exportCSV() {
    // client-side CSV of current trades
    const header = ['id','symbol','price','quantity','traded_at'];
    const lines = trades.map(t => [t.id, t.symbol, t.price, t.quantity, new Date(t.traded_at).toLocaleString()].join(','));
    const csv = [header.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trades${symbol ? '-' + symbol : ''}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return (
    <div className="bg-slate-900 p-4 rounded-lg">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold">Trade History {symbol ? `— ${symbol}` : ''}</h3>
        <div className="flex gap-2">
          <button onClick={exportCSV} className="bg-slate-700 px-3 rounded text-sm">Export CSV</button>
        </div>
      </div>

      <div className="space-y-2 max-h-72 overflow-auto">
        {trades.map(t => (
          <div key={t.id} className="p-2 bg-slate-800 rounded flex justify-between text-sm">
            <div>{t.symbol} • {t.quantity} @ ${Number(t.price).toFixed(2)}</div>
            <div className="text-slate-400">{new Date(t.traded_at).toLocaleString()}</div>
          </div>
        ))}
        {trades.length === 0 && <div className="text-slate-500">No trades yet</div>}
      </div>
    </div>
  );
}
