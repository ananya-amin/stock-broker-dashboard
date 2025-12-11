// frontend/src/api.ts
import { io, Socket } from 'socket.io-client';

// ✅ ALWAYS point frontend to deployed backend in production
const SERVER =
  import.meta.env.VITE_SERVER_URL ||
  'https://stock-broker-dashboard-lm5e.onrender.com';

// ✅ Create socket but DO NOT auto-connect
export const socket: Socket = io(SERVER, {
  autoConnect: false,
  transports: ['websocket'], // ✅ required for Render
});

// ✅ Call this after user logs in
export function connect(email: string) {
  // connect safely
  if (!socket.connected) {
    socket.connect();
  }

  // join backend room
  socket.emit('client:join', { email });
}
