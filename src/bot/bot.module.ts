import { Module, OnModuleInit, Logger } from '@nestjs/common';
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
    // ✅ Ordem correta: serviços base primeiro, depois os que dependem deles
    PrismaService,
    BotService,
    MessageProcessor,
    ItemLimitChecker,
    WeaponController,
    NotificationService,
    MessageListener,
  ],
  exports: [BotService, PrismaService],
})
export class BotModule implements OnModuleInit {
  private readonly logger = new Logger(BotModule.name);

  constructor(private readonly botService: BotService) {}

  async onModuleInit() {
    this.logger.log('🚀 BotModule inicializando...');

    // Aguarda o bot estar completamente pronto antes de inicializar o MemberListener
    setTimeout(() => {
      try {
        const client = this.botService.getClient();

        if (!client) {
          this.logger.error('❌ Client não disponível no BotModule');
          return;
        }

        if (!client.isReady()) {
          this.logger.warn('⚠️ Client ainda não está pronto, aguardando...');
          client.once('ready', () => {
            this.logger.log(
              '✅ Client pronto, inicializando MemberListener...',
            );
            new MemberListener(client);
          });
        } else {
          // Inicializa o MemberListener com o Client do BotService
          new MemberListener(client);
          this.logger.log('✅ MemberListener inicializado no BotModule');
        }
      } catch (error) {
        this.logger.error('❌ Erro ao inicializar MemberListener:', error);
      }
    }, 3000);
  }
}
