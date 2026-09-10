const environment = process.env.NODE_ENV ?? 'development';
type MemoryPersistenceMode = 'local_development' | 'runtime_only' | 'user_cloud' | 'supabase';
const configuredMemoryMode = process.env.SERA_MEMORY_PERSISTENCE?.trim().toLowerCase();
const memoryPersistenceMode: MemoryPersistenceMode =
  configuredMemoryMode === 'local_development' ||
  configuredMemoryMode === 'user_cloud' ||
  configuredMemoryMode === 'runtime_only' ||
  configuredMemoryMode === 'supabase'
    ? (configuredMemoryMode as MemoryPersistenceMode)
    : (environment === 'production'
        ? (process.env.SUPABASE_URL ? 'supabase' : 'runtime_only')
        : 'local_development');

export const serverConfig = {
  environment,
  isProduction: environment === 'production',
  allowDevFeatures: environment !== 'production' && process.env.SERA_ENABLE_DEV_FEATURES !== 'false',
  corsOrigins: [
    ...(process.env.SERA_CORS_ORIGINS ?? process.env.SERA_RECEPTION_CORS_ORIGINS ?? 'http://localhost:5173,https://app.seraos.xyz,https://seraos.xyz')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    'https://app.seraos.xyz',
    'https://seraos.xyz',
  ],
  demoIntentCommand: process.env.SERA_DEMO_INTENT_COMMAND?.trim().toLowerCase(),
  memoryPersistenceMode,
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
  whatsapp: {
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN,
    businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID,
    apiVersion: process.env.WHATSAPP_API_VERSION || 'v21.0',
    isEnabled: Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN),
  },
};

export function isAllowedOrigin(origin: string | undefined): boolean {
  // Non-browser clients (health checks, server-side tools) do not send Origin.
  if (!origin) return true;
  if (origin.endsWith('.vercel.app')) return true;
  if (origin.endsWith('.seraos.xyz') || origin === 'https://seraos.xyz') return true;
  return serverConfig.corsOrigins.includes(origin);
}
