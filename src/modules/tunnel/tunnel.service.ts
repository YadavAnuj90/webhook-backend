import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Response } from 'express';
import { randomBytes } from 'crypto';

// In-memory map of tunnelId → SSE response objects
// (Per-instance; for multi-instance use Redis pub/sub)
const tunnelSessions = new Map<string, Response>();

@Injectable()
export class TunnelService {
  private readonly logger = new Logger(TunnelService.name);

  /** Register a new SSE tunnel session. Returns the tunnelId. */
  register(tunnelId: string, res: Response) {
    tunnelSessions.set(tunnelId, res);
    this.logger.log(`🔌 Tunnel registered: ${tunnelId}`);
    res.on('close', () => {
      tunnelSessions.delete(tunnelId);
      this.logger.log(`🔌 Tunnel disconnected: ${tunnelId}`);
    });
  }

  /** Generate a new unique tunnel ID */
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
    const data = JSON.stringify(event);
    res.write(`data: ${data}\n\n`);
    return true;
  }

  isActive(tunnelId: string): boolean {
    const res = tunnelSessions.get(tunnelId);
    return !!res && !res.writableEnded;
  }

  listActive(): string[] {
    return Array.from(tunnelSessions.keys());
  }
}
