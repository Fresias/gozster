// Shared by the user-level dispatchers (claude-code, antigravity) and their installers:
//   - resolveRepo: the harness repo a tool call touches, also when the session starts outside it (Multica <workdir>/).
//   - installKit / syncKit: the kit copy those dispatchers run (<hooksDir>/harness-kit), installed atomically and kept
//     equal to origin/main, so a branch can never weaken its own rules and a merge reaches every session.
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

export const GUARD = path.join("harness-kit", "core", "guard", "guard-cli.mjs");
export const KIT_PARTS = ["core", "adapters"];
export const MARKER = ".installed.json";
/** Installed dispatcher file (next to the kit) -> its source inside the kit. */
export const DISPATCHERS = {
  "harness-dispatch.mjs": "core/plugins/claude-code/dispatch.mjs",
  "harness-dispatch-antigravity.mjs": "core/plugins/antigravity/dispatch.mjs",
};

/** A real git checkout (dir or worktree file `.git`) that vendors the harness guard; stray kit copies don't count. */
function hasGuard(dir) {
  return existsSync(path.join(dir, GUARD)) && existsSync(path.join(dir, ".git"));
}

/** Walk up from dir to the first ancestor that contains the harness guard. */
function upward(dir) {
  let cur = path.resolve(dir);
  for (;;) {
    if (hasGuard(cur)) return cur;
    const parent = path.dirname(cur);
    if (parent === cur) return "";
    cur = parent;
  }
}

/** Single child repo with a guard (Multica workdir layout). */
function child(dir) {
  try {
    const found = readdirSync(dir, { withFileTypes: true })
      .filter((e) => (e.isDirectory() || e.isSymbolicLink()) && !e.name.startsWith("."))
      .map((e) => path.join(dir, e.name))
      .filter(hasGuard);
    return found.length === 1 ? found[0] : "";
  } catch {
    return "";
  }
}

/** Repo of the first file path that lives in one, else the repo at/above cwd, else the single repo below cwd. */
export function resolveRepo(cwd, filePaths = []) {
  const base = cwd || process.cwd();
  for (const p of filePaths) {
    if (typeof p === "string" && p) {
      const hit = upward(path.dirname(path.resolve(base, p)));
      if (hit) return hit;
    }
  }
  return upward(base) || child(base);
}

const blobSha = (buf) => createHash("sha1").update(`blob ${buf.length}\0`).update(buf).digest("hex");

/** Kit files (core + adapters) under root: Map<posix path relative to the kit, Buffer>. */
export function readKit(root) {
  const files = new Map();
  const walk = (rel) => {
    const abs = path.join(root, rel);
    if (!existsSync(abs)) return;
    for (const e of readdirSync(abs, { withFileTypes: true })) {
      const r = `${rel}/${e.name}`;
      if (e.isDirectory()) walk(r);
      else files.set(r, readFileSync(path.join(root, r)));
    }
  };
  KIT_PARTS.forEach(walk);
  return files;
}

/** Order-independent fingerprint of a kit file map (git blob ids). */
export function kitHash(files) {
  const h = createHash("sha256");
  for (const rel of [...files.keys()].sort()) h.update(`${rel}\0${blobSha(files.get(rel))}\n`);
  return h.digest("hex");
}

function writeAtomic(file, data) {
  const tmp = `${file}.tmp-${process.pid}-${randomBytes(4).toString("hex")}`;
  writeFileSync(tmp, data);
  renameSync(tmp, file);
}

function readMarker(kitRoot) {
  try {
    return JSON.parse(readFileSync(path.join(kitRoot, MARKER), "utf8"));
  } catch {
    return {};
  }
}

/**
 * Install files as <hooksDir>/harness-kit atomically: write a temp dir, then swap it in with rename. A concurrent
 * reader sees the old or the new complete kit (or, for an instant, none). If another process wins the swap, its
 * copy (same source) stays. Returns true when this call's copy was installed.
 */
export function installKit(hooksDir, files, meta) {
  const target = path.join(hooksDir, "harness-kit");
  const tag = `${process.pid}-${randomBytes(4).toString("hex")}`;
  const tmp = `${target}.tmp-${tag}`;
  const old = `${target}.old-${tag}`;
  try {
    for (const [rel, data] of files) {
      mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true });
      writeFileSync(path.join(tmp, rel), data);
    }
    writeFileSync(path.join(tmp, MARKER), JSON.stringify(meta) + "\n");
    let moved = false;
    try {
      renameSync(target, old);
      moved = true;
    } catch {
      // absent, or another process is swapping it right now
    }
    try {
      renameSync(tmp, target);
      return true;
    } catch {
      if (moved && !existsSync(target)) renameSync(old, target);
      return false;
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
    // Never drop the previous copy unless a complete kit is in place.
    if (existsSync(path.join(target, MARKER))) rmSync(old, { recursive: true, force: true });
  }
}

