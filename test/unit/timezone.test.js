import { describe, expect, it } from 'vitest';

import { normalizeTimeZone } from '../../src/utils/timezone.js';

describe('normalizeTimeZone', () => {
	it('keeps a valid IANA zone, trimmed', () => {
		expect(normalizeTimeZone('America/Chicago')).toBe('America/Chicago');
		expect(normalizeTimeZone(' Europe/Paris ')).toBe('Europe/Paris');
	});

	it.each([undefined, null, '', '   ', 123, {}, 'Mars/Base'])('falls back to UTC for %j', (value) => {
		expect(normalizeTimeZone(value)).toBe('UTC');
	});
});
