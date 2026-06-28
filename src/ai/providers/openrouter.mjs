import { UnsupportedProviderError } from '../provider-interface.mjs';

export class OpenRouterProvider {
  constructor() { this.id = 'openrouter'; }
  async generate() { throw new UnsupportedProviderError(this.id); }
}
