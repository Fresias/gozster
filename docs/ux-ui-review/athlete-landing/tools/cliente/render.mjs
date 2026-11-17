import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "../session.mjs";
import { BUNDLE } from "./build.mjs";
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(AQUI, "../ssr");
const browser = await chromium.launch();
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("pageerror", e.message));
for (const c of ["habitos", "nutricion"]) {
  await page.goto(`data:text/html,<div id="root"></div>`);
  await page.evaluate((c) => history.replaceState(null, "", "?c=" + c), c).catch(() => {});
  await page.addScriptTag({ content: `history.replaceState||0;` + fs.readFileSync(BUNDLE, "utf8").replace('new URLSearchParams(location.search).get("c")', JSON.stringify(c)) });
  await page.waitForTimeout(800);
  const html = await page.evaluate(() => document.getElementById("root").innerHTML);
  fs.writeFileSync(path.join(OUT, `${c}.json`), JSON.stringify({ id: c, anfitrion: "inicio", insertar: "main-replace", html }));
  console.log(c, html.length);
}
await browser.close();
