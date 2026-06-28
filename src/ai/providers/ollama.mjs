import { UnsupportedProviderError } from '../provider-interface.mjs';

export class OllamaProvider {
  constructor() { this.id = 'ollama'; }
  async generate() { throw new UnsupportedProviderError(this.id); }
}
