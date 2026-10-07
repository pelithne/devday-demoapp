const helloButton = document.querySelector("#say-hello");
const remixButton = document.querySelector("#remix");
const status = document.querySelector("#hello-status");
const confetti = document.querySelector("#confetti");
const palettes = [
  { accent: "#7c3aed", light: "#e8ddff", name: "Cosmic purple" },
  { accent: "#0f766e", light: "#ccfbf1", name: "Ocean green" },
  { accent: "#be185d", light: "#fce7f3", name: "Bubblegum pink" },
  { accent: "#c2410c", light: "#ffedd5", name: "Sunset orange" },
];
let hellos = 0;
let paletteIndex = 0;

helloButton.addEventListener("click", () => {
  hellos += 1;
  status.textContent = hellos === 1 ? "Hello, world! You just made the internet a little friendlier." : `${hellos} little hellos. The world says hello right back!`;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  confetti.replaceChildren();
  for (let index = 0; index < 24; index += 1) {
    const piece = document.createElement("span");
    piece.className = "confetti-piece";
    piece.style.setProperty("--confetti-color", ["#7c3aed", "#f59e0b", "#0d9488", "#ec4899"][index % 4]);
    piece.style.setProperty("--dx", `${Math.round(Math.random() * 420 - 210)}px`);
    piece.style.setProperty("--dy", `${Math.round(Math.random() * -240 - 50)}px`);
    piece.style.setProperty("--rotation", `${Math.round(Math.random() * 720)}deg`);
    piece.addEventListener("animationend", () => piece.remove(), { once: true });
    confetti.append(piece);
  }
});

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
    status.textContent = `Hello still works, but release details could not load: ${error.message}`;
  }
}

loadRelease();
