const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

async function createPage({ response } = {}) {
  const styles = new Map();
  const elements = new Map();
  function element() {
    const listeners = new Map();
    return {
      textContent: "",
      title: "",
      addEventListener: (event, callback) => listeners.set(event, callback),
      trigger: event => listeners.get(event)(),
    };
  }
  for (const selector of ["#remix", "#hello-status", "#release"]) {
    elements.set(selector, element());
  }
  const page = {
    document: {
      querySelector: selector => elements.get(selector),
      documentElement: { style: { setProperty: (name, value) => styles.set(name, value) } },
    },
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

test("page omits the greeting action and decorative captions", () => {
  const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  assert.doesNotMatch(html, /Send a little hello|you are here|hello energy|a small start|a big adventure|id="say-hello"|id="confetti"|class="sticker/i);
  assert.match(html, /id="remix"/);
  assert.match(html, /id="greeting"/);
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

test("failed release request is surfaced without disabling colour remix", async () => {
  const { elements } = await createPage({ response: { ok: false, status: 503 } });
  assert.equal(elements.get("#release").textContent, "unavailable");
  assert.match(elements.get("#hello-status").textContent, /503/);
  elements.get("#remix").trigger("click");
  assert.match(elements.get("#hello-status").textContent, /Ocean green/);
});

test("invalid release metadata is surfaced", async () => {
  const { elements } = await createPage({ response: { ok: true, json: async () => ({ release: null }) } });
  assert.equal(elements.get("#release").textContent, "unavailable");
  assert.match(elements.get("#hello-status").textContent, /Missing release identifier/);
});
