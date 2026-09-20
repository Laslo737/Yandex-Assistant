import dotenv from 'dotenv';

dotenv.config();

function get(name: string, fallback?: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

function getBoolean(...names: string[]): boolean {
  return names.some((name) => {
    const value = get(name);
    return value === 'true' || value === '1';
  });
}

export const env = {
  port: Number(get('PORT', '3002')),
  app: {
    name: get('APP_NAME', 'yandex-360-ai-assistant') as string,
    version: get('APP_VERSION', '0.1.0') as string,
    nodeEnv: get('NODE_ENV', 'development') as string,
    debugCommands: getBoolean('ENABLE_DEBUG_COMMANDS', 'SHOW_DEBUG_COMMANDS'),
    publicBaseUrl: get('APP_PUBLIC_BASE_URL') as string
  },
  yandexMessenger: {
    enabled: getBoolean('ENABLE_YANDEX_MESSENGER', 'ENABLE_YANDEX'),
    apiBaseUrl: get('YANDEX_API_BASE_URL') as string,
    key: get('YANDEX_MESSENGER_KEY', get('YANDEX_MESSANGER_KEY')),
    webhookSecret: get('YANDEX_WEBHOOK_SECRET'),
    authHeader: get('YANDEX_AUTH_HEADER', 'Authorization') as string,
    authScheme: get('YANDEX_AUTH_SCHEME', 'OAuth') as string
  },
  tracker: {
    enabled: getBoolean('ENABLE_YANDEX_TRACKER'),
    apiBaseUrl: get('YANDEX_TRACKER_API_BASE_URL') as string,
    webBaseUrl: get('YANDEX_TRACKER_WEB_BASE_URL') as string,
    oauthToken: get('YANDEX_TRACKER_OAUTH_TOKEN'),
    orgId: get('YANDEX_TRACKER_ORG_ID'),
    cloudOrgId: get('YANDEX_TRACKER_CLOUD_ORG_ID')
  },
  llm: {
    provider: get('LLM_PROVIDER', 'mock') as string,
    openrouterApiKey: get('OPENROUTER_API_KEY'),
    openrouterBaseUrl: get('OPENROUTER_BASE_URL') as string,
    openrouterModel: get('OPENROUTER_MODEL', 'openai/gpt-5.4-mini') as string,
    openrouterHttpReferer: get('OPENROUTER_HTTP_REFERER'),
    openrouterXTitle: get('OPENROUTER_X_TITLE', 'Yandex 360 AI Assistant') as string
  }
};

export type Env = typeof env;
