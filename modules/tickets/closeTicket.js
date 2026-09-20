const {
    Events,
    ChannelType,
    PermissionFlagsBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");

const { Pool } = require("pg");
const config = require("./config");

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes("localhost")
        ? false
        : { rejectUnauthorized: false }
});

module.exports = (client) => {

    client.on(Events.InteractionCreate, async interaction => {

        if (!interaction.isButton()) return;

        const id = interaction.customId;

        if (![
            "reclamar_ticket",
            "cerrar_ticket",
            "confirmar_eliminar"
        ].includes(id)) return;

        const canal = interaction.channel;
        const guild = interaction.guild;

        if (!guild || !canal) return;

        const esStaff =
            interaction.member.roles.cache.has(
                config.supportRole
            );

        const esSupervisor =
            interaction.member.roles.cache.has(
                config.supervisorRole
            );

        const esStaffAutorizado = esStaff || esSupervisor;

        const topic = canal.topic || "";

        const propietario =
            topic.match(/ticket-owner:(\d+)/)?.[1];

        const reclamado =
            topic.match(/claimed:(\d+|none)/)?.[1];

        const estaCerrado =
            topic.includes("status:closed");

        // =========================================
        // RECLAMAR TICKET
        // =========================================

        if (id === "reclamar_ticket") {

            if (!esStaffAutorizado) {
                return interaction.reply({
                    content: "❌ Solo el Staff puede reclamar tickets.",
                    ephemeral: true
                });
            }

            if (reclamado && reclamado !== "none") {
                return interaction.reply({
                    content: `❌ Este ticket ya fue reclamado por <@${reclamado}>.`,
                    ephemeral: true
                });
            }

            if (estaCerrado) {
                return interaction.reply({
                    content: "❌ Este ticket está cerrado.",
                    ephemeral: true
                });
            }

            await interaction.deferReply();

            try {

                const nombreCategoria =
                    `🔒 TICKETS ${interaction.user.username}`
                    .slice(0, 100);

                let categoria = guild.channels.cache.find(c =>
                    c.type === ChannelType.GuildCategory &&
                    c.name === nombreCategoria
                );

                if (!categoria) {

                    categoria = await guild.channels.create({
                        name: nombreCategoria,
                        type: ChannelType.GuildCategory,
                        permissionOverwrites: [
                            {
                                id: guild.roles.everyone.id,
                                deny: [
                                    PermissionFlagsBits.ViewChannel
                                ]
                            },
                            {
                                id: config.supervisorRole,
                                allow: [
                                    PermissionFlagsBits.ViewChannel
                                ]
                            },
                            {
                                id: interaction.user.id,
                                allow: [
                                    PermissionFlagsBits.ViewChannel
                                ]
                            }
                        ]
                    });

                } else {

                    await categoria.permissionOverwrites.edit(
                        interaction.user.id,
                        {
                            ViewChannel: true
                        }
                    );

                    await categoria.permissionOverwrites.edit(
                        config.supervisorRole,
                        {
                            ViewChannel: true
                        }
                    );
                }

                // Actualizar permisos del ticket
                await canal.permissionOverwrites.set([
                    {
                        id: guild.roles.everyone.id,
                        deny: [
                            PermissionFlagsBits.ViewChannel
                        ]
                    },
                    {
                        id: propietario,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.SendMessages,
                            PermissionFlagsBits.ReadMessageHistory,
                            PermissionFlagsBits.AttachFiles
                        ]
                    },
                    {
                        id: interaction.user.id,
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
                    },
                    {
                        id: config.supportRole,
                        deny: [
                            PermissionFlagsBits.ViewChannel
                        ]
                    }
                ]);

                // Mover a categoría privada
                await canal.setParent(categoria.id, {
                    lockPermissions: false
                });

                await canal.setTopic(
                    `ticket-owner:${propietario};` +
                    `type:${topic.match(/type:(\w+)/)?.[1] || "support"};` +
                    `claimed:${interaction.user.id}`
                );

                await pool.query(
                    `UPDATE tickets
                     SET claimed_by = $1
                     WHERE channel_id = $2`,
                    [interaction.user.id, canal.id]
                );

                await interaction.editReply({
                    content:
                        `🙋 Ticket reclamado por ${interaction.user}.\n` +
                        `🔒 Se ha movido a ${categoria.name}.\n` +
                        `Solo tú, el usuario y los supervisores tienen acceso.`
                });

            } catch (error) {

                console.error("Error reclamando ticket:", error);

                await interaction.editReply(
                    "❌ No se pudo reclamar el ticket."
                );
            }

            return;
        }

        // =========================================
        // CERRAR TICKET
        // =========================================

        if (id === "cerrar_ticket") {

            const esPropietario =
                interaction.user.id === propietario;

            const esReclamador =
                interaction.user.id === reclamado;

            if (
                !esStaffAutorizado &&
                !esPropietario &&
                !esReclamador
            ) {
                return interaction.reply({
                    content: "❌ No tienes permiso para cerrar este ticket.",
                    ephemeral: true
                });
            }

            if (estaCerrado) {
                return interaction.reply({
                    content: "❌ Este ticket ya está cerrado.",
                    ephemeral: true
                });
            }

            await canal.permissionOverwrites.edit(
                propietario,
                {
                    SendMessages: false
                }
            );

            await canal.setTopic(
                `${topic};status:closed`
            );

            await pool.query(
                `UPDATE tickets
                 SET status = 'closed',
                     closed_at = CURRENT_TIMESTAMP
                 WHERE channel_id = $1`,
                [canal.id]
            );

            const fila = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId("confirmar_eliminar")
                        .setLabel("Eliminar Ticket")
                        .setEmoji("🗑️")
                        .setStyle(ButtonStyle.Danger)
                );

            return interaction.reply({
                content:
                    "🔒 Ticket cerrado. El usuario ya no puede escribir.\n" +
                    "El Staff autorizado puede eliminarlo.",
                components: [fila]
            });
        }

        // =========================================
        // ELIMINAR TICKET
        // =========================================

        if (id === "confirmar_eliminar") {

            if (!esStaffAutorizado) {
                return interaction.reply({
                    content: "❌ Solo el Staff o supervisores pueden eliminar tickets.",
                    ephemeral: true
                });
            }

            if (!estaCerrado) {
                return interaction.reply({
                    content: "❌ Primero debes cerrar el ticket.",
                    ephemeral: true
                });
            }

            await interaction.reply({
                content: "🗑️ Eliminando ticket en 5 segundos..."
            });

            setTimeout(async () => {

                await canal.delete().catch(console.error);

            }, 5000);
        }
    });
};