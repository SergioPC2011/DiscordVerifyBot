const {
    EmbedBuilder,
    ButtonBuilder,
    ActionRowBuilder,
    ButtonStyle
} = require("discord.js");

const config = require("./config");

module.exports = async (client) => {

    const canal = await client.channels.fetch(config.panelChannel);

    if (!canal) {
        console.log("❌ No se encontró el canal del panel de tickets.");
        return;
    }

    const embed = new EmbedBuilder()

        .setColor(config.embedColor)

        .setTitle("🎫 SISTEMA TICKETS YELLOW DEVILS")

        .setThumbnail(client.user.displayAvatarURL())

        .setDescription(`
# 📋 Sistema de Postulaciones

¿Quieres formar parte de **YELLOW DEVILS**?

Pulsa el botón de abajo para abrir un ticket privado.

━━━━━━━━━━━━━━━━━━━━━━

✅ Tu ticket será visible únicamente por ti y el Staff.

📝 Completa toda la plantilla.

⏳ Espera la respuesta del equipo.

⚠ Solo puedes tener **un ticket abierto**.

━━━━━━━━━━━━━━━━━━━━━━
`)

        .setFooter({
            text: "YELLOW DEVILS • Sistema de Tickets"
        })

        .setTimestamp();

    const boton = new ButtonBuilder()

        .setCustomId("crear_ticket")

        .setLabel("Abrir Postulación")

        .setEmoji("🎫")

        .setStyle(ButtonStyle.Primary);

    const fila = new ActionRowBuilder()

        .addComponents(boton);

    await canal.send({

        embeds: [embed],

        components: [fila]

    });

    console.log("✅ Panel de tickets enviado.");

};