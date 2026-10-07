const remixButton = document.querySelector("#remix");
const status = document.querySelector("#hello-status");
const palettes = [
  { accent: "#7c3aed", light: "#e8ddff", name: "Cosmic purple" },
  { accent: "#0f766e", light: "#ccfbf1", name: "Ocean green" },
  { accent: "#be185d", light: "#fce7f3", name: "Bubblegum pink" },
  { accent: "#c2410c", light: "#ffedd5", name: "Sunset orange" },
];
let paletteIndex = 0;

remixButton.addEventListener("click", () => {
  paletteIndex = (paletteIndex + 1) % palettes.length;
  const palette = palettes[paletteIndex];
  document.documentElement.style.setProperty("--accent", palette.accent);
  document.documentElement.style.setProperty("--accent-light", palette.light);
  status.textContent = `${palette.name}. Same world, fresh hello.`;
});

async function loadRelease() {
  const label = document.querySelector("#release");
  try {
    const response = await fetch("/release.json", { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`Request failed (${response.status}).`);
    const data = await response.json();
    if (typeof data.release !== "string" || !data.release) throw new Error("Missing release identifier.");
    label.textContent = data.release.slice(0, 7);
    label.title = data.release;
  } catch (error) {
    label.textContent = "unavailable";
    label.title = error.message;
    status.textContent = `Release details could not load: ${error.message}`;
  }
}

loadRelease();
