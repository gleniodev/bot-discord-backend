import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  Events,
} from 'discord.js';
import { config } from 'dotenv';
import { rankPrisoesData, runRankPrisoes } from './ranking/rankprisoes';

config();

@Injectable()
export class BotService implements OnModuleInit {
  private client: Client;
  private readonly logger = new Logger(BotService.name);

  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        // MessageContent não é necessário para contar mensagens, mas
        // mantenho caso você use em outros recursos:
        GatewayIntentBits.MessageContent,
        // Recomendado para resolver nickname de forma confiável:
        GatewayIntentBits.GuildMembers,
      ],
      partials: [
        Partials.Message,
        Partials.Channel,
        Partials.Reaction,
        Partials.User,
        Partials.GuildMember,
      ],
    });

    // === Debug / observabilidade ===
    this.client.on(Events.ClientReady, async (c) => {
      this.logger.log(`✅ Bot conectado como ${c.user.tag}`);
      this.logger.log(`📊 Servidores: ${this.client.guilds.cache.size}`);
      await this.registerSlashCommands(); // <-- registra /rankprisoes aqui
    });

    this.client.on('error', (error) => {
      this.logger.error('❌ Erro no Discord Client:', error);
    });

    this.client.on('warn', (warning) => {
      this.logger.warn('⚠️ Aviso do Discord:', warning);
    });

    // === Dispatcher de interações ===
    this.client.on(Events.InteractionCreate, async (interaction) => {
      if (!interaction.isChatInputCommand()) return;

      try {
        if (interaction.commandName === 'rankprisoes') {
          await runRankPrisoes(interaction);
        }
      } catch (err) {
        this.logger.error(
          '❌ Erro ao executar comando /rankprisoes',
          err as any,
        );
        if (interaction.isRepliable()) {
          const content = '❌ Ocorreu um erro ao processar o comando.';
          if (interaction.deferred || interaction.replied) {
            await interaction.editReply(content).catch(() => {});
          } else {
            await interaction
              .reply({ content, ephemeral: true })
              .catch(() => {});
          }
        }
      }
    });
  }

  // ========== Lifecycle ==========
  async onModuleInit() {
    const token = process.env.DISCORD_TOKEN;
    if (!token) {
      this.logger.error(
        '❌ DISCORD_TOKEN não encontrado nas variáveis de ambiente!',
      );
      throw new Error('DISCORD_TOKEN é obrigatório');
    }

    this.logger.log('🔐 Fazendo login no Discord...');
    try {
      await this.client.login(token);
      this.logger.log('✅ Login realizado com sucesso!');
    } catch (error) {
      this.logger.error('❌ Erro ao fazer login no Discord:', error);
      throw error;
    }
  }

  // ========== Registro de comandos ==========
  private async registerSlashCommands() {
    const token = process.env.DISCORD_TOKEN!;
    const appId = process.env.DISCORD_CLIENT_ID;
    const guildId = process.env.DISCORD_GUILD_ID; // opcional p/ registrar mais rápido

    if (!appId) {
      this.logger.error(
        '❌ DISCORD_CLIENT_ID não configurado — não foi possível registrar comandos.',
      );
      return;
    }

    const rest = new REST({ version: '10' }).setToken(token);
    const body = [rankPrisoesData.toJSON()];

    try {
      if (guildId) {
        await rest.put(Routes.applicationGuildCommands(appId, guildId), {
          body,
        });
        this.logger.log(
          `📦 Comandos registrados no GUILD ${guildId} (propagação imediata).`,
        );
      } else {
        await rest.put(Routes.applicationCommands(appId), { body });
        this.logger.log(
          '📦 Comandos registrados GLOBALMENTE (pode levar alguns minutos).',
        );
      }
    } catch (err) {
      this.logger.error(
        '❌ Falha ao registrar comandos de aplicação',
        err as any,
      );
    }
  }

  // ========== Utilidades públicas ==========
  getClient(): Client {
    return this.client;
  }

  async start() {
    if (!this.client.isReady()) {
      await this.onModuleInit();
    }
  }

  isReady(): boolean {
    return this.client.isReady();
  }

  async waitForReady(timeoutMs: number = 30000): Promise<void> {
    if (this.client.isReady()) return;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Timeout: Bot não conectou em ${timeoutMs}ms`));
      }, timeoutMs);

      this.client.once(Events.ClientReady, () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }
}
