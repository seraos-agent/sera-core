const environment = process.env.NODE_ENV ?? 'development';
type MemoryPersistenceMode = 'local_development' | 'runtime_only' | 'user_cloud';
const configuredMemoryMode = process.env.SERA_MEMORY_PERSISTENCE?.trim().toLowerCase();
const memoryPersistenceMode: MemoryPersistenceMode = configuredMemoryMode === 'local_development' || configuredMemoryMode === 'user_cloud' || configuredMemoryMode === 'runtime_only'
  ? configuredMemoryMode
  : (environment === 'production' ? 'runtime_only' : 'local_development');

export const serverConfig = {
  environment,
  isProduction: environment === 'production',
  allowDevFeatures: environment !== 'production' && process.env.SERA_ENABLE_DEV_FEATURES !== 'false',
  corsOrigins: (process.env.SERA_CORS_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  demoIntentCommand: process.env.SERA_DEMO_INTENT_COMMAND?.trim().toLowerCase(),
  memoryPersistenceMode,
};

export function isAllowedOrigin(origin: string | undefined): boolean {
  // Non-browser clients (health checks, server-side tools) do not send Origin.
  if (!origin) return true;
  return serverConfig.corsOrigins.includes(origin);
}
