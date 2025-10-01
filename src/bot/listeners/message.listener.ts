// src/bot/listeners/message.listener.ts
import {
  Injectable,
  OnModuleInit,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { BotService } from '../bot.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { SyncUsersService } from '../sync/sync-users.service';
import { MessageProcessor } from './processors/message.processor';
import { ItemLimitChecker } from './checkers/item-limit.checker';
import { WeaponController } from './controllers/weapon.controller';
import { NotificationService } from './services/notification.service';

@Injectable()
export class MessageListener implements OnModuleInit {
  private readonly logger = new Logger(MessageListener.name);

  constructor(
    @Inject(forwardRef(() => BotService))
    private readonly botService: BotService,
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => SyncUsersService))
    private readonly syncUsersService: SyncUsersService,
    private readonly messageProcessor: MessageProcessor,
    private readonly itemLimitChecker: ItemLimitChecker,
    private readonly weaponController: WeaponController,
    private readonly notificationService: NotificationService,
  ) {
    this.logger.log('🔧 MessageListener constructor chamado');
  }

  async onModuleInit() {
    this.logger.log('🔧 Inicializando MessageListener...');

    // Aguarda um pouco para garantir que tudo está pronto
    await new Promise((resolve) => setTimeout(resolve, 3000));

    try {
      // Verifica se o botService está disponível
      if (!this.botService) {
        this.logger.error('❌ BotService ainda não está disponível');
        return;
      }

      // Aguarda o BotService estar completamente pronto
      await this.botService.waitForReady(15000);
      this.logger.log('✅ BotService está pronto, configurando listeners...');
      this.configurarListeners();
    } catch (error) {
      this.logger.error('❌ Erro ao aguardar BotService:', error);
      // Tenta mesmo assim após um delay adicional
      setTimeout(() => {
        this.logger.warn('⚠️ Tentando configurar listeners após erro...');
        try {
          this.configurarListeners();
        } catch (err) {
          this.logger.error(
            '❌ Falha definitiva ao configurar listeners:',
            err,
          );
        }
      }, 5000);
    }
  }

  private configurarListeners() {
    try {
      const client = this.botService.getClient();

      if (!client) {
        this.logger.error('❌ Client não disponível no BotService!');
        return;
      }

      if (!client.isReady()) {
        this.logger.warn(
          '⚠️ Bot ainda não está pronto, aguardando evento ready...',
        );
        client.once('ready', () => {
          this.logger.log('✅ Bot ficou pronto, configurando listeners...');
          this.adicionarEventListeners();
        });
      } else {
        this.logger.log('✅ Bot já está pronto, configurando listeners...');
        this.adicionarEventListeners();
      }
    } catch (error) {
      this.logger.error('❌ Erro ao configurar listeners:', error);
    }
  }

  private adicionarEventListeners() {
    const client = this.botService.getClient();

    if (!client) {
      this.logger.error(
        '❌ Não foi possível adicionar event listeners - client não disponível',
      );
      return;
    }

    client.on('messageCreate', async (message) => {
      try {
        this.logger.debug(
          `📨 Mensagem recebida no canal: ${message.channel.id}`,
        );

        // Ignora mensagens do próprio bot
        if (message.author.id === client.user?.id) {
          return;
        }

        // Processa a mensagem usando o MessageProcessor
        const processedData =
          await this.messageProcessor.processMessage(message);

        if (!processedData) {
          return; // Mensagem não é relevante ou não foi processada
        }

        this.logger.log(
          `📝 Processando: ${processedData.nickname} - ${processedData.acao} - ${processedData.item} x${processedData.quantidade}`,
        );

        // Salva no banco
        try {
          await this.prisma.itemLog.create({
            data: {
              nickname: processedData.nickname,
              fixo: processedData.fixo,
              itemSlug: processedData.item.toLowerCase(),
              quantidade: processedData.quantidade,
              acao: processedData.acao,
              cidade: processedData.city,
              dataHora: processedData.dataHora,
            },
          });
          this.logger.log('✅ Log salvo no banco com sucesso');
        } catch (error) {
          this.logger.error('❌ Erro ao salvar no banco:', error);
          return;
        }

        // Verifica se é item removido (controle de limite)
        if (processedData.acao.toLowerCase().includes('removido')) {
          await this.itemLimitChecker.verificarLimiteItem(
            client,
            processedData.nickname,
            processedData.item,
            processedData.quantidade,
            processedData.dataHora,
            processedData.city,
          );
        }

        // Verifica se é item adicionado (possível devolução)
        if (processedData.acao.toLowerCase().includes('adicionado')) {
          await this.itemLimitChecker.verificarDevolucaoItem(
            client,
            processedData.nickname,
            processedData.item,
            processedData.quantidade,
            processedData.dataHora,
            processedData.city,
          );
        }
      } catch (error) {
        this.logger.error('❌ Erro geral ao processar mensagem:', error);
      }
    });

    this.logger.log('✅ Event listeners configurados com sucesso!');
  }
}
