import React, { useEffect, useState } from 'react';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { socket } from './api';

type Point = { t: number; price: number };

export default function Charts({ symbol }: { symbol: string }) {
  const [data, setData] = useState<Point[]>([]);

  useEffect(() => {
    function onUpdate(payload: Record<string, any>) {
      const p = payload[symbol];
      if (!p) return;
      setData(prev => {
        const next = [...prev.slice(-199), { t: p.updatedAt, price: p.price }];
        return next;
      });
    }
    socket.on('prices:update', onUpdate);
    socket.on('prices:init', (payload: any) => {
      const p = payload.prices[symbol];
      if (p) setData([{ t: p.updatedAt, price: p.price }]);
    });
    return () => { socket.off('prices:update', onUpdate); };
  }, [symbol]);

  const chartData = data.map(d => ({ time: new Date(d.t).toLocaleTimeString(), value: d.price }));

  return (
    <div className="bg-slate-900 p-4 rounded-lg">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold">{symbol} (live)</h3>
        <div className="text-slate-400">{chartData.length ? chartData[chartData.length-1].value.toFixed(2) : '—'}</div>
      </div>
      <div style={{ width: '100%', height: 180 }}>
        <ResponsiveContainer>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id={`grad-${symbol}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#34d399" stopOpacity={0.8}/>
                <stop offset="95%" stopColor="#34d399" stopOpacity={0.05}/>
              </linearGradient>
            </defs>
            <XAxis dataKey="time" hide />
            <YAxis domain={['auto','auto']} hide />
            <Tooltip />
            <Area type="monotone" dataKey="value" stroke="#34d399" fillOpacity={1} fill={`url(#grad-${symbol})`} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
