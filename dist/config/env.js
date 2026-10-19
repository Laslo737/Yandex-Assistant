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
    admin: {
        enabled: getBoolean('ENABLE_ADMIN'),
        databasePath: get('ANALYTICS_DB_PATH', './data/analytics.sqlite'),
        retentionDays: Number(get('ANALYTICS_RETENTION_DAYS', '90')),
        username: get('ADMIN_USERNAME', 'admin'),
        password: get('ADMIN_PASSWORD', '')
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
        cloudOrgId: get('YANDEX_TRACKER_CLOUD_ORG_ID'),
        load: {
            concurrency: Number(get('TRACKER_CONCURRENCY', '4')),
            minIntervalMs: Number(get('TRACKER_MIN_INTERVAL_MS', '150')),
            maxQueue: Number(get('TRACKER_MAX_QUEUE', '200')),
            queueTimeoutMs: Number(get('TRACKER_QUEUE_TIMEOUT_MS', '15000')),
            requestTimeoutMs: Number(get('TRACKER_REQUEST_TIMEOUT_MS', '12000')),
            operationTimeoutMs: Number(get('TRACKER_OPERATION_TIMEOUT_MS', '30000')),
            maxRetries: Number(get('TRACKER_MAX_RETRIES', '2'))
        }
    },
    workday: {
        cacheTtlMs: Number(get('MY_DAY_CACHE_TTL_MS', '60000')),
        cacheMaxEntries: Number(get('MY_DAY_CACHE_MAX_ENTRIES', '512')),
        maxPending: Number(get('MY_DAY_MAX_PENDING', '100')),
        loadTimeoutMs: Number(get('MY_DAY_LOAD_TIMEOUT_MS', '45000'))
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
