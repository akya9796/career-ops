import { readAiConfig, loadEnvFile } from './ai-config.mjs';
import { assertProviderShape } from './provider-interface.mjs';
import { GeminiProvider } from './providers/gemini.mjs';
import { OpenAIProvider } from './providers/openai.mjs';
import { ClaudeProvider } from './providers/claude.mjs';
import { OllamaProvider } from './providers/ollama.mjs';
import { OpenRouterProvider } from './providers/openrouter.mjs';
import { AzureOpenAIProvider } from './providers/azure-openai.mjs';

function providerFor(name, options) {
  if (name === 'gemini') return new GeminiProvider(options);
  if (name === 'openai') return new OpenAIProvider(options);
  if (name === 'claude') return new ClaudeProvider(options);
  if (name === 'ollama') return new OllamaProvider(options);
  if (name === 'openrouter') return new OpenRouterProvider(options);
  if (name === 'azure_openai') return new AzureOpenAIProvider(options);
  throw new Error(`Unknown AI provider: ${name}`);
}

export class AIManager {
  constructor({
    config = null,
    configPath = 'config/ai.yml',
    envPath = '.env.local',
    env = process.env,
    fetchImpl = fetch,
    provider = null,
  } = {}) {
    loadEnvFile({ envPath, target: env });
    this.config = config || readAiConfig({ configPath });
    this.providerName = this.config.provider || 'gemini';
    this.providerConfig = this.config[this.providerName] || {};
    this.provider = assertProviderShape(provider || providerFor(this.providerName, {
      config: this.providerConfig,
      env,
      fetchImpl,
    }));
  }

  async generate(request = {}) {
    const providerEnabled = this.providerConfig.enabled !== false;
    if (!providerEnabled) return this.fallbackResult(request, `${this.providerName} provider is disabled.`);
    let lastError = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const result = await this.provider.generate(request);
        return { ok: true, attempt, provider: this.providerName, ...result };
      } catch (err) {
        lastError = err;
        if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 250));
      }
    }
    return this.fallbackResult(request, lastError?.message || 'AI generation failed.', lastError);
  }

  fallbackResult(request, message, error = null) {
    if (request.fallback !== undefined) {
      return {
        ok: false,
        provider: this.providerName,
        text: request.fallback,
        error: message,
        code: error?.code || 'AI_FALLBACK',
      };
    }
    throw error || new Error(message);
  }
}

export async function generateAI(request, options = {}) {
  return new AIManager(options).generate(request);
}
