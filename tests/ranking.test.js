import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const extract = (start, end) => html.slice(html.indexOf(start), html.indexOf(end));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

test("ranking retries after an offline authentication attempt and shares in-flight requests", async () => {
  let calls = 0;
  const session = { user: { id: "player" } };
  const client = { auth: { async getSession() {
    calls++;
    if (calls === 1) throw new Error("offline");
    return { data: { session } };
  } } };
  const context = vm.createContext({ supabaseAuthPromise: null, supabaseUserId: null,
    getSupabaseClient: () => client, console: { error() {} } });
  vm.runInContext(extract("function ensureSupabaseAuth(){", "function setRankingStatus("), context);
  const first = context.ensureSupabaseAuth();
  assert.equal(first, context.ensureSupabaseAuth());
  assert.equal(await first, null);
  assert.equal(await context.ensureSupabaseAuth(), session);
  assert.equal(calls, 2);
  assert.equal(context.supabaseUserId, "player");
});

test("score submission captures the completed run before awaiting authentication", async () => {
  const auth = deferred();
  let submitted;
  const context = vm.createContext({ playerName: "One", progress: 3, best: 3000000000,
    rankingScoreForCurrentRun: () => 4000, ensureSupabaseAuth: () => auth.promise,
    getSupabaseClient: () => ({ rpc: async (_, payload) => { submitted = payload; return {}; } }),
    console: { log() {}, error() {} }, setRankingStatus() {} });
  vm.runInContext(extract("async function submitLeaderboardScore(", "function syncLeaderboardScore("), context);
  const pending = context.submitLeaderboardScore("stage_clear");
  context.playerName = "Two";
  context.progress = 4;
  context.best = 4000000000;
  auth.resolve({ user: { id: "player" } });
  assert.equal(await pending, true);
  assert.equal(submitted.p_player_name, "One");
  assert.equal(submitted.p_cleared_stage, 3);
  assert.equal(submitted.p_high_score, 3000000000);
});

test("a slow old ranking response cannot replace the latest result", async () => {
  const requests = [deferred(), deferred()];
  let next = 0;
  const rendered = [];
  const query = { select() { return this; }, order() { return this; }, limit() { return requests[next++].promise; } };
  const context = vm.createContext({ rankingLoadGeneration: 0, ensureSupabaseAuth: async () => ({}),
    getSupabaseClient: () => ({ from: () => query }), setRankingStatus() {},
    renderRankingRows: rows => rendered.push(rows), console: { error() {} } });
  vm.runInContext(extract("async function loadRanking(){", "async function submitLeaderboardScore("), context);
  const first = context.loadRanking();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(next, 1);
  const second = context.loadRanking();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(next, 2);
  requests[1].resolve({ data: ["new"] });
  await second;
  requests[0].resolve({ data: ["old"] });
  await first;
  assert.deepEqual(rendered, [["new"]]);
});
