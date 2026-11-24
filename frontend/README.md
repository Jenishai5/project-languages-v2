# TurtleTalk frontend

React + TypeScript + Vite + Tailwind. This is the original TurtleTalk app from
[project-languages](https://github.com/Jenishai5/project-languages), now connected to the FastAPI backend in this repo.

## Run it

The backend must be running first (`make api` in the repo root, port 8000).

```bash
cp .env.example .env
npm install
npm run dev
```

Open http://localhost:5173.

## How it talks to the backend

The app calls `/api/...`. Vite's dev server forwards those calls to FastAPI and drops the `/api` prefix
(see `vite.config.ts`):

| Frontend calls | FastAPI receives |
|---|---|
| `/api/game/sentences` | `/game/sentences` |
| `/api/game/wordmatch?language=en-es` | `/game/wordmatch?language=en-es` |
| `/api/progress/sentence` | `/progress/sentence` |

Login still uses Supabase Auth in the browser. The backend checks the Supabase token before saving progress.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Development server with hot reload |
| `npm run build` | Type-check and build for production |
| `npm test` | Run the tests (Vitest) |
