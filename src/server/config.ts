const environment = process.env.NODE_ENV ?? 'development';

export const serverConfig = {
  environment,
  isProduction: environment === 'production',
  allowDevFeatures: environment !== 'production' && process.env.SERA_ENABLE_DEV_FEATURES !== 'false',
  corsOrigins: (process.env.SERA_CORS_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  demoIntentCommand: process.env.SERA_DEMO_INTENT_COMMAND?.trim().toLowerCase(),
};

export function isAllowedOrigin(origin: string | undefined): boolean {
  // Non-browser clients (health checks, server-side tools) do not send Origin.
  if (!origin) return true;
  return serverConfig.corsOrigins.includes(origin);
}
