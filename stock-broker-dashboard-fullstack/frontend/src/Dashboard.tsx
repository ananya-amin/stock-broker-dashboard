import React, { useEffect, useState } from 'react';
import { socket, connect } from './api';

const SUPPORTED = ['GOOG','TSLA','AMZN','META','NVDA'] as const;
type Sym = typeof SUPPORTED[number];
type Price = { price: number; updatedAt: number };

export default function Dashboard({ email, onLogout }: { email: string; onLogout: ()=>void }){
  const [prices, setPrices] = useState<Record<Sym, Price | undefined>>({} as any);
  const [subs, setSubs] = useState<string[]>([]);

  useEffect(()=>{
    connect(email);
    socket.on('prices:init', (payload)=> setPrices(payload.prices));
    socket.on('prices:update', (payload)=> setPrices(payload));
    socket.on('subscriptions:init', (list:string[])=> setSubs(list));
    socket.on('subscriptions:update', (list:string[])=> setSubs(list));
    return () => { socket.off('prices:init'); socket.off('prices:update'); socket.off('subscriptions:init'); socket.off('subscriptions:update'); };
  }, [email]);

  function toggleSub(symbol: Sym){
    if (subs.includes(symbol)) {
      socket.emit('unsubscribe', { symbol });
      setSubs(prev => prev.filter(s=>s!==symbol));
    } else {
      socket.emit('subscribe', { symbol });
      setSubs(prev => [...prev, symbol]);
    }
  }

  return (
    <div className="dashboard">
      <header>
        <h1>Stock Dashboard</h1>
        <div>
          <span>{email}</span>
          <button onClick={onLogout}>Logout</button>
        </div>
      </header>

      <section className="stocks">
        <h2>Supported Stocks</h2>
        <div className="grid">
          {SUPPORTED.map(sym => {
            const p = prices[sym]?.price ?? '—';
            const updated = prices[sym]?.updatedAt ? new Date(prices[sym]!.updatedAt).toLocaleTimeString() : '';
            const isSub = subs.includes(sym);
            return (
              <div className={`card ${isSub? 'subbed':''}`} key={sym}>
                <div className="row">
                  <strong>{sym}</strong>
                  <button onClick={()=>toggleSub(sym)}>{isSub? 'Unsubscribe': 'Subscribe'}</button>
                </div>
                <div className="price">{p}</div>
                <div className="small">{updated}</div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="my-subs">
        <h2>My Subscriptions</h2>
        {subs.length === 0 ? <p>No subscriptions yet.</p> : (
          <ul>{subs.map(s => <li key={s}>{s} — {prices[s as Sym]?.price ?? '—'}</li>)}</ul>
        )}
      </section>
    </div>
  );
}
