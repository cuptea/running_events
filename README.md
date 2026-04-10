# Running Events Finder

A small web app where users can enter a city/location and get upcoming nearby running events.

## What it does

- Accepts a free-form location (city, neighborhood, country, etc.).
- Geocodes the location using OpenStreetMap Nominatim.
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

This project works on platforms like **Render**, **Railway**, **Fly.io**, or any VPS that can run Node.js.

- Build command: `npm install`
- Start command: `npm start`
- Port: provided by `PORT` environment variable.

## API

`GET /api/events?location=<query>`

Example:

```bash
curl "http://localhost:3000/api/events?location=Seattle"
```
