const {
    ChannelType,
    PermissionFlagsBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    Events
} = require("discord.js");

const { Pool } = require("pg");
const config = require("./config");

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes("localhost")
        ? false
        : { rejectUnauthorized: false }
});

const tipos = {
    partner: {
        nombre: "Partner",
        emoji: "🤝"
    },
    buy: {
        nombre: "Buy",
        emoji: "🛒"
    },
    support: {
        nombre: "Support",
        emoji: "🎧"
    },
    remplace: {
        nombre: "Remplace",
        emoji: "🔄"
    }
};

module.exports = (client) => {

    client.on(Events.InteractionCreate, async interaction => {

        if (!interaction.isStringSelectMenu()) return;

        if (
            interaction.customId !==
            "seleccionar_tipo_ticket"
        ) return;

        await interaction.deferReply({
            ephemeral: true
        });

        try {

            const tipo = interaction.values[0];
            const datos = tipos[tipo];

            if (!datos) {
                return interaction.editReply(
                    "❌ Tipo de ticket no válido."
                );
            }

            const guild = interaction.guild;

            if (!guild || guild.id !== config.guildId) {
                return interaction.editReply(
                    "❌ Servidor no válido."
                );
            }

            const categoriaId =
                config.ticketCategories?.[tipo];

            const categoria = categoriaId
                ? await guild.channels.fetch(categoriaId)
                    .catch(() => null)
                : null;

            if (
                !categoria ||
                categoria.type !== ChannelType.GuildCategory
            ) {
                return interaction.editReply(
                    "❌ La categoría del ticket no existe o no está configurada."
                );
            }

            // Comprobar ticket abierto
            const existe = guild.channels.cache.find(c =>
                c.topic?.includes(
                    `ticket-owner:${interaction.user.id};`
                )
            );

            if (existe) {
                return interaction.editReply(
                    `❌ Ya tienes un ticket abierto: ${existe}`
                );
            }

            const permisos = [
                {
                    id: guild.roles.everyone.id,
                    deny: [
                        PermissionFlagsBits.ViewChannel
                    ]
                },
                {
                    id: interaction.user.id,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ReadMessageHistory,
                        PermissionFlagsBits.AttachFiles,
                        PermissionFlagsBits.EmbedLinks
                    ]
                },
                {
                    id: config.supportRole,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ReadMessageHistory
                    ]
                },
                {
                    id: config.supervisorRole,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ReadMessageHistory
                    ]
                }
            ];

            const nombreUsuario = interaction.user.username
                .toLowerCase()
                .replace(/[^a-z0-9-]/g, "")
                .slice(0, 15);

            const canal = await guild.channels.create({
                name: `ticket-${tipo}-${nombreUsuario}`,
                type: ChannelType.GuildText,
                parent: categoria.id,
                topic:
                    `ticket-owner:${interaction.user.id};` +
                    `type:${tipo};claimed:none`,
                permissionOverwrites: permisos
            });

            const embed = new EmbedBuilder()
                .setColor(config.embedColor)
                .setTitle(
                    `${datos.emoji} Ticket ${datos.nombre}`
                )
                .setDescription(`
Bienvenido, <@${interaction.user.id}>.

Tu ticket ha sido creado correctamente.

**Categoría:** ${datos.nombre}

Un miembro del Staff podrá reclamar tu ticket.
Por favor, explica detalladamente tu consulta.

━━━━━━━━━━━━━━━━━━━━━━

🔒 Este canal es privado.
`)
                .setFooter({
                    text: "ResellMe • Ticket System"
                })
                .setTimestamp();

            const botones = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId("reclamar_ticket")
                        .setLabel("Reclamar")
                        .setEmoji("🙋")
                        .setStyle(ButtonStyle.Success),

                    new ButtonBuilder()
                        .setCustomId("cerrar_ticket")
                        .setLabel("Cerrar")
                        .setEmoji("🔒")
                        .setStyle(ButtonStyle.Danger)
                );

            await canal.send({
                content:
                    `<@${interaction.user.id}> <@&${config.supportRole}>`,
                embeds: [embed],
                components: [botones]
            });

            await pool.query(
                `INSERT INTO tickets
                (channel_id, user_id, username, ticket_type)
                VALUES ($1, $2, $3, $4)`,
                [
                    canal.id,
                    interaction.user.id,
                    interaction.user.username,
                    tipo
                ]
            );

            await interaction.editReply({
                content: `✅ Ticket creado: ${canal}`
            });

        } catch (error) {

            console.error("Error creando ticket:", error);

            await interaction.editReply({
                content:
                    "❌ No se pudo crear el ticket. Contacta con un administrador."
            }).catch(() => {});
        }
    });
};