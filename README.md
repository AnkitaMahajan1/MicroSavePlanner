# MicroSave Planner

<p align="center">
  <img src="./assets/microsave-banner.svg" alt="MicroSave Planner Animated Banner" />
</p>

MicroSave Planner helps you save money automatically by rounding up your daily spending.

## Simple Idea

When you buy something, the app rounds your amount to the next 100 and saves the difference.

### Coffee Example

You buy coffee for **73**.
- Next 100 is **100**
- Savings amount is **27**

That 27 can be invested for your future.

## What You Can Do

- Calculate round-up savings from transactions
- Validate transactions (no negative or duplicate entries)
- Apply custom saving rules with `q`, `p`, `k` periods
- Estimate future returns for:
  - NPS
  - Index investing

## Quick Start

### Run Backend

```powershell
cd "c:\Users\ankimaha\OneDrive - AMDOCS\Desktop\desk\selfSavings"
.\venv\Scripts\activate
python run.py
```

Backend docs: `http://127.0.0.1:5477/docs`

### Run Frontend

```powershell
cd "c:\Users\ankimaha\OneDrive - AMDOCS\Desktop\desk\selfSavings\frontend"
copy .env.example .env
npm install
npm run dev
```

Frontend app: `http://127.0.0.1:5173`

### Run with Docker

```powershell
cd "c:\Users\ankimaha\OneDrive - AMDOCS\Desktop\desk\selfSavings"
docker compose up --build
```

## API Endpoints

- `POST /microsave/challenge/v1/transactions:parse`
- `POST /microsave/challenge/v1/transactions:validate`
- `POST /microsave/challenge/v1/transactions:filter`
- `POST /microsave/challenge/v1/returns:nps`
- `POST /microsave/challenge/v1/returns:index`
- `GET /microsave/challenge/v1/performance`

## Tiny API Demo (Coffee)

Request:

```json
[
  { "date": "2026-03-30 09:00:00", "amount": 73 }
]
```

Response from `transactions:parse`:

```json
{
  "transactions": [
    {
      "date": "2026-03-30 09:00:00",
      "amount": 73,
      "ceiling": 100,
      "remanent": 27
    }
  ]
}
```

## Returns Clarification (Easy)

For `returns:nps` and `returns:index`, the app now gives a clear summary:

- `totalInvestedAmount`: how much is being invested
- `investmentHorizonYears`: years left until age 60
- `retirementCorpusAt60`: projected inflation-adjusted corpus at age 60
- `responseMessage`: plain-English sentence

Example meaning:
- If age is `30`, horizon is `30` years.
- If response says:
  - `totalInvestedAmount = 12000`
  - `retirementCorpusAt60 = 48650`
- It means: by age 60, this invested amount is projected to become about 48,650.

## Notes

- Frontend API URL can be set in `frontend/.env` using `VITE_API_BASE_URL`.
