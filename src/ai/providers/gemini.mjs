import { AIProviderError, MissingAIKeyError } from '../provider-interface.mjs';
import { buildPromptInput } from '../prompt-loader.mjs';

function extractInteractionText(json) {
  if (typeof json?.output_text === 'string') return json.output_text;
  const parts = [];
  for (const step of json?.steps || []) {
    for (const item of step?.content || []) {
      if (item?.type === 'text' && item.text) parts.push(item.text);
    }
  }
  return parts.join('').trim();
}

export class GeminiProvider {
  constructor({ config = {}, env = process.env, fetchImpl = fetch } = {}) {
    this.id = 'gemini';
    this.config = config;
    this.env = env;
    this.fetchImpl = fetchImpl;
  }

  async generate(request = {}) {
    const envName = this.config.api_key_env || 'GEMINI_API_KEY';
    const apiKey = this.env[envName];
    if (!apiKey) throw new MissingAIKeyError(this.id, envName);
    const model = request.model || this.config.model || 'gemini-2.5-flash';
    const endpoint = this.config.endpoint || 'https://generativelanguage.googleapis.com/v1beta/interactions';
    const response = await this.fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        model,
        input: buildPromptInput(request),
        temperature: request.temperature ?? 0.35,
        max_output_tokens: request.maxOutputTokens ?? 2048,
        store: false,
      }),
      signal: AbortSignal.timeout(request.timeoutMs || 45_000),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      const sanitized = body.split(apiKey).join('[redacted]');
      throw new AIProviderError(`Gemini API error: HTTP ${response.status}${sanitized ? ` ${sanitized.slice(0, 240)}` : ''}`, { provider: this.id });
    }
    const json = await response.json();
    const text = extractInteractionText(json);
    if (!text) throw new AIProviderError('Gemini returned an empty response.', { provider: this.id });
    return {
      provider: this.id,
      model,
      text,
      raw: request.includeRaw ? json : undefined,
      usage: json.usage || null,
    };
  }
}
