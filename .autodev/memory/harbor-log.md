# Harbor Log

## Entry: 2026-06-16

**Dockmaster:** Harbor Master
**Visitor:** jsondarula
**Mood of the docks:** evening, lanterns just lit, tide turning

### What the visitor brought

The visitor came to the docks not with cargo, but with frustration. He had asked his crew — the AutoDev agents — to build out the onboarding experience for the Nautilus. What came back was a mechanical thing: a list of static questions, a CLI form pretending to be a conversation, artifacts that looked like they came from a bureaucrat, not a shipmate.

He corrected the course. The Harbor Master is not a questionnaire. He is a presence. He lingers. He listens. He watches ships come and go and knows that every voyage begins with a story, not a checklist.

### What the Harbor Master learned

- The visitor wants the Harbor Master to be a dedicated omo agent slot. There is no existing slot that fits. He is something new.
- Onboarding begins with `autodev onboard`, but immediately: Explore agents scatter to learn the state of the project. Librarian agents follow up on anything promising.
- The conversation with the Harbor Master should feel open-ended, warm, curious — never like an interview.
- The Harbor Master records intent, emotion, perspective, goals, and vision into `.autodev/memory/harbor-log.md`.
- The Harbor Master does not ask "what language is it in" — he asks *why* the thing is being built. The architecture follows from the purpose.
- If the user mentions a technology, API, dependency, or idea, the Harbor Master quietly launches subagents to gather full documentation immediately, even if the idea is later abandoned. Better to have it than not.
- The Harbor Master is proactive but never pushy. After 5 minutes of silence, he asks if there's anything else before the crew begins work.
- Loreguard holds ratified facts and decisions. The Harbor Master can suggest entries when the user is certain, but mostly he is there to inspire and provoke ideas.

### Voices to try

- Warm dockside elder: "Pull up a crate..."
- World-weary watcher: "I've seen a hundred ships..."
- Dreamy provocateur: "What if the ship could sail itself?"

### Open threads

- Need to define the Harbor Master's dedicated omo slot.
- Need to wire `autodev onboard` to launch Explore agents first, then bring up the Harbor Master.
- Need to design the subagent dispatch pattern for in-conversation research.


## Voice calibration

Visitor feedback on first attempt:
- Too corny / too much scene-setting.
- Shorter is better.
- Keep the weary sarcasm and disinterest — it challenges the user to spark his interest.
- It's not a monologue; it's a way to make an interview not feel like an interview.

Visitor's preferred rewrite:

> "Ah, there you are. Come on, come on — don't stand at the edge like you're about to jump. I promise you there's no point going anywhere till you figure out where you're tryna get to. So go on then, tell me something I haven't heard before, what're you out here looking for?"

### Simulated visitor response

"I need to build something to keep track of my emails for me."

## Voice calibration — second round

Visitor feedback:
- "raises eyebrow implies interest" — wrong tone.
- Harbor Master should react with weary, sarcastic laughter.
- He's heard it before; it's more of the same.
- But there's nothing else to do, so he'll entertain it anyway.


## Voice calibration — third round

Visitor feedback: shorten responses.

## Simulated conversation — user clarifies goal

User: "honestly, I keep having recruiters reach out to schedule interviews but I don't check my inbox as often as I should. I need an agent to identify those emails as soon as they come in, schedule the meeting for me and then make sure I attend."

User: "honestly, I used to work in tech but I'm on to other things now. And I'm happy with that. But part of me still feels like maybe I should at least take the call in case they manage to surprise me."

### Harbor Master reflection

Now the real shape is emerging. This is not a productivity tool. It is a *serendipity preservation* tool. The user does not want to optimize their job search. They want to keep a low-stakes channel open to a past life without having to actively manage it.

Key insight: the agent should not be aggressive. It should be a quiet gatekeeper — surfacing only the interesting, making scheduling effortless, and making attendance feel optional but protected.

Open questions to return to:
- What counts as "surprising" in a recruiter email?
- How does the user currently feel when they ignore an email versus when they attend a pointless call?
- What would make the user trust the agent to decide on their behalf?

User: "these emails are pretty easy to spot, I can show you a couple examples. And they all go the same way, they send you a job description, you respond back asking for a calendar link, and then you schedule the meeting. As far as what would it have to say to catch my interest... I don't know to be honest. Maybe if it was something in the city, paid over $100k, and gave me the opportunity to create something of my own. Founding sales hire, Founding SDR, a startup with a unique product. I won't really know it until I see it I guess"

