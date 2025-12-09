import React, { useEffect, useState } from 'react';
import Login from './Login';
import { socket, connect } from './api';
import Charts from './Charts';
import OrderBook from './OrderBook';
import TradeHistory from './TradeHistory';
import AdminPanel from './AdminPanel';

const SUPPORTED = ['GOOG','TSLA','AMZN','META','NVDA'] as const;
type Sym = typeof SUPPORTED[number];

export default function App() {
  const [email, setEmail] = useState<string | null>(() => localStorage.getItem('sb_user_email'));
  const [view, setView] = useState<'dashboard'|'charts'|'orders'|'trades'|'admin'>('dashboard');
  const [prices, setPrices] = useState<Record<Sym, any>>({} as any);
  const [subs, setSubs] = useState<string[]>([]);

  useEffect(()=>{
    if (!email) return;
    connect(email);
    socket.on('prices:init', (payload:any) => setPrices(payload.prices));
    socket.on('prices:update', (payload:any) => setPrices(payload));
    socket.on('subscriptions:init', (list:string[])=> setSubs(list));
    socket.on('subscriptions:update', (list:string[])=> setSubs(list));
    return () => { socket.off(); };
  }, [email]);

  if (!email) return <Login onLogin={setEmail!} />;

  return (
    <div className="min-h-screen bg-slate-950 text-white p-6">
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">📊 Stock Broker Dashboard</h1>
          <div className="text-slate-400">Live market subscriptions</div>
        </div>
        <div className="flex items-center gap-3">
          <nav className="flex gap-2">
            <button onClick={()=>setView('dashboard')} className={`px-3 py-1 rounded ${view==='dashboard'?'bg-slate-700':''}`}>Dashboard</button>
            <button onClick={()=>setView('charts')} className={`px-3 py-1 rounded ${view==='charts'?'bg-slate-700':''}`}>Charts</button>
            <button onClick={()=>setView('orders')} className={`px-3 py-1 rounded ${view==='orders'?'bg-slate-700':''}`}>Orders</button>
            <button onClick={()=>setView('trades')} className={`px-3 py-1 rounded ${view==='trades'?'bg-slate-700':''}`}>Trades</button>
            <button onClick={()=>setView('admin')} className={`px-3 py-1 rounded ${view==='admin'?'bg-slate-700':''}`}>Admin</button>
          </nav>
          <div className="text-sm text-slate-300">{email}</div>
          <button className="ml-2 text-sm text-red-400" onClick={()=>{ localStorage.removeItem('sb_user_email'); setEmail(null);} }>Logout</button>
        </div>
      </header>

      <main>
        {view === 'dashboard' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {SUPPORTED.map(sym => {
              const p = prices[sym]?.price ?? 0;
              const isSub = subs.includes(sym);
              return (
                <div key={sym} className="bg-slate-900 p-6 rounded-2xl shadow">
                  <div className="flex items-center justify-between">
                    <strong className="text-xl">{sym}</strong>
                    <div className="text-slate-400 text-sm">{isSub ? 'Subscribed' : 'Not subscribed'}</div>
                  </div>
                  <div className="text-3xl font-bold mt-4">${Number(p).toFixed(2)}</div>
                  <div className="mt-6">
                    <button onClick={() => { socket.emit(isSub ? 'unsubscribe' : 'subscribe', { symbol: sym }); }}
                      className={`w-full py-2 rounded ${isSub ? 'bg-red-600' : 'bg-emerald-600'}`}>
                      {isSub ? 'Unsubscribe' : 'Subscribe'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {view === 'charts' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {SUPPORTED.map(sym => <Charts key={sym} symbol={sym} />)}
          </div>
        )}

        {view === 'orders' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {SUPPORTED.map(sym => (
              <OrderBook key={sym} email={email!} symbol={sym} />
            ))}
          </div>
        )}

        {view === 'trades' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TradeHistory />
            <TradeHistory symbol="GOOG" />
          </div>
        )}

        {view === 'admin' && <AdminPanel />}
      </main>
    </div>
  );
}
