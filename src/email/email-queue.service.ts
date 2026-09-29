import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';

@Injectable()
export class EmailQueueService {
  constructor(@InjectQueue('email-delivery') private readonly queue: Queue) {}
  async enqueueInvitation(data: {
    to: string;
    name: string;
    token: string;
  }): Promise<void> {
    await this.queue.add('user-invitation', data, {
      attempts: 5,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    });
  }
}
