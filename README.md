# Running Events Finder

A small web app where users can enter a city/location and get upcoming nearby running events.

## What it does

- Accepts a free-form location (city, neighborhood, country, etc.).
- Geocodes the location using OpenStreetMap Nominatim (with Open-Meteo geocoder fallback).
- Pulls global running event data from parkrun's public events directory.
- Computes nearest events and returns the top 25 nearest options.
- Shows the next scheduled weekly event date (next Saturday).

## Run locally

```bash
npm install
npm start
```

App runs on `http://localhost:3000` by default.

## Deploy publicly

I can’t directly deploy from this environment because there is no access to your Render/Railway/Fly/Vercel account tokens.

### Fastest option: Render (free tier)

1. Push this repo to GitHub.
2. In Render, click **New +** → **Blueprint**.
3. Select your repo and deploy; Render will use `render.yaml` automatically.

Alternative (manual web service settings):
- Build command: `npm install`
- Start command: `npm start`
- Health check path: `/health`

### Railway/Fly/VPS

- Start command: `npm start`
- Port: provided by `PORT` environment variable.

## API

`GET /api/events?location=<query>&maxDistanceMiles=<number>`

Example:

```bash
curl "http://localhost:3000/api/events?location=Seattle&maxDistanceMiles=50"
```
