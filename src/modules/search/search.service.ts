import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '../users/schemas/user.schema';
import { Endpoint } from '../endpoints/schemas/endpoint.schema';
import { WebhookEvent } from '../events/schemas/event.schema';
import { AuditLog } from '../audit/schemas/audit-log.schema';

@Injectable()
export class SearchService {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Endpoint.name) private endpointModel: Model<Endpoint>,
    @InjectModel(WebhookEvent.name) private eventModel: Model<WebhookEvent>,
    @InjectModel(AuditLog.name) private auditModel: Model<AuditLog>,
  ) {}

  async globalSearch(query: string, userId: string, role: string) {
    const q = query?.trim();
    if (!q || q.length < 2) return { results: [], total: 0 };
    const regex = new RegExp(q, 'i');
    const isAdmin = ['admin', 'super_admin'].includes(role);

    const [endpoints, events, users, auditLogs] = await Promise.all([
      this.endpointModel.find({ $or: [{ name: regex }, { url: regex }] }).limit(5).lean(),
      this.eventModel.find({ eventType: regex }).limit(5).lean(),
      isAdmin
        ? this.userModel.find({ $or: [{ fullName: regex }, { email: regex }, { company: regex }] }, { passwordHash: 0, sessions: 0 }).limit(5).lean()
        : Promise.resolve([]),
      this.auditModel.find({ userId, action: regex }).limit(5).lean(),
    ]);

    const results = [
      ...endpoints.map(e => ({ type: 'endpoint', id: e._id, title: e.name, subtitle: e.url, status: e.status })),
      ...events.map(e => ({ type: 'event', id: e._id, title: e.eventType, subtitle: e.status, status: e.status })),
      ...users.map((u: any) => ({ type: 'user', id: u._id, title: `${u.firstName} ${u.lastName}`, subtitle: u.email, status: u.status })),
      ...auditLogs.map(a => ({ type: 'audit', id: a._id, title: a.action, subtitle: a.createdAt })),
    ];
    return { results, total: results.length };
  }
}
