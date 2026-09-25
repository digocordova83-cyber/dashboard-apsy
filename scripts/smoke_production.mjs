import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";

const bundle = await readFile(
  new URL("../dist/index.js", import.meta.url),
  "utf8"
);
const forbiddenRuntimeImports = [
  "vite",
  "vite-plugin-manus-runtime",
  "@vitejs/plugin-react",
  "@tailwindcss/vite",
  "@builder.io/vite-plugin-jsx-loc",
];

for (const dependency of forbiddenRuntimeImports) {
  const escaped = dependency.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(?:from\\s+|import\\s*\\()?[\"']${escaped}[\"']`);
  if (pattern.test(bundle)) {
    throw new Error(
      `Production bundle imports development dependency: ${dependency}`
    );
  }
}

const port = 3200 + Math.floor(Math.random() * 200);
const child = spawn(process.execPath, ["dist/index.js"], {
  cwd: new URL("..", import.meta.url),
  env: { ...process.env, NODE_ENV: "production", PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"],
});

let output = "";
child.stdout.on("data", chunk => {
  output += chunk.toString();
});
child.stderr.on("data", chunk => {
  output += chunk.toString();
});

const sleep = milliseconds =>
  new Promise(resolve => setTimeout(resolve, milliseconds));
let healthy = false;

try {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (child.exitCode !== null) break;
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`);
      if (response.ok && (await response.text()).includes('id="root"')) {
        healthy = true;
        break;
      }
    } catch {
      // O processo ainda pode estar inicializando.
    }
    await sleep(250);
  }

  if (!healthy) {
    throw new Error(`Production server did not become healthy.\n${output}`);
  }
  console.log(`Production smoke test passed on port ${port}.`);
} finally {
  child.kill("SIGTERM");
  await Promise.race([
    new Promise(resolve => child.once("exit", resolve)),
    sleep(2_000).then(() => child.kill("SIGKILL")),
  ]);
}
