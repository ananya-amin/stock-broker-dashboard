// frontend/src/Dashboard.tsx
import { useEffect, useState } from 'react';
import { socket } from './api';
import OrderBook from './OrderBook';
import TradeHistory from './TradeHistory';
import Charts from './Charts';

const SYMBOLS = ['GOOG', 'TSLA', 'AMZN', 'META', 'NVDA'];

type PriceMap = {
  [key: string]: {
    price: number;
    updatedAt: number;
  };
};

export default function Dashboard({ email }: { email: string }) {
  const [prices, setPrices] = useState<PriceMap>({});
  const [selected, setSelected] = useState<string>('GOOG');

  useEffect(() => {
    function onInit(data: PriceMap) {
      setPrices(data || {});
    }

    function onUpdate(data: PriceMap) {
      setPrices(prev => ({ ...prev, ...data }));
    }

    socket.on('prices:init', onInit);
    socket.on('prices:update', onUpdate);

    return () => {
      socket.off('prices:init', onInit);
      socket.off('prices:update', onUpdate);
    };
  }, []);

  // ✅ SAFETY: wait until prices load
  if (!prices || Object.keys(prices).length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-400">
        Loading market data...
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4">
      {/* LEFT: Market Prices */}
      <div className="bg-slate-900 p-4 rounded-lg">
        <h2 className="font-semibold mb-3">Market</h2>

        <div className="space-y-2">
          {SYMBOLS.map((symbol) => {
            const p = prices[symbol];

            // ✅ another safety guard
            if (!p) return null;

            return (
              <button
                key={symbol}
                onClick={() => setSelected(symbol)}
                className={`w-full flex justify-between p-2 rounded
                  ${selected === symbol ? 'bg-slate-700' : 'bg-slate-800'}
                `}
              >
                <span>{symbol}</span>
                <span>${p.price.toFixed(2)}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* MIDDLE */}
      <OrderBook symbol={selected} email={email} />

      {/* RIGHT */}
      <div className="space-y-4">
        <Charts symbol={selected} />
        <TradeHistory symbol={selected} />
      </div>
    </div>
  );
}
