import { test, expect } from "bun:test";
import { fireCodebaseExploration, fireTargetedResearch, fireRiskAssessment, type BackgroundResearchDeps } from "../background-research.js";

type CreateSession = BackgroundResearchDeps["createSession"];

function makeMockSession(responseContent: string): { session: any; dispose: () => void } {
  const subscribers: Array<(event: any) => void> = [];
  let disposed = false;
  return {
    session: {
      subscribe: (fn: (event: any) => void) => { subscribers.push(fn); },
      prompt: async (_p: string) => {
        for (const fn of subscribers) {
          fn({ type: "message_end", message: { role: "assistant", content: responseContent } });
        }
      },
    },
    dispose: () => { disposed = true; },
  };
}

function makeDeps(
  createSession: CreateSession,
): { deps: BackgroundResearchDeps; mailbox: Array<{ from: string; kind: string; content: string }> } {
  const mailbox: Array<{ from: string; kind: string; content: string }> = [];
  const deps: BackgroundResearchDeps = {
    createSession,
    postToMailbox: (from, kind, content) => { mailbox.push({ from, kind, content }); },
    projectRoot: "/tmp/fake-project",
  };
  return { deps, mailbox };
}

test("fireCodebaseExploration: creates session, posts findings to mailbox, disposes", async () => {
  let disposed = false;
  const { deps, mailbox } = makeDeps(async () => {
    const s = makeMockSession("Found a Python project with FastAPI, pyproject.toml, tests/ dir.");
    const origDispose = s.dispose;
    s.dispose = () => { disposed = true; origDispose(); };
    return s;
  });

  await fireCodebaseExploration(deps, "user wants to build a trading bot");
  expect(mailbox.length).toBe(1);
  expect(mailbox[0]!.from).toBe("explore");
  expect(mailbox[0]!.kind).toBe("note");
  expect(mailbox[0]!.content).toContain("Found a Python project");
  expect(disposed).toBe(true);
});

test("fireCodebaseExploration: empty response → no mailbox post, still disposes", async () => {
  let disposed = false;
  const { deps, mailbox } = makeDeps(async () => {
    const s = makeMockSession("");
    const origDispose = s.dispose;
    s.dispose = () => { disposed = true; origDispose(); };
    return s;
  });

  await fireCodebaseExploration(deps, "context");
  expect(mailbox.length).toBe(0);
  expect(disposed).toBe(true);
});

test("fireCodebaseExploration: createSession throws → no crash, no mailbox", async () => {
  const { deps, mailbox } = makeDeps(async () => { throw new Error("API down"); });
  await fireCodebaseExploration(deps, "context");
  expect(mailbox.length).toBe(0);
});

test("fireTargetedResearch: API keyword triggers conseil note", async () => {
  const { deps, mailbox } = makeDeps(async () => makeMockSession("Found REST API routes in src/routes/"));
  await fireTargetedResearch(deps, "I need a REST API for my trading bot", "user wants trading bot with API");
  expect(mailbox.length).toBeGreaterThanOrEqual(1);
  expect(mailbox.some(m => m.from === "conseil" && m.kind === "note")).toBe(true);
});

test("fireTargetedResearch: database keyword triggers conseil note", async () => {
  const { deps, mailbox } = makeDeps(async () => makeMockSession("Found SQLite database in db/"));
  await fireTargetedResearch(deps, "I need a database for storing trades", "context");
  expect(mailbox.some(m => m.from === "conseil")).toBe(true);
});

test("fireTargetedResearch: security keyword triggers metis flag", async () => {
  const { deps, mailbox } = makeDeps(async () => makeMockSession("Found auth middleware, but no rate limiting"));
  await fireTargetedResearch(deps, "I need authentication and security", "context");
  expect(mailbox.some(m => m.from === "metis" && m.kind === "flag")).toBe(true);
});

test("fireTargetedResearch: no keyword match → no sessions fired", async () => {
  let sessionCreated = false;
  const { deps, mailbox } = makeDeps(async () => { sessionCreated = true; return makeMockSession("x"); });
  await fireTargetedResearch(deps, "hello my name is Bob", "context");
  expect(sessionCreated).toBe(false);
  expect(mailbox.length).toBe(0);
});

test("fireTargetedResearch: multiple keywords fire multiple agents", async () => {
  const { deps, mailbox } = makeDeps(async () => makeMockSession("Found API + database config"));
  await fireTargetedResearch(deps, "I need an API with a postgres database and testing", "context");
  expect(mailbox.length).toBeGreaterThanOrEqual(3);
});

test("fireRiskAssessment: posts metis flag to mailbox", async () => {
  const { deps, mailbox } = makeDeps(async () => makeMockSession("Risk: user hasn't mentioned compliance or audit trails"));
  await fireRiskAssessment(deps, "user wants trading bot\nuser: I need a trading bot");
  expect(mailbox.length).toBe(1);
  expect(mailbox[0]!.from).toBe("metis");
  expect(mailbox[0]!.kind).toBe("flag");
});

test("fireRiskAssessment: empty response → no mailbox post", async () => {
  const { deps, mailbox } = makeDeps(async () => makeMockSession(""));
  await fireRiskAssessment(deps, "context");
  expect(mailbox.length).toBe(0);
});

test("fireRiskAssessment: createSession throws → no crash", async () => {
  const { deps, mailbox } = makeDeps(async () => { throw new Error("timeout"); });
  await fireRiskAssessment(deps, "context");
  expect(mailbox.length).toBe(0);
});