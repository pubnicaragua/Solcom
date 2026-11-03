export const CLIENT_PORTAL_USER_ID = '8abe3739-ba0d-4b5b-9e67-a1d9b5e6c588';

export function isClientPortalUser(userId: unknown): boolean {
  return String(userId || '').trim() === CLIENT_PORTAL_USER_ID;
}
