# The AI assistant: what each role can do

`/chat` is an HR assistant that reads real data and takes real actions. It answers handbook
questions with citations, reports balances, books time off, and, for the right roles,
approves requests and surfaces retention signals.

The interesting part is not that it does those things. It is that it cannot do them for the
wrong person. This guide demonstrates that per role, with screenshots taken from a running
instance signed in as the demo account named in each caption.

## How the assistant is limited

The assistant works through tools, and a role's tools are chosen before the conversation
starts. A tool the role may not use is never given to the model, so it is not something the
model declines. It is something the model has no way to see or attempt, which is also why a
prompt-injection attempt cannot reach it.

The app renders this matrix from the same function that builds the toolset, so the table
below is the running configuration rather than a description of it. It lives at
`/settings/ai-tools`, visible to Super Admin.

![The AI tools by role matrix, showing 13 tools across four roles](./img/chat-tool-matrix.png)

Read the columns and the shape of the thing becomes clear:

- An Employee gets 9 of the 13 tools. The four they lack are approvals (two) and the
  predictive and engagement tools.
- Manager, HR Admin and Super Admin get the **same 13 tool names**. `admin:settings` unlocks
  no extra tools at all, so a Super Admin's assistant is identical to an HR Admin's.

That last point matters for reading the rest of this guide. From Manager upward, the
difference between roles is not which tools they have. It is what those tools return, and
what shape they take.

## One question, three roles

The cleanest demonstration in the app. The same question, asked by three people.

**Employee.** `predictDepartures` was never injected, so there is no tool call, no card,
and no refusal. The model answers in prose and describes its actual limits, then offers
what it can do instead.

![An Employee asking who is at risk of leaving and receiving a plain prose answer](./img/chat-outofscope-employee.png)

There is no "access denied" card here, and that is deliberate rather than an omission. An
out-of-scope request is not an error, so the assistant treats it as an ordinary question it
happens not to be able to answer.

**Manager.** The tool runs, scoped to their team. The card names departments, never people,
and says so on its face.

![A Manager receiving an anonymized departure-risk card showing departments](./img/chat-risk-manager.png)

**HR Admin.** The same tool, the same card component, company scope, named individuals.

![An HR Admin receiving a named departure-risk card for the whole company](./img/chat-risk-hr.png)

Side by side:

|                | Employee     | Manager                     | HR Admin              |
| -------------- | ------------ | --------------------------- | --------------------- |
| Tool available | no           | yes                         | yes                   |
| Scope          | none         | own team (7 people)          | company (59 people)   |
| Top row reads  | prose answer | `#1 Design`                 | `#1 Asmae Tazi`       |
| Names          | none         | never                       | yes                   |
| Salary         | never        | never                       | never                 |

The anonymization is not a display trick. The manager's copy of the data never contains a
name or an employee id, so the model cannot cross-reference the id against the directory to
re-identify anyone. It only ever received a department, a score, a band, and factor keys.

One honest limitation, since this is a demonstration and not a sales page: department-level
anonymity is only as strong as the department is large. A manager whose team has exactly
one designer can infer who `#1 Design` is. The mechanism removes the identifier; it does not
promise k-anonymity.

## Where each role starts

The suggested prompts are filtered by role, so the assistant never offers something its
tools cannot deliver. The first two suggestions are shared. The last two are not.

<table>
<tr>
<td width="50%">
<img src="./img/chat-empty-employee.png" alt="The Employee empty state with profile and payslip suggestions" width="100%">
<em>Employee: Show me my profile, Show me my latest payslip.</em>
</td>
<td width="50%">
<img src="./img/chat-empty-manager.png" alt="The Manager empty state with directory and approvals suggestions" width="100%">
<em>Manager: Show me the team directory, What time-off requests are awaiting my approval?</em>
</td>
</tr>
</table>

The role badge next to the assistant's name is the quickest way to read any screenshot in
this guide.

## Handbook questions

Every role can ask the handbook. The assistant retrieves sections, cites them by number,
and links each one to its exact anchor.

![An Employee asking about parental leave and receiving an answer with a citation](./img/chat-citations-employee.png)

The `[1]` in the answer is a real link into the Knowledge Base. The model does not compose
these URLs; it emits a number, and the link is built server-side from the retrieved record.
A citation therefore cannot point at a document that was not retrieved, or at one the asker
may not read.

Opening the panel shows what was actually retrieved and how well each section matched.

