const cards = new Map();
const rows = new Map();
const feedback = document.querySelector("#feedback");
let selectedTopic = null;
let voterId = null;
let submitting = false;

function message(text, error = false) {
  feedback.textContent = text;
  feedback.classList.toggle("error", error);
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function initialiseVoter() {
  try {
    voterId = localStorage.getItem("devday-voter");
    if (!voterId) {
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      bytes[6] = (bytes[6] & 15) | 64;
      bytes[8] = (bytes[8] & 63) | 128;
      const hex = [...bytes].map(value => value.toString(16).padStart(2, "0")).join("");
      voterId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
      localStorage.setItem("devday-voter", voterId);
    }
    selectedTopic = localStorage.getItem("devday-choice");
  } catch (error) {
    voterId = null;
    message("Enable browser storage to vote. Live results are still available.", true);
  }
}

async function api(path, options = {}) {
  const response = await fetch(path, { ...options, signal: AbortSignal.timeout(12000) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
  return data;
}

function render(state) {
  document.querySelector("#total-votes").textContent = state.totalVotes;
  const release = document.querySelector("#backend-release");
  release.textContent = state.release.slice(0, 7);
  release.title = state.release;
  const topics = document.querySelector("#topics");
  for (const topic of state.topics) {
    if (!cards.has(topic.id)) {
      const button = element("button", "topic");
      button.type = "button";
      button.setAttribute("aria-label", `Vote for ${topic.name}`);
      button.style.setProperty("--topic-color", topic.color);
      button.append(element("span", "topic-symbol", topic.symbol), element("span", "topic-name", topic.name), element("span", "topic-tagline", topic.tagline), element("span", "topic-cta", "Cast your vote"));
      button.addEventListener("click", () => submitVote(topic.id));
      topics.append(button);
      cards.set(topic.id, button);
      const row = element("div", "result");
      const heading = element("div", "result-heading");
      heading.append(element("span", "", topic.name), element("span", "result-value"));
      const track = element("div", "track");
      const bar = element("div", "bar");
      bar.style.background = topic.color;
      track.append(bar);
      row.append(heading, track);
      document.querySelector("#results").append(row);
      rows.set(topic.id, row);
    }
    const button = cards.get(topic.id);
    button.setAttribute("aria-pressed", String(selectedTopic === topic.id));
    button.disabled = submitting || !voterId;
    button.querySelector(".topic-cta").textContent = selectedTopic === topic.id ? "Your pick - change anytime" : "Cast your vote";
    const row = rows.get(topic.id);
    const percent = state.totalVotes ? Math.round(topic.votes / state.totalVotes * 100) : 0;
    row.querySelector(".result-value").replaceChildren(element("strong", "", `${percent}%`), document.createTextNode(`${topic.votes} ${topic.votes === 1 ? "vote" : "votes"}`));
    row.querySelector(".bar").style.width = `${percent}%`;
  }
  topics.setAttribute("aria-busy", "false");
}

async function submitVote(topicId) {
  if (submitting || !voterId) return;
  submitting = true;
  for (const button of cards.values()) button.disabled = true;
  try {
    const state = await api("/api/votes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ voterId, topicId }) });
    selectedTopic = topicId;
    try {
      localStorage.setItem("devday-choice", topicId);
    } catch (error) {
      message("Vote saved, but this browser could not remember your selection.", true);
      render(state);
      return;
    }
    render(state);
    message("You're in! Your vote is saved. Change your pick whenever inspiration strikes.");
  } catch (error) {
    message(`Could not save your vote: ${error.message}`, true);
  } finally {
    submitting = false;
    for (const button of cards.values()) button.disabled = !voterId;
  }
}

async function refresh() {
  if (submitting) {
    setTimeout(refresh, 5000);
    return;
  }
  try {
    const state = await api("/api/state");
    render(state);
    if (voterId && !selectedTopic) message("Pick a topic to join the conversation.");
    else if (voterId && feedback.classList.contains("error")) message("Connected again. Your voice counts.");
  } catch (error) {
    message(`Live results unavailable: ${error.message} Retrying shortly.`, true);
  } finally {
    setTimeout(refresh, 5000);
  }
}

initialiseVoter();
fetch("/release.json").then(response => {
  if (!response.ok) throw new Error(`Release request failed (${response.status}).`);
  return response.json();
}).then(data => {
  document.querySelector("#frontend-release").textContent = data.release.slice(0, 7);
  document.querySelector("#frontend-release").title = data.release;
}).catch(error => {
  document.querySelector("#frontend-release").textContent = "unavailable";
  message(`Could not load the UI release: ${error.message}`, true);
});
refresh();
