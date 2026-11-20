// PC Pulse interfeysini yigʻadi: src/ → dist/ (hashlangan JS/CSS, public/ nusxasi, index.html).
// Mahalliy muhitda node_modules boʻlmasa, PP_NODE_PATH dagi paketlardan foydalanadi.
import * as esbuild from "esbuild";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const out = join(root, "dist");
const watch = process.argv.includes("--watch");
const nodePaths = process.env.PP_NODE_PATH ? process.env.PP_NODE_PATH.split(":") : [];

function build() {
  rmSync(out, { recursive: true, force: true });
  mkdirSync(join(out, "assets"), { recursive: true });
  cpSync(join(root, "public"), out, { recursive: true });
  const res = esbuild.buildSync({
    entryPoints: [join(root, "src/main.tsx")],
    bundle: true, minify: true, sourcemap: false, format: "esm", target: ["es2020", "safari15"],
    outdir: join(out, "assets"), entryNames: "app-[hash]", assetNames: "[name]-[hash]",
    loader: { ".svg": "file" }, external: ["*.woff", "*.woff2"],
    jsx: "automatic", legalComments: "none", metafile: true, nodePaths,
    define: { "process.env.NODE_ENV": '"production"' },
    logLevel: "warning",
  });
  const files = Object.keys(res.metafile.outputs).map((f) => f.replace(/\\/g, "/"));
  const js = files.find((f) => f.endsWith(".js")).split("/dist/")[1] || files.find((f) => f.endsWith(".js"));
  const css = (files.find((f) => f.endsWith(".css")) || "").split("dist/")[1];
  const rel = (f) => f.slice(f.indexOf("assets/"));
  let html = readFileSync(join(root, "index.html"), "utf8")
    .replace("<!--CSS-->", css ? `<link rel="stylesheet" href="${rel(css)}">` : "")
    .replace("<!--JS-->", `<script type="module" src="${rel(js)}"></script>`);
  writeFileSync(join(out, "index.html"), html);
  // service worker keshining nomi yigʻilgan fayllardan hosil qilinadi — har yangi versiyada eski kesh almashadi
  const ver = createHash("sha256").update(files.join("|") + html).digest("hex").slice(0, 10);
  const sw = readFileSync(join(out, "sw.js"), "utf8").replace("__BUILD__", ver).replace("__ASSETS__", JSON.stringify([rel(js), css ? rel(css) : null].filter(Boolean)));
  writeFileSync(join(out, "sw.js"), sw);
  const kb = (f) => (readFileSync(join(root, f.includes("/dist/") ? f.slice(f.indexOf("dist/")) : f)).length / 1024).toFixed(0);
  console.log(`tayyor: ${rel(js)} (${kb(files.find((f) => f.endsWith(".js")))} KB)${css ? `, ${rel(css)}` : ""} · sw ${ver}`);
}

build();
if (watch) {
  const { watch: fsWatch } = await import("node:fs");
  let t = null;
  fsWatch(join(root, "src"), { recursive: true }, () => { clearTimeout(t); t = setTimeout(() => { try { build(); } catch (e) { console.error(e.message); } }, 120); });
  console.log("kuzatilmoqda…");
}
if (!existsSync(join(out, "index.html"))) process.exit(1);
