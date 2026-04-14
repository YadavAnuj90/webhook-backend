import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EventType } from './schemas/event-type.schema';

export interface SchemaError { path: string; message: string }

function validateSchema(
  data: unknown,
  schema: Record<string, any>,
  path = '',
): SchemaError[] {
  const errors: SchemaError[] = [];
  if (!schema || typeof schema !== 'object') return errors;

  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const jsType = data === null ? 'null' : Array.isArray(data) ? 'array' : typeof data;
    if (!types.includes(jsType)) {
      errors.push({ path: path || '/', message: `Expected type "${types.join('|')}", got "${jsType}"` });
      return errors;
    }
  }

  if (Array.isArray(schema.enum) && !schema.enum.includes(data)) {
    errors.push({ path: path || '/', message: `Value must be one of [${schema.enum.join(', ')}]` });
  }

  if (typeof data === 'string') {
    if (schema.minLength !== undefined && data.length < schema.minLength)
      errors.push({ path, message: `Must be at least ${schema.minLength} characters` });
    if (schema.maxLength !== undefined && data.length > schema.maxLength)
      errors.push({ path, message: `Must be at most ${schema.maxLength} characters` });
    if (schema.pattern && !new RegExp(schema.pattern).test(data))
      errors.push({ path, message: `Does not match pattern "${schema.pattern}"` });
  }

  if (typeof data === 'number') {
    if (schema.minimum !== undefined && data < schema.minimum)
      errors.push({ path, message: `Must be >= ${schema.minimum}` });
    if (schema.maximum !== undefined && data > schema.maximum)
      errors.push({ path, message: `Must be <= ${schema.maximum}` });
  }

  if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>;

    if (Array.isArray(schema.required)) {
      for (const key of schema.required) {
        if (!(key in obj))
          errors.push({ path: `${path}.${key}`, message: `Required field missing` });
      }
    }

    if (schema.properties && typeof schema.properties === 'object') {
      for (const [key, subSchema] of Object.entries(schema.properties)) {
        if (key in obj) {
          errors.push(...validateSchema(obj[key], subSchema as Record<string, any>, `${path}.${key}`));
        }
      }
    }

    if (schema.additionalProperties === false && schema.properties) {
      for (const key of Object.keys(obj)) {
        if (!(key in schema.properties))
          errors.push({ path: `${path}.${key}`, message: `Additional property not allowed` });
      }
    }
  }

  if (Array.isArray(data) && schema.items) {
    data.forEach((item, i) =>
      errors.push(...validateSchema(item, schema.items, `${path}[${i}]`)));
    if (schema.minItems !== undefined && data.length < schema.minItems)
      errors.push({ path, message: `Array must have at least ${schema.minItems} items` });
    if (schema.maxItems !== undefined && data.length > schema.maxItems)
      errors.push({ path, message: `Array must have at most ${schema.maxItems} items` });
  }

  return errors;
}

@Injectable()
export class EventCatalogService {

  constructor(@InjectModel(EventType.name) private model: Model<EventType>) {}

  async create(projectId: string, dto: {
    name: string; version?: string; description?: string;
    schema?: Record<string, any>; samplePayload?: Record<string, any>; tags?: string[];
  }) {
    const exists = await this.model.findOne({ projectId, name: dto.name, version: dto.version || 'v1' });
    if (exists) throw new ConflictException(`Event type "${dto.name}@${dto.version || 'v1'}" already exists`);
    return this.model.create({ ...dto, projectId });
  }

  async findAll(projectId: string, activeOnly = true) {
    const filter: any = { projectId };
    if (activeOnly) filter.isActive = true;
    return this.model.find(filter).sort({ name: 1, version: 1 });
  }

  async findOne(projectId: string, id: string) {
    const et = await this.model.findOne({ _id: id, projectId });
    if (!et) throw new NotFoundException('Event type not found');
    return et;
  }

  async update(projectId: string, id: string, dto: Partial<{
    description: string; schema: Record<string, any>; samplePayload: Record<string, any>;
    isActive: boolean; tags: string[];
  }>) {
    const et = await this.model.findOneAndUpdate({ _id: id, projectId }, { $set: dto }, { new: true });
    if (!et) throw new NotFoundException('Event type not found');
    return et;
  }

  async delete(projectId: string, id: string) {
    const et = await this.model.findOneAndDelete({ _id: id, projectId });
    if (!et) throw new NotFoundException('Event type not found');
    return { success: true };
  }

  async validatePayload(projectId: string, eventTypeName: string, payload: Record<string, any>): Promise<{ valid: boolean; errors: SchemaError[] }> {
    const et = await this.model.findOne({ projectId, name: eventTypeName, isActive: true })
      .sort({ version: -1 });
    if (!et || !et.jsonSchema) return { valid: true, errors: [] };
    const errors = validateSchema(payload, et.jsonSchema);
    return { valid: errors.length === 0, errors };
  }

  async findByName(
    projectId: string,
    name: string,
  ): Promise<EventType | null> {
    return this.model
      .findOne({ projectId, name, isActive: true })
      .sort({ version: -1 });
  }

  async simulate(
    projectId: string,
    id: string,
    overrides?: Record<string, any>,
  ): Promise<{
    simulatedPayload: Record<string, any>;
    eventType: string;
    version: string;
  }> {
    const et = await this.findOne(projectId, id);
    const payload = {
      ...(et.samplePayload || {}),
      ...overrides,
      _simulated: true,
      _simulatedAt: new Date().toISOString(),
    };
    return {
      simulatedPayload: payload,
      eventType: et.name,
      version: et.version,
    };
  }
}
