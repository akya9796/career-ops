export class AIProviderError extends Error {
  constructor(message, { code = 'AI_PROVIDER_ERROR', provider = '' } = {}) {
    super(message);
    this.name = 'AIProviderError';
    this.code = code;
    this.provider = provider;
  }
}

export class MissingAIKeyError extends AIProviderError {
  constructor(provider, envName) {
    super(`${provider} API key missing. Set ${envName} in .env.local or the process environment.`, {
      code: 'MISSING_API_KEY',
      provider,
    });
    this.envName = envName;
  }
}

export class UnsupportedProviderError extends AIProviderError {
  constructor(provider) {
    super(`${provider} is planned but not implemented in this lean V1 AI layer.`, {
      code: 'UNSUPPORTED_PROVIDER',
      provider,
    });
  }
}

export function assertProviderShape(provider) {
  if (!provider || typeof provider.generate !== 'function') {
    throw new AIProviderError('AI provider must expose generate(request).');
  }
  return provider;
}
