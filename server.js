const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const DEFAULT_COUNTRY = "Germany";
const USER_AGENT = process.env.USER_AGENT || "running-events-finder/1.0 (contact: admin@example.com)";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
};

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(payload));
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

async function geocodeLocation(location) {
  const geocodeUrl = new URL("https://nominatim.openstreetmap.org/search");
  geocodeUrl.searchParams.set("q", `${location}, ${DEFAULT_COUNTRY}`);
  geocodeUrl.searchParams.set("format", "jsonv2");
  geocodeUrl.searchParams.set("limit", "1");

  try {
    const response = await fetch(geocodeUrl, {
      headers: {
        "User-Agent": USER_AGENT,
      },
    });

    if (!response.ok) {
      throw new Error(`Geocoding request failed (${response.status})`);
    }

    const results = await response.json();
    if (!Array.isArray(results) || !results.length) {
      throw new Error("No geocoding results");
    }

    const lat = Number(results[0].lat);
    const lon = Number(results[0].lon);

    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      throw new Error("Invalid geocoding coordinates");
    }

    return {
      lat,
      lon,
      displayName: results[0].display_name || `${location}, ${DEFAULT_COUNTRY}`,
    };
  } catch (_error) {
    throw new Error("Failed to geocode location.");
  }
}

function extractDate(text) {
  if (!text) {
    return null;
  }

  const ddmmyyyy = text.match(/\b(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})\b/);
  if (ddmmyyyy) {
    const day = ddmmyyyy[1].padStart(2, "0");
    const month = ddmmyyyy[2].padStart(2, "0");
    return `${ddmmyyyy[3]}-${month}-${day}`;
  }

  const yyyymmdd = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (yyyymmdd) {
    return `${yyyymmdd[1]}-${yyyymmdd[2]}-${yyyymmdd[3]}`;
  }

  return null;
}

async function searchGermanyRunningEvents(location, geocode, limit = 10) {
  if (!GOOGLE_API_KEY) {
    throw new Error("Google Places API is not configured. Set GOOGLE_API_KEY environment variable.");
  }

  const clampedLimit = Math.min(Math.max(limit, 1), 10);
  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": GOOGLE_API_KEY,
      "X-Goog-FieldMask": [
        "places.id",
        "places.displayName",
        "places.formattedAddress",
        "places.shortFormattedAddress",
        "places.websiteUri",
        "places.googleMapsUri",
        "places.editorialSummary",
      ].join(","),
    },
    body: JSON.stringify({
      textQuery: `running event ${location} ${DEFAULT_COUNTRY}`,
      languageCode: "de",
      regionCode: "DE",
      locationBias: {
        circle: {
          center: {
            latitude: geocode.lat,
            longitude: geocode.lon,
          },
          radius: 30000,
        },
      },
      maxResultCount: clampedLimit,
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Google Places API request failed (${response.status}): ${details}`);
  }

  const payload = await response.json();
  const places = payload.places || [];

  return places.map((place, index) => {
    const placeName = place.displayName?.text || `Running event ${index + 1}`;
    const summary = place.editorialSummary?.text || place.shortFormattedAddress || "";
    const rawDate = extractDate(`${placeName} ${summary}`);

    return {
      id: place.id || `place-${index + 1}`,
      name: placeName,
      country: DEFAULT_COUNTRY,
      city: location,
      summary,
      nextEventDate: rawDate,
      detailUrl: place.websiteUri || place.googleMapsUri || null,
      source: "Google Places API",
      address: place.formattedAddress || place.shortFormattedAddress || null,
    };
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
        error: "Please provide a location query parameter, e.g. /api/events?location=Munich",
      });
      return;
    }

    try {
      const geocode = await geocodeLocation(location);
      const events = await searchGermanyRunningEvents(location, geocode, 10);

      sendJson(res, 200, {
        location: {
          displayName: geocode.displayName,
          lat: geocode.lat,
          lon: geocode.lon,
        },
        events,
        source: "Google Places API",
        message: events.length ? undefined : "No running events found nearby.",
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
