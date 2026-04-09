import { Injectable, Logger } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';

/**
 * RealtimeService — decoupled bridge between delivery pipeline and WebSocket clients.
 *
 * This service is injected into DeliveryService, keeping the gateway logic
 * separate from delivery logic. If no WebSocket clients are connected,
 * emits are no-ops (fire-and-forget).
 *
 * Event types:
 *   delivery:success     — event successfully delivered
 *   delivery:failed      — delivery attempt failed (retrying)
 *   delivery:dead        — event exhausted retries → DLQ
 *   delivery:retry       — event scheduled for retry
 *   delivery:filtered    — event filtered out by rules
 *   delivery:rate_queued — event queued for drip-delivery
 */
@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);

  constructor(private gateway: RealtimeGateway) {}

  notifyDeliverySuccess(params: {
    projectId: string;
    endpointId: string;
    eventId: string;
    eventType: string;
    statusCode: number;
    latencyMs: number;
  }) {
    this.gateway.emitDeliveryEvent('delivery:success', params.projectId, params.endpointId, {
      eventId: params.eventId,
      eventType: params.eventType,
      statusCode: params.statusCode,
      latencyMs: params.latencyMs,
      status: 'delivered',
    });
  }

  notifyDeliveryFailed(params: {
    projectId: string;
    endpointId: string;
    eventId: string;
    eventType: string;
    statusCode?: number;
    errorMessage: string;
    retryCount: number;
    nextRetryAt?: Date;
  }) {
    this.gateway.emitDeliveryEvent('delivery:failed', params.projectId, params.endpointId, {
      eventId: params.eventId,
      eventType: params.eventType,
      statusCode: params.statusCode,
      errorMessage: params.errorMessage,
      retryCount: params.retryCount,
      nextRetryAt: params.nextRetryAt?.toISOString(),
      status: 'failed',
    });
  }

  notifyDeliveryDead(params: {
    projectId: string;
    endpointId: string;
    eventId: string;
    eventType: string;
    retryCount: number;
    errorMessage: string;
  }) {
    this.gateway.emitDeliveryEvent('delivery:dead', params.projectId, params.endpointId, {
      eventId: params.eventId,
      eventType: params.eventType,
      retryCount: params.retryCount,
      errorMessage: params.errorMessage,
      status: 'dead',
    });
  }

  notifyDeliveryRetry(params: {
    projectId: string;
    endpointId: string;
    eventId: string;
    eventType: string;
    retryCount: number;
    nextRetryAt: Date;
  }) {
    this.gateway.emitDeliveryEvent('delivery:retry', params.projectId, params.endpointId, {
      eventId: params.eventId,
      eventType: params.eventType,
      retryCount: params.retryCount,
      nextRetryAt: params.nextRetryAt.toISOString(),
      status: 'retrying',
    });
  }

  notifyDeliveryFiltered(params: {
    projectId: string;
    endpointId: string;
    eventId: string;
    eventType: string;
  }) {
    this.gateway.emitDeliveryEvent('delivery:filtered', params.projectId, params.endpointId, {
      eventId: params.eventId,
      eventType: params.eventType,
      status: 'filtered',
    });
  }

  notifyRateQueued(params: {
    projectId: string;
    endpointId: string;
    eventId: string;
    eventType: string;
    retryAfterMs: number;
  }) {
    this.gateway.emitDeliveryEvent('delivery:rate_queued', params.projectId, params.endpointId, {
      eventId: params.eventId,
      eventType: params.eventType,
      retryAfterMs: params.retryAfterMs,
      status: 'rate_queued',
    });
  }

  getStats() {
    return {
      connectedClients: this.gateway.getConnectedClients(),
      activeRooms: this.gateway.getActiveRooms(),
    };
  }
}
