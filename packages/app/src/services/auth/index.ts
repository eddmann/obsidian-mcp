/**
 * Authentication & OAuth Module
 *
 * Unified authentication module that provides:
 * - Session management
 * - OAuth 2.0 token operations
 * - Cookie utilities
 * - PKCE verification
 */

// Session Management
export {
  createSession,
  getSession,
  authenticateSession,
  storePendingAuthRequest,
  consumePendingAuthRequest,
  isAuthenticated,
  destroySession,
  type Session,
} from './session-manager.js';

// OAuth Token Management
export {
  createAuthorizationCode,
  exchangeCodeForToken,
  refreshAccessToken,
  validateAccessToken,
  revokeToken,
  validateClientCredentials,
} from './oauth-tokens.js';

// Auth Store Singleton & Factories
export { getAuthStore, setAuthStore } from './auth-store-singleton.js';
export {
  createInMemoryAuthStore,
  createDynamoDbAuthStore,
  type DynamoDbAuthStoreOptions,
} from './auth-store.js';

// PKCE Utilities (internal use primarily, but exported for testing)
export { generateSecureToken, verifyCodeChallenge } from './pkce.js';
