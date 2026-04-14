# Running Events Finder

A web app where users can enter a city/location and get upcoming running events in Germany.

## What it does

- Accepts a free-form location (city, region, etc.).
- Uses **Google Programmable Search API** to search for running events in Germany.
- Returns up to 10 event search results with links and extracted date (if present).

## Required environment variables

You must provide both:

- `GOOGLE_API_KEY`
- `GOOGLE_CSE_ID`

Without these, `/api/events` returns a configuration error.

## Run locally

```bash
export GOOGLE_API_KEY="your-api-key"
export GOOGLE_CSE_ID="your-cse-id"
npm start
```

App runs on `http://localhost:3000` by default.

## API

`GET /api/events?location=<query>`

Example:

```bash
curl "http://localhost:3000/api/events?location=Munich"
```

## Deploy publicly

- Build command: `npm install`
- Start command: `npm start`
- Health check path: `/health`
- Set `GOOGLE_API_KEY` and `GOOGLE_CSE_ID` in your hosting provider environment settings.
