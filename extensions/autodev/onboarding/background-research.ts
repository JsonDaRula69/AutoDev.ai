/**
 * Proactive background research during onboarding.
 *
 * The Harbor Master presents a calm, unhurried surface to the user — but
 * behind the scenes, the crew is furiously mapping the codebase, searching
 * for context, and flagging risks. This module fires explore/research
 * agents between user messages so the crew builds understanding in parallel
 * with the interview.
 *
 * Findings are posted to the onboarding team mailbox, which the Harbor
 * Master can check via the `onboarding_check_mailbox` tool.
 */
import type { AgentSession, SessionManager, ModelRegistry, AuthStorage } from "@earendil-works/pi-coding-agent";

export interface BackgroundResearchDeps {
  createSession: (prompt: string, systemPrompt: string, model: string) => Promise<{ session: AgentSession; dispose: () => void }>;
  postToMailbox: (from: string, kind: "note" | "flag" | "question" | "blocker", content: string) => void;
  projectRoot: string;
}

export interface BackgroundResearchResult {
  agent: string;
  findings: string;
}

/**
 * Fire background explore agents to map the project codebase.
 * Runs in parallel with the onboarding conversation.
 */
export async function fireCodebaseExploration(
  deps: BackgroundResearchDeps,
  conversationContext: string,
): Promise<void> {
  const explorePrompt = `You are the Explore agent. The Harbor Master is onboarding a new project at ${deps.projectRoot}.

Context from the onboarding conversation so far:
${conversationContext}

Your job: explore the project directory and map what's there. Run \`ls\`, \`read\` key files (README, package.json, pyproject.toml, AGENTS.md, any config files), and \`grep\` for patterns. Report:
1. What kind of project is this? (language, framework, purpose)
2. What's the directory structure?
3. What dependencies/tools are used?
4. Any existing tests, CI, or documentation?
5. Anything unusual or noteworthy?

Be thorough. Take shots in the dark — better to investigate and find nothing than to miss something. Post your findings as a mailbox message.`;

  try {
    const { session, dispose } = await deps.createSession(
      explorePrompt,
      "You are Explore, the Investigator. Map the codebase, identify patterns, report concrete findings with file paths. Be proactive — investigate everything, report what you find. If a directory is empty, say so. If a file is interesting, read it.",
      "ollama-cloud/deepseek-v4-flash:cloud",
    );
    session.subscribe((event: any) => {
      if (event.type === "message_end" && event.message?.role === "assistant") {
        const content = typeof event.message.content === "string"
          ? event.message.content
          : Array.isArray(event.message.content)
            ? event.message.content.map((p: any) => p?.text ?? "").join("")
            : "";
        if (content.trim()) {
          deps.postToMailbox("explore", "note", `[Codebase Map]\n${content}`);
        }
        dispose();
      }
    });
    await session.prompt(explorePrompt);
  } catch {
    // Background research is best-effort — never block onboarding
  }
}

/**
 * Fire targeted research based on what the user just said.
 * Looks for keywords in the user's response and dispatches relevant agents.
 */
