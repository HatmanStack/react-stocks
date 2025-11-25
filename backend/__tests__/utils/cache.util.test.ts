import { calculateTTLByDataType } from '../../src/utils/cache.util';
import { jest } from '@jest/globals';

describe('calculateTTLByDataType', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-01-20T12:00:00Z')); // Mock "today" as Jan 20, 2025
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('historical stock date returns 90 days TTL', () => {
    const ttl = calculateTTLByDataType('stock', '2025-01-15');
    const expectedTTL = Math.floor((new Date('2025-01-20T12:00:00Z').getTime() + 90 * 24 * 60 * 60 * 1000) / 1000);
    expect(ttl).toBe(expectedTTL);
  });

  test('current stock date returns 1 day TTL', () => {
    const ttl = calculateTTLByDataType('stock', '2025-01-20');
    const expectedTTL = Math.floor((new Date('2025-01-20T12:00:00Z').getTime() + 1 * 24 * 60 * 60 * 1000) / 1000);
    expect(ttl).toBe(expectedTTL);
  });

  test('future stock date returns 1 day TTL', () => {
    const ttl = calculateTTLByDataType('stock', '2025-01-25');
    const expectedTTL = Math.floor((new Date('2025-01-20T12:00:00Z').getTime() + 1 * 24 * 60 * 60 * 1000) / 1000);
    expect(ttl).toBe(expectedTTL);
  });

  test('news data returns 7 days TTL', () => {
    const ttl = calculateTTLByDataType('news');
    const expectedTTL = Math.floor((new Date('2025-01-20T12:00:00Z').getTime() + 7 * 24 * 60 * 60 * 1000) / 1000);
    expect(ttl).toBe(expectedTTL);
  });

  test('sentiment data returns 30 days TTL', () => {
    const ttl = calculateTTLByDataType('sentiment');
    const expectedTTL = Math.floor((new Date('2025-01-20T12:00:00Z').getTime() + 30 * 24 * 60 * 60 * 1000) / 1000);
    expect(ttl).toBe(expectedTTL);
  });

  test('metadata returns 30 days TTL', () => {
      const ttl = calculateTTLByDataType('metadata');
      const expectedTTL = Math.floor((new Date('2025-01-20T12:00:00Z').getTime() + 30 * 24 * 60 * 60 * 1000) / 1000);
      expect(ttl).toBe(expectedTTL);
  });

  test('job returns 1 day TTL', () => {
      const ttl = calculateTTLByDataType('job');
      const expectedTTL = Math.floor((new Date('2025-01-20T12:00:00Z').getTime() + 1 * 24 * 60 * 60 * 1000) / 1000);
      expect(ttl).toBe(expectedTTL);
  });

  test('invalid date returns 1 day TTL default', () => {
      const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const ttl = calculateTTLByDataType('stock', 'invalid-date');
      const expectedTTL = Math.floor((new Date('2025-01-20T12:00:00Z').getTime() + 1 * 24 * 60 * 60 * 1000) / 1000);
      expect(ttl).toBe(expectedTTL);
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
  });

  test('unknown data type returns 1 day TTL default', () => {
      // @ts-ignore
      const ttl = calculateTTLByDataType('unknown');
      const expectedTTL = Math.floor((new Date('2025-01-20T12:00:00Z').getTime() + 1 * 24 * 60 * 60 * 1000) / 1000);
      expect(ttl).toBe(expectedTTL);
  });
});
