import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from './prisma.service';

@Injectable()
export class BootstrapService implements OnModuleInit {
  private readonly logger = new Logger(BootstrapService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.config.get<string>('BOOTSTRAP_ADMIN_ENABLED', 'false') !== 'true')
      return;
    const email = this.config.get<string>('BOOTSTRAP_ADMIN_EMAIL');
    const password = this.config.get<string>('BOOTSTRAP_ADMIN_PASSWORD');
    if (
      !email ||
      !password ||
      password.length < 12 ||
      (this.config.get('NODE_ENV') === 'production' &&
        /change-me|password|admin/i.test(password)) ||
      (await this.prisma.users.count({ where: { role: 'SUPER_ADMIN' } })) > 0 ||
      (await this.prisma.users.findUnique({
        where: { email: email.toLowerCase() },
      }))
    )
      return;
    await this.prisma.users.create({
      data: {
        name: this.config.get('BOOTSTRAP_ADMIN_NAME', 'Administrador global'),
        email: email.toLowerCase(),
        password_hash: await bcrypt.hash(password, 12),
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
      },
    });
    this.logger.log('Bootstrap SUPER_ADMIN created');
  }
}
