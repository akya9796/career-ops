# AI Provider Audit

This audit covers reusable AI pieces from `archive/legacy-career-ops/`. The goal is a small provider-agnostic layer for the current dashboard assistant, not a restoration of the old prompt-heavy architecture.

| Legacy file | Purpose | Reusable? | Reused? | Replaced? | Reason |
| --- | --- | --- | --- | --- | --- |
| `gemini-eval.mjs` | Gemini CLI with model config, env key lookup, structured prompt assembly, error redaction, validation, report writing. | Yes | Partly | Mostly | Reused the env-key pattern, Gemini default, one-call generation shape, retry/error-redaction ideas. Replaced report/tracker logic with `AIManager.generate(...)`. |
| `ollama-eval.mjs` | Local Ollama CLI with endpoint guard, timeout, prompt assembly, and report writing. | Yes, later | No | Yes | Endpoint safety and timeout ideas are useful for a future provider, but V1 only implements Gemini. |
| `config/ai.yml` | Provider config with default provider and per-provider settings. | Yes | Yes | Simplified | Current `config/ai.yml` keeps one switch: `provider: gemini`, plus provider blocks. |
| `prompts/*` and `modes/*` | Large prompt/mode library for evaluations, applications, interviews, and market intelligence. | Partly | Partly | Yes | Kept prompt files, but only lean task prompts: cover letter, job summary, fit explanation, future CV tailoring. |
| `CLAUDE.md`, `GEMINI.md`, `OPENCODE.md` | Agent-specific operating docs. | Limited | No | Yes | Too broad for runtime architecture; useful only as archive reference. |
| `test-career-intelligence.mjs` | Tests for older intelligence workflows. | Limited | No | Yes | Current tests target provider selection and resilient generation instead. |
| `prompts/market_intelligence/*` | Market trend prompting. | No | No | No | Outside current assistant scope. |
| `modes/auto-pipeline.md`, `modes/deep.md` | Broad autonomous workflows. | No | No | No | The current app must remain deterministic and approval-first. |

## Reused Now

- Provider selected from `config/ai.yml`.
- API key read from `.env.local` or process environment.
- Gemini is the only implemented V1 provider.
- AI failures return friendly fallback output where business workflows need continuity.
- Prompt text lives outside business logic.

## Kept For Later

- Ollama loopback safety and timeout pattern.
- OpenAI, Claude, OpenRouter, and Azure OpenAI provider slots.
- Structured response validation for future JSON-only tasks.

## Not Restored

The old report writer, tracker merger, multilingual mode library, career intelligence prompts, and autonomous pipeline logic remain archived. They are useful references but would bloat the current dashboard assistant.
