export type {
  SessionData,
  AuthCodeData,
  AccessTokenData,
  RefreshTokenData,
  SessionRepository,
  OAuthTokenRepository,
  AuthStore,
} from './types.js';

export { InMemoryAuthStore, createInMemoryAuthStore } from './in-memory-store.js';

export {
  DynamoDbAuthStore,
  createDynamoDbAuthStore,
  type DynamoDbAuthStoreOptions,
} from './dynamodb-store.js';

// Note: the Firestore store is deliberately NOT re-exported here. The Lambda
// bundle imports this barrel and inlines everything it reaches, so exporting
// it would pull @google-cloud/firestore into the Lambda/stdio bundles.
// Import it directly from './firestore-store.js' where needed.