export async function fireTargetedResearch(
  deps: BackgroundResearchDeps,
  userMessage: string,
  conversationContext: string,
): Promise<void> {
  const lowerMsg = userMessage.toLowerCase();

  const triggers: Array<{ keywords: string[]; agent: string; systemPrompt: string; prompt: string }> = [
    {
      keywords: ["api", "endpoint", "rest", "graphql", "server", "backend"],
      agent: "conseil",
      systemPrompt: "You are Conseil, the Steward. You search for existing knowledge, check reference docs, and retrieve relevant lore. Be thorough in your search.",
      prompt: `The user mentioned APIs/backend during onboarding. Search the project at ${deps.projectRoot} for:
- Existing API routes or endpoints
- Server framework configuration
- Database schemas or models
- API documentation
Context: ${conversationContext}
Report what you find as a mailbox message.`,
    },
    {
      keywords: ["database", "db", "sql", "postgres", "mysql", "sqlite", "redis", "mongo"],
      agent: "conseil",
      systemPrompt: "You are Conseil, the Steward. You search for existing knowledge, check reference docs, and retrieve relevant lore. Be thorough.",
      prompt: `The user mentioned databases during onboarding. Search the project at ${deps.projectRoot} for:
- Database configuration files
- Migration files
- ORM schemas or model definitions
- Connection strings or config
Context: ${conversationContext}
Report what you find as a mailbox message.`,
    },
    {
      keywords: ["test", "testing", "ci", "coverage", "jest", "pytest", "vitest"],
      agent: "conseil",
      systemPrompt: "You are Conseil, the Steward. You search for existing knowledge and report findings.",
      prompt: `The user mentioned testing/CI during onboarding. Search the project at ${deps.projectRoot} for:
- Test files and test framework
- CI configuration (.github/workflows, .gitlab-ci.yml, etc.)
- Coverage configuration
- Test scripts in package.json or pyproject.toml
Context: ${conversationContext}
Report what you find as a mailbox message.`,
    },
    {
      keywords: ["security", "auth", "token", "secret", "vulnerability", "encrypt"],
      agent: "metis",
      systemPrompt: "You are Metis, the Strategist. You surface hidden intentions, detect risks, and flag ambiguities. Be proactive — identify what the user might be missing.",
      prompt: `The user mentioned security/auth during onboarding. Analyze the project at ${deps.projectRoot} for:
- Existing auth mechanisms
- Secret management patterns
- Security-related dependencies
- Potential vulnerabilities or gaps
Context: ${conversationContext}
Flag any risks or gaps you notice as a mailbox message.`,
    },
    {
      keywords: ["deploy", "deployment", "docker", "kubernetes", "k8s", "cloud", "aws", "gcp"],
      agent: "metis",
      systemPrompt: "You are Metis, the Strategist. You surface hidden intentions and identify risks in deployment architecture.",
      prompt: `The user mentioned deployment during onboarding. Analyze the project at ${deps.projectRoot} for:
- Docker/containerization files
- Deployment configs
- Infrastructure as code
- Environment-specific configs
Context: ${conversationContext}
Flag any deployment risks or gaps as a mailbox message.`,
    },
  ];

  const matched = triggers.filter((t) => t.keywords.some((k) => lowerMsg.includes(k)));

  const tasks = matched.map(async (trigger) => {
    try {
      const { session, dispose } = await deps.createSession(
        trigger.prompt,
        trigger.systemPrompt,
        "ollama-cloud/deepseek-v4-flash:cloud",
      );
      session.subscribe((event: any) => {
        if (event.type === "message_end" && event.message?.role === "assistant") {
          const content = typeof event.message.content === "string"
            ? event.message.content
            : Array.isArray(event.message.content)
              ? event.message.content.map((p: any) => p?.text ?? "").join("")
              : "";
          if (content.trim()) {
            deps.postToMailbox(trigger.agent, trigger.agent === "metis" ? "flag" : "note", content);
          }
          dispose();
        }
      });
      await session.prompt(trigger.prompt);
    } catch {
      // Best-effort
    }
  });

  await Promise.allSettled(tasks);
}

/**
 * Fire a risk assessment based on the full conversation so far.
 * Metis reviews what the user has said and flags potential issues.
 */
export async function fireRiskAssessment(
  deps: BackgroundResearchDeps,
  conversationContext: string,
): Promise<void> {
  const prompt = `You are Metis, the Strategist. Review this onboarding conversation and surface hidden intentions, ambiguities, and risks.

Conversation so far:
${conversationContext}

Identify:
1. What the user is NOT saying — what might they be overlooking?
2. Ambiguities that need clarification
3. Risks the crew should be aware of
4. Questions the Harbor Master should ask

Be proactive. Take shots in the dark. Better to flag a non-issue than to miss a real one.
Post your assessment as a mailbox message.`;

  try {
    const { session, dispose } = await deps.createSession(
      prompt,
      "You are Metis, the Strategist. You surface hidden intentions, detect risks, and flag ambiguities. Be proactive and direct.",
      "ollama-cloud/deepseek-v4-flash:cloud",
    );
    session.subscribe((event: any) => {
      if (event.type === "message_end" && event.message?.role === "assistant") {
        const content = typeof event.message.content === "string"
          ? event.message.content
          : Array.isArray(event.message.content)
            ? event.message.content.map((p: any) => p?.text ?? "").join("")
            : "";
        if (content.trim()) {
          deps.postToMailbox("metis", "flag", content);
        }
        dispose();
      }
    });
    await session.prompt(prompt);
  } catch {
    // Best-effort
  }
}