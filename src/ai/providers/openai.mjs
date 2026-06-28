import { UnsupportedProviderError } from '../provider-interface.mjs';

export class OpenAIProvider {
  constructor() { this.id = 'openai'; }
  async generate() { throw new UnsupportedProviderError(this.id); }
}
