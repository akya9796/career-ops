import { UnsupportedProviderError } from '../provider-interface.mjs';

export class ClaudeProvider {
  constructor() { this.id = 'claude'; }
  async generate() { throw new UnsupportedProviderError(this.id); }
}
