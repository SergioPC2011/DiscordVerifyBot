const {
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder
} = require("discord.js");

const config = require("./config");

module.exports = async (client) => {

    const canal = await client.channels.fetch(
        config.panelChannel
    );

    if (!canal) {
        console.log("❌ No se encontró el canal del panel.");
        return;
    }

    const embed = new EmbedBuilder()
        .setColor(config.embedColor)
        .setTitle("🎫 Yellow Shop | Ticket System")
        .setThumbnail(client.user.displayAvatarURL())
        .setDescription(`
# Bienvenido al centro de soporte

Selecciona el tipo de ticket que necesitas.

🤝 **Partner**
Colaboraciones y asociaciones.

🛒 **Buy**
Consultas relacionadas con compras.

🎧 **Support**
Ayuda general y problemas.

🔄 **Remplace**
Reemplazos de productos.

━━━━━━━━━━━━━━━━━━━━━━

🔒 Tus tickets son privados.
👤 Solo puedes tener un ticket abierto.
📩 Nuestro equipo te atenderá lo antes posible.
`)
        .setFooter({
            text: "Yellow Shop • Ticket System"
        })
        .setTimestamp();

    const menu = new StringSelectMenuBuilder()
        .setCustomId("seleccionar_tipo_ticket")
        .setPlaceholder("🎫 Selecciona una categoría")
        .addOptions(
            {
                label: "Partner",
                description: "Colaboraciones y asociaciones",
                value: "partner",
                emoji: "🤝"
            },
            {
                label: "Buy",
                description: "Consultas sobre compras",
                value: "buy",
                emoji: "🛒"
            },
            {
                label: "Support",
                description: "Ayuda general",
                value: "support",
                emoji: "🎧"
            },
            {
                label: "Remplace",
                description: "Reemplazos de productos",
                value: "remplace",
                emoji: "🔄"
            }
        );

    const fila = new ActionRowBuilder()
        .addComponents(menu);

    await canal.send({
        embeds: [embed],
        components: [fila]
    });

    console.log("✅ Panel avanzado enviado.");
};