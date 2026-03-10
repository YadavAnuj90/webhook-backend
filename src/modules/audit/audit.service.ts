import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditLog, AuditAction } from './schemas/audit-log.schema';

interface AuditEntry {
  userId: string;
  userEmail?: string;
  action: AuditAction;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  resourceId?: string;
  resourceType?: string;
  outcome?: 'success' | 'failure';
  errorMessage?: string;
}

@Injectable()
export class AuditService {
  constructor(@InjectModel(AuditLog.name) private auditModel: Model<AuditLog>) {}

  async log(entry: AuditEntry): Promise<void> {
    await this.auditModel.create(entry).catch(() => {});
  }

  async getUserHistory(userId: string, page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    const [logs, total] = await Promise.all([
      this.auditModel.find({ userId }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      this.auditModel.countDocuments({ userId }),
    ]);
    return { logs, total, page, limit };
  }

  async getSystemHistory(filters: { action?: AuditAction; userId?: string; from?: Date; to?: Date; page?: number; limit?: number }) {
    const query: any = {};
    if (filters.action) query.action = filters.action;
    if (filters.userId) query.userId = filters.userId;
    if (filters.from || filters.to) {
      query.createdAt = {};
      if (filters.from) query.createdAt.$gte = filters.from;
      if (filters.to) query.createdAt.$lte = filters.to;
    }
    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const skip = (page - 1) * limit;
    const [logs, total] = await Promise.all([
      this.auditModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      this.auditModel.countDocuments(query),
    ]);
    return { logs, total, page, limit };
  }
}
