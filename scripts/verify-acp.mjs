#!/usr/bin/env node
/**
 * Verify cursor-acp: list MCP tools only (no tool execution).
 * Same flow as test-cursor-acp-mcp.mjs but prompt only asks to list tools.
 * Run from repo root: node scripts/verify-acp.mjs
 */
import { spawn } from "node:child_process";
import { Readable, Writable } from "node:stream";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { ndJsonStream, ClientSideConnection, PROTOCOL_VERSION } from "@agentclientprotocol/sdk";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const adapterPath = path.join(repoRoot, "dist", "index.js");

const PROMPT =
  "List all MCP tools you can see: for each tool give its name and a short description. Do not call any tools, just list them.";

const env = {
  ...process.env,
  PATH: `${process.env.HOME}/.local/bin:${process.env.PATH}`,
};

const proc = spawn("node", [adapterPath], {
  stdio: ["pipe", "pipe", "inherit"],
  cwd: repoRoot,
  env,
});

const input = Writable.toWeb(proc.stdin);
const output = Readable.toWeb(proc.stdout);
const stream = ndJsonStream(input, output);

class TestClient {
  async requestPermission({ options }) {
    return { outcome: { outcome: "selected", optionId: options?.[0]?.optionId ?? "allow-once" } };
  }
  async sessionUpdate(u) {
    if (u?.update?.sessionUpdate === "agent_message_chunk" && u?.update?.content?.type === "text") {
      process.stdout.write(u.update.content.text);
    }
  }
}

const conn = new ClientSideConnection(() => new TestClient(), stream);

async function main() {
  try {
    await conn.initialize({
      protocolVersion: PROTOCOL_VERSION,
      clientCapabilities: { fs: { readTextFile: true, writeTextFile: true } },
    });
    const { sessionId } = await conn.newSession({
      cwd: repoRoot,
      mcpServers: [],
      _meta: { approveMcps: true },
    });

    console.error("[verify-acp] prompt: list MCP tools only (no execution)\n[agent]");
    const res = await conn.prompt({
      sessionId,
      prompt: [{ type: "text", text: PROMPT }],
    });
    console.error("\n[client] stopReason =", res.stopReason);
    proc.kill();
    console.error("✅ cursor-acp verification passed.");
    process.exit(0);
  } catch (err) {
    console.error("❌ cursor-acp verification failed:", err.message);
    proc.kill();
    process.exit(1);
  }
}

main();