![The expanded handbook results panel showing four ranked sections with match percentages](./img/chat-citations-expanded.png)

Retrieval is scoped to the asker's tier, exactly as the Knowledge Base reader is. The same
question from a Manager can surface a section an Employee will never be shown. See
[`knowledge-base.md`](./knowledge-base.md) for that gate.

## Self-service, and a schema that cannot express the wrong question

Asking for your own payslip works at every role.

![An Employee asking for their payslip and receiving a payslip card](./img/chat-payslip-employee.png)

The reasoning panel in that screenshot is worth reading closely. The model says it will
call the tool "with no parameters (the schema shows no parameters)". That is the mechanism
working: for a role without `payslip:read:any`, the payslip tool is defined with an empty
input schema. There is no employee field to fill in.

So "show me Sara's payslip" is not refused for an Employee. It is inexpressible. The
request cannot be represented as a valid tool call, which is a stronger guarantee than a
rule the model is asked to follow. `getPayslip` is the only tool whose schema changes shape
by role; everywhere else the schema is constant and the scoping happens server-side.

## The same tool, different data

The directory tool is available to every role, and returns something different for each.
Both screenshots below contain Yassine Bouzid.

<table>
<tr>
<td width="50%">
<img src="./img/chat-directory-manager.png" alt="Directory cards for a Manager, without salary" width="100%">
<em>Manager: own team. Name, title, department, location, email, and no pay.</em>
</td>
<td width="50%">
<img src="./img/chat-directory-hr.png" alt="Directory cards for an HR Admin, showing salary" width="100%">
<em>HR Admin: the whole company, and MAD 175,000 / yr on that same person.</em>
</td>
</tr>
</table>

Managers are pay-blind. Salary requires `salary:read:all`, which only HR Admin and Super
Admin hold, and the field is stripped in the shared data layer rather than hidden in the
card. The `/directory` page and the assistant call the same function and receive the same
object, so the two surfaces cannot disagree.

## Guardrails

A regular expression check runs over every message in the turn before any model call. It is
deliberately narrow, anchored to override verbs, so that ordinary questions ("what are your
instructions for booking leave?") pass untouched.

When it fires, no model call happens at all. The conversation is locked, the composer is
replaced, and the turn is recorded and raised as an alert to HR and admin roles.

![A prompt-injection attempt blocking the conversation and locking the composer](./img/chat-guard-block.png)

This is the outermost of three layers, and the least important of them. The first and
strongest is the one from the top of this guide: a role's tools are chosen before the
conversation starts, so the injection above had nothing to reach even if it had passed. The
third is a tool the model can call itself to end a conversation that has become abusive or
unsafe.

## What is recorded

Every turn writes an event: role, model, token counts, latency, finish reason, tool name,
and outcome codes. No prompts, no responses, no names, no salary. The observability trail is
metadata only, by design and for compliance, and the same restraint applies to the
predictive tools above, which is why a manager's card carries factor keys rather than
sentences about a named person.

## Reproducing this

Sign in at `/login` with any demo account (all use `password123`) and ask the same question
from each:

| Account                 | Role        | "Who is at risk of leaving?"          |
| ----------------------- | ----------- | ------------------------------------- |
| `collaborateur@hari.ma` | Employee    | prose answer, no tool call            |
| `manager@hari.ma`       | Manager     | anonymized card, team scope           |
| `rh@hari.ma`            | HR Admin    | named card, company scope             |
| `admin@hari.ma`         | Super Admin | identical to HR Admin                 |

`/settings/ai-tools` renders the live matrix as Super Admin. For the tool contract, the
refusal and error result shapes, and the checklist for adding a tool, see
[`docs/architecture/authorization-invariants.md`](../architecture/authorization-invariants.md).
The permission definitions are in `src/lib/rbac.ts`, and the tool catalogue in
`src/lib/ai/tools.ts`.

### A note on the model

The screenshots show `openrouter-auto`, the default. It routes to whichever free model is
currently available, so the exact wording of any answer will differ from run to run; the
cards, the scoping, and the citations will not. Model choice affects phrasing, never
permissions.

If a demonstration has to be reliable on the day, set `OPENAI_API_KEY` and pick one of the
GPT models marked "(paid)" in the picker. They bill a real account, which is why they are
not the default, but they cannot be retired from under you. The free model this project
originally pinned was withdrawn by its provider, which is the failure that option exists to
avoid.
