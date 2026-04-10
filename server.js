const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const PARKRUN_EVENTS_URL = "https://images.parkrun.com/events.json";
const USER_AGENT =
  process.env.APP_USER_AGENT ||
  "running-events-finder/1.2 (+https://github.com/example/running-events; contact: support@running-events.local)";
const EVENT_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
};

const eventCache = {
  events: null,
  fetchedAt: 0,
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

async function geocodeWithNominatim(location) {
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
    throw new Error(`Nominatim geocoding failed (${response.status}).`);
  }

  const results = await response.json();
  if (!Array.isArray(results) || results.length === 0) {
    throw new Error("Location not found in Nominatim.");
  }

  const topResult = results[0];
  return {
    latitude: Number(topResult.lat),
    longitude: Number(topResult.lon),
    displayName: topResult.display_name,
  };
}

async function geocodeWithOpenMeteo(location) {
  const geocodeURL = new URL("https://geocoding-api.open-meteo.com/v1/search");
  geocodeURL.searchParams.set("name", location);
  geocodeURL.searchParams.set("count", "1");
  geocodeURL.searchParams.set("language", "en");
  geocodeURL.searchParams.set("format", "json");

  const response = await fetch(geocodeURL, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Open-Meteo geocoding failed (${response.status}).`);
  }

  const payload = await response.json();
  const results = payload?.results || [];
  if (!Array.isArray(results) || results.length === 0) {
    throw new Error("Location not found in Open-Meteo geocoder.");
  }

  const topResult = results[0];
  return {
    latitude: Number(topResult.latitude),
    longitude: Number(topResult.longitude),
    displayName: [
      topResult.name,
      topResult.admin1,
      topResult.country,
    ]
      .filter(Boolean)
      .join(", "),
  };
}

async function geocodeLocation(location) {
  try {
    return await geocodeWithNominatim(location);
  } catch (nominatimError) {
    try {
      return await geocodeWithOpenMeteo(location);
    } catch (fallbackError) {
      throw new Error(
        `Failed to geocode location. ${nominatimError.message} ${fallbackError.message}`
      );
    }
  }
}

function inferDetailUrl(event, country) {
  if (event?.url) {
    return event.url;
  }

  if (event?.website) {
    return event.website;
  }

  const host = country?.urlFragment ? `parkrun.${country.urlFragment}` : "parkrun.com";
  const shortname = event?.shortname || "";
  return `https://www.${host}/${shortname}`;
}

async function fetchParkrunEvents() {
  const now = Date.now();
  if (eventCache.events && now - eventCache.fetchedAt < EVENT_CACHE_TTL_MS) {
    return eventCache.events;
  }

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
      if (event?.lat == null || event?.lon == null || !event?.shortname) {
        continue;
      }

      events.push({
        id: `${countryName}-${event.shortname}`,
        name: event.name || eventName,
        country: countryName,
        latitude: Number(event.lat),
        longitude: Number(event.lon),
        detailUrl: inferDetailUrl(event, country),
      });
    }
  }

  eventCache.events = events;
  eventCache.fetchedAt = now;

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

  if (requestUrl.pathname === "/health" && req.method === "GET") {
    sendJson(res, 200, { status: "ok" });
    return;
  }

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
