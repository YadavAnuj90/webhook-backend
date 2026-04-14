import { Injectable, Logger } from '@nestjs/common';
import { Response } from 'express';
import { randomBytes } from 'crypto';

export interface TunnelMeta {
  tunnelId: string;
  userId: string;
  createdAt: string;

  forwarded: number;

  lastEventAt: string | null;
}

const tunnelSessions = new Map<string, Response>();

const tunnelMeta = new Map<string, TunnelMeta>();

@Injectable()
export class TunnelService {
  private readonly logger = new Logger(TunnelService.name);

  createTunnel(userId: string): TunnelMeta {
    const tunnelId = randomBytes(16).toString('hex');
    const meta: TunnelMeta = {
      tunnelId,
      userId,
      createdAt: new Date().toISOString(),
      forwarded: 0,
      lastEventAt: null,
    };
    tunnelMeta.set(tunnelId, meta);
    this.logger.log(`🆕 Tunnel created: ${tunnelId} for user ${userId}`);
    return meta;
  }

  register(tunnelId: string, res: Response) {
    tunnelSessions.set(tunnelId, res);
    this.logger.log(`🔌 Tunnel connected: ${tunnelId}`);
    res.on('close', () => {
      tunnelSessions.delete(tunnelId);
      this.logger.log(`🔌 Tunnel disconnected: ${tunnelId}`);
    });
  }

  generateId(): string {
    return randomBytes(16).toString('hex');
  }

  forward(tunnelId: string, event: {
    method: string; headers: Record<string, string>; body: any; query: any; path: string;
  }): boolean {
    const res = tunnelSessions.get(tunnelId);
    if (!res || res.writableEnded) {
      tunnelSessions.delete(tunnelId);
      return false;
    }

    const meta = tunnelMeta.get(tunnelId);
    if (meta) {
      meta.forwarded++;
      meta.lastEventAt = new Date().toISOString();
    }
    const data = JSON.stringify(event);
    res.write(`data: ${data}\n\n`);
    return true;
  }

  isActive(tunnelId: string): boolean {
    const res = tunnelSessions.get(tunnelId);
    return !!res && !res.writableEnded;
  }

  listForUser(userId: string): (TunnelMeta & { active: boolean })[] {
    const results: (TunnelMeta & { active: boolean })[] = [];
    for (const meta of tunnelMeta.values()) {
      if (meta.userId === userId) {
        results.push({ ...meta, active: this.isActive(meta.tunnelId) });
      }
    }

    results.sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    return results;
  }

  getMeta(tunnelId: string): TunnelMeta | undefined {
    return tunnelMeta.get(tunnelId);
  }

  deleteTunnel(tunnelId: string) {
    const res = tunnelSessions.get(tunnelId);
    if (res && !res.writableEnded) {
      res.end();
    }
    tunnelSessions.delete(tunnelId);
    tunnelMeta.delete(tunnelId);
    this.logger.log(`🗑️ Tunnel deleted: ${tunnelId}`);
  }

  listActive(): string[] {
    return Array.from(tunnelSessions.keys());
  }
}
