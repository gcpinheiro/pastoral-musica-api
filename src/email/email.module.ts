import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { EmailQueueService } from './email-queue.service';

@Module({
  imports: [BullModule.registerQueue({ name: 'email-delivery' })],
  providers: [EmailQueueService],
  exports: [EmailQueueService],
})
export class EmailModule {}
