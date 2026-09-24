"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
function get(name, fallback) {
    const value = process.env[name];
    return value === undefined || value === '' ? fallback : value;
}
function getBoolean(...names) {
    return names.some((name) => {
        const value = get(name);
        return value === 'true' || value === '1';
    });
}
exports.env = {
    port: Number(get('PORT', '3002')),
    app: {
        name: get('APP_NAME', 'yandex-360-ai-assistant'),
        version: get('APP_VERSION', '0.1.0'),
        nodeEnv: get('NODE_ENV', 'development'),
        debugCommands: getBoolean('ENABLE_DEBUG_COMMANDS', 'SHOW_DEBUG_COMMANDS'),
        publicBaseUrl: get('APP_PUBLIC_BASE_URL')
    },
    yandexMessenger: {
        enabled: getBoolean('ENABLE_YANDEX_MESSENGER', 'ENABLE_YANDEX'),
        apiBaseUrl: get('YANDEX_API_BASE_URL'),
        key: get('YANDEX_MESSENGER_KEY', get('YANDEX_MESSANGER_KEY')),
        webhookSecret: get('YANDEX_WEBHOOK_SECRET'),
        loginDomain: get('YANDEX_MESSENGER_LOGIN_DOMAIN'),
        authHeader: get('YANDEX_AUTH_HEADER', 'Authorization'),
        authScheme: get('YANDEX_AUTH_SCHEME', 'OAuth')
    },
    tracker: {
        enabled: getBoolean('ENABLE_YANDEX_TRACKER'),
        apiBaseUrl: get('YANDEX_TRACKER_API_BASE_URL'),
        webBaseUrl: get('YANDEX_TRACKER_WEB_BASE_URL'),
        oauthToken: get('YANDEX_TRACKER_OAUTH_TOKEN'),
        orgId: get('YANDEX_TRACKER_ORG_ID'),
        cloudOrgId: get('YANDEX_TRACKER_CLOUD_ORG_ID')
    },
    llm: {
        provider: get('LLM_PROVIDER', 'mock'),
        openrouterApiKey: get('OPENROUTER_API_KEY'),
        openrouterBaseUrl: get('OPENROUTER_BASE_URL'),
        openrouterModel: get('OPENROUTER_MODEL', 'openai/gpt-5.4-mini'),
        openrouterHttpReferer: get('OPENROUTER_HTTP_REFERER'),
        openrouterXTitle: get('OPENROUTER_X_TITLE', 'Yandex 360 AI Assistant')
    }
};
