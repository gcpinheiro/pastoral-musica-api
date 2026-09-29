import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EmailModule } from '../email/email.module';
import { LeadershipController } from './leadership.controller';
import { LeadershipService } from './leadership.service';

@Module({
  imports: [EmailModule],
  controllers: [AuthController, LeadershipController],
  providers: [AuthService, LeadershipService],
  exports: [AuthService],
})
export class AuthModule {}
