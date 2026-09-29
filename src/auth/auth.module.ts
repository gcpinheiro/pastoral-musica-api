import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LeadershipController } from './leadership.controller';
import { LeadershipService } from './leadership.service';

@Module({
  controllers: [AuthController, LeadershipController],
  providers: [AuthService, LeadershipService],
  exports: [AuthService],
})
export class AuthModule {}
