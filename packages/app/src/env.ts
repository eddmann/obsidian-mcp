import dotenv from 'dotenv';
import { existsSync } from 'fs';
import { dirname, join } from 'path';

// Core environment variables required for all modes
export const CORE_ENV_VARS = [
  'VAULT_REPO',
  'VAULT_BRANCH',
  'GIT_TOKEN',
  'JOURNAL_PATH_TEMPLATE',
  'JOURNAL_DATE_FORMAT',
  'JOURNAL_ACTIVITY_SECTION',
  'JOURNAL_FILE_TEMPLATE',
] as const;

// OAuth-specific environment variables (only for HTTP/Lambda modes)
export const OAUTH_ENV_VARS = [
  'OAUTH_CLIENT_ID',
  'OAUTH_CLIENT_SECRET',
  'PERSONAL_AUTH_TOKEN',
  'BASE_URL',
] as const;

// All environment variables (for HTTP/Lambda modes)
export const REQUIRED_ENV_VARS = [...CORE_ENV_VARS, ...OAUTH_ENV_VARS] as const;

export type RequiredEnvVar = (typeof REQUIRED_ENV_VARS)[number];
export type CoreEnvVar = (typeof CORE_ENV_VARS)[number];
export type OAuthEnvVar = (typeof OAUTH_ENV_VARS)[number];

/**
 * Recursively search up the directory tree for a .env file
 * @param startDir Directory to start searching from
 * @returns Path to .env file if found, undefined otherwise
 */
function findEnvFile(startDir: string): string | undefined {
  let currentDir = startDir;

  while (true) {
    const envPath = join(currentDir, '.env');

    if (existsSync(envPath)) {
      return envPath;
    }

    const parentDir = dirname(currentDir);

    // Reached filesystem root
    if (parentDir === currentDir) {
      return undefined;
    }

    currentDir = parentDir;
  }
}

export function loadEnv(): void {
  const envPath = findEnvFile(process.cwd());

  const result = envPath ? dotenv.config({ path: envPath }) : dotenv.config(); // Fallback to default behavior

  if (result.error && (result.error as NodeJS.ErrnoException).code !== 'ENOENT') {
    throw result.error;
  }
}

export function ensureEnvVars(variables: Iterable<RequiredEnvVar> = REQUIRED_ENV_VARS): void {
  const missing = Array.from(variables).filter(key => !process.env[key] || process.env[key] === '');

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

// Convenience function for stdio mode (no OAuth required)
export function ensureCoreEnvVars(): void {
  ensureEnvVars(CORE_ENV_VARS);
}
