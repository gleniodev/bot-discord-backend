import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BotService } from './bot/bot.service';
import { SyncUsersModule } from './bot/sync/sync-users.module';
import { BotListenersModule } from './bot/listeners/bot-listeners.module';
import { HealthController } from './health/health.controller';
// import { MedalsModule } from './bot/medals/medals.module';

@Module({
  imports: [
    SyncUsersModule,
    BotListenersModule,
    // MedalsModule,
  ],
  providers: [BotService, PrismaService],
  controllers: [HealthController],
})
export class AppModule {}
