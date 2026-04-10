const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const PARKRUN_EVENTS_URL = "https://images.parkrun.com/events.json";
const USER_AGENT =
  "running-events-finder/1.0 (https://example.com; contact: admin@example.com)";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
};

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

function haversineMiles(lat1, lon1, lat2, lon2) {
  const earthRadiusMiles = 3958.8;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.asin(Math.sqrt(a));
  return earthRadiusMiles * c;
}

function getNextSaturdayDate() {
  const now = new Date();
  const currentDay = now.getUTCDay();
  const saturday = 6;
  const daysUntilSaturday = (saturday - currentDay + 7) % 7 || 7;

  const nextSaturday = new Date(now);
  nextSaturday.setUTCDate(now.getUTCDate() + daysUntilSaturday);
  nextSaturday.setUTCHours(9, 0, 0, 0);

  return nextSaturday.toISOString();
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(payload));
}

async function geocodeLocation(location) {
  const geocodeURL = new URL("https://nominatim.openstreetmap.org/search");
  geocodeURL.searchParams.set("q", location);
  geocodeURL.searchParams.set("format", "jsonv2");
  geocodeURL.searchParams.set("limit", "1");

  const response = await fetch(geocodeURL, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error("Failed to geocode location.");
  }

  const results = await response.json();
  if (!Array.isArray(results) || results.length === 0) {
    throw new Error("Location not found. Try a more specific city or region.");
  }

  const topResult = results[0];
  return {
    latitude: Number(topResult.lat),
    longitude: Number(topResult.lon),
    displayName: topResult.display_name,
  };
}

async function fetchParkrunEvents() {
  const response = await fetch(PARKRUN_EVENTS_URL, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error("Could not fetch running events at the moment.");
  }

  const data = await response.json();
  const events = [];

  for (const countryName of Object.keys(data?.countries || {})) {
    const country = data.countries[countryName];
    const eventList = country?.events || {};

    for (const eventName of Object.keys(eventList)) {
      const event = eventList[eventName];
      if (!event?.lat || !event?.lon || !event?.shortname) {
        continue;
      }

      events.push({
        id: `${countryName}-${event.shortname}`,
        name: event.name || eventName,
        country: countryName,
        latitude: Number(event.lat),
        longitude: Number(event.lon),
        detailUrl: `https://www.parkrun.${country.urlFragment || "com"}/${event.shortname}`,
      });
    }
  }

  return events;
}

function serveStaticFile(reqPath, res) {
  const normalizedPath = reqPath === "/" ? "/index.html" : reqPath;
  const safePath = path.normalize(normalizedPath).replace(/^\.+/, "");
  const filePath = path.join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      fs.readFile(path.join(PUBLIC_DIR, "index.html"), (fallbackErr, fallbackData) => {
        if (fallbackErr) {
          res.writeHead(500);
          res.end("Internal Server Error");
          return;
        }

        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(fallbackData);
      });
      return;
    }

    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);

  if (requestUrl.pathname === "/api/events" && req.method === "GET") {
    const location = requestUrl.searchParams.get("location");

    if (!location) {
      sendJson(res, 400, {
        error: "Please provide a location query parameter, e.g. /api/events?location=Boston",
      });
      return;
    }

    try {
      const [place, allEvents] = await Promise.all([
        geocodeLocation(location),
        fetchParkrunEvents(),
      ]);

      const withDistance = allEvents
        .map((event) => {
          const distanceMiles = haversineMiles(
            place.latitude,
            place.longitude,
            event.latitude,
            event.longitude
          );

          return {
            ...event,
            distanceMiles,
            nextEventDate: getNextSaturdayDate(),
          };
        })
        .sort((a, b) => a.distanceMiles - b.distanceMiles)
        .slice(0, 25);

      sendJson(res, 200, {
        location: place,
        events: withDistance,
        source: "parkrun global events directory",
      });
      return;
    } catch (error) {
      sendJson(res, 500, {
        error: error.message || "Unexpected error while searching for events.",
      });
      return;
    }
  }

  serveStaticFile(requestUrl.pathname, res);
});

server.listen(PORT, () => {
  console.log(`Running Events Finder is running on port ${PORT}`);
});
