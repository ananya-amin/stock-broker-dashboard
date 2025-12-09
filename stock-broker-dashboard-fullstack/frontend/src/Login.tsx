import React, { useState } from 'react';

export default function Login({ onLogin }: { onLogin: (email: string) => void }) {
  const [email, setEmail] = useState('');
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return alert('Enter email');
    localStorage.setItem('sb_user_email', email);
    onLogin(email);
  };
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white p-6">
      <div className="max-w-md w-full bg-slate-900 rounded-2xl p-8 shadow-lg">
        <h2 className="text-2xl font-bold mb-4">Welcome — Sign in</h2>
        <form onSubmit={submit} className="space-y-4">
          <input value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" className="w-full px-4 py-2 rounded bg-slate-800" />
          <button className="w-full py-2 rounded bg-emerald-600 font-semibold">Sign in</button>
        </form>
        <p className="text-slate-400 mt-4">Use any email — demo only.</p>
      </div>
    </div>
  );
}
