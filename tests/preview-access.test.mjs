import test from "node:test";
import assert from "node:assert/strict";
import { checkPreviewAccess, blockedPreviewResponse, isPublicProduction } from "../lib/preview-access.mjs";

const credentials = { username: "test-user", password: "only-a-test-password-0123456789" };
const auth = (value) => "Basic " + btoa(value);

test("only Netlify's production context is public", () => {
  assert.equal(isPublicProduction("production"), true);
  for (const context of [undefined, "dev", "branch-deploy", "deploy-preview"]) {
    assert.equal(isPublicProduction(context), false);
  }
});

test("missing or short credentials lock the app, even when a header is supplied", async () => {
  for (const config of [{}, { username: "test-user" }, { ...credentials, password: "short" }]) {
    assert.equal(await checkPreviewAccess(auth("test-user:anything"), config), "unconfigured");
  }
});
test("unauthenticated and malformed requests cannot enter", async () => {
  for (const value of [null, "", "Bearer arbitrary", "Basic %%%", auth("missing-colon"), auth("test-user:wrong"), auth("wrong:"+credentials.password), "Basic "+"a".repeat(5000)]) {
    assert.equal(await checkPreviewAccess(value, credentials), "denied");
  }
});
test("valid credentials are accepted and passwords can contain colons", async () => {
  assert.equal(await checkPreviewAccess(auth("test-user:"+credentials.password), credentials), "allowed");
  const withColon = { ...credentials, password: credentials.password+":suffix" };
  assert.equal(await checkPreviewAccess(auth("test-user:"+withColon.password), withColon), "allowed");
});
test("denials do not expose credentials and cannot be cached", async () => {
  for (const state of ["unconfigured", "denied"]) {
    const response = blockedPreviewResponse(state);
    assert.equal(response.status, state === "unconfigured" ? 503 : 401);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.match(response.headers.get("x-robots-tag"), /noindex/);
    assert.equal((await response.text()).includes(credentials.password), false);
  }
});