/** Copy a dispatcher source next to the kit (atomic replace) unless it is already identical. */
export function installDispatcher(hooksDir, name, data) {
  const file = path.join(hooksDir, name);
  if (existsSync(file) && readFileSync(file).equals(data)) return false;
  mkdirSync(hooksDir, { recursive: true });
  writeAtomic(file, data);
  return true;
}

/** Install the kit and one dispatcher from a checkout (install.mjs). Returns true when something changed. */
export function installLocal(hooksDir, kitDir, dispatcherName) {
  const files = readKit(kitDir);
  const current = readKit(path.join(hooksDir, "harness-kit"));
  let changed = false;
  if (kitHash(files) !== kitHash(current)) changed = installKit(hooksDir, files, { source: "checkout", sha: "" }) || changed;
  const src = files.get(DISPATCHERS[dispatcherName]);
  return installDispatcher(hooksDir, dispatcherName, src) || changed;
}

/** True when the installed kit and dispatcher equal the checkout (install.mjs --check). */
export function isInstalled(hooksDir, kitDir, dispatcherName) {
  const files = readKit(kitDir);
  const file = path.join(hooksDir, dispatcherName);
  return (
    kitHash(files) === kitHash(readKit(path.join(hooksDir, "harness-kit"))) &&
    existsSync(file) &&
    readFileSync(file).equals(files.get(DISPATCHERS[dispatcherName]))
  );
}

function git(repo, args, input) {
  const r = spawnSync("git", ["-C", repo, ...args], { input, maxBuffer: 64 * 1024 * 1024 });
  if (r.error || r.status !== 0) throw new Error(`git ${args[0]} failed`);
  return r.stdout;
}

/** Kit blobs at a commit: Map<path relative to the kit, blob sha>. */
function listKit(repo, sha) {
  const out = git(repo, ["ls-tree", "-r", "-z", sha, "--", ...KIT_PARTS.map((p) => `harness-kit/${p}`)]).toString("utf8");
  const blobs = new Map();
  for (const entry of out.split("\0")) {
    const m = /^\d+ blob ([0-9a-f]+)\tharness-kit\/(.+)$/.exec(entry);
    if (m) blobs.set(m[2], m[1]);
  }
  return blobs;
}

/** Contents of blobs, read in one `git cat-file --batch`. */
function readBlobs(repo, blobs) {
  const shas = [...new Set(blobs.values())];
  const out = git(repo, ["cat-file", "--batch"], shas.join("\n") + "\n");
  const bySha = new Map();
  let at = 0;
  while (at < out.length) {
    const nl = out.indexOf(10, at);
    const [sha, , size] = out.subarray(at, nl).toString("utf8").split(" ");
    bySha.set(sha, out.subarray(nl + 1, nl + 1 + Number(size)));
    at = nl + 1 + Number(size) + 1;
  }
  return new Map([...blobs].map(([rel, sha]) => [rel, bySha.get(sha)]));
}

/**
 * Keep <hooksDir>/harness-kit (and the dispatchers installed next to it) equal to origin/main of repo.
 * Cached per origin/main sha in the kit marker: one comparison per new sha, not per tool call.
 * Never reads the working branch. Any git failure leaves the installed copy as it is.
 * Returns "cached" | "unchanged" | "synced" | "skipped".
 */
export function syncKit(repo, hooksDir, log = (line) => process.stderr.write(line + "\n")) {
  const kitRoot = path.join(hooksDir, "harness-kit");
  try {
    const marker = readMarker(kitRoot);
    const sha = git(repo, ["rev-parse", "--verify", "-q", "origin/main^{commit}"]).toString("utf8").trim();
    if (!sha) return "skipped";
    if (marker.sha === sha) return "cached";
    const blobs = listKit(repo, sha);
    if (!blobs.has(DISPATCHERS["harness-dispatch.mjs"]) || !blobs.has("core/guard/guard-cli.mjs")) return "skipped";

    const installed = readKit(kitRoot);
    const kitSame = installed.size === blobs.size && [...blobs].every(([rel, b]) => installed.has(rel) && blobSha(installed.get(rel)) === b);
    const staleDispatchers = Object.entries(DISPATCHERS).filter(([name, rel]) => {
      const file = path.join(hooksDir, name);
      return existsSync(file) && blobs.has(rel) && blobSha(readFileSync(file)) !== blobs.get(rel);
    });
    if (kitSame && staleDispatchers.length === 0) {
      writeAtomic(path.join(kitRoot, MARKER), JSON.stringify({ ...marker, sha }) + "\n");
      return "unchanged";
    }

    const files = readBlobs(repo, blobs);
    if (!kitSame) installKit(hooksDir, files, { source: "origin/main", sha });
    else writeAtomic(path.join(kitRoot, MARKER), JSON.stringify({ source: "origin/main", sha }) + "\n");
    for (const [name, rel] of staleDispatchers) installDispatcher(hooksDir, name, files.get(rel));
    const from = marker.sha ? marker.sha.slice(0, 7) : marker.source || "unknown";
    log(`harness-kit: installed guard synced from origin/main (${from} -> ${sha.slice(0, 7)})`);
    return "synced";
  } catch {
    return "skipped";
  }
}
