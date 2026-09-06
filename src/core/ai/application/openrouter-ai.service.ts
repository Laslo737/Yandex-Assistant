import OpenAI from 'openai';
import { env } from '../../../config/env';

export interface GenerateTextInput {
  system: string;
  messages: Array<{ role: 'user' | 'assistant'; text: string }>;
  temperature?: number;
}

export class OpenRouterAiService {
  private readonly client: OpenAI;

  constructor() {
    this.client = new OpenAI({
      apiKey: env.llm.openrouterApiKey || 'missing-openrouter-key',
      baseURL: env.llm.openrouterBaseUrl,
      defaultHeaders: {
        ...(env.llm.openrouterHttpReferer ? { 'HTTP-Referer': env.llm.openrouterHttpReferer } : {}),
        ...(env.llm.openrouterXTitle ? { 'X-Title': env.llm.openrouterXTitle } : {})
      }
    });
  }

  isEnabled(): boolean {
    return env.llm.provider === 'openrouter' && Boolean(env.llm.openrouterApiKey);
  }

  async generateText(input: GenerateTextInput): Promise<string> {
    if (env.llm.provider !== 'openrouter') {
      throw new Error(`LLM provider ${env.llm.provider} is not enabled for OpenRouter calls.`);
    }

    if (!env.llm.openrouterApiKey) {
      throw new Error('OPENROUTER_API_KEY is not configured.');
    }

    const response = await this.client.chat.completions.create({
      model: env.llm.openrouterModel,
      temperature: input.temperature ?? 0.2,
      messages: [
        { role: 'system', content: input.system },
        ...input.messages.map((message) => ({ role: message.role, content: message.text }))
      ]
    });

    const text = response.choices?.[0]?.message?.content?.trim() || '';
    if (!text) {
      throw new Error('OpenRouter returned empty response.');
    }

    return text;
  }
}
