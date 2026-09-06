"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenRouterAiService = void 0;
const openai_1 = __importDefault(require("openai"));
const env_1 = require("../../../config/env");
class OpenRouterAiService {
    client;
    constructor() {
        this.client = new openai_1.default({
            apiKey: env_1.env.llm.openrouterApiKey || 'missing-openrouter-key',
            baseURL: env_1.env.llm.openrouterBaseUrl,
            defaultHeaders: {
                ...(env_1.env.llm.openrouterHttpReferer ? { 'HTTP-Referer': env_1.env.llm.openrouterHttpReferer } : {}),
                ...(env_1.env.llm.openrouterXTitle ? { 'X-Title': env_1.env.llm.openrouterXTitle } : {})
            }
        });
    }
    isEnabled() {
        return env_1.env.llm.provider === 'openrouter' && Boolean(env_1.env.llm.openrouterApiKey);
    }
    async generateText(input) {
        if (env_1.env.llm.provider !== 'openrouter') {
            throw new Error(`LLM provider ${env_1.env.llm.provider} is not enabled for OpenRouter calls.`);
        }
        if (!env_1.env.llm.openrouterApiKey) {
            throw new Error('OPENROUTER_API_KEY is not configured.');
        }
        const response = await this.client.chat.completions.create({
            model: env_1.env.llm.openrouterModel,
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
exports.OpenRouterAiService = OpenRouterAiService;
