const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

async function createPage({ reducedMotion = false, response } = {}) {
  const styles = new Map();
  const elements = new Map();
  function element() {
    const listeners = new Map();
    return {
      textContent: "",
      title: "",
      children: [],
      style: { setProperty: (name, value) => styles.set(name, value) },
      addEventListener: (event, callback) => listeners.set(event, callback),
      trigger: event => listeners.get(event)(),
      replaceChildren() { this.children = []; },
      append(piece) {
        this.children.push(piece);
        piece.remove = () => { this.children = this.children.filter(child => child !== piece); };
      },
    };
  }
  for (const selector of ["#say-hello", "#remix", "#hello-status", "#confetti", "#release"]) {
    elements.set(selector, element());
  }
  const page = {
    document: {
      querySelector: selector => elements.get(selector),
      createElement: element,
      documentElement: { style: { setProperty: (name, value) => styles.set(name, value) } },
    },
    matchMedia: () => ({ matches: reducedMotion }),
    AbortSignal,
    fetch: async () => response || { ok: true, json: async () => ({ release: "a".repeat(40) }) },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "app.js"), "utf8"), page);
  await new Promise(resolve => setImmediate(resolve));
  return { elements, styles };
}

test("shows actual release metadata", async () => {
  const { elements } = await createPage();
  assert.equal(elements.get("#release").textContent, "aaaaaaa");
  assert.equal(elements.get("#release").title, "a".repeat(40));
});

test("hello button counts greetings and bounds the confetti nodes", async () => {
  const { elements } = await createPage();
  elements.get("#say-hello").trigger("click");
  assert.match(elements.get("#hello-status").textContent, /Hello, world!/);
  assert.equal(elements.get("#confetti").children.length, 24);
  elements.get("#say-hello").trigger("click");
  assert.match(elements.get("#hello-status").textContent, /2 little hellos/);
  assert.equal(elements.get("#confetti").children.length, 24);
  elements.get("#confetti").children[0].trigger("animationend");
  assert.equal(elements.get("#confetti").children.length, 23);
});

test("reduced-motion users still get greetings without confetti", async () => {
  const { elements } = await createPage({ reducedMotion: true });
  elements.get("#say-hello").trigger("click");
  assert.match(elements.get("#hello-status").textContent, /Hello, world!/);
  assert.equal(elements.get("#confetti").children.length, 0);
});

test("colour remix cycles through all palettes", async () => {
  const { elements, styles } = await createPage();
  elements.get("#remix").trigger("click");
  assert.equal(styles.get("--accent"), "#0f766e");
  assert.match(elements.get("#hello-status").textContent, /Ocean green/);
  for (let index = 0; index < 3; index += 1) elements.get("#remix").trigger("click");
  assert.equal(styles.get("--accent"), "#7c3aed");
  assert.equal(styles.get("--accent-light"), "#e8ddff");
});

test("failed release request is surfaced without disabling hello", async () => {
  const { elements } = await createPage({ response: { ok: false, status: 503 } });
  assert.equal(elements.get("#release").textContent, "unavailable");
  assert.match(elements.get("#hello-status").textContent, /503/);
  elements.get("#say-hello").trigger("click");
  assert.match(elements.get("#hello-status").textContent, /Hello, world!/);
});

test("invalid release metadata is surfaced", async () => {
  const { elements } = await createPage({ response: { ok: true, json: async () => ({ release: null }) } });
  assert.equal(elements.get("#release").textContent, "unavailable");
  assert.match(elements.get("#hello-status").textContent, /Missing release identifier/);
});
