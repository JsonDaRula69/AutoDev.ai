/**
 * Onboarding mailbox — team-mode integration for the Harbor Master session.
 *
 * Creates a team run at onboarding start with Conseil, Metis, and Momus as
 * observer members. These agents can post observations to the shared mailbox
 * without interrupting the conversation flow. The Harbor Master reads
 * mailbox messages via the `onboarding_check_mailbox` tool.
 *
 * Lifecycle:
 *   1. startOnboardingTeam() — creates team + observer members, returns runId
 *   2. Observers post messages via postObservation() (called by background sessions)
 *   3. Harbor Master calls onboarding_check_mailbox tool to read observations
 *   4. endOnboardingTeam() — cleans up the team run
 *
 * The observer agents (Conseil, Metis, Momus) have distinct roles:
 *   - Conseil: knowledge retrieval suggestions — "we should check the reference docs for X"
 *   - Metis: ambiguity flags — "the user said Y but that could mean A or B"
 *   - Momus: assumption challenges — "the HM is assuming Z, but that's unverified"
 */
import type { AgentToolResult, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import * as store from "../team-mode/store.js";

type ToolResult = AgentToolResult<unknown>;

const ONBOARDING_OBSERVERS = ["harbor-master", "conseil", "metis", "momus"] as const;

let _activeOnboardingTeam: string | null = null;

export function startOnboardingTeam(): string {
  if (_activeOnboardingTeam !== null) {
    return _activeOnboardingTeam;
  }
  const team = store.createTeam({
    name: "onboarding-mailbox",
    purpose: "Harbor Master onboarding observer mailbox",
    trigger: "onboarding",
    members: ONBOARDING_OBSERVERS.map((role) => ({ role })),
  });
  _activeOnboardingTeam = team.id;
  return team.id;
}

export function endOnboardingTeam(): void {
  if (_activeOnboardingTeam !== null) {
    store.deleteTeam(_activeOnboardingTeam);
    _activeOnboardingTeam = null;
  }
}

export function getActiveOnboardingTeamId(): string | null {
  return _activeOnboardingTeam;
}

export function postObservation(
  from: string,
  kind: "note" | "flag" | "question" | "blocker",
  content: string,
): { ok: boolean; error?: string } {
  if (_activeOnboardingTeam === null) {
    return { ok: false, error: "No active onboarding team" };
  }
  const result = store.addMessage({
    teamRunId: _activeOnboardingTeam,
    from,
    to: "harbor-master",
    content,
    kind,
  });
  if ("error" in result) {
    return { ok: false, error: result.error };
  }
  return { ok: true };
}

export function executeOnboardingCheckMailbox(): ToolResult {
  if (_activeOnboardingTeam === null) {
    return {
      content: [{ type: "text", text: "No active onboarding mailbox." }],
      details: { messages: [], active: false },
    };
  }
  const messages = store.getMessages(_activeOnboardingTeam);
  const formatted = messages.map((m) =>
    `[${m.kind}] from ${m.from}: ${m.content}`,
  );
  return {
    content: [
      {
        type: "text",
        text:
          messages.length === 0
            ? "Mailbox is empty. No observations from the crew yet."
            : `${messages.length} observation(s) from the crew:\n${formatted.join("\n")}`,
      },
    ],
    details: {
      messages: messages.map((m) => ({
        id: m.id,
        from: m.from,
        kind: m.kind,
        content: m.content,
        createdAt: m.createdAt,
      })),
      active: true,
      teamRunId: _activeOnboardingTeam,
    },
  };
}

export function _resetOnboardingMailbox(): void {
  _activeOnboardingTeam = null;
}

export function register(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "onboarding_check_mailbox",
    label: "Check Crew Mailbox",
    description:
      "Check for observations from the crew (Conseil, Metis, Momus) " +
      "posted during onboarding. These agents analyze the conversation " +
      "in the background and flag ambiguities, suggest knowledge retrieval, " +
      "or challenge assumptions — all without interrupting the interview. " +
      "Call this periodically to incorporate crew insights into the conversation.",
    parameters: Type.Object({}),
    execute: async () => executeOnboardingCheckMailbox(),
  });
}