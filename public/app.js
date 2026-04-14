const form = document.getElementById("search-form");
const locationInput = document.getElementById("location-input");
const statusEl = document.getElementById("status");
const resultsEl = document.getElementById("results");

function formatDate(isoDate) {
  if (!isoDate) {
    return "Date not listed";
  }

  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return isoDate;
  }

  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "full",
  }).format(date);
}

function renderEvents(events) {
  if (!events.length) {
    resultsEl.innerHTML = "<p>No running events found nearby.</p>";
    return;
  }

  resultsEl.innerHTML = events
    .map(
      (event) => `
      <article class="card">
        <h2>${event.name}</h2>
        <p><strong>Country:</strong> ${event.country}</p>
        <p><strong>City:</strong> ${event.city}</p>
        <p><strong>Next event:</strong> ${formatDate(event.nextEventDate)}</p>
        <p>${event.summary || "No description available."}</p>
        <p><strong>Source:</strong> ${event.source}</p>
        <p><a href="${event.detailUrl}" target="_blank" rel="noreferrer">Event details</a></p>
      </article>
    `
    )
    .join("");
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const location = locationInput.value.trim();

  if (!location) {
    return;
  }

  statusEl.textContent = "Searching for running events in Germany...";
  resultsEl.innerHTML = "";

  try {
    const response = await fetch(`/api/events?location=${encodeURIComponent(location)}`);
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "Could not load events.");
    }

    statusEl.textContent = payload.message
      ? payload.message
      : `Showing events for ${payload.location.displayName}`;
    renderEvents(payload.events);
  } catch (error) {
    statusEl.textContent = "";
    resultsEl.innerHTML = `<p>${error.message}</p>`;
  }
});
