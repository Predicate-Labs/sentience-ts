import { ZodFirstPartyTypeKind, ZodTypeAny } from 'zod';

type JsonSchema = Record<string, any>;

type Unwrapped = {
  schema: ZodTypeAny;
  optional: boolean;
  nullable: boolean;
};

function unwrapSchema(schema: ZodTypeAny): Unwrapped {
  let current = schema;
  let optional = false;
  let nullable = false;
  while (true) {
    const typeName = current._def?.typeName as ZodFirstPartyTypeKind | undefined;
    if (typeName === ZodFirstPartyTypeKind.ZodOptional) {
      optional = true;
      current = current._def.innerType;
      continue;
    }
    if (typeName === ZodFirstPartyTypeKind.ZodDefault) {
      optional = true;
      current = current._def.innerType;
      continue;
    }
    if (typeName === ZodFirstPartyTypeKind.ZodNullable) {
      nullable = true;
      current = current._def.innerType;
      continue;
    }
    break;
  }
  return { schema: current, optional, nullable };
}

export function zodToJsonSchema(schema: ZodTypeAny): JsonSchema {
  const { schema: base, nullable } = unwrapSchema(schema);
  const typeName = base._def?.typeName as ZodFirstPartyTypeKind | undefined;

  let result: JsonSchema;
  switch (typeName) {
    case ZodFirstPartyTypeKind.ZodString:
      result = { type: 'string' };
      break;
    case ZodFirstPartyTypeKind.ZodNumber:
      result = { type: 'number' };
      break;
    case ZodFirstPartyTypeKind.ZodBoolean:
      result = { type: 'boolean' };
      break;
    case ZodFirstPartyTypeKind.ZodLiteral:
      result = { const: base._def.value, type: typeof base._def.value };
      break;
    case ZodFirstPartyTypeKind.ZodEnum:
      result = { type: 'string', enum: base._def.values };
      break;
    case ZodFirstPartyTypeKind.ZodArray:
      result = { type: 'array', items: zodToJsonSchema(base._def.type) };
      break;
    case ZodFirstPartyTypeKind.ZodObject: {
      const shape = base._def.shape();
      const properties: Record<string, JsonSchema> = {};
      const required: string[] = [];
      for (const [key, value] of Object.entries(shape)) {
        const { schema: inner, optional } = unwrapSchema(value as ZodTypeAny);
        properties[key] = zodToJsonSchema(inner);
        if (!optional) required.push(key);
      }
      result = { type: 'object', properties, required };
      break;
    }
    case ZodFirstPartyTypeKind.ZodUnion:
      result = {
        anyOf: base._def.options.map((opt: ZodTypeAny) => zodToJsonSchema(opt)),
      };
      break;
    default:
      result = {};
      break;
  }

  if (nullable) {
    return { anyOf: [result, { type: 'null' }] };
  }
  return result;
}
