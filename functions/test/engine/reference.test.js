import { describe, expect, it } from 'vitest';
import { ALPHABET, newReference } from '../../lib/engine/reference.js';
import { hashToken, newManageToken, tokensEqual } from '../../lib/tokens.js';

describe('scheduler references and tokens', () => {
  it('creates references from the restricted alphabet', () => {
    const reference = newReference(() => 0);
    expect(reference).toBe('SC-22222222');
    expect(reference).toMatch(/^SC-[2-9A-HJKMNP-Z]{8}$/);
    expect(ALPHABET).not.toMatch(/[01OIL]/);
  });

  it('never uses a forbidden character across a thousand references', () => {
    const references = Array.from({ length: 1000 }, () => newReference());
    expect(references.every((reference) => /^SC-[2-9A-HJKMNP-Z]{8}$/.test(reference))).toBe(true);
  });

  it('compares token hashes safely', () => {
    const token = newManageToken();
    const hash = hashToken(token);
    expect(tokensEqual(hash, hash)).toBe(true);
    expect(tokensEqual(hash, hashToken('different'))).toBe(false);
    expect(tokensEqual(hash, hash.slice(1))).toBe(false);
  });
});
