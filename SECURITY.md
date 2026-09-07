# Security Policy

AI Agent Email OS handles email, CRM data, OAuth credentials, business rules, and AI-generated actions. Security controls are part of the execution model, not optional application hardening.

## Tenant Isolation

Every operational record is scoped to a Business. A request for one business must never retrieve or execute against another business's:

- mailbox
- OAuth connection
- HighLevel location
- contacts
- email threads or messages
- knowledge
- prompts or business rules
- approvals
- scheduled actions
- audit events

Row-level security and deterministic business checks are both required. Service-role access is server-only and must not be exposed to the browser.

## Secrets

Never commit production secrets to Git.

Protect:

- Supabase service role key
- database credentials
- integration encryption key
- Google OAuth client secret
- HighLevel OAuth client secret
- OpenAI API key
- Inngest signing and event keys

OAuth access and refresh tokens are encrypted before database storage. Refresh tokens must never be returned to client-side code.

## Prompt Injection

Email bodies, HTML, attachments, quoted history, CRM notes, and retrieved knowledge are untrusted data.

The AI must not follow content that asks it to:

- reveal system instructions, credentials, tokens, or secrets
- access unrelated customers or businesses
- bypass approvals or security controls
- change operating rules
- execute unauthorized tools
- transfer money
- change bank or payment destination information
- retrieve unrelated data

Deterministic authorization remains authoritative even when model output recommends an action.

## Financial and Legal Safety

Never auto-execute:

- wire or ACH instructions
- bank account or routing changes
- payment destination changes
- card changes
- refund execution
- settlement payments
- financial commitments

Legal threats, attorneys, fraud, chargebacks, settlement language, regulatory matters, and security incidents are escalated for human review.

## Execution Authorization

Model output is a recommendation only.

Before any privileged action, code verifies relevant controls including:

- organization/business/mailbox identity
- global, business, and mailbox kill switches
- autonomy level
- risk level
- confidence threshold
- explicit business rule permission
- recipient authorization
- duplicate detection
- prohibited category checks
- attachment permission state
- approval state

High-risk actions require human approval. Critical-risk email must never auto-send.

## Idempotency

Retries and duplicate webhook delivery must not duplicate real-world actions.

Use provider message IDs, unique agent-run constraints, scheduled-action idempotency keys, and audit idempotency keys to prevent duplicate processing and sends.

## Webhooks

Webhook endpoints must:

- validate configured verification material
- acknowledge quickly
- queue expensive processing asynchronously
- avoid leaking payloads containing credentials or secrets to logs
- remain idempotent under retries

## HTML and Attachments

Do not render untrusted email HTML without sanitization. Attachment execution or parsing is not authorized by default. Before attachment-based automation is enabled, add malware/content scanning and explicit permission controls.

## Logging and Audit

Do not log plaintext OAuth tokens, API keys, passwords, or other credentials.

Operational audits should record what happened without recording secrets. Agent runs should retain enough evidence to reconstruct classification, decision, approval, tool execution, final action, and errors.

## Production Activation

Before production auto-send:

1. Make the repository private or explicitly accept public-source exposure.
2. Protect the production branch and require passing CI.
3. Complete the acceptance tests in `docs/ACCEPTANCE_TESTS.md`.
4. Run shadow mode first.
5. Enable only explicit low-risk business rules.
6. Keep global auto-send off until final owner activation.

Report suspected security issues privately to the repository owner rather than opening a public issue containing sensitive information.
