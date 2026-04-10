import { Injectable, Logger } from '@nestjs/common';
import { Response } from 'express';
import { randomBytes } from 'crypto';

/** Metadata tracked per tunnel session */
export interface TunnelMeta {
  tunnelId: string;
  userId: string;
  createdAt: string;
  /** Number of events forwarded through this tunnel */
  forwarded: number;
  /** Last event forwarded timestamp */
  lastEventAt: string | null;
}

// In-memory map of tunnelId → SSE response objects
// (Per-instance; for multi-instance use Redis pub/sub)
const tunnelSessions = new Map<string, Response>();

// Metadata map — survives SSE disconnect so dashboard can still show recent tunnels
const tunnelMeta = new Map<string, TunnelMeta>();

@Injectable()
export class TunnelService {
  private readonly logger = new Logger(TunnelService.name);

  /** Create a new tunnel ID and store its metadata */
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

  /** Register an SSE connection for a tunnel */
  register(tunnelId: string, res: Response) {
    tunnelSessions.set(tunnelId, res);
    this.logger.log(`🔌 Tunnel connected: ${tunnelId}`);
    res.on('close', () => {
      tunnelSessions.delete(tunnelId);
      this.logger.log(`🔌 Tunnel disconnected: ${tunnelId}`);
    });
  }

  /** Generate a new unique tunnel ID (legacy compat) */
  generateId(): string {
    return randomBytes(16).toString('hex');
  }

  /** Forward an incoming webhook to the CLI session */
  forward(tunnelId: string, event: {
    method: string; headers: Record<string, string>; body: any; query: any; path: string;
  }): boolean {
    const res = tunnelSessions.get(tunnelId);
    if (!res || res.writableEnded) {
      tunnelSessions.delete(tunnelId);
      return false;
    }
    // Update stats
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

  /** List all tunnels created by a specific user (both active and recent) */
  listForUser(userId: string): (TunnelMeta & { active: boolean })[] {
    const results: (TunnelMeta & { active: boolean })[] = [];
    for (const meta of tunnelMeta.values()) {
      if (meta.userId === userId) {
        results.push({ ...meta, active: this.isActive(meta.tunnelId) });
      }
    }
    // Sort: active first, then by createdAt desc
    results.sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    return results;
  }

  /** Get metadata for a single tunnel */
  getMeta(tunnelId: string): TunnelMeta | undefined {
    return tunnelMeta.get(tunnelId);
  }

  /** Delete a tunnel session and its metadata */
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
