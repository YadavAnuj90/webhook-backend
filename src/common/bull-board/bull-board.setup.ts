
import { INestApplication, Logger } from '@nestjs/common';
import { WEBHOOK_QUEUE, DEAD_LETTER_QUEUE } from '../../queue/queue.constants';

const logger = new Logger('BullBoard');

export async function setupBullBoard(app: INestApplication): Promise<void> {

  let createBullBoard: any, BullAdapter: any, ExpressAdapter: any, basicAuth: any;
  try {
    ({ createBullBoard } = await import('@bull-board/api'));
    ({ BullAdapter }     = await import('@bull-board/api/bullAdapter'));
    ({ ExpressAdapter }  = await import('@bull-board/express'));
    const basicAuthModule = await import('express-basic-auth');
    basicAuth             = basicAuthModule.default ?? basicAuthModule;
  } catch {
    logger.warn(
      '⚠️  Bull Board packages not installed. Queue dashboard disabled.\n' +
      '   Run: npm install @bull-board/api @bull-board/express express-basic-auth',
    );
    return;
  }

  let webhookQueue: any, dlqQueue: any;
  try {

    webhookQueue = app.get(`BullQueue_${WEBHOOK_QUEUE}`,   { strict: false });
    dlqQueue     = app.get(`BullQueue_${DEAD_LETTER_QUEUE}`, { strict: false });
  } catch {
    logger.warn('Could not retrieve Bull queues from NestJS container for Bull Board');
    return;
  }

  const username = process.env.BULL_BOARD_USERNAME || 'admin';
  const password = process.env.BULL_BOARD_PASSWORD || 'admin';

  if (username === 'admin' && password === 'admin' && process.env.NODE_ENV === 'production') {
    logger.warn(
      '🚨 BULL_BOARD_USERNAME and BULL_BOARD_PASSWORD are using default values in production! ' +
      'Set them in your environment immediately.',
    );
  }

  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/admin/queues');

  createBullBoard({
    queues: [
      webhookQueue ? new BullAdapter(webhookQueue) : null,
      dlqQueue     ? new BullAdapter(dlqQueue)     : null,
    ].filter(Boolean),
    serverAdapter,
  });

  const httpAdapter = app.getHttpAdapter();
  const expressApp  = httpAdapter.getInstance();

  expressApp.use(
    '/admin/queues',
    basicAuth({
      users: { [username]: password },
      challenge: true,
      realm: 'WebhookOS Queue Monitor',
    }),
    serverAdapter.getRouter(),
  );

  logger.log(`📊 Bull Board available at /admin/queues (protected by basic auth)`);
}
