import { Global, Module } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { PrismaService } from './prisma.service';
import { BootstrapService } from './bootstrap.service';

@Global()
@Module({
  providers: [PrismaService, DatabaseService, BootstrapService],
  exports: [PrismaService, DatabaseService],
})
export class DatabaseModule {}
