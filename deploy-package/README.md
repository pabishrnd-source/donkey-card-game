# Card Duel Masters Deploy Package

This folder is a standalone deployment package. It can be uploaded directly to GitHub without the original monorepo.

## Structure

- `frontend/` - React + Vite app, ready for Vercel.
- `backend/` - Node.js + Express + WebSocket server, ready for Render.

## Local Run

Start the backend:

```bash
cd backend
npm install
copy .env.example .env
npm start
```

Start the frontend in another terminal:

```bash
cd frontend
npm install
copy .env.example .env
npm run dev
```

Open `http://localhost:5173`.

## Production Deployment

Deploy backend first so you know the Render URL. Then set frontend environment variables on Vercel.

Required frontend variables:

- `VITE_API_URL=https://your-render-service.onrender.com`
- `VITE_WS_URL=wss://your-render-service.onrender.com/ws`

Required backend variable:

- `CORS_ORIGIN=https://your-vercel-app.vercel.app`

