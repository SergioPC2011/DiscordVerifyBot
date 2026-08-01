const {
    ChannelType,
    PermissionFlagsBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    Events
} = require("discord.js");

const config = require("./config");

module.exports = (client) => {

    client.on(Events.InteractionCreate, async interaction => {

        if (!interaction.isButton()) return;

        if (interaction.customId !== "crear_ticket") return;

        const guild = client.guilds.cache.get(config.guildId);

        if (!guild) return;

        // Evitar tickets duplicados
        const existe = guild.channels.cache.find(c =>
            c.name === `ticket-${interaction.user.id}`
        );

        if (existe) {

            return interaction.reply({
                content: "❌ Ya tienes un ticket abierto.",
                ephemeral: true
            });

        }

        // Crear canal
        const canal = await guild.channels.create({

            name: `ticket-${interaction.user.username}`,

            type: ChannelType.GuildText,

            permissionOverwrites: [

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
                        PermissionFlagsBits.ReadMessageHistory
                    ]
                },

                {
                    id: config.supportRole,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ReadMessageHistory
                    ]
                }

            ]

        });

        const embed = new EmbedBuilder()

            .setColor(config.embedColor)

            .setTitle("🎫 POSTULACIÓN YELLOW DEVILS")

            .setDescription(`
Bienvenido.

Completa la siguiente plantilla.

━━━━━━━━━━━━━━━━━━━━━━

Nombre OOC:

Nombre IC:

Edad OOC:

Steam URL:

TIEMPO DISPO:

5 CLIPS O HG:

━━━━━━━━━━━━━━━━━━━━━━

Cuando termines espera la respuesta del Staff.
`);

        const botones = new ActionRowBuilder()

            .addComponents(

                new ButtonBuilder()

                    .setCustomId("cerrar_ticket")

                    .setLabel("Cerrar Ticket")

                    .setEmoji("🔒")

                    .setStyle(ButtonStyle.Danger)

            );

        await canal.send({

            content: `<@${interaction.user.id}> <@&${config.supportRole}>`,

            embeds: [embed],

            components: [botones]

        });
const { Pool } = require("pg");

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes("localhost")
        ? false
        : { rejectUnauthorized: false }
});

await pool.query(
`
INSERT INTO tickets
(
channel_id,
user_id,
username
)
VALUES($1,$2,$3)
`,
[
    canal.id,
    interaction.user.id,
    interaction.user.username
]);

console.log("💾 Ticket guardado en PostgreSQL.");
        await interaction.reply({

            content: `✅ Ticket creado: ${canal}`,

            ephemeral: true

        });

    });

};