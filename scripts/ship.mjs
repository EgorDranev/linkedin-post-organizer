#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const message = process.argv.slice(2).join(" ").trim();

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: options.capture ? "pipe" : "inherit",
    encoding: "utf8",
  });

  if (result.status !== 0) {
    const rendered = [command, ...args].join(" ");
    throw new Error(`${rendered} failed`);
  }

  return options.capture ? result.stdout.trim() : "";
}

function git(args, options) {
  return run("git", args, options);
}

function hasChanges() {
  return git(["status", "--porcelain"], { capture: true }).length > 0;
}

if (!message) {
  console.error('Usage: npm run ship -- "Short feature/fix summary"');
  process.exit(1);
}

const branch = git(["branch", "--show-current"], { capture: true });
if (!branch) {
  console.error("Refusing to ship from a detached HEAD.");
  process.exit(1);
}

if (["main", "master"].includes(branch) && process.env.SHIP_ALLOW_MAIN !== "1") {
  console.error(
    `Refusing to push directly from ${branch}. Ship from a feature branch, or set SHIP_ALLOW_MAIN=1.`
  );
  process.exit(1);
}

if (!hasChanges()) {
  console.log("No local changes to ship.");
  process.exit(0);
}

run("npm", ["run", "build"]);

git(["add", "-A"]);

const staged = git(["diff", "--cached", "--name-only"], { capture: true });
if (!staged) {
  console.log("No staged changes after build.");
  process.exit(0);
}

git(["commit", "-m", message]);
git(["push", "-u", "origin", branch]);

console.log(`Shipped ${branch}: ${message}`);
