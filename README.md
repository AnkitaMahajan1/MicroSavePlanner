# MicroSave Planner

This project now includes:
- FastAPI backend on `5477`
- React + Vite frontend on `5173`

## Backend (local)

```powershell
cd "c:\Users\ankimaha\OneDrive - AMDOCS\Desktop\desk\selfSavings"
.\venv\Scripts\activate
python run.py
```

Backend docs: `http://127.0.0.1:5477/docs`

## Frontend (local)

```powershell
cd "c:\Users\ankimaha\OneDrive - AMDOCS\Desktop\desk\selfSavings\frontend"
copy .env.example .env
npm install
npm run dev
```

UI: `http://127.0.0.1:5173`

## Docker Compose (backend + frontend)

```powershell
cd "c:\Users\ankimaha\OneDrive - AMDOCS\Desktop\desk\selfSavings"
docker compose up --build
```

## UI Capabilities

- **Transactions page**
  - Calculate Savings: compute ceiling/remanent
  - Validate: validate duplicates/negative amounts
  - Filter: apply `q`, `p`, `k` period logic
- **Returns page**
  - NPS returns
  - Index returns

## Notes

- Frontend API base URL is configurable via `frontend/.env` (`VITE_API_BASE_URL`).

## Deploy on Render

This repo includes `render.yaml` for one-click blueprint deployment (API + frontend).

1. Push this project to GitHub.
2. In Render, choose **New +** -> **Blueprint**.
3. Connect the GitHub repo and select this project.
4. Render will create:
   - `microsave-planner-api` (FastAPI via Dockerfile)
   - `microsave-planner-web` (Vite static site)
5. After deploy completes, open the frontend URL and share it.

The frontend automatically uses the deployed backend URL from the Render service reference.
