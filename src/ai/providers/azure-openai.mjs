import { UnsupportedProviderError } from '../provider-interface.mjs';

export class AzureOpenAIProvider {
  constructor() { this.id = 'azure_openai'; }
  async generate() { throw new UnsupportedProviderError(this.id); }
}
