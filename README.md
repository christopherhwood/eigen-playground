# Eigen Sandbox

An interactive playground that lets you **see** how a 2 × 2 matrix transforms the plane –
with a friendly AI narrator that explains what is happening in real‑time.

Move four sliders (a, b, c, d) to tweak the matrix `[[a, b],[c, d]]`; vectors, eigen‑vectors and
test arrows update instantly in the canvas while the OpenAI‑powered narrator describes
determinant flips, collapses, eigenvalues and more in casual, bite‑sized language.

<p align="center">
  <img src="docs/demo.gif" alt="Demo animation" width="600" />
</p>

---

## Table of contents

1.  Features
2.  Tech stack
3.  Local development
4.  Environment variables
5.  Project layout
6.  Deploying
7.  Contributing

---

## 1 · Features

• Real‑time matrix visualisation (basis, extra test vectors and eigen‑vectors if they exist).

• Fast WebSocket bridge between the browser and a FastAPI backend.

• GPT‑4o‑mini (or any ChatCompletion model) provides:
    – Narration every time the matrix changes.
    – Context‑aware chat side‑bar for visitor questions.
    – Threaded comments on highlighted snippets.

• Fully client‑side front‑end – just drop the `frontend/dist` folder on Netlify.

• One‑click deploys: Netlify (front‑end) + Fly.io (backend in a tiny Docker image).

---

## 2 · Tech stack

Front‑end:

```text
React + TypeScript  – component logic
Vite                – dev‑server & bundling
Tailwind CSS        – utility‑first styling
```

Back‑end:

```text
FastAPI             – HTTP & WebSocket routes
Uvicorn             – ASGI server
OpenAI Python SDK   – chat completions
```

Tooling: ESLint, Prettier, ts‑config paths, and basic `Dockerfile` for Fly.

---

## 3 · Local development

Prerequisites: Node ≥ 18, Python ≥ 3.9, and an OpenAI API key.

```bash
# ① Start the front‑end
cd frontend
npm install
npm run dev          # http://localhost:5173

# ② Start the back‑end in another terminal
cd backend
python -m venv .venv && source .venv/bin/activate  # optional but recommended
pip install -r requirements.txt
export OPENAI_API_KEY=sk-...                       # your key here
uvicorn app.main:app --reload  # http://localhost:8000/ws (WebSocket)
```

Now visit http://localhost:5173 and drag the sliders – the narrator should start
chatting within a second or two once the WebSocket handshake completes.

---

## 4 · Environment variables

| Variable          | Used by | Description                                 |
|-------------------|---------|---------------------------------------------|
| `OPENAI_API_KEY`  | backend | Secret key for the ChatCompletion endpoint. |
| `VITE_WS_URL`     | front‑end (optional) | Override WebSocket URL (defaults to `ws://localhost:8000/ws`). |


---

## 5 · Project layout

```
├── backend/           ← FastAPI service (Docker‑ready)
│   ├── app/main.py    ← WebSocket & LLM logic
│   └── requirements.txt
├── frontend/          ← Vite + React client
│   ├── src/           ← UI components & hooks
│   └── vite.config.ts
├── fly.toml           ← Fly deploy config (backend)
└── netlify.toml       ← Netlify build settings (frontend)
```

---

## 6 · Deploying

### Netlify (front‑end)

1. Click “New site from git” and select this repository.
2. Set the build command to `npm run build` and the publish directory to `frontend/dist`.
3. Add an environment variable `OPENAI_API_KEY` under *Site settings → Environment*.

### Fly.io (backend)

```bash
cd backend
fly launch --dockerfile Dockerfile   # answer the interactive prompts once
fly deploy                           # subsequent deploys
```

Remember to set your `OPENAI_API_KEY` secret on Fly as well:

```bash
fly secrets set OPENAI_API_KEY=sk-...
```

---

## 7 · Contributing

Pull requests are welcome! Feel free to open an issue first if you find a bug or
want to discuss a new feature.

1. Fork → create a branch → commit→ open PR.
2. Run `npm run lint` in `frontend/` and `pytest` (if tests exist) in `backend/`.
3. Make sure the README stays up‑to‑date whenever you add user‑facing changes.

---

Made with ❤️ and linear algebra.
