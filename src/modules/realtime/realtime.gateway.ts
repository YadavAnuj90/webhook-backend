import {
  WebSocketGateway, WebSocketServer, SubscribeMessage,
  OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect,
  ConnectedSocket, MessageBody,
} from '@nestjs/websockets';
import { Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  namespace: '/realtime',
  cors: { origin: '*', credentials: true },
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
  handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { projectId?: string; endpointId?: string },
  ) {
    if (data.projectId) {
      const room = `project:${data.projectId}`;
      client.join(room);
      this.logger.log(`${client.id} joined room ${room}`);
      client.emit('subscribed', { room, projectId: data.projectId });
    }
    if (data.endpointId) {
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
