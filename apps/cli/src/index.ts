#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Command } from "commander";
import { PandaClient } from "@panda/sdk";

const program = new Command();

program
  .name("panda")
  .description("PANDA agent framework CLI")
  .version("0.1.0");

program
  .command("init")
  .description("Create a minimal PANDA project scaffold in the current directory")
  .action(() => {
    mkdirSync("panda", { recursive: true });
    writeFileSync(
      join("panda", "panda.config.json"),
      `${JSON.stringify({ daemonUrl: "http://127.0.0.1:4317" }, null, 2)}\n`,
    );
    console.log("Created panda/panda.config.json");
  });

program
  .command("dev")
  .description("Start the daemon and dashboard in development mode")
  .action(() => run("pnpm", ["--parallel", "--filter", "@panda/daemon", "--filter", "@panda/dashboard", "dev"]));

program
  .command("daemon")
  .description("Start the local PANDA daemon")
  .action(() => run("pnpm", ["--filter", "@panda/daemon", "dev"]));

program
  .command("dashboard")
  .description("Start the PANDA dashboard")
  .action(() => run("pnpm", ["--filter", "@panda/dashboard", "dev"]));

program
  .command("doctor")
  .description("Check local daemon connectivity")
  .action(async () => {
    const client = new PandaClient();
    try {
      const health = await client.health();
      console.log(`Daemon: ok (${health.name} ${health.version})`);
    } catch (error) {
      console.log("Daemon: unavailable");
      console.log(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

program
  .command("version")
  .description("Print PANDA version")
  .action(() => {
    console.log("0.1.0");
  });

program.parse();

function run(command: string, args: string[]) {
  const child = spawn(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  child.on("exit", (code) => {
    process.exitCode = code ?? 1;
  });
}
