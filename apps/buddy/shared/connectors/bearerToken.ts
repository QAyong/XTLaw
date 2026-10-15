/**
 * Users often paste a token together with its "Bearer " scheme. Sending that value after our own
 * `Bearer ` prefix produces `Bearer Bearer <token>`, which some gateways accept for account queries
 * but reject for billed calls, so the scheme is removed wherever a token is stored or sent.
 */
export function normalizeBearerToken(token: string): string {
  return token.trim().replace(/^(?:bearer(?:\s+|$))+/i, '').trim()
}
