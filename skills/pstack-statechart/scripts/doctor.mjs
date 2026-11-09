#!/usr/bin/env node
// DSH-only, read-only companion to the unmodified pstack statechart runtime.
// Tool pins match upstream ae5650febf4320793844c12c4adaa937f417f8da.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TLC_TOOL = "http:tla2tools[url=https://github.com/tlaplus/tlaplus/releases/download/v1.7.4/tla2tools.jar,checksum=sha256:936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88]@1.7.4";
const JAVA_TOOL = "java@temurin-25";
const cwd = process.cwd();
const env = { ...process.env, MISE_CEILING_PATHS: cwd, MISE_AUTO_INSTALL: "false" };
const problems = [];
const [major, minor] = process.versions.node.split(".").map(Number);
const nodeSupported = (major === 22 && minor >= 18) || (major === 23 && minor >= 6) || major >= 24;
console.log(`Node: ${process.versions.node}${nodeSupported ? " (supported)" : " (unsupported)"}`);
if (!nodeSupported) problems.push("Use installed Node 22.18–22.x or 23.6+; this doctor never installs Node.");

function executable(command) {
  if (!command) return undefined;
  const candidates = command.includes(path.sep)
    ? [path.resolve(cwd, command)]
    : (process.env.PATH ?? "").split(path.delimiter).map((dir) => path.resolve(cwd, dir, command));
  return candidates.find((candidate) => {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return fs.statSync(candidate).isFile();
    } catch {
      return false;
    }
  });
}

function probe(file, args) {
  const result = spawnSync(file, args, { cwd, env, encoding: "utf8", timeout: 10_000, maxBuffer: 1 << 20 });
  return {
    ok: result.status === 0 && !result.error,
    stdout: result.stdout?.trim() ?? "",
    detail: result.error?.message ?? result.stderr?.trim() ?? `exit ${result.status}`,
    stderr: result.stderr?.trim() ?? "",
  };
}

const mise = executable("mise");
console.log(`mise: ${mise ?? "not found (optional with TLA2TOOLS and Java)"}`);
let jar = process.env.TLA2TOOLS ? path.resolve(cwd, process.env.TLA2TOOLS) : undefined;
let java = process.env.JAVA ? executable(process.env.JAVA) : undefined;
if (process.env.JAVA && !java) problems.push(`JAVA is not an executable: ${process.env.JAVA}`);

if (!jar && mise) {
  const found = probe(mise, ["where", TLC_TOOL]);
  if (found.ok && found.stdout) jar = path.resolve(cwd, found.stdout, "tla2tools.jar");
  else problems.push(`Pinned TLC is not available through mise: ${found.detail || found.stdout}`);
}
if (!process.env.JAVA && !process.env.TLA2TOOLS && mise) {
  const found = probe(mise, ["which", "java", "--tool", JAVA_TOOL]);
  if (found.ok && found.stdout) java = executable(found.stdout);
}
if (!process.env.JAVA && !java) java = executable("java");

if (jar) {
  try {
    fs.accessSync(jar, fs.constants.R_OK);
    if (!fs.statSync(jar).isFile()) throw new Error("not a regular file");
    console.log(`TLC jar: ${jar} (readable; no model run)`);
  } catch (error) {
    problems.push(`TLC jar is unavailable: ${jar}: ${error.message}`);
  }
} else {
  problems.push("Set TLA2TOOLS to the absolute path of an existing tla2tools.jar, or make the pinned TLC tool available in mise.");
}

if (java) {
  const version = probe(java, ["-version"]);
  const text = `${version.stdout}\n${version.stderr}`;
  const match = text.match(/\bversion\s+"(\d+)(?:\.(\d+))?/) ?? text.match(/\bopenjdk\s+(\d+)(?:\.(\d+))?/);
  const javaMajor = match ? Number(match[1] === "1" ? match[2] : match[1]) : 0;
  if (version.ok && javaMajor >= 11) console.log(`Java: ${java} (Java ${javaMajor})`);
  else problems.push(`Java 11+ is not usable at ${java}: ${version.detail || text.trim()}`);
} else {
  problems.push("Set JAVA to an existing Java 11+ executable, or put a working java on PATH. A macOS /usr/bin/java stub is not an installed runtime.");
}

console.log("Doctor is read-only: no installs, downloads, model checks, or output files.");
if (problems.length) {
  for (const problem of problems) console.error(`Missing: ${problem}`);
  console.error("Do not run the pipeline yet. If mise must provision pinned TLC/Temurin 25, explain the network/install side effects and obtain the user's agreement first. Otherwise arrange explicit prerequisites, then rerun this doctor.");
  process.exitCode = 1;
} else {
  const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
  const launcher = fileURLToPath(new URL("./statechart", import.meta.url));
  console.log("Ready. Keep these resolved paths in the pipeline invocation to bypass upstream provisioning; replace SPEC.tla and NEW_OUTPUT_DIRECTORY with your model and a new or empty output folder:");
  console.log(`TLA2TOOLS=${quote(jar)} JAVA=${quote(java)} MISE_AUTO_INSTALL=false ${quote(launcher)} SPEC.tla --out NEW_OUTPUT_DIRECTORY`);
}
