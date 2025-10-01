// import { Module } from '@nestjs/common';
// import { BotService } from './bot.service';
// import { MessageListener } from './listeners/message.listener';
// import { PrismaService } from '../../prisma/prisma.service';
// import { SyncUsersModule } from './sync/sync-users.module';
// // import { MedalsService } from './medals/medals.service';
// import { MemberListener } from './listeners/member.listener';
// import { Client, GatewayIntentBits, Partials } from 'discord.js';

// @Module({
//   imports: [SyncUsersModule],
//   providers: [BotService, MessageListener, PrismaService],
// })
// export class BotModule {
//   public client: Client;

//   constructor() {
//     this.client = new Client({
//       intents: [
//         GatewayIntentBits.Guilds,
//         GatewayIntentBits.GuildMembers,
//         GatewayIntentBits.GuildMessages,
//         GatewayIntentBits.MessageContent, // se você já usa
//       ],
//       partials: [Partials.GuildMember, Partials.User],
//     });

//     // Registra listeners (inclui welcome/leave + invites)
//     new MemberListener(this.client);
//   }

//   public async start(token: string) {
//     await this.client.login(token);
//   }
// }
import { Module, OnModuleInit } from '@nestjs/common';
import { BotService } from './bot.service';
import { MessageListener } from './listeners/message.listener';
import { PrismaService } from '../../prisma/prisma.service';
import { SyncUsersModule } from './sync/sync-users.module';
import { MemberListener } from './listeners/member.listener';
import { MessageProcessor } from './listeners/processors/message.processor';
import { ItemLimitChecker } from './listeners/checkers/item-limit.checker';
import { WeaponController } from './listeners/controllers/weapon.controller';
import { NotificationService } from './listeners/services/notification.service';

@Module({
  imports: [SyncUsersModule],
  providers: [
    BotService,
    MessageListener,
    PrismaService,
    MessageProcessor,
    ItemLimitChecker,
    WeaponController,
    NotificationService,
  ],
  exports: [BotService],
})
export class BotModule implements OnModuleInit {
  constructor(private readonly botService: BotService) {}

  onModuleInit() {
    // Aguarda o bot estar pronto antes de inicializar o MemberListener
    setTimeout(() => {
      const client = this.botService.getClient();

      if (!client) {
        console.error('❌ Client não disponível no BotModule');
        return;
      }

      // Inicializa o MemberListener com o Client do BotService
      new MemberListener(client);
      console.log('✅ MemberListener inicializado no BotModule');
    }, 3000); // 3 segundos para garantir que tudo está pronto
  }
}
