# AI Agent Email OS

Multi-tenant AI email operations platform for Gmail, Microsoft 365, GoHighLevel CRM, business knowledge, approval workflows, deterministic execution, and auditability.

## Product Principle

The application owns:

- mailbox connections
- AI reasoning
- permissions
- audit history
- automation state
- approvals
- follow-up scheduling
- business-specific policies

GoHighLevel remains the CRM and system of record for customer and opportunity data.

## Initial Architecture

- Next.js
- TypeScript
- Tailwind CSS
- PostgreSQL / Supabase
- Supabase Auth
- Gmail API + Google OAuth
- GoHighLevel API
- OpenAI Responses API
- Async jobs via Inngest or Trigger.dev
- Vercel
- Sentry
- PostHog

Microsoft 365 support is Phase 2.

## Multi-Tenant Hierarchy

User -> Organization -> Business -> Mailboxes -> GHL Location -> Business Rules -> AI Agent Configuration

Each Business must remain fully isolated. Never mix:

- knowledge bases
- customer records
- GHL locations
- signatures
- prompts
- email threads
- policies
- contacts
- automation rules

## Risk Levels

- LOW
- MEDIUM
- HIGH
- CRITICAL

LOW may auto-execute only when deterministic rules explicitly allow it.
MEDIUM requires explicit business authorization and threshold checks.
HIGH requires human approval.
CRITICAL must never auto-send.

## Autonomy Levels

- 0: Observe
- 1: Draft
- 2: Guarded Autopilot
- 3: Full Autopilot

Production MVP defaults to Guarded Autopilot only after shadow-mode validation.

## Core Agent Flow

Incoming Email -> Triage -> CRM Context -> Decision -> Draft -> Execution Guard -> Approval or Send -> Audit

The AI model never directly executes privileged actions. Every action passes through deterministic authorization code.

## Build Order

1. Repository
2. Database
3. Authentication
4. Organization/business isolation
5. Gmail OAuth
6. Gmail inbound ingestion
7. Email storage
8. GHL OAuth
9. GHL contact matching
10. AI triage
11. CRM context
12. AI decision engine
13. Response drafting
14. Approval center
15. Gmail sending
16. Audit trail
17. Guarded autopilot
18. GHL tasks
19. Follow-ups
20. Knowledge retrieval
21. Business rules
22. Command center
23. Microsoft 365

Do not build Microsoft 365, billing, elaborate analytics, or mobile before the core vertical slice works.

## First Vertical Slice

Incoming Gmail message -> stored thread -> business identification -> GHL contact match -> AI triage -> decision -> draft -> approval -> send in original thread -> outgoing storage -> audit log.

## Safety Requirements

- OAuth tokens encrypted at rest
- HTTPS only
- strict tenant isolation
- row-level security
- no refresh tokens exposed client-side
- idempotent webhook and send handling
- webhook validation
- HTML sanitization
- attachment scanning before use
- rate limiting
- prompt injection defenses
- secrets redacted from logs
- financial changes never auto-executed
- deterministic authorization before every privileged action

## Local Setup

Implementation scaffolding is being added in the initial foundation commits.

See `.env.example` for the expected runtime configuration.
