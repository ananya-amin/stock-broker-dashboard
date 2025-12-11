// frontend/src/components/TradeHistory.tsx

import React, { useEffect, useState } from 'react';
import { fetchTrades } from '../api';
import { socket } from '../api';

type Trade = {
  id: number;
  symbol: string;
  price: number;
  quantity: number;
  traded_at: number;
};

export default function TradeHistory({ symbol }: { symbol?: string }) {
  const [trades, setTrades] = useState<Trade[]>([]);

  async function load() {
    try {
      const res = await fetchTrades(symbol);
      setTrades(res?.trades ?? []);
    } catch {
      setTrades([]);
    }
  }

  useEffect(() => {
    load();

    function onTrade(trade: Trade) {
      if (!symbol || trade.symbol === symbol) {
        setTrades((prev) => [trade, ...prev].slice(0, 200));
      }
    }

    socket.on('trades:update', onTrade);
    return () => {
      socket.off('trades:update', onTrade);
    };
  }, [symbol]);

  return (
    <div className="bg-slate-900 p-4 rounded-lg">
      <h3 className="font-semibold mb-2">
        Trade History {symbol ? `— ${symbol}` : ''}
      </h3>

      <div className="space-y-2 max-h-72 overflow-auto">
        {trades.map((t) => (
          <div
            key={t.id}
            className="p-2 bg-slate-800 rounded flex justify-between text-sm"
          >
            <div>
              {t.symbol} • {t.quantity} @ ${t.price.toFixed(2)}
            </div>
            <div className="text-slate-400">
              {new Date(t.traded_at).toLocaleString()}
            </div>
          </div>
        ))}

        {trades.length === 0 && (
          <div className="text-slate-500">No trades yet</div>
        )}
      </div>
    </div>
  );
}
