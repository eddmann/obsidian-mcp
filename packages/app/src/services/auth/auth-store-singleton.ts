import type { AuthStore } from './stores/types.js';

let authStore: AuthStore | null = null;

export function getAuthStore(): AuthStore {
  if (!authStore) {
    throw new Error('Auth store not initialized. Call setAuthStore() at application startup.');
  }
  return authStore;
}

export function setAuthStore(store: AuthStore): void {
  authStore = store;
}
