import { spawn } from "node:child_process";
import { once } from "node:events";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";

const port = 3107;
const origin = "http://127.0.0.1:" + port;
const password = "ci-only-test-password-0123456789";
const authorization = "Basic " + Buffer.from("test-user:" + password).toString("base64");
async function runScenario(configured) {
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", String(port)], {
    stdio: ["ignore", "ignore", "inherit"],
    env: { ...process.env, NODE_ENV: "production", PREVIEW_ACCESS_USERNAME: configured ? "test-user" : "", PREVIEW_ACCESS_PASSWORD: configured ? password : "" }
  });
  const exited = once(child, "exit");
  let spawnError;
  child.on("error", error => { spawnError = error; });
  try {
    let ready = false;
    for (let attempt=0; attempt<100; attempt++) {
      if (spawnError) throw spawnError;
      if (child.exitCode !== null) throw new Error("Production server exited before checks.");
      try { await fetch(origin, { signal: AbortSignal.timeout(1000) }); ready=true; break; } catch { await delay(250); }
    }
    assert.equal(ready, true, "Production server must become ready");
    for (const path of ["/", "/api/status", "/sample.csv", "/_next/static/probe.js", "/?__nextDefaultLocale=en"]) {
      const denied = await fetch(origin + path);
      assert.equal(denied.status, configured ? 401 : 503, path + " must be protected");
      assert.match(denied.headers.get("cache-control") || "", /no-store/);
    }
    const subrequest = await fetch(origin + "/api/status", {
      headers: { "x-middleware-subrequest": "proxy:proxy:proxy:proxy:proxy" }
    });
    assert.notEqual(subrequest.status, 200, "A spoofed middleware header must not grant access");
    if (configured) {
      const wrong = await fetch(origin, { headers: { authorization: "Basic " + Buffer.from("test-user:wrong").toString("base64") } });
      assert.equal(wrong.status, 401);
      const home = await fetch(origin, { headers: { authorization } });
      assert.equal(home.status, 200);
      assert.match(await home.text(), /Fictional sample/);
      const status = await fetch(origin + "/api/status", { headers: { authorization } });
      assert.equal(status.status, 200);
      assert.deepEqual(await status.json(), { status: "private-preview", conversionAvailable: false });
    }
  } finally {
    child.kill("SIGTERM");
    await Promise.race([exited, delay(5000)]);
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
      await exited;
    }
  }
}

async function runPublicProduction() {
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", String(port)], {
    stdio: ["ignore", "ignore", "inherit"],
    env: { ...process.env, NODE_ENV: "production", CONTEXT: "production", PREVIEW_ACCESS_USERNAME: "", PREVIEW_ACCESS_PASSWORD: "" }
  });
  const exited = once(child, "exit");
  try {
    let response;
    for (let attempt=0; attempt<100; attempt++) {
      try { response = await fetch(origin, { signal: AbortSignal.timeout(1000) }); break; } catch { await delay(250); }
    }
    assert.equal(response?.status, 200, "Production home page must be public");
    assert.match(await response.text(), /Document to Excel/);
    const status = await fetch(origin + "/api/status");
    assert.equal(status.status, 200, "Production status endpoint must be public");
  } finally {
    child.kill("SIGTERM");
    await Promise.race([exited, delay(5000)]);
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
      await exited;
    }
  }
}

if (process.env.CONTEXT === "production") {
  await runPublicProduction();
  console.log("Production smoke checks passed: public routes respond without preview credentials.");
} else {
  await runScenario(false);
  await runScenario(true);
  console.log("Preview smoke checks passed: access fails closed and authorized routes respond.");
}
