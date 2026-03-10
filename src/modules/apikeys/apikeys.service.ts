import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ApiKey, ApiKeyDocument } from './schemas/apikey.schema';
import * as crypto from 'crypto';

@Injectable()
export class ApiKeysService {
  constructor(@InjectModel(ApiKey.name) private model: Model<ApiKeyDocument>) {}

  private hash(key: string) { return crypto.createHash('sha256').update(key).digest('hex'); }

  async create(userId: string, dto: { name: string; scopes?: string[]; expiresAt?: string; description?: string; workspaceId?: string }) {
    const rawKey = 'whk_' + crypto.randomBytes(32).toString('hex');
    const keyHash = this.hash(rawKey);
    const keyPrefix = rawKey.substring(0, 12);
    const doc = await this.model.create({
      userId: new Types.ObjectId(userId),
      workspaceId: dto.workspaceId ? new Types.ObjectId(dto.workspaceId) : undefined,
      name: dto.name, keyHash, keyPrefix,
      scopes: dto.scopes || ['read', 'write'],
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      description: dto.description,
    });
    // Return full key ONCE — never again
    return { ...doc.toObject(), key: rawKey };
  }

  async list(userId: string) {
    return this.model.find({ userId: new Types.ObjectId(userId) }).sort({ createdAt: -1 }).select('-keyHash');
  }

  async revoke(userId: string, id: string) {
    const key = await this.model.findById(id);
    if (!key) throw new NotFoundException('API key not found');
    if (key.userId.toString() !== userId) throw new ForbiddenException('Not your key');
    await this.model.findByIdAndUpdate(id, { isActive: false });
    return { success: true };
  }

  async delete(userId: string, id: string) {
    const key = await this.model.findById(id);
    if (!key) throw new NotFoundException('API key not found');
    if (key.userId.toString() !== userId) throw new ForbiddenException('Not your key');
    await this.model.findByIdAndDelete(id);
    return { success: true };
  }

  async validateKey(rawKey: string): Promise<ApiKeyDocument | null> {
    const keyHash = this.hash(rawKey);
    const key = await this.model.findOne({ keyHash, isActive: true });
    if (!key) return null;
    if (key.expiresAt && new Date() > key.expiresAt) { await this.model.findByIdAndUpdate(key._id, { isActive: false }); return null; }
    await this.model.findByIdAndUpdate(key._id, { $inc: { usageCount: 1 }, lastUsedAt: new Date() });
    return key;
  }

  async getStats(userId: string) {
    const keys = await this.model.find({ userId: new Types.ObjectId(userId) });
    return {
      total: keys.length,
      active: keys.filter(k => k.isActive).length,
      expired: keys.filter(k => k.expiresAt && new Date() > k.expiresAt).length,
      totalUsage: keys.reduce((a, k) => a + (k.usageCount || 0), 0),
    };
  }
}
