import { z } from 'zod';

/**
 * Convert a JSON Schema object (from MCP tool inputSchema) to a Zod schema.
 * Covers the common types found in MCP tool definitions.
 */
export function jsonSchemaToZod(schema: unknown): z.ZodTypeAny {
  if (!schema || typeof schema !== 'object') {
    return z.any();
  }

  const s = schema as Record<string, unknown>;

  // Handle nullable: { type: ["string", "null"] }
  if (Array.isArray(s.type)) {
    const types = s.type as string[];
    const nonNull = types.filter((t) => t !== 'null');
    if (nonNull.length === 1) {
      const inner = jsonSchemaToZod({ ...s, type: nonNull[0] });
      return inner.nullable();
    }
    return z.any();
  }

  switch (s.type) {
    case 'object':
      return convertObject(s);
    case 'string':
      return convertString(s);
    case 'number':
      return convertNumber(s);
    case 'integer':
      return convertInteger(s);
    case 'boolean':
      return z.boolean();
    case 'array':
      return convertArray(s);
    default:
      return z.any();
  }
}

function convertObject(s: Record<string, unknown>): z.ZodObject<any> {
  const properties = (s.properties ?? {}) as Record<string, unknown>;
  const required = (s.required ?? []) as string[];
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const [key, propSchema] of Object.entries(properties)) {
    const zodType = jsonSchemaToZod(propSchema);
    shape[key] = required.includes(key) ? zodType : zodType.optional();
  }

  return z.object(shape);
}

function convertString(s: Record<string, unknown>): z.ZodTypeAny {
  let schema = z.string();

  if (Array.isArray(s.enum)) {
    const values = s.enum as [string, ...string[]];
    return z.enum(values);
  }

  if (typeof s.minLength === 'number') {
    schema = schema.min(s.minLength);
  }
  if (typeof s.maxLength === 'number') {
    schema = schema.max(s.maxLength);
  }

  return schema;
}

function convertNumber(s: Record<string, unknown>): z.ZodNumber {
  let schema = z.number();

  if (typeof s.minimum === 'number') {
    schema = schema.min(s.minimum);
  }
  if (typeof s.maximum === 'number') {
    schema = schema.max(s.maximum);
  }

  return schema;
}

function convertInteger(s: Record<string, unknown>): z.ZodNumber {
  let schema = z.number().int();

  if (typeof s.minimum === 'number') {
    schema = schema.min(s.minimum);
  }
  if (typeof s.maximum === 'number') {
    schema = schema.max(s.maximum);
  }

  return schema;
}

function convertArray(s: Record<string, unknown>): z.ZodArray<any> {
  const items = s.items;
  const itemSchema = items ? jsonSchemaToZod(items) : z.any();
  return z.array(itemSchema);
}
