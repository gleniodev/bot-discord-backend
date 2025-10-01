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
  imports: [
    SyncUsersModule, // ✅ Importa o módulo que exporta SyncUsersService
  ],
  providers: [
    // ✅ Ordem de providers é importante
    PrismaService, // 1. Serviços base primeiro
    BotService, // 2. BotService (não tem dependências complexas)
    MessageProcessor, // 3. Processadores
    ItemLimitChecker, // 4. Checkers
    WeaponController, // 5. Controllers
    NotificationService, // 6. Services auxiliares
    MessageListener, // 7. Listeners por último (dependem de tudo acima)
  ],
  exports: [BotService, PrismaService], // ✅ Exporta para outros módulos
})
export class BotModule implements OnModuleInit {
  constructor(private readonly botService: BotService) {}

  async onModuleInit() {
    this.logger.log('🚀 BotModule inicializando...');

    // Aguarda o bot estar completamente pronto antes de inicializar o MemberListener
    setTimeout(() => {
      try {
        const client = this.botService.getClient();

        if (!client) {
          console.error('❌ Client não disponível no BotModule');
          return;
        }

        if (!client.isReady()) {
          console.warn('⚠️ Client ainda não está pronto, aguardando...');
          client.once('ready', () => {
            console.log('✅ Client pronto, inicializando MemberListener...');
            new MemberListener(client);
          });
        } else {
          // Inicializa o MemberListener com o Client do BotService
          new MemberListener(client);
          console.log('✅ MemberListener inicializado no BotModule');
        }
      } catch (error) {
        console.error('❌ Erro ao inicializar MemberListener:', error);
      }
    }, 3000);
  }

  private readonly logger = {
    log: (message: string) => console.log(`[BotModule] ${message}`),
    error: (message: string, error?: any) =>
      console.error(`[BotModule] ${message}`, error),
  };
}
