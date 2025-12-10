# Stock-broker-dashboard-fullstack

This full-stack project includes:
- Backend: Node.js + TypeScript + Express + Socket.IO + SQLite (persistent subscriptions)
- Frontend: Vite + React + TypeScript + Socket.IO client
- Dockerfiles and docker-compose to run both services easily.

Run locally (without Docker):
- Start backend:
  cd backend
  npm install
  npm run build
  npm start
- Start frontend:
  cd frontend
  npm install
  npm run dev
  Open http://localhost:5173

Run with Docker:
- docker-compose up --build
- Frontend: http://localhost:8080
- Backend API: http://localhost:4000

Notes:
- The backend stores users & subscriptions in SQLite at ./backend/data/db.sqlite (persisted via a volume in docker-compose).
- Socket.IO is used to deliver price updates every second.
