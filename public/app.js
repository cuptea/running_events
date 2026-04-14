const form = document.getElementById("search-form");
const locationInput = document.getElementById("location-input");
const statusEl = document.getElementById("status");
const resultsEl = document.getElementById("results");

function formatDate(isoDate) {
  const date = new Date(isoDate);
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "full",
    timeStyle: "short",

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
        <p><strong>Distance:</strong> ${event.distanceMiles.toFixed(1)} miles</p>
        <p><strong>Next event:</strong> ${formatDate(event.nextEventDate)}</p>
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


  statusEl.textContent = "Searching for running events...";
  resultsEl.innerHTML = "";

  try {
    const response = await fetch(`/api/events?location=${encodeURIComponent(location)}`);
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "Could not load events.");
    }


    statusEl.textContent = `Showing events near ${payload.location.displayName}`;

    renderEvents(payload.events);
  } catch (error) {
    statusEl.textContent = "";
    resultsEl.innerHTML = `<p>${error.message}</p>`;
  }
});
