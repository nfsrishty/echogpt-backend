import * as Joi from 'joi';

/**
 * Validates environment variables at startup.
 * If anything is missing or malformed, the app refuses to boot
 * instead of failing later in a confusing way.
 */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().port().default(3000),

  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgresql', 'postgres'] })
    .required(),

  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),

  // 32 bytes written as 64 hex characters (AES-256 key)
  ENCRYPTION_KEY: Joi.string().hex().length(64).required(),

  // Comma-separated list, e.g. "chrome-extension://abc,http://localhost:5173"
  CORS_ORIGINS: Joi.string().default('*'),

  // Web search (Tavily). Without a key, Tavily's keyless mode is used
  // (lower limits). A free key gives 1,000 searches/month.
  TAVILY_API_KEY: Joi.string().allow('').optional(),
  TAVILY_BASE_URL: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .default('https://api.tavily.com'),
  SEARCH_CACHE_TTL_SECONDS: Joi.number().integer().min(0).default(3600),
});
