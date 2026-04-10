const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const GOOGLE_CSE_ID = process.env.GOOGLE_CSE_ID;
const DEFAULT_COUNTRY = "Germany";

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

async function searchGermanyRunningEvents(location, limit = 10) {
  if (!GOOGLE_API_KEY || !GOOGLE_CSE_ID) {
    throw new Error(
      "Google Search API is not configured. Set GOOGLE_API_KEY and GOOGLE_CSE_ID environment variables."
    );
  }

  const query = `Laufveranstaltung ${location} ${DEFAULT_COUNTRY}`;
  const searchURL = new URL("https://www.googleapis.com/customsearch/v1");
  searchURL.searchParams.set("key", GOOGLE_API_KEY);
  searchURL.searchParams.set("cx", GOOGLE_CSE_ID);
  searchURL.searchParams.set("q", query);
  searchURL.searchParams.set("num", String(Math.min(Math.max(limit, 1), 10)));
  searchURL.searchParams.set("gl", "de");
  searchURL.searchParams.set("hl", "de");
  searchURL.searchParams.set("safe", "off");

  const response = await fetch(searchURL);
  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Google Search API request failed (${response.status}): ${details}`);
  }

  const payload = await response.json();
  const items = payload.items || [];

  return items.map((item, index) => {
    const rawDate = extractDate(`${item.title || ""} ${item.snippet || ""}`);

    return {
      id: `google-${index + 1}`,
      name: item.title || "Running event",
      country: DEFAULT_COUNTRY,
      city: location,
      summary: item.snippet || "",
      nextEventDate: rawDate,
      detailUrl: item.link,
      source: item.displayLink || "Google Search",
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
      const events = await searchGermanyRunningEvents(location, 10);

      sendJson(res, 200, {
        location: {
          displayName: `${location}, ${DEFAULT_COUNTRY}`,
        },
        events,
        source: "Google Programmable Search API",
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
