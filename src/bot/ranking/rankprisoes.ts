// src/bot/ranking/rankprisoes.ts
import {
  ChatInputCommandInteraction,
  TextChannel,
  EmbedBuilder,
  SlashCommandBuilder,
  inlineCode,
  GuildMember,
  ChannelType,
} from 'discord.js';
import { DiscordSnowflake } from '@sapphire/snowflake';

const FIXED_CHANNEL_ID = '1355607647956766760';

// ---------- Slash command builder ----------
export const rankPrisoesData = new SlashCommandBuilder()
  .setName('rankprisoes')
  .setDescription(
    'Conta mensagens no canal prisões por militar em um intervalo de no máximo 15 dias e mostra um ranking.',
  )
  .addStringOption((opt) =>
    opt
      .setName('data_inicial')
      .setDescription('Data inicial (DD/MM/YYYY)')
      .setRequired(true),
  )
  .addStringOption((opt) =>
    opt
      .setName('data_final')
      .setDescription('Data final (DD/MM/YYYY)')
      .setRequired(true),
  );

// ---------- Utils ----------
function parseDateLoose(input: string): Date | null {
  const t = input.trim();
  let d: Date | null = null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    d = new Date(`${t}T00:00:00`);
  } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(t)) {
    const [dd, mm, yyyy] = t.split('/').map(Number);
    d = new Date(yyyy, mm - 1, dd, 0, 0, 0);
  }
  return isNaN(d?.getTime() ?? NaN) ? null : d!;
}

function diffDays(a: Date, b: Date) {
  const ms = Math.abs(b.getTime() - a.getTime());
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

async function resolveDisplayName(
  interaction: ChatInputCommandInteraction,
  userId: string,
) {
  let member: GuildMember | null = null;
  try {
    member = (await interaction.guild?.members.fetch(userId)) ?? null;
  } catch {
    /* ignore */
  }
  if (member)
    return member.nickname ?? member.user.globalName ?? member.user.username;
  const user = await interaction.client.users.fetch(userId).catch(() => null);
  return user?.globalName ?? user?.username ?? userId;
}

// ---------- Handler ----------
export async function runRankPrisoes(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply(); // público por padrão

  const startStr = interaction.options.getString('data_inicial', true);
  const endStr = interaction.options.getString('data_final', true);

  const start = parseDateLoose(startStr);
  const end = parseDateLoose(endStr);

  if (!start || !end) {
    return interaction.editReply(
      '❌ Datas inválidas. Use **YYYY-MM-DD** ou **DD/MM/YYYY**.',
    );
  }
  if (end < start) {
    return interaction.editReply(
      '❌ A data final precisa ser **maior ou igual** à data inicial.',
    );
  }
  const days = diffDays(start, end);
  if (days > 15) {
    return interaction.editReply(
      '❌ O intervalo máximo permitido é de **15 dias**.',
    );
  }

  // janela inclusiva: 00:00 do início até 23:59:59.999 do fim
  const startMs = new Date(
    start.getFullYear(),
    start.getMonth(),
    start.getDate(),
    0,
    0,
    0,
    0,
  ).getTime();
  const endMs = new Date(
    end.getFullYear(),
    end.getMonth(),
    end.getDate(),
    23,
    59,
    59,
    999,
  ).getTime();

  // busca canal fixo (cache ou fetch)
  const channel = (interaction.client.channels.cache.get(FIXED_CHANNEL_ID) ??
    (await interaction.client.channels
      .fetch(FIXED_CHANNEL_ID)
      .catch(() => null))) as TextChannel | null;

  if (!channel?.isTextBased() || channel.type !== ChannelType.GuildText) {
    return interaction.editReply(
      '❌ Não consegui acessar o canal de texto fixo.',
    );
  }

  // ===== Paginação correta (para trás) com deduplicação =====
  // Começa APÓS a data final para garantir inclusão do próprio dia final
  let cursorBeforeId: string | undefined = DiscordSnowflake.generate({
    timestamp: endMs + 1,
  }).toString();

  const processedIds = new Set<string>(); // evita contar a mesma mensagem mais de uma vez
  const counts = new Map<string, number>(); // userId -> mensagens
  let totalMessages = 0;

  const SAFETY_SCAN_CAP = 200_000; // proteção extra
  let reachedStartBoundary = false;

  while (true) {
    const batch = await channel.messages
      .fetch({ limit: 100, before: cursorBeforeId })
      .catch(() => null);
    if (!batch || batch.size === 0) break;

    // Ordena do mais novo para o mais antigo
    const msgs = [...batch.values()].sort(
      (a, b) => b.createdTimestamp - a.createdTimestamp,
    );

    // O ID mais antigo do batch (último após ordenar desc) será o novo cursor
    const oldestInBatch = msgs[msgs.length - 1];
    const nextCursor = oldestInBatch?.id;

    for (const msg of msgs) {
      const ts = msg.createdTimestamp;

      // se já chegou antes do início da janela, podemos parar
      if (ts < startMs) {
        reachedStartBoundary = true;
        break;
      }

      // dedup: se por algum motivo a msg reaparecer, não conta de novo
      if (processedIds.has(msg.id)) continue;
      processedIds.add(msg.id);

      // conta somente se estiver dentro da janela [start, end]
      if (ts >= startMs && ts <= endMs) {
        const authorId = msg.author?.id;
        if (authorId) {
          counts.set(authorId, (counts.get(authorId) ?? 0) + 1);
          totalMessages++;
        }
      }
    }

    cursorBeforeId = nextCursor;

    if (!cursorBeforeId) break;
    if (reachedStartBoundary) break;
    if (processedIds.size >= SAFETY_SCAN_CAP) break;

    await sleep(200); // evita rate limit
  }

  if (counts.size === 0) {
    return interaction.editReply(
      `ℹ️ Não encontrei mensagens no canal entre **${startStr}** e **${endStr}**.`,
    );
  }

  // ordena ranking
  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]);

  // monta linhas (máx. 50)
  const MAX_LINES = 50;
  const lines: string[] = [];
  let rank = 1;

  for (const [userId, qty] of entries.slice(0, MAX_LINES)) {
    const name = await resolveDisplayName(interaction, userId);
    lines.push(`**${rank}.** ${name} — ${qty}`);
    rank++;
  }

  const embed = new EmbedBuilder()
    .setTitle('🏆 Ranking de Prisões')
    .setDescription(
      [
        `Canal: <#${FIXED_CHANNEL_ID}>`,
        `Período: ${inlineCode(startStr)} → ${inlineCode(endStr)}`,
        `Mensagens no intervalo: **${totalMessages}**`,
        '',
        lines.join('\n'),
        entries.length > MAX_LINES
          ? `\n… e mais **${entries.length - MAX_LINES}** usuários.`
          : '',
      ].join('\n'),
    )
    .setFooter({ text: 'Janela máxima permitida: 15 dias' });

  await interaction.editReply({ embeds: [embed] });
}
