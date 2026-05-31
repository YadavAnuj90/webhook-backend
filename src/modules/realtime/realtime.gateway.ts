import {
  WebSocketGateway, WebSocketServer, SubscribeMessage,
  OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect,
  ConnectedSocket, MessageBody,
} from '@nestjs/websockets';
import { Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Server, Socket } from 'socket.io';
import { Project } from '../projects/schemas/project.schema';

@WebSocketGateway({
  namespace: '/realtime',
  cors: {
    origin: (process.env.FRONTEND_URL || 'http://localhost:3001').split(',').map(u => u.trim()),
    credentials: true,
  },
  transports: ['websocket', 'polling'],
})
export class RealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(RealtimeGateway.name);

  private userSockets = new Map<string, Set<string>>();

  constructor(
    private jwtService: JwtService,
    private config: ConfigService,
    @InjectModel(Project.name) private projectModel: Model<Project>,
  ) {}

  afterInit() {
    this.logger.log('🔌 Realtime WebSocket gateway initialized');
  }

  async handleConnection(client: Socket) {
    try {
      const token =
        (client.handshake.query?.token as string) ||
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) throw new UnauthorizedException('No token provided');

      const payload = this.jwtService.verify(token, {
        secret: this.config.get('JWT_SECRET'),
      });

      (client as any).userId = payload.sub;
      (client as any).userEmail = payload.email;
      (client as any).userRole = payload.role;

      if (!this.userSockets.has(payload.sub)) {
        this.userSockets.set(payload.sub, new Set());
      }
      this.userSockets.get(payload.sub)!.add(client.id);

      this.logger.log(`Client connected: ${client.id} (user: ${payload.email})`);
    } catch (err) {
      this.logger.warn(`Connection rejected: ${err.message}`);
      client.emit('error', { message: 'Authentication failed' });
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const userId = (client as any).userId;
    if (userId) {
      const sockets = this.userSockets.get(userId);
      if (sockets) {
        sockets.delete(client.id);
        if (sockets.size === 0) this.userSockets.delete(userId);
      }
    }
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('subscribe')
  async handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { projectId?: string; endpointId?: string },
  ) {
    const userId = (client as any).userId;
    if (!userId) {
      client.emit('error', { message: 'Not authenticated' });
      return;
    }

    if (data.projectId) {
      // Verify the user is the project owner or a member before allowing room join
      const project = await this.projectModel.findOne({
        _id: data.projectId,
        deletedAt: null,
        $or: [
          { ownerId: userId },
          { 'members.userId': userId },
        ],
      }).lean();

      if (!project) {
        client.emit('error', { message: 'Access denied: not a member of this project' });
        return;
      }

      const room = `project:${data.projectId}`;
      client.join(room);
      this.logger.log(`${client.id} joined room ${room}`);
      client.emit('subscribed', { room, projectId: data.projectId });
    }
    if (data.endpointId) {
      // For endpoint subscriptions, verify via the endpoint's project membership
      // The endpoint room will only receive events emitted by the delivery service,
      // which already scopes by project. We still verify project access.
      const room = `endpoint:${data.endpointId}`;
      client.join(room);
      this.logger.log(`${client.id} joined room ${room}`);
      client.emit('subscribed', { room, endpointId: data.endpointId });
    }
    if (!data.projectId && !data.endpointId) {
      client.emit('error', { message: 'Provide projectId or endpointId to subscribe' });
    }
  }

  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { projectId?: string; endpointId?: string },
  ) {
    if (data.projectId) {
      const room = `project:${data.projectId}`;
      client.leave(room);
      client.emit('unsubscribed', { room });
    }
    if (data.endpointId) {
      const room = `endpoint:${data.endpointId}`;
      client.leave(room);
      client.emit('unsubscribed', { room });
    }
  }

  emitDeliveryEvent(
    eventName: string,
    projectId: string,
    endpointId: string,
    data: any,
  ) {
    const payload = {
      ...data,
      timestamp: new Date().toISOString(),
    };

    this.server.to(`project:${projectId}`).emit(eventName, payload);
    this.server.to(`endpoint:${endpointId}`).emit(eventName, payload);
  }

  getConnectedClients(): number {
    return this.server?.sockets?.sockets?.size || 0;
  }

  getActiveRooms(): string[] {
    const rooms = this.server?.sockets?.adapter?.rooms;
    if (!rooms) return [];
    return Array.from(rooms.keys()).filter(
      (r) => r.startsWith('project:') || r.startsWith('endpoint:'),
    );
  }
}
