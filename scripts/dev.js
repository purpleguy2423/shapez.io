#!/usr/bin/env node

const { spawn } = require("child_process");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const modDir = path.join(rootDir, "shapez.io-mods", "gulp");
const gameDir = path.join(rootDir, "gulp");

const children = [];

function startProcess(name, command, cwd) {
    const child = spawn(command, {
        cwd,
        shell: true,
        stdio: "inherit",
        env: {
            ...process.env,
        },
    });

    child.on("exit", code => {
        if (code !== 0 && code !== null) {
            console.error(`${name} exited with code ${code}`);
        }
    });

    children.push(child);
    return child;
}

function stopAll() {
    for (const child of children) {
        if (!child.killed) {
            child.kill("SIGINT");
        }
    }
}

const buildStep = spawn("yarn", ["build:mods"], {
    cwd: rootDir,
    shell: true,
    stdio: "inherit",
    env: { ...process.env },
});

buildStep.on("exit", code => {
    if (code !== 0) {
        console.error("Mod build failed, exiting");
        process.exit(code ?? 1);
    }

    console.log("\nStarting dev servers...\n");
    startProcess("mod dev server", "yarn gulp main.build.dev", modDir);
    startProcess("game dev server", "cd gulp && NODE_OPTIONS=--openssl-legacy-provider yarn gulp", rootDir);
});

process.on("SIGINT", () => {
    stopAll();
    process.exit(0);
});

process.on("SIGTERM", () => {
    stopAll();
    process.exit(0);
});
