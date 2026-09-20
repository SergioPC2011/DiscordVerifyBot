
const {
    Events,
    ChannelType,
    PermissionFlagsBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    AttachmentBuilder
} = require("discord.js");

const { Pool } = require("pg");
const config = require("./config");

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes("localhost")
        ? false
        : { rejectUnauthorized: false }
});

// Escapar texto para que no rompa el HTML
function escapeHTML(text = "") {
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Obtener todo el historial del canal
async function obtenerMensajes(canal) {
    let mensajes = [];
    let lastId;

    while (true) {
        const opciones = { limit: 100 };

        if (lastId) opciones.before = lastId;

        const lote = await canal.messages.fetch(opciones);

        if (lote.size === 0) break;

        mensajes.push(...lote.values());

        lastId = lote.last().id;

        if (lote.size < 100) break;
    }

    // Orden cronológico: más antiguo primero
    return mensajes.sort(
        (a, b) => a.createdTimestamp - b.createdTimestamp
    );
}

// Crear el archivo HTML de la transcripción
function crearHTML(mensajes, canal, propietario) {
    const contenido = mensajes.map(msg => {
        const fecha = new Date(msg.createdTimestamp)
            .toLocaleString("es-ES", {
                dateStyle: "short",
                timeStyle: "medium",
                timeZone: "Europe/Madrid"
            });

        const autor = escapeHTML(
            msg.author?.tag || "Usuario desconocido"
        );

        const avatar = msg.author?.displayAvatarURL({
            extension: "png",
            size: 64
        }) || "";

        const texto = escapeHTML(msg.content || "")
            .replace(/\n/g, "<br>");

        const adjuntos = [...msg.attachments.values()]
            .map(a =>
                `<li><a href="${escapeHTML(a.url)}" target="_blank">` +
                `${escapeHTML(a.name || "Archivo adjunto")}</a></li>`
            )
            .join("");

        const embeds = msg.embeds.map(e => {
            const titulo = escapeHTML(e.title || "");
            const descripcion = escapeHTML(e.description || "")
                .replace(/\n/g, "<br>");

            if (!titulo && !descripcion) return "";

            return `<div class="embed">
                <strong>${titulo}</strong><br>${descripcion}
            </div>`;
        }).join("");

        return `
            <div class="message">
                <img class="avatar" src="${escapeHTML(avatar)}">
                <div class="body">
                    <div class="meta">
                        <strong>${autor}</strong>
                        <span>${fecha}</span>
                    </div>
                    <div class="text">${texto || ""}</div>
                    ${adjuntos ? `<ul>${adjuntos}</ul>` : ""}
                    ${embeds}
                </div>
            </div>
        `;
    }).join("");

    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Transcripción ${escapeHTML(canal.name)}</title>
<style>
body {
    background: #313338;
    color: #dbdee1;
    font-family: Arial, sans-serif;
    padding: 24px;
}
h1 { color: #ffd400; }
.info {
    background: #232428;
    padding: 15px;
    border-radius: 8px;
    margin-bottom: 24px;
}
.message {
    display: flex;
    gap: 12px;
    padding: 14px 0;
    border-bottom: 1px solid #41434a;
}
.avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
}
.body { flex: 1; min-width: 0; }
.meta { margin-bottom: 6px; }
.meta span {
    color: #949ba4;
    font-size: 12px;
    margin-left: 8px;
}
.text { overflow-wrap: anywhere; }
a { color: #00a8fc; }
.embed {
    border-left: 4px solid #ffd400;
    background: #232428;
    padding: 10px;
    margin-top: 8px;
}
</style>
</head>
<body>
<h1>Yellow Shop | Ticket System</h1>
<div class="info">
    <strong>Canal:</strong> ${escapeHTML(canal.name)}<br>
    <strong>ID del ticket:</strong> ${escapeHTML(canal.id)}<br>
    <strong>Usuario:</strong> ${escapeHTML(propietario)}<br>
    <strong>Mensajes:</strong> ${mensajes.length}<br>
    <strong>Fecha de exportación:</strong>
    ${new Date().toLocaleString("es-ES", {
        timeZone: "Europe/Madrid"
    })}
</div>
${contenido}
</body>
</html>`;
}

// Generar y entregar la transcripción
async function enviarTranscripcion(client, canal, propietario) {
    const mensajes = await obtenerMensajes(canal);

    const html = crearHTML(
        mensajes,
        canal,
        propietario
    );

    const buffer = Buffer.from(html, "utf-8");

    const archivo = new AttachmentBuilder(buffer, {
        name: `transcripcion-${canal.id}.html`
    });

    const embed = new EmbedBuilder()
        .setColor(config.embedColor)
        .setTitle("📑 Transcripción de ticket")
        .setDescription(
            `**Canal:** #${canal.name}\n` +
            `**Usuario:** <@${propietario}>\n` +
            `**Mensajes:** ${mensajes.length}\n` +
            `**Ticket:** \`${canal.id}\``
        )
        .setTimestamp();

    // Enviar al canal de transcripciones
    const canalLogs = await client.channels.fetch(
        config.transcriptChannel
    );

    if (!canalLogs || !canalLogs.isTextBased()) {
        throw new Error(
            "El canal de transcripciones no existe o no es de texto."
        );
    }

    const mensajeLogs = await canalLogs.send({
        embeds: [embed],
        files: [archivo]
    });

    // Obtener enlace de descarga del archivo
    const urlLogs = mensajeLogs.attachments.first()?.url;

    // Enviar por MD al propietario
    let dmEnviado = false;

    try {
        const usuario = await client.users.fetch(propietario);

        const mensajeDM = await usuario.send({
            content:
                "🔒 Tu ticket de **Yellow Shop | Ticket System** " +
                "ha sido cerrado.\n\n" +
                "Aquí tienes la transcripción completa de la conversación:",
            files: [
                new AttachmentBuilder(buffer, {
                    name: `transcripcion-${canal.id}.html`
                })
            ]
        });

        const urlDM = mensajeDM.attachments.first()?.url;

        if (urlDM) {
            await usuario.send(
                `📥 **Descargar tu transcripción:**\n${urlDM}`
            );
        }

        dmEnviado = true;

    } catch (error) {
        console.error(
            "No se pudo enviar la transcripción por MD:",
            error.message
        );
    }

    // Dejar constancia del resultado del MD en logs
    await canalLogs.send({
        content:
            `${dmEnviado
                ? "✅ Transcripción enviada por MD."
                : "⚠️ No se pudo enviar la transcripción por MD."
            }\n` +
            (urlLogs
                ? `📥 **Descargar transcripción:** ${urlLogs}`
                : "")
    });

    return { dmEnviado, urlLogs };
}

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

        const member = interaction.member;

        const esStaff =
            member.roles?.cache?.has(config.supportRole);

        const esSupervisor =
            member.roles?.cache?.has(config.supervisorRole);

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

            if (!propietario) {
                return interaction.reply({
                    content: "❌ No se ha encontrado el propietario del ticket.",
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
                                deny: [PermissionFlagsBits.ViewChannel]
                            },
                            {
                                id: config.supervisorRole,
                                allow: [PermissionFlagsBits.ViewChannel]
                            },
                            {
                                id: interaction.user.id,
                                allow: [PermissionFlagsBits.ViewChannel]
                            }
                        ]
                    });
                } else {
                    await categoria.permissionOverwrites.edit(
                        interaction.user.id,
                        { ViewChannel: true }
                    );

                    await categoria.permissionOverwrites.edit(
                        config.supervisorRole,
                        { ViewChannel: true }
                    );
                }

                await canal.permissionOverwrites.set([
                    {
                        id: guild.roles.everyone.id,
                        deny: [PermissionFlagsBits.ViewChannel]
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
                        deny: [PermissionFlagsBits.ViewChannel]
                    }
                ]);

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
        // CERRAR TICKET + TRANSCRIPCIÓN
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

            if (!propietario) {
                return interaction.reply({
                    content: "❌ No se ha encontrado el propietario del ticket.",
                    ephemeral: true
                });
            }

            await interaction.deferReply();

            try {
                // Generar y enviar transcripción antes de cerrar
                const resultado = await enviarTranscripcion(
                    client,
                    canal,
                    propietario
                );

                // Bloquear al usuario
                await canal.permissionOverwrites.edit(
                    propietario,
                    { SendMessages: false }
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

                await interaction.editReply({
                    content:
                        "🔒 Ticket cerrado correctamente.\n" +
                        "📑 Transcripción guardada en el canal de registros.\n" +
                        (resultado.dmEnviado
                            ? "📩 Transcripción enviada al usuario por MD.\n"
                            : "⚠️ No se pudo enviar el MD al usuario.\n"
                        ) +
                        "El Staff autorizado puede eliminar el ticket.",
                    components: [fila]
                });

            } catch (error) {
                console.error(
                    "Error cerrando ticket/transcripción:",
                    error
                );

                await interaction.editReply({
                    content:
                        "⚠️ Hubo un error al generar o enviar la transcripción. " +
                        "El ticket no se ha cerrado; revisa los logs y permisos."
                }).catch(() => {});
            }

            return;
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