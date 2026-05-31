import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '../users/schemas/user.schema';
import { Endpoint } from '../endpoints/schemas/endpoint.schema';
import { WebhookEvent } from '../events/schemas/event.schema';
import { AuditLog } from '../audit/schemas/audit-log.schema';
import { Project } from '../projects/schemas/project.schema';
import { escapeRegex } from '../../utils/regex.util';

@Injectable()
export class SearchService {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Endpoint.name) private endpointModel: Model<Endpoint>,
    @InjectModel(WebhookEvent.name) private eventModel: Model<WebhookEvent>,
    @InjectModel(AuditLog.name) private auditModel: Model<AuditLog>,
    @InjectModel(Project.name) private projectModel: Model<Project>,
  ) {}

  async globalSearch(query: string, userId: string, role: string) {
    const q = query?.trim();
    if (!q || q.length < 2) return { results: [], total: 0 };
    const regex = new RegExp(escapeRegex(q), 'i');
    const isAdmin = ['admin', 'super_admin'].includes(role);

    // Scope search by user's accessible projects to prevent cross-tenant data leaks
    let projectIds: string[] = [];
    if (!isAdmin) {
      const accessibleProjects = await this.projectModel
        .find({
          deletedAt: null,
          $or: [{ ownerId: userId }, { 'members.userId': userId }],
        }, { _id: 1 })
        .lean();
      projectIds = accessibleProjects.map(p => String(p._id));
    }

    const projectScope = !isAdmin && projectIds.length > 0
      ? { projectId: { $in: projectIds } }
      : (!isAdmin ? { projectId: '__none__' } : {}); // Non-admin with no projects sees nothing

    const [endpoints, events, users, auditLogs] = await Promise.all([
      this.endpointModel.find({ ...projectScope, $or: [{ name: regex }, { url: regex }] }).limit(5).lean(),
      this.eventModel.find({ ...projectScope, eventType: regex }).limit(5).lean(),
      isAdmin
        ? this.userModel.find({ $or: [{ fullName: regex }, { email: regex }, { company: regex }] }, { passwordHash: 0, sessions: 0 }).limit(5).lean()
        : Promise.resolve([]),
      this.auditModel.find({ userId, action: regex }).limit(5).lean(),
    ]);

    const results = [
      ...endpoints.map(e => ({ type: 'endpoint', id: e._id, title: e.name, subtitle: e.url, status: e.status })),
      ...events.map(e => ({ type: 'event', id: e._id, title: e.eventType, subtitle: e.status, status: e.status })),
      ...users.map((u: any) => ({ type: 'user', id: u._id, title: `${u.firstName} ${u.lastName}`, subtitle: u.email, status: u.status })),
      ...auditLogs.map(a => ({ type: 'audit', id: a._id, title: a.action, subtitle: (a as any).createdAt })),
    ];
    return { results, total: results.length };
  }
}
