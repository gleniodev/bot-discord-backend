import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BotService } from './bot/bot.service';
import { SyncUsersModule } from './bot/sync/sync-users.module';
import { BotListenersModule } from './bot/listeners/bot-listeners.module'; // 👈 Adicione esta linha
// import { MedalsModule } from './bot/medals/medals.module';

@Module({
  imports: [
    SyncUsersModule,
    BotListenersModule,
    // MedalsModule,
  ],
  providers: [BotService, PrismaService],
  // Remova MessageListener daqui, pois agora está no BotListenersModule
})
export class AppModule {}
