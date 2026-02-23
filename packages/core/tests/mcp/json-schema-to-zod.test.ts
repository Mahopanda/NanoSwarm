import { describe, it, expect } from 'bun:test';
import { jsonSchemaToZod } from '../../src/mcp/json-schema-to-zod.ts';

describe('jsonSchemaToZod', () => {
  describe('object type', () => {
    it('should convert object with required and optional fields', () => {
      const schema = jsonSchemaToZod({
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
        required: ['name'],
      });

      expect(schema.parse({ name: 'Alice', age: 30 })).toEqual({ name: 'Alice', age: 30 });
      expect(schema.parse({ name: 'Bob' })).toEqual({ name: 'Bob' });
      expect(() => schema.parse({})).toThrow();
    });

    it('should handle empty object', () => {
      const schema = jsonSchemaToZod({ type: 'object' });
      expect(schema.parse({})).toEqual({});
    });

    it('should handle nested objects', () => {
      const schema = jsonSchemaToZod({
        type: 'object',
        properties: {
          address: {
            type: 'object',
            properties: {
              city: { type: 'string' },
            },
            required: ['city'],
          },
        },
        required: ['address'],
      });

      expect(schema.parse({ address: { city: 'Tokyo' } })).toEqual({
        address: { city: 'Tokyo' },
      });
    });
  });

  describe('string type', () => {
    it('should convert basic string', () => {
      const schema = jsonSchemaToZod({ type: 'string' });
      expect(schema.parse('hello')).toBe('hello');
      expect(() => schema.parse(123)).toThrow();
    });

    it('should handle string enum', () => {
      const schema = jsonSchemaToZod({ type: 'string', enum: ['a', 'b', 'c'] });
      expect(schema.parse('a')).toBe('a');
      expect(() => schema.parse('d')).toThrow();
    });

    it('should handle minLength and maxLength', () => {
      const schema = jsonSchemaToZod({ type: 'string', minLength: 2, maxLength: 5 });
      expect(schema.parse('ab')).toBe('ab');
      expect(() => schema.parse('a')).toThrow();
      expect(() => schema.parse('abcdef')).toThrow();
    });
  });

  describe('number type', () => {
    it('should convert basic number', () => {
      const schema = jsonSchemaToZod({ type: 'number' });
      expect(schema.parse(3.14)).toBe(3.14);
      expect(() => schema.parse('not a number')).toThrow();
    });

    it('should handle minimum and maximum', () => {
      const schema = jsonSchemaToZod({ type: 'number', minimum: 0, maximum: 100 });
      expect(schema.parse(50)).toBe(50);
      expect(() => schema.parse(-1)).toThrow();
      expect(() => schema.parse(101)).toThrow();
    });
  });

  describe('integer type', () => {
    it('should convert integer with .int() constraint', () => {
      const schema = jsonSchemaToZod({ type: 'integer' });
      expect(schema.parse(42)).toBe(42);
      expect(() => schema.parse(3.14)).toThrow();
    });

    it('should handle integer with bounds', () => {
      const schema = jsonSchemaToZod({ type: 'integer', minimum: 1, maximum: 10 });
      expect(schema.parse(5)).toBe(5);
      expect(() => schema.parse(0)).toThrow();
      expect(() => schema.parse(11)).toThrow();
    });
  });

  describe('boolean type', () => {
    it('should convert boolean', () => {
      const schema = jsonSchemaToZod({ type: 'boolean' });
      expect(schema.parse(true)).toBe(true);
      expect(schema.parse(false)).toBe(false);
      expect(() => schema.parse('true')).toThrow();
    });
  });

  describe('array type', () => {
    it('should convert array with items', () => {
      const schema = jsonSchemaToZod({ type: 'array', items: { type: 'string' } });
      expect(schema.parse(['a', 'b'])).toEqual(['a', 'b']);
      expect(() => schema.parse([1, 2])).toThrow();
    });

    it('should handle array without items (z.any())', () => {
      const schema = jsonSchemaToZod({ type: 'array' });
      expect(schema.parse([1, 'mixed', true])).toEqual([1, 'mixed', true]);
    });
  });

  describe('nullable', () => {
    it('should handle nullable string: ["string", "null"]', () => {
      const schema = jsonSchemaToZod({ type: ['string', 'null'] });
      expect(schema.parse('hello')).toBe('hello');
      expect(schema.parse(null)).toBe(null);
    });

    it('should handle nullable number', () => {
      const schema = jsonSchemaToZod({ type: ['number', 'null'] });
      expect(schema.parse(42)).toBe(42);
      expect(schema.parse(null)).toBe(null);
    });
  });

  describe('edge cases', () => {
    it('should return z.any() for null schema', () => {
      const schema = jsonSchemaToZod(null);
      expect(schema.parse('anything')).toBe('anything');
      expect(schema.parse(42)).toBe(42);
    });

    it('should return z.any() for undefined schema', () => {
      const schema = jsonSchemaToZod(undefined);
      expect(schema.parse('anything')).toBe('anything');
    });

    it('should return z.any() for unknown type', () => {
      const schema = jsonSchemaToZod({ type: 'unknown_type' });
      expect(schema.parse('anything')).toBe('anything');
    });
  });

  describe('real MCP tool schema', () => {
    it('should handle a filesystem-like read_file tool schema', () => {
      const schema = jsonSchemaToZod({
        type: 'object',
        properties: {
          path: { type: 'string' },
        },
        required: ['path'],
      });

      expect(schema.parse({ path: '/tmp/file.txt' })).toEqual({ path: '/tmp/file.txt' });
      expect(() => schema.parse({})).toThrow();
    });

    it('should handle a search tool schema with optional params', () => {
      const schema = jsonSchemaToZod({
        type: 'object',
        properties: {
          query: { type: 'string' },
          limit: { type: 'integer', minimum: 1, maximum: 100 },
          format: { type: 'string', enum: ['json', 'text'] },
        },
        required: ['query'],
      });

      expect(schema.parse({ query: 'test' })).toEqual({ query: 'test' });
      expect(schema.parse({ query: 'test', limit: 10, format: 'json' })).toEqual({
        query: 'test',
        limit: 10,
        format: 'json',
      });
    });
  });
});
