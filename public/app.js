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
    const emptyState = document.createElement("p");
    emptyState.textContent = "No running events found nearby.";
    resultsEl.replaceChildren(emptyState);
    return;
  }

  const cards = events.map((eventData) => {
    const card = document.createElement("article");
    card.className = "card";

    const title = document.createElement("h2");
    title.textContent = eventData.name;
    card.appendChild(title);

    const country = document.createElement("p");
    country.innerHTML = `<strong>Country:</strong> `;
    country.append(document.createTextNode(eventData.country));
    card.appendChild(country);

    const distance = document.createElement("p");
    distance.innerHTML = `<strong>Distance:</strong> `;
    distance.append(document.createTextNode(`${eventData.distanceMiles.toFixed(1)} miles`));
    card.appendChild(distance);

    const nextEvent = document.createElement("p");
    nextEvent.innerHTML = `<strong>Next event:</strong> `;
    nextEvent.append(document.createTextNode(formatDate(eventData.nextEventDate)));
    card.appendChild(nextEvent);

    const details = document.createElement("p");
    const link = document.createElement("a");
    link.href = eventData.detailUrl;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = "Event details";
    details.appendChild(link);
    card.appendChild(details);

    return card;
  });

  resultsEl.replaceChildren(...cards);
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
    const errorMessage = document.createElement("p");
    errorMessage.textContent = error.message;
    resultsEl.replaceChildren(errorMessage);
  }
});
