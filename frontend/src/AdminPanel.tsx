import React, { useEffect, useState } from 'react';
import { fetchAdminUsers, fetchAdminSubscriptions, downloadTradesCSV } from './api';

export default function AdminPanel() {
  const [adminKey, setAdminKey] = useState<string>('');
  const [users, setUsers] = useState<any[]>([]);
  const [subs, setSubs] = useState<any[]>([]);

  async function load() {
    if (!adminKey) return;
    const u = await fetchAdminUsers(adminKey);
    const s = await fetchAdminSubscriptions(adminKey);
    setUsers(u.users || []);
    setSubs(s.subscriptions || []);
  }

  useEffect(()=>{ if (adminKey) load(); }, [adminKey]);

  return (
    <div className="bg-slate-900 p-4 rounded-lg">
      <h3 className="font-semibold mb-3">Admin Panel</h3>
      <div className="mb-3">
        <input placeholder="Admin key (X-ADMIN-KEY)" value={adminKey} onChange={e=>setAdminKey(e.target.value)} className="w-full p-2 rounded bg-slate-800 mb-2" />
        <button onClick={load} className="bg-blue-600 px-3 py-1 rounded">Load Data</button>
        <button onClick={() => downloadTradesCSV(adminKey)} className="ml-2 bg-emerald-600 px-3 py-1 rounded">Download All Trades CSV</button>
      </div>

      <div className="mb-4">
        <h4 className="font-medium">Users</h4>
        <div className="text-sm max-h-36 overflow-auto mt-2">
          {users.map(u=> <div key={u.id} className="p-2 bg-slate-800 rounded mb-1">{u.email} {u.is_admin ? '(admin)' : ''}</div>)}
          {users.length===0 && <div className="text-slate-500">No users</div>}
        </div>
      </div>

      <div>
        <h4 className="font-medium">Subscriptions</h4>
        <div className="text-sm max-h-36 overflow-auto mt-2">
          {subs.map((s:any, i:number)=> <div key={i} className="p-2 bg-slate-800 rounded mb-1">{s.email} — {s.symbol}</div>)}
          {subs.length===0 && <div className="text-slate-500">No subscriptions</div>}
        </div>
      </div>
    </div>
  );
}