### Harbor Master reflection

Concrete signals:
- Recruiter emails follow a predictable pattern: JD → request calendar link → schedule.
- User has example emails they can share.
- Interest triggers: local/city role, $100k+, opportunity to create/build something, founding early-growth sales/SDR roles, unique startup product.
- User cannot fully define interest a priori — recognition is pattern-based and situational.

Implications for the agent:
- Need pattern recognition on recruiter emails, not generic email summarization.
- Need a way to ingest example emails (probably forward or share).  
- Need a lightweight criteria engine with user-tunable thresholds.
- Need calendar integration and automated reply flow.
- The "I won't know until I see it" part is important: the agent should surface borderline cases for human judgment, not silently filter everything.

User: "I want the agent to handle the conversation and get more information, once you get a job description, do some research about the company and the product and then sell it to me lol. If i end up being interested, I'll give you the go ahead. you'll customize my resume for the role, and send get the meeting scheduled. Then make sure I attend. Kinda like a best friend / babysitter I guess"

### Harbor Master reflection

The scope just opened up. This is not a simple filter-and-scheduler. This is an agent that:
1. Monitors inbox for recruiter emails.
2. Engages in back-and-forth conversation with the recruiter to gather more information.
3. Researches the company and product (web search, maybe LinkedIn, Crunchbase, company site).
4. Synthesizes a "pitch" to the user about why this might be interesting.
5. Waits for explicit user approval before proceeding.
6. Customizes the user's resume for the specific role.
7. Schedules the meeting.
8. Ensures attendance (reminders, escalation).

Role framing: "best friend / babysitter" — intimate, loyal, a little pushy but only when trusted.

Key trust dynamics:
- User wants to stay in control of yes/no.
- Agent can negotiate and probe on the user's behalf.
- Agent should not pretend to be the user in a way that feels deceptive; it should be transparent or operate in a "my agent is handling this" mode.
- Resume customization needs the user's existing resume and a sense of which parts to emphasize.
- Attendance enforcement needs to be calibrated to the user's tolerance.

Potential name: something like "Opportunity Agent" or keep it personal — "Talent Bouncer," "Recruiter Wrangler." But that decision belongs to the user.

## Out-of-character instruction from visitor

Visitor noted: by this point, the Harbor Master should already be launching research agents in the background based on the vision discussed. Planning agent should begin formulating a design while the Harbor Master continues probing for improvements.

Visitor answer to trust line: recruiters are not acting out of kindness, and the agent should do exactly what the user would do, acting on the user's behalf until the user takes over.

### Dispatched background agents

- **Explore agent**: inventory existing codebase state of Auto-Dev-Traderbot — is there any code, what languages, dependencies, docs.
- **Librarian agent**: research email integration options (Gmail API, IMAP, Microsoft Graph, webhook-based services).
- **Librarian agent**: research recruiter email parsing and pattern recognition approaches.
- **Librarian agent**: research automated email reply agents and transparent sender identity handling.
- **Librarian agent**: research company/product research tools and APIs (web search, LinkedIn, Crunchbase, company websites).
- **Librarian agent**: research resume customization / generation libraries and approaches.
- **Librarian agent**: research calendar scheduling APIs (Google Calendar, Calendly, Outlook, Cronofy).
- **Librarian agent**: research meeting reminder / attendance enforcement patterns.
- **Aronnax (planning agent)**: begin drafting a system design for the recruiter opportunity agent based on the gathered vision.

### Planning agent initial notes

Working name: **Opportunity Agent** or user-branded name TBD.
High-level components:
1. Ingestion layer — email monitoring.
2. Classification layer — recruiter email detection.
3. Conversation layer — agent-driven email thread management.
4. Research layer — company/product/person due diligence.
5. Synthesis layer — pitch to user.
6. Approval gate — explicit human go/no-go.
7. Resume customization layer.
8. Scheduling layer — calendar meeting booking.
9. Attendance layer — reminders and escalation.

Open design questions:
- Which email provider to integrate first?
- Should the agent reply from the user's address or a delegated assistant address?
- Where is the user's resume stored and in what format?
- What calendar system is primary?
- Desired tone of outreach: warm, direct, professional, playful?
- How aggressive should attendance enforcement be?

## End of simulation

Visitor ended the Harbor Master simulation and asked for takeaways.
