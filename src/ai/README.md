# AI Provider Layer

Provider selection is configured in `config/ai.yml`.

Current V1 provider:

- Gemini via `AIManager.generate(...)`

Planned providers:

- OpenAI
- Claude
- Ollama
- OpenRouter
- Azure OpenAI

Business logic should never call a provider directly. It should call `AIManager.generate(...)` with a system prompt, user prompt, structured JSON input, and an optional fallback string.

The dashboard workflow must stay resilient: if AI fails or the API key is missing, deterministic scraping, scoring, tracking, and document packaging continue.
