import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Response } from 'express';
import { randomBytes } from 'crypto';

export interface TunnelMeta {
  tunnelId: string;
  userId: string;
  createdAt: string;

  forwarded: number;

  lastEventAt: string | null;
}

const MAX_TUNNELS = 500;
const TUNNEL_TTL_MS = 3_600_000; // 1 hour
const tunnelSessions = new Map<string, Response>();

const tunnelMeta = new Map<string, TunnelMeta>();

@Injectable()
export class TunnelService {
  private readonly logger = new Logger(TunnelService.name);

  createTunnel(userId: string): TunnelMeta {
    // Enforce max tunnels to prevent unbounded memory growth
    if (tunnelMeta.size >= MAX_TUNNELS) {
      this.cleanupExpiredTunnels();
      if (tunnelMeta.size >= MAX_TUNNELS) {
        // Remove oldest inactive tunnel
        for (const [id, meta] of tunnelMeta.entries()) {
          if (!this.isActive(id)) { this.deleteTunnel(id); break; }
        }
      }
    }

    const tunnelId = randomBytes(16).toString('hex');
    const meta: TunnelMeta = {
      tunnelId,
      userId,
      createdAt: new Date().toISOString(),
      forwarded: 0,
      lastEventAt: null,
    };
    tunnelMeta.set(tunnelId, meta);
    this.logger.log(`Tunnel created: ${tunnelId} for user ${userId}`);
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

  @Cron(CronExpression.EVERY_5_MINUTES)
  cleanupExpiredTunnels(): void {
    const now = Date.now();
    let cleaned = 0;
    for (const [id, meta] of tunnelMeta.entries()) {
      const age = now - new Date(meta.createdAt).getTime();
      if (age > TUNNEL_TTL_MS && !this.isActive(id)) {
        tunnelSessions.delete(id);
        tunnelMeta.delete(id);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      this.logger.log(`Cleaned up ${cleaned} expired tunnel(s). Active: ${tunnelMeta.size}`);
    }
  }
}
