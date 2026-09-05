require("dotenv").config();
const express = require("express");
const axios = require("axios");
const path = require("path");
const crypto = require("crypto");

const {
    Client,
    GatewayIntentBits,
    ButtonBuilder,
    ButtonStyle,
    ActionRowBuilder,
    EmbedBuilder,
    Events,
    StringSelectMenuBuilder,
    SlashCommandBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    PermissionFlagsBits
} = require("discord.js");

const { Pool } = require("pg");


// =====================================================
// CONFIGURACIÓN
// =====================================================

const verificationServers = {

    // SERVIDOR 1
    "1515037603219509309": {
        channelId: "1529576800869683292",
        roleId: "1532089874247844010"
    },

    // SERVIDOR 2
    "1519063238866636851": {
        channelId: "1545441908283801731",
        roleId: "1519063337923641534"
    }

};


// =====================================================
// CONFIGURACIÓN DE AÑADIR USUARIOS
// =====================================================

// Tiempo entre usuarios
const MASS_JOIN_DELAY_MS = 1500;


// Estados temporales OAuth
const oauthStates = new Map();

// =====================================================
// KEYS DE LA WEB
// =====================================================

const webKeySessions = new Map();
const adminKeySessions = new Map();
const WEB_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function generateWebKey() {
    return `DV-${crypto.randomBytes(18).toString("hex").toUpperCase()}`;
}

function parseCookies(req) {
    const header = req.headers.cookie || "";
    const cookies = {};

    for (const part of header.split(";")) {
        const index = part.indexOf("=");
        if (index === -1) continue;

        const name = part.slice(0, index).trim();
        const value = part.slice(index + 1).trim();
        cookies[name] = decodeURIComponent(value);
    }

    return cookies;
}

function setSessionCookie(res, name, value, maxAge) {
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";

    res.setHeader(
        "Set-Cookie",
        `${name}=${encodeURIComponent(value)}; Max-Age=${Math.floor(maxAge / 1000)}; Path=/; HttpOnly; SameSite=Lax${secure}`
    );
}

function clearSessionCookie(res, name) {
    res.setHeader(
        "Set-Cookie",
        `${name}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`
    );
}

function createSession(store, data, ttl) {
    const token = crypto.randomBytes(32).toString("hex");

    store.set(token, {
        ...data,
        expiresAt: Date.now() + ttl
    });

    return token;
}

function getValidSession(store, token) {

    if (!token) {
        return null;
    }

    const session = store.get(token);

    if (!session) {
        return null;
    }

    if (session.expiresAt <= Date.now()) {

        store.delete(token);

        return null;
    }

    return session;
}

function requireWebKey(req, res, next) {

    const cookies =
        parseCookies(req);

    const session =
        getValidSession(
            webKeySessions,
            cookies.web_key_session
        );

    if (!session) {

        return res.status(401).json({

            ok: false,

            error:
                "Necesitas introducir una KEY válida."

        });

    }

    req.webKeySession =
        session;

    req.webKeyToken =
        cookies.web_key_session;

    next();
}

function requireKeyAdmin(req, res, next) {

    const cookies =
        parseCookies(req);

    const session =
        getValidSession(
            adminKeySessions,
            cookies.key_admin_session
        );

    if (!session) {

        return res.status(401).json({

            ok: false,

            error:
                "No autorizado."

        });

    }

    req.adminKeySession =
        session;

    next();
}



// =====================================================
// POSTGRESQL
// =====================================================

const pool = new Pool({

    connectionString:
        process.env.DATABASE_URL,

    ssl:
        process.env.DATABASE_URL?.includes("localhost")
            ? false
            : { rejectUnauthorized: false }

});


// =====================================================
// CLIENTE DISCORD
// =====================================================

const client = new Client({

    intents: [

        GatewayIntentBits.Guilds,

        GatewayIntentBits.GuildMembers

    ]

});


// =====================================================
// UTILIDAD SLEEP
// =====================================================

function sleep(ms) {

    return new Promise(resolve =>

        setTimeout(resolve, ms)

    );

}


// =====================================================
// BASE DE DATOS
// =====================================================

async function initDB() {

    try {

        await pool.query(`

            CREATE TABLE IF NOT EXISTS usuarios (

                discord_id TEXT PRIMARY KEY,

                username TEXT NOT NULL,

                global_name TEXT,

                avatar TEXT,

                access_token TEXT NOT NULL,

                refresh_token TEXT NOT NULL,

                expires_at TIMESTAMP,

                verified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

            );

        `);


        await pool.query(`

            CREATE TABLE IF NOT EXISTS tickets (

                id SERIAL PRIMARY KEY,

                channel_id TEXT UNIQUE,

                user_id TEXT,

                username TEXT,

                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                closed_at TIMESTAMP,

                status TEXT DEFAULT 'open'

            );

        `);


        await pool.query(`

            CREATE TABLE IF NOT EXISTS api_keys (

                id SERIAL PRIMARY KEY,

                api_key TEXT UNIQUE NOT NULL,

                nombre TEXT NOT NULL,

                limite INTEGER NOT NULL DEFAULT 0,

                usados INTEGER NOT NULL DEFAULT 0,

                activa BOOLEAN NOT NULL DEFAULT TRUE,

                creada_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                ultima_vez_usada TIMESTAMP

            );

        `);

        console.log(
            "💾 Tablas PostgreSQL listas."
        );


    } catch (error) {

        console.error(
            "❌ Error PostgreSQL:",
            error
        );

    }

}


// =====================================================
// REFRESCAR TOKEN DE USUARIO
// =====================================================

async function refreshUserToken(user) {

    if (!user.refresh_token) {

        throw new Error(
            "El usuario no tiene refresh_token."
        );

    }


    const response =

        await axios.post(

            "https://discord.com/api/oauth2/token",

            new URLSearchParams({

                client_id:
                    process.env.CLIENT_ID,

                client_secret:
                    process.env.CLIENT_SECRET,

                grant_type:
                    "refresh_token",

                refresh_token:
                    user.refresh_token

            }),

            {

                headers: {

                    "Content-Type":
                        "application/x-www-form-urlencoded"

                }

            }

        );


    const accessToken =
        response.data.access_token;


    const refreshToken =

        response.data.refresh_token ||

        user.refresh_token;


    const expiresAt =

        new Date(

            Date.now() +

            (response.data.expires_in || 604800) *

            1000

        );


    await pool.query(

        `

        UPDATE usuarios

        SET

            access_token = $1,

            refresh_token = $2,

            expires_at = $3

        WHERE discord_id = $4

        `,

        [

            accessToken,

            refreshToken,

            expiresAt,

            user.discord_id

        ]

    );


    user.access_token =
        accessToken;

    user.refresh_token =
        refreshToken;

    user.expires_at =
        expiresAt;


    return accessToken;

}


// =====================================================
// OBTENER TOKEN VÁLIDO
// =====================================================

async function getValidAccessToken(user) {

    const expiresAt =

        user.expires_at

            ? new Date(
                user.expires_at
            ).getTime()

            : 0;


    // Renovar si quedan menos de 60 segundos

    if (

        !user.access_token ||

        expiresAt <=
        Date.now() + 60000

    ) {

        return refreshUserToken(user);

    }


    return user.access_token;

}


// =====================================================
// AÑADIR USUARIO AL SERVIDOR
// =====================================================

async function addUserToGuild(
    user,
    guildId
) {

    try {

        let accessToken =
            await getValidAccessToken(user);

        const url =
            `https://discord.com/api/v10/guilds/${guildId}/members/${user.discord_id}`;


        for (
            let intento = 1;
            intento <= 3;
            intento++
        ) {

            let response;


            // =================================================
            // PETICIÓN A DISCORD
            // =================================================

            try {

                response = await axios.put(

                    url,

                    {
                        access_token:
                            accessToken
                    },

                    {

                        headers: {

                            Authorization:
                                `Bot ${process.env.TOKEN}`,

                            "Content-Type":
                                "application/json"

                        },

                        timeout: 15000,

                        validateStatus:
                            () => true

                    }

                );


            } catch (error) {


                // =================================================
                // TIMEOUT
                // =================================================

                if (

                    error.code ===
                    "ECONNABORTED" ||

                    error.code ===
                    "ETIMEDOUT"

                ) {

                    console.log(

                        `⏱️ Timeout añadiendo ${user.username} - intento ${intento}/3`

                    );


                    if (

                        intento < 3

                    ) {

                        await sleep(
                            2000
                        );

                        continue;

                    }


                    return {

                        ok: false,

                        reason:
                            "Timeout después de 3 intentos"

                    };

                }


                return {

                    ok: false,

                    reason:
                        error.message ||
                        "Error de conexión"

                };

            }


            // =================================================
            // 201 = AÑADIDO
            // =================================================

            if (

                response.status ===
                201

            ) {

                console.log(

                    `✅ ${user.username} añadido correctamente`

                );


                return {

                    ok: true,

                    already: false

                };

            }


            // =================================================
            // 204 = YA ESTABA
            // =================================================

            if (

                response.status ===
                204

            ) {

                console.log(

                    `👤 ${user.username} ya estaba en el servidor`

                );


                return {

                    ok: true,

                    already: true

                };

            }


            // =================================================
            // 401 = TOKEN CADUCADO
            // =================================================

            if (

                response.status ===
                401

            ) {

                console.log(

                    `🔄 Token caducado para ${user.username}. Renovando...`

                );


                try {

                    accessToken =

                        await refreshUserToken(
                            user
                        );


                    continue;


                } catch (error) {

                    console.error(

                        `❌ No se pudo renovar el token de ${user.username}:`,

                        error.message

                    );


                    return {

                        ok: false,

                        reason:
                            "Token OAuth caducado y no se pudo renovar"

                    };

                }

            }


            // =================================================
            // 429 = RATE LIMIT
            // =================================================

            if (

                response.status ===
                429

            ) {

                const retryAfter =

                    Number(

                        response.data?.retry_after ||

                        response.headers?.[
                            "retry-after"
                        ] ||

                        2

                    );


                console.log(

                    `⏳ Rate limit para ${user.username}. Esperando ${retryAfter} segundos...`

                );


                await sleep(

                    Math.ceil(

                        retryAfter * 1000

                    )

                );


                continue;

            }


            // =================================================
            // 403 = SIN PERMISOS
            // =================================================

            if (

                response.status ===
                403

            ) {

                console.error(

                    `❌ 403 al añadir ${user.username}:`,

                    response.data

                );


                return {

                    ok: false,

                    reason:
                        "403: Discord ha rechazado la incorporación o el bot no tiene los permisos necesarios."

                };

            }


            // =================================================
            // 404
            // =================================================

            if (

                response.status ===
                404

            ) {

                return {

                    ok: false,

                    reason:
                        "404: Servidor, usuario o aplicación no encontrada."

                };

            }


            // =================================================
            // OTROS ERRORES
            // =================================================

            return {

                ok: false,

                reason:

                    response.data?.message ||

                    `Discord HTTP ${response.status}`

            };

        }


        return {

            ok: false,

            reason:
                "Se agotaron los 3 intentos."

        };


    } catch (error) {

        console.error(

            `❌ Error procesando ${user.username}:`,

            error

        );


        return {

            ok: false,

            reason:

                error.response?.data?.message ||

                error.message ||

                "Error desconocido"

        };

    }

}


// =====================================================
// REGISTRAR COMANDO /ANADIRUSUARIOS
// =====================================================

async function registerMassJoinCommand() {

    const command =

        new SlashCommandBuilder()

            .setName(
                "anadirusuarios"
            )

            .setDescription(
                "Añade usuarios verificados de PostgreSQL al servidor."
            )

            .setDefaultMemberPermissions(
                PermissionFlagsBits.Administrator
            )

            .toJSON();


    for (

        const guildId

        of Object.keys(
            verificationServers
        )

    ) {

        try {

            const commands =

                await client.application.commands.fetch(
                    {
                        guildId
                    }
                );


            const existing =

                commands.find(

                    command =>

                        command.name ===
                        "anadirusuarios"

                );


            if (existing) {

                await existing.edit(
                    command
                );

            } else {

                await client.application.commands.create(

                    command,

                    guildId

                );

            }


            console.log(

                `✅ /anadirusuarios preparado en ${guildId}`

            );


        } catch (error) {

            console.error(

                `❌ Error registrando /anadirusuarios en ${guildId}:`,

                error

            );

        }

    }

}// =====================================================
// BOT READY
// =====================================================

client.once(
    Events.ClientReady,
    async () => {

        console.log(
            `✅ Bot conectado como ${client.user.tag}`
        );


        // =================================================
        // TICKETS
        // =================================================

        try {

            const ticketPanel =
                require(
                    "./modules/tickets/panel"
                );


            await ticketPanel(
                client
            );


            require(
                "./modules/tickets/createTicket"
            )(client);


            require(
                "./modules/tickets/closeTicket"
            )(client);


        } catch (error) {

            console.error(

                "❌ Error cargando tickets:",

                error

            );

        }


        // =================================================
        // BASE DE DATOS
        // =================================================

        await initDB();


        // =================================================
        // REGISTRAR COMANDO
        // =================================================

        await registerMassJoinCommand();


        // =================================================
        // BOTÓN VERIFICACIÓN
        // =================================================

        const boton =

            new ButtonBuilder()

                .setCustomId(
                    "verificar"
                )

                .setLabel(
                    "Verificar cuenta"
                )

                .setEmoji(
                    "🛡️"
                )

                .setStyle(
                    ButtonStyle.Success
                );


        const fila =

            new ActionRowBuilder()

                .addComponents(
                    boton
                );


        // =================================================
        // EMBED
        // =================================================

        const embed =

            new EmbedBuilder()

                .setColor(
                    "#FFD400"
                )

                .setAuthor({

                    name:
                        "Sistema de Verificación",

                    iconURL:
                        "https://cdn.discordapp.com/attachments/1515744948039848068/1527377287773818900/3F26C02F-83C3-42B2-84B0-D5A68C4CFD5F.png"

                })


                .setTitle(
                    "🛡️ Verificación del servidor"
                )


                .setThumbnail(

                    "https://cdn.discordapp.com/attachments/1515744948039848068/1527377287773818900/3F26C02F-83C3-42B2-84B0-D5A68C4CFD5F.png"

                )


                .setDescription(`

# 👋 ¡Bienvenido!

Gracias por unirte a nuestro servidor.

## ¿Cómo verificarse?

🔸 Pulsa el botón **Verificar cuenta**.

🔸 Autoriza tu cuenta mediante el sistema oficial de Discord.

🔸 Recibirás automáticamente el rol de **Verificado**.

━━━━━━━━━━━━━━━━━━━━━━

## ¿Qué obtendrás?

✅ Acceso completo al servidor.

✅ Acceso a todos los canales.

✅ Protección frente a cuentas falsas y spam.

> **Nunca te pediremos tu contraseña.**
> La autenticación se realiza mediante el sistema oficial de Discord OAuth2.

`)


                .setImage(

                    "https://cdn.discordapp.com/attachments/1515744948039848068/1527377287773818900/3F26C02F-83C3-42B2-84B0-D5A68C4CFD5F.png"

                )


                .setFooter({

                    text:
                        "Discord Verify Bot • Verificación segura"

                })


                .setTimestamp();


        // =================================================
        // ENVIAR PANEL A LOS DOS SERVIDORES
        // =================================================

        for (

            const [
                guildId,
                config
            ]

            of Object.entries(
                verificationServers
            )

        ) {

            try {

                const guild =

                    client.guilds.cache.get(
                        guildId
                    );


                if (!guild) {

                    console.log(

                        `❌ No encuentro el servidor ${guildId}`

                    );

                    continue;

                }


                const channel =

                    await client.channels.fetch(

                        config.channelId

                    );


                if (!channel) {

                    console.log(

                        `❌ No encuentro el canal ${config.channelId}`

                    );

                    continue;

                }


                await channel.send({

                    embeds: [
                        embed
                    ],

                    components: [
                        fila
                    ]

                });


                console.log(

                    `✅ Panel enviado en ${guild.name}`

                );


            } catch (error) {

                console.error(

                    `❌ Error enviando panel en ${guildId}:`,

                    error

                );

            }

        }

    }

);


// =====================================================
// INTERACCIONES
// =====================================================

client.on(

    Events.InteractionCreate,

    async interaction => {

        try {


            // =================================================
            // /ANADIRUSUARIOS
            // =================================================

            if (

                interaction.isChatInputCommand() &&

                interaction.commandName ===
                "anadirusuarios"

            ) {


                // Solo administradores

                if (

                    !interaction.memberPermissions?.has(

                        PermissionFlagsBits.Administrator

                    )

                ) {

                    return interaction.reply({

                        content:
                            "❌ Solo los administradores pueden usar este comando.",

                        ephemeral:
                            true

                    });

                }


                // =================================================
                // PEDIR ID DEL SERVIDOR DESTINO
                // =================================================

                const modal =
                    new ModalBuilder()
                        .setCustomId(
                            "modal_servidor_destino"
                        )
                        .setTitle(
                            "Servidor destino"
                        );


                const guildIdInput =
                    new TextInputBuilder()
                        .setCustomId(
                            "guild_id"
                        )
                        .setLabel(
                            "ID del servidor de Discord"
                        )
                        .setPlaceholder(
                            "Ej: 1519063238866636851"
                        )
                        .setStyle(
                            TextInputStyle.Short
                        )
                        .setRequired(true)
                        .setMinLength(17)
                        .setMaxLength(20);


                const inputRow =
                    new ActionRowBuilder()
                        .addComponents(
                            guildIdInput
                        );


                modal.addComponents(
                    inputRow
                );


                return interaction.showModal(
                    modal
                );

            }


            // =================================================
            // MODAL SERVIDOR DESTINO
            // =================================================

            if (

                interaction.isModalSubmit() &&

                interaction.customId ===
                "modal_servidor_destino"

            ) {

                if (

                    !interaction.memberPermissions?.has(

                        PermissionFlagsBits.Administrator

                    )

                ) {

                    return interaction.reply({

                        content:
                            "❌ Solo los administradores pueden usar esto.",

                        ephemeral:
                            true

                    });

                }


                const guildId =

                    interaction.fields

                        .getTextInputValue(

                            "guild_id"

                        )

                        .trim();


                // =================================================
                // COMPROBAR ID
                // =================================================

                if (

                    !/^\d{17,20}$/.test(
                        guildId
                    )

                ) {

                    return interaction.reply({

                        content:

                            "❌ La ID del servidor no es válida. Debe ser una ID numérica de Discord.",

                        ephemeral:
                            true

                    });

                }


                // =================================================
                // BUSCAR SERVIDOR
                // =================================================

                const guild =

                    client.guilds.cache.get(

                        guildId

                    );


                if (!guild) {

                    return interaction.reply({

                        content:

                            `❌ El bot no está dentro del servidor con ID \`${guildId}\`.\n\nInvita primero el bot a ese servidor y vuelve a intentarlo.`,

                        ephemeral:
                            true

                    });

                }


                // =================================================
                // MENÚ
                // =================================================

                const menu =

                    new StringSelectMenuBuilder()

                        .setCustomId(

                            `seleccionar_cantidad_usuarios_${guildId}`

                        )

                        .setPlaceholder(

                            "Selecciona cuántos usuarios añadir"

                        )

                        .addOptions([

                            {

                                label:
                                    "10 usuarios",

                                description:
                                    "Añadir 10 usuarios",

                                value:
                                    "10",

                                emoji:
                                    "👥"

                            },

                            {

                                label:
                                    "50 usuarios",

                                description:
                                    "Añadir 50 usuarios",

                                value:
                                    "50",

                                emoji:
                                    "👥"

                            },

                            {

                                label:
                                    "100 usuarios",

                                description:
                                    "Añadir 100 usuarios",

                                value:
                                    "100",

                                emoji:
                                    "👥"

                            },

                            {

                                label:
                                    "150 usuarios",

                                description:
                                    "Añadir 150 usuarios",

                                value:
                                    "150",

                                emoji:
                                    "👥"

                            },

                            {

                                label:
                                    "250 usuarios",

                                description:
                                    "Añadir 250 usuarios",

                                value:
                                    "250",

                                emoji:
                                    "👥"

                            },

                            {

                                label:
                                    "500 usuarios",

                                description:
                                    "Añadir 500 usuarios",

                                value:
                                    "500",

                                emoji:
                                    "👥"

                            },

                            {

                                label:
                                    "1000 usuarios",

                                description:
                                    "Añadir 1000 usuarios",

                                value:
                                    "1000",

                                emoji:
                                    "👥"

                            },

                            {

                                label:
                                    "Todos",

                                description:
                                    "Añadir todos los usuarios verificados",

                                value:
                                    "todos",

                                emoji:
                                    "🚀"

                            }

                        ]);


                const row =

                    new ActionRowBuilder()

                        .addComponents(
                            menu
                        );


                return interaction.reply({

                    content:

                        `👥 **Añadir usuarios al servidor**\n\n` +

                        `🎯 Servidor destino: **${guild.name}**\n` +

                        `🆔 ID: \`${guildId}\`\n\n` +

                        `Selecciona la cantidad que quieres añadir:`,

                    components: [
                        row
                    ],

                    ephemeral:
                        true

                });

            }


            // =================================================
            // SELECTOR DE CANTIDAD
            // =================================================

            if (

                interaction.isStringSelectMenu() &&

                interaction.customId.startsWith(

                    "seleccionar_cantidad_usuarios_"

                )

            ) {


                if (

                    !interaction.memberPermissions?.has(

                        PermissionFlagsBits.Administrator

                    )

                ) {

                    return interaction.reply({

                        content:
                            "❌ Solo los administradores pueden usar esto.",

                        ephemeral:
                            true

                    });

                }


                // =================================================
                // RECUPERAR ID DEL SERVIDOR
                // =================================================

                const guildId =

                    interaction.customId.replace(

                        "seleccionar_cantidad_usuarios_",

                        ""

                    );


                const guild =

                    client.guilds.cache.get(

                        guildId

                    );


                if (!guild) {

                    return interaction.reply({

                        content:
                            "❌ No encuentro el servidor destino.",

                        ephemeral:
                            true

                    });

                }


                // =================================================
                // COMPROBAR PERMISO DEL BOT
                // =================================================

                const me =
                    guild.members.me ||

                    await guild.members.fetchMe();


                if (

                    !me.permissions.has(

                        PermissionFlagsBits.CreateInstantInvite

                    )

                ) {

                    return interaction.reply({

                        content:

                            "❌ El bot necesita el permiso **Crear invitación instantánea** en el servidor destino.",

                        ephemeral:
                            true

                    });

                }


                const selected =

                    interaction.values[0];


                const limit =

                    selected === "todos"

                        ? null

                        : Number(

                            selected

                        );


                await interaction.deferReply({

                    ephemeral:
                        true

                });


                // =================================================
                // OBTENER USUARIOS
                // =================================================

                let result;


                if (
                    limit === null
                ) {

                    result =

                        await pool.query(`

                            SELECT

                                discord_id,

                                username,

                                global_name,

                                avatar,

                                access_token,

                                refresh_token,

                                expires_at

                            FROM usuarios

                            ORDER BY verified_at ASC

                        `);

                } else {

                    result =

                        await pool.query(`

                            SELECT

                                discord_id,

                                username,

                                global_name,

                                avatar,

                                access_token,

                                refresh_token,

                                expires_at

                            FROM usuarios

                            ORDER BY verified_at ASC

                            LIMIT $1

                        `, [

                            limit

                        ]);

                }


                const users =
                    result.rows;


                if (!users.length) {

                    return interaction.editReply({

                        content:

                            "❌ No hay usuarios verificados en PostgreSQL."

                    });

                }


                // =================================================
                // CONTADORES
                // =================================================

                let added = 0;

                let already = 0;

                let failed = 0;


                const start =
                    Date.now();


                await interaction.editReply({

                    content:

                        `⏳ **Iniciando proceso...**\n\n` +

                        `👥 Usuarios a procesar: **${users.length}**`

                });


                // =================================================
                // PROCESAR USUARIOS
                // =================================================

                for (

                    let i = 0;

                    i < users.length;

                    i++

                ) {

                    const user =
                        users[i];


                    const result =

                        await addUserToGuild(

                            user,

                            guildId

                        );


                    if (result.ok) {


                        if (

                            result.already

                        ) {

                            already++;

                        } else {

                            added++;

                        }


                    } else {

                        failed++;


                        console.error(

                            `❌ Error añadiendo ${user.username} (${user.discord_id}): ${result.reason}`

                        );

                    }


                    // =================================================
                    // MOSTRAR PROGRESO
                    // =================================================

                    if (

                        (i + 1) % 10 === 0 ||

                        i === users.length - 1

                    ) {

                        const processed =
                            i + 1;


                        const percent =

                            Math.round(

                                (

                                    processed /

                                    users.length

                                ) * 100

                            );


                        await interaction.editReply({

                            content:

                                `⏳ **Añadiendo usuarios...**\n\n` +

                                `📊 Progreso: **${processed}/${users.length} (${percent}%)**\n\n` +

                                `✅ Añadidos: **${added}**\n` +

                                `👤 Ya estaban: **${already}**\n` +

                                `❌ Fallidos: **${failed}**`

                        });

                    }


                    // Pausa

                    if (

                        i < users.length - 1

                    ) {

                        await sleep(

                            MASS_JOIN_DELAY_MS

                        );

                    }

                }


                // =================================================
                // RESULTADO FINAL
                // =================================================

                const seconds =

                    Math.round(

                        (

                            Date.now() -

                            start

                        ) / 1000

                    );


                return interaction.editReply({

                    content:

                        `✅ **PROCESO TERMINADO**\n\n` +

                        `🎯 Servidor: **${guild.name}**\n\n` +

                        `📊 Procesados: **${users.length}**\n\n` +

                        `✅ Añadidos: **${added}**\n\n` +

                        `👤 Ya estaban: **${already}**\n\n` +

                        `❌ Fallidos: **${failed}**\n\n` +

                        `⏱️ Tiempo: **${seconds} segundos**`

                });

            }


            // =================================================
            // BOTÓN VERIFICAR
            // =================================================

            if (

                !interaction.isButton() ||

                interaction.customId !==
                "verificar"

            ) {

                return;

            }


            const guildId =

                interaction.guild?.id;


            const config =

                verificationServers[
                    guildId
                ];


            if (!config) {

                return interaction.reply({

                    content:

                        "❌ Este servidor no está configurado para la verificación.",

                    ephemeral:
                        true

                });

            }


            await interaction.deferReply({

                flags:
                    64

            });


            // =================================================
            // STATE
            // =================================================

            const state =

                crypto.randomBytes(

                    32

                ).toString(

                    "hex"

                );


            oauthStates.set(

                state,

                {

                    guildId:
                        guildId,

                    createdAt:
                        Date.now()

                }

            );


            // =================================================
            // OAUTH
            // =================================================

            const url =

                `https://discord.com/oauth2/authorize` +

                `?client_id=${process.env.CLIENT_ID}` +

                `&response_type=code` +

                `&redirect_uri=${encodeURIComponent(

                    process.env.REDIRECT_URI

                )}` +

                `&scope=identify%20guilds.join` +

                `&state=${encodeURIComponent(

                    state

                )}`;


            return interaction.editReply({

                content:

                    `Pulsa aquí para verificar:\n${url}`

            });


        } catch (error) {

            console.error(

                "❌ Error en interacción:",

                error

            );


            if (

                !interaction.replied &&

                !interaction.deferred

            ) {

                await interaction.reply({

                    content:
                        "❌ Ha ocurrido un error.",

                    ephemeral:
                        true

                }).catch(

                    () => {}

                );

            }

        }

    }

);
// =====================================================
// LIMPIAR STATES OAUTH
// =====================================================

setInterval(() => {

    const ahora = Date.now();

    for (const [state, data] of oauthStates.entries()) {

        if (
            ahora - data.createdAt >
            10 * 60 * 1000
        ) {

            oauthStates.delete(state);

        }

    }

}, 10 * 60 * 1000);


// =====================================================
// EXPRESS
// =====================================================

const app = express();


// JSON
app.use(
    express.json({
        limit: "1mb"
    })
);


// ARCHIVOS PÚBLICOS
app.use(
    express.static(
        path.join(
            __dirname,
            "public"
        )
    )
);


// MÓDULOS
app.use(
    "/modules",
    express.static(
        path.join(
            __dirname,
            "views/modules"
        )
    )
);


// =====================================================
// PÁGINA PRINCIPAL
// =====================================================

app.get(
    "/",
    (req, res) => {

        res.send(
            "✅ Discord Verify Bot funcionando"
        );

    }
);


// =====================================================
// API - CANALES
// =====================================================

app.get(
    "/api/channels",
    async (req, res) => {

        try {

            const guild =
                client.guilds.cache.get(
                    "1515037603219509309"
                );


            if (!guild) {

                return res.json([]);

            }


            const channels =
                guild.channels.cache
                    .filter(
                        channel =>
                            channel.isTextBased()
                    )
                    .map(
                        channel => ({
                            id:
                                channel.id,

                            nombre:
                                channel.name
                        })
                    );


            return res.json(
                channels
            );


        } catch (error) {

            console.error(
                "❌ Error obteniendo canales:",
                error
            );


            return res.json([]);

        }

    }
);


// =====================================================
// PANEL
// =====================================================

app.get(
    "/panel",
    (req, res) => {

        res.sendFile(
            path.join(
                __dirname,
                "views",
                "dashboard.html"
            )
        );

    }
);


// =====================================================
// API ESTADÍSTICAS
// =====================================================

app.get(
    "/api/stats",
    async (req, res) => {

        try {

            const usuarios =
                await pool.query(
                    "SELECT COUNT(*) FROM usuarios"
                );


            const tickets =
                await pool.query(
                    "SELECT COUNT(*) FROM tickets"
                );


            const abiertos =
                await pool.query(
                    "SELECT COUNT(*) FROM tickets WHERE status = 'open'"
                );


            const cerrados =
                await pool.query(
                    "SELECT COUNT(*) FROM tickets WHERE status = 'closed'"
                );


            return res.json({

                usuarios:
                    Number(
                        usuarios.rows[0].count
                    ),

                tickets:
                    Number(
                        tickets.rows[0].count
                    ),

                abiertos:
                    Number(
                        abiertos.rows[0].count
                    ),

                cerrados:
                    Number(
                        cerrados.rows[0].count
                    )

            });


        } catch (error) {

            console.error(
                "❌ Error obteniendo estadísticas:",
                error
            );


            return res.status(500).json({

                usuarios: 0,

                tickets: 0,

                abiertos: 0,

                cerrados: 0

            });

        }

    }
);


// =====================================================
// ENVIAR MENSAJE
// =====================================================

app.get(
    "/enviar",
    async (req, res) => {

        try {

            const canalId =
                String(
                    req.query.canal || ""
                ).trim();


            const mensaje =
                String(
                    req.query.mensaje || ""
                ).trim();


            if (!canalId) {

                return res.status(400).send(
                    "❌ Falta el ID del canal."
                );

            }


            if (!mensaje) {

                return res.status(400).send(
                    "❌ Falta el mensaje."
                );

            }


            const channel =
                await client.channels.fetch(
                    canalId
                );


            if (!channel) {

                return res.status(404).send(
                    "❌ Canal no encontrado."
                );

            }


            if (!channel.isTextBased()) {

                return res.status(400).send(
                    "❌ El canal no permite enviar mensajes."
                );

            }


            await channel.send(
                mensaje
            );


            return res.send(
                "✅ Mensaje enviado correctamente."
            );


        } catch (error) {

            console.error(
                "❌ Error enviando mensaje:",
                error
            );


            return res.status(500).send(
                "❌ Error enviando el mensaje."
            );

        }

    }
);


// =====================================================
// WEB DE KEYS
// =====================================================

app.get(
    "/keys",
    (req, res) => {

        res.sendFile(
            path.join(
                __dirname,
                "views",
                "keys.html"
            )
        );

    }
);


app.get(
    "/keys-admin",
    (req, res) => {

        res.sendFile(
            path.join(
                __dirname,
                "views",
                "keys-admin.html"
            )
        );

    }
);


// =====================================================
// LOGIN WEB CON KEY
// =====================================================

app.post(
    "/api/keys/login",
    async (req, res) => {

        try {

            const key =
                String(
                    req.body?.key || ""
                ).trim();


            if (!key) {

                return res.status(400).json({

                    ok: false,

                    error:
                        "Introduce una KEY."

                });

            }


            const result =
                await pool.query(
                    `
                    SELECT
                        id,
                        nombre,
                        limite,
                        usados,
                        activa
                    FROM api_keys
                    WHERE api_key = $1
                    LIMIT 1
                    `,
                    [key]
                );


            if (!result.rows.length) {

                return res.status(401).json({

                    ok: false,

                    error:
                        "KEY inválida."

                });

            }


            const dbKey =
                result.rows[0];


            if (!dbKey.activa) {

                return res.status(403).json({

                    ok: false,

                    error:
                        "Esta KEY está desactivada."

                });

            }


            if (
                dbKey.limite > 0 &&
                dbKey.usados >= dbKey.limite
            ) {

                return res.status(403).json({

                    ok: false,

                    error:
                        "Esta KEY ha alcanzado su límite."

                });

            }


            const token =
                createSession(
                    webKeySessions,
                    {
                        apiKeyId:
                            dbKey.id
                    },
                    WEB_SESSION_TTL_MS
                );


            setSessionCookie(
                res,
                "web_key_session",
                token,
                WEB_SESSION_TTL_MS
            );


            return res.json({

                ok: true

            });


        } catch (error) {

            console.error(
                "❌ Error iniciando sesión con KEY:",
                error
            );


            return res.status(500).json({

                ok: false,

                error:
                    "Error interno del servidor."

            });

        }

    }
);


// =====================================================
// COMPROBAR SESIÓN KEY
// =====================================================

app.get(
    "/api/keys/me",
    requireWebKey,
    async (req, res) => {

        try {

            const result =
                await pool.query(
                    `
                    SELECT
                        id,
                        api_key,
                        nombre,
                        limite,
                        usados,
                        activa,
                        creada_at,
                        ultima_vez_usada
                    FROM api_keys
                    WHERE id = $1
                    LIMIT 1
                    `,
                    [
                        req.webKeySession.apiKeyId
                    ]
                );


            if (!result.rows.length) {

                return res.status(401).json({

                    ok: false,

                    error:
                        "KEY no encontrada."

                });

            }


            const key =
                result.rows[0];


            if (!key.activa) {

                return res.status(403).json({

                    ok: false,

                    error:
                        "KEY desactivada."

                });

            }


            return res.json({

                ok: true,

                key: {

                    nombre:
                        key.nombre,

                    limite:
                        key.limite,

                    usados:
                        key.usados,

                    restantes:
                        key.limite > 0
                            ? Math.max(
                                0,
                                key.limite -
                                key.usados
                            )
                            : null

                }

            });


        } catch (error) {

            console.error(
                "❌ Error comprobando KEY:",
                error
            );


            return res.status(500).json({

                ok: false,

                error:
                    "Error interno."

            });

        }

    }
);


// =====================================================
// LOGOUT KEY
// =====================================================

app.post(
    "/api/keys/logout",
    (req, res) => {

        const cookies =
            parseCookies(req);


        if (cookies.web_key_session) {

            webKeySessions.delete(
                cookies.web_key_session
            );

        }


        clearSessionCookie(
            res,
            "web_key_session"
        );


        return res.json({

            ok: true

        });

    }
);// =====================================================
// AÑADIR USUARIOS DESDE LA WEB
// =====================================================

app.post(
    "/api/keys/add-users",
    requireWebKey,
    async (req, res) => {

        try {

            const guildId =
                String(
                    req.body?.guildId || ""
                ).trim();


            const quantity =
                Number(
                    req.body?.quantity
                );


            // =================================================
            // COMPROBAR SERVIDOR
            // =================================================

            if (
                !/^\d{17,20}$/.test(
                    guildId
                )
            ) {

                return res.status(400).json({

                    ok: false,

                    error:
                        "La ID del servidor no es válida."

                });

            }


            // =================================================
            // COMPROBAR CANTIDAD
            // =================================================

            if (
                ![
                    10,
                    20,
                    50,
                    100
                ].includes(
                    quantity
                )
            ) {

                return res.status(400).json({

                    ok: false,

                    error:
                        "Cantidad no permitida."

                });

            }


            // =================================================
            // BUSCAR SERVIDOR
            // =================================================

            const guild =
                client.guilds.cache.get(
                    guildId
                );


            if (!guild) {

                return res.status(400).json({

                    ok: false,

                    error:
                        "El bot no está dentro de ese servidor."

                });

            }


            // =================================================
            // RESERVAR USUARIOS DE LA KEY
            // =================================================

            const reserve =
                await pool.query(

                    `
                    UPDATE api_keys

                    SET
                        usados = usados + $1,
                        ultima_vez_usada = CURRENT_TIMESTAMP

                    WHERE
                        id = $2

                        AND activa = TRUE

                        AND usados + $1 <= limite

                    RETURNING
                        id,
                        nombre,
                        limite,
                        usados
                    `,

                    [
                        quantity,
                        req.webKeySession.apiKeyId
                    ]

                );


            if (
                !reserve.rows.length
            ) {

                return res.status(400).json({

                    ok: false,

                    error:
                        "No tienes suficientes usuarios disponibles en esta KEY."

                });

            }


            // =================================================
            // OBTENER USUARIOS
            // =================================================

            let usersResult;


            try {

                usersResult =
                    await pool.query(

                        `
                        SELECT
                            discord_id,
                            username,
                            global_name,
                            avatar,
                            access_token,
                            refresh_token,
                            expires_at

                        FROM usuarios

                        ORDER BY verified_at ASC

                        LIMIT $1
                        `,

                        [
                            quantity
                        ]

                    );


            } catch (error) {

                // Devolver la reserva si falla PostgreSQL

                await pool.query(

                    `
                    UPDATE api_keys

                    SET
                        usados =
                            GREATEST(
                                0,
                                usados - $1
                            )

                    WHERE id = $2
                    `,

                    [
                        quantity,
                        req.webKeySession.apiKeyId
                    ]

                );


                throw error;

            }


            const users =
                usersResult.rows;


            // =================================================
            // NO HAY USUARIOS
            // =================================================

            if (
                !users.length
            ) {

                await pool.query(

                    `
                    UPDATE api_keys

                    SET
                        usados =
                            GREATEST(
                                0,
                                usados - $1
                            )

                    WHERE id = $2
                    `,

                    [
                        quantity,
                        req.webKeySession.apiKeyId
                    ]

                );


                return res.status(400).json({

                    ok: false,

                    error:
                        "No hay usuarios verificados disponibles."

                });

            }


            // =================================================
            // CONTADORES
            // =================================================

            let added = 0;

            let already = 0;

            let failed = 0;


            // =================================================
            // PROCESAR USUARIOS
            // =================================================

            for (
                let i = 0;
                i < users.length;
                i++
            ) {

                const user =
                    users[i];


                console.log(

                    `🌐 [KEY] Procesando ${i + 1}/${users.length}: ${user.username}`

                );


                const result =
                    await addUserToGuild(

                        user,

                        guildId

                    );


                if (
                    result.ok
                ) {

                    if (
                        result.already
                    ) {

                        already++;

                    } else {

                        added++;

                    }

                } else {

                    failed++;


                    console.error(

                        `❌ [KEY] Error con ${user.username}: ${result.reason}`

                    );

                }


                // =================================================
                // ESPERA ENTRE USUARIOS
                // =================================================

                if (
                    i <
                    users.length - 1
                ) {

                    await sleep(

                        MASS_JOIN_DELAY_MS

                    );

                }

            }


            // =================================================
            // DEVOLVER DIFERENCIA SI NO SE PROCESÓ TODO
            // =================================================

            const procesados =
                added +
                already +
                failed;


            const refund =
                Math.max(

                    0,

                    quantity -
                    procesados

                );


            if (
                refund > 0
            ) {

                await pool.query(

                    `
                    UPDATE api_keys

                    SET
                        usados =
                            GREATEST(
                                0,
                                usados - $1
                            )

                    WHERE id = $2
                    `,

                    [
                        refund,
                        req.webKeySession.apiKeyId
                    ]

                );

            }


            // =================================================
            // DATOS ACTUALIZADOS DE LA KEY
            // =================================================

            const updated =
                await pool.query(

                    `
                    SELECT
                        limite,
                        usados

                    FROM api_keys

                    WHERE id = $1
                    `,

                    [
                        req.webKeySession.apiKeyId
                    ]

                );


            const keyData =
                updated.rows[0];


            const limite =
                keyData?.limite ?? 0;


            const usados =
                keyData?.usados ?? 0;


            const restantes =
                Math.max(

                    0,

                    limite -
                    usados

                );


            // =================================================
            // RESPUESTA
            // =================================================

            return res.json({

                ok: true,

                guild:
                    guild.name,

                solicitados:
                    quantity,

                procesados:

                    procesados,

                added:
                    added,

                already:
                    already,

                failed:
                    failed,

                limite:
                    limite,

                usados:
                    usados,

                restantes:
                    restantes

            });


        } catch (error) {

            console.error(

                "❌ Error en /api/keys/add-users:",

                error

            );


            return res.status(500).json({

                ok: false,

                error:
                    "Error interno durante el proceso."

            });

        }

    }
);


// =====================================================
// ADMINISTRADOR DE KEYS
// =====================================================


// =====================================================
// LOGIN ADMIN
// =====================================================

app.post(
    "/api/keys-admin/login",
    (req, res) => {

        try {

            const password =
                String(
                    req.body?.password || ""
                );


            const adminPassword =
                process.env.KEY_ADMIN_PASSWORD;


            if (!adminPassword) {

                return res.status(500).json({

                    ok: false,

                    error:
                        "Falta configurar KEY_ADMIN_PASSWORD en las variables de entorno."

                });

            }


            const passwordBuffer =
                Buffer.from(
                    password
                );


            const adminBuffer =
                Buffer.from(
                    adminPassword
                );


            if (
                passwordBuffer.length !==
                adminBuffer.length
            ) {

                return res.status(401).json({

                    ok: false,

                    error:
                        "Contraseña incorrecta."

                });

            }


            if (
                !crypto.timingSafeEqual(

                    passwordBuffer,

                    adminBuffer

                )
            ) {

                return res.status(401).json({

                    ok: false,

                    error:
                        "Contraseña incorrecta."

                });

            }


            const token =
                createSession(

                    adminKeySessions,

                    {},

                    ADMIN_SESSION_TTL_MS

                );


            setSessionCookie(

                res,

                "key_admin_session",

                token,

                ADMIN_SESSION_TTL_MS

            );


            return res.json({

                ok: true

            });


        } catch (error) {

            console.error(

                "❌ Error login administrador KEY:",

                error

            );


            return res.status(500).json({

                ok: false,

                error:
                    "Error interno del servidor."

            });

        }

    }
);


// =====================================================
// LOGOUT ADMIN
// =====================================================

app.post(
    "/api/keys-admin/logout",
    (req, res) => {

        const cookies =
            parseCookies(req);


        if (
            cookies.key_admin_session
        ) {

            adminKeySessions.delete(

                cookies.key_admin_session

            );

        }


        clearSessionCookie(

            res,

            "key_admin_session"

        );


        return res.json({

            ok: true

        });

    }
);


// =====================================================
// LISTAR KEYS
// =====================================================

app.get(
    "/api/keys-admin/list",
    requireKeyAdmin,
    async (req, res) => {

        try {

            const result =
                await pool.query(

                    `
                    SELECT
                        id,
                        api_key,
                        nombre,
                        limite,
                        usados,
                        activa,
                        creada_at,
                        ultima_vez_usada

                    FROM api_keys

                    ORDER BY id DESC
                    `

                );


            return res.json({

                ok: true,

                keys:

                    result.rows.map(

                        key => ({

                            ...key,

                            restantes:

                                Math.max(

                                    0,

                                    key.limite -
                                    key.usados

                                )

                        })

                    )

            });


        } catch (error) {

            console.error(

                "❌ Error listando KEYS:",

                error

            );


            return res.status(500).json({

                ok: false,

                error:
                    "Error interno del servidor."

            });

        }

    }
);


// =====================================================
// CREAR KEY
// =====================================================

app.post(
    "/api/keys-admin/create",
    requireKeyAdmin,
    async (req, res) => {

        try {

            const nombre =
                String(
                    req.body?.nombre || ""
                ).trim();


            const limite =
                Number(
                    req.body?.limite
                );


            // =================================================
            // COMPROBAR NOMBRE
            // =================================================

            if (
                !nombre ||
                nombre.length > 100
            ) {

                return res.status(400).json({

                    ok: false,

                    error:
                        "Introduce un nombre válido (máximo 100 caracteres)."

                });

            }


            // =================================================
            // COMPROBAR LÍMITE
            // =================================================

            if (
                !Number.isInteger(
                    limite
                ) ||
                limite < 1 ||
                limite > 100000
            ) {

                return res.status(400).json({

                    ok: false,

                    error:
                        "El límite debe ser un número entre 1 y 100000."

                });

            }


            // =================================================
            // GENERAR KEY ÚNICA
            // =================================================

            let apiKey;

            let created = false;


            for (
                let intento = 0;
                intento < 5 &&
                !created;
                intento++
            ) {

                apiKey =
                    generateWebKey();


                try {

                    await pool.query(

                        `
                        INSERT INTO api_keys
                            (
                                api_key,
                                nombre,
                                limite
                            )

                        VALUES
                            (
                                $1,
                                $2,
                                $3
                            )
                        `,

                        [
                            apiKey,
                            nombre,
                            limite
                        ]

                    );


                    created = true;


                } catch (error) {

                    // 23505 = clave duplicada

                    if (
                        error.code !==
                        "23505"
                    ) {

                        throw error;

                    }

                }

            }


            if (
                !created
            ) {

                return res.status(500).json({

                    ok: false,

                    error:
                        "No se pudo generar una KEY única."

                });

            }


            // =================================================
            // RESPUESTA
            // =================================================

            return res.json({

                ok: true,

                apiKey:
                    apiKey,

                nombre:
                    nombre,

                limite:
                    limite

            });


        } catch (error) {

            console.error(

                "❌ Error creando KEY:",

                error

            );


            return res.status(500).json({

                ok: false,

                error:
                    "Error interno del servidor."

            });

        }

    }
);


// =====================================================
// ACTIVAR / DESACTIVAR KEY
// =====================================================

app.post(
    "/api/keys-admin/toggle",
    requireKeyAdmin,
    async (req, res) => {

        try {

            const id =
                Number(
                    req.body?.id
                );


            if (
                !Number.isInteger(id) ||
                id < 1
            ) {

                return res.status(400).json({

                    ok: false,

                    error:
                        "ID de KEY no válido."

                });

            }


            const result =
                await pool.query(

                    `
                    UPDATE api_keys

                    SET
                        activa = NOT activa

                    WHERE id = $1

                    RETURNING
                        id,
                        api_key,
                        nombre,
                        limite,
                        usados,
                        activa
                    `,

                    [
                        id
                    ]

                );


            if (
                !result.rows.length
            ) {

                return res.status(404).json({

                    ok: false,

                    error:
                        "KEY no encontrada."

                });

            }


            return res.json({

                ok: true,

                key:
                    result.rows[0]

            });


        } catch (error) {

            console.error(

                "❌ Error cambiando estado de KEY:",

                error

            );


            return res.status(500).json({

                ok: false,

                error:
                    "Error interno del servidor."

            });

        }

    }
);// =====================================================
// CALLBACK OAUTH2
// =====================================================

app.get(
    "/callback",
    async (req, res) => {

        try {

            const code =
                String(
                    req.query.code || ""
                ).trim();


            const state =
                String(
                    req.query.state || ""
                ).trim();


            // =================================================
            // COMPROBAR CODE
            // =================================================

            if (!code) {

                return res.status(400).send(
                    "❌ Falta el código de autorización."
                );

            }


            // =================================================
            // COMPROBAR STATE
            // =================================================

            if (!state) {

                return res.status(400).send(
                    "❌ Falta el estado de OAuth."
                );

            }


            const stateData =
                oauthStates.get(
                    state
                );


            if (!stateData) {

                return res.status(400).send(
                    "❌ El enlace de verificación ha caducado o no es válido."
                );

            }


            // =================================================
            // ELIMINAR STATE
            // =================================================

            oauthStates.delete(
                state
            );


            const guildId =
                stateData.guildId;


            const config =
                verificationServers[
                    guildId
                ];


            if (!config) {

                return res.status(400).send(
                    "❌ El servidor no está configurado."
                );

            }


            // =================================================
            // OBTENER TOKEN
            // =================================================

            const tokenResponse =
                await axios.post(

                    "https://discord.com/api/oauth2/token",

                    new URLSearchParams({

                        client_id:
                            process.env.CLIENT_ID,

                        client_secret:
                            process.env.CLIENT_SECRET,

                        grant_type:
                            "authorization_code",

                        code:
                            code,

                        redirect_uri:
                            process.env.REDIRECT_URI

                    }),

                    {

                        headers: {

                            "Content-Type":
                                "application/x-www-form-urlencoded"

                        }

                    }

                );


            const accessToken =
                tokenResponse.data.access_token;


            const refreshToken =
                tokenResponse.data.refresh_token;


            const expiresAt =
                new Date(

                    Date.now() +

                    (
                        tokenResponse.data.expires_in ||
                        604800
                    ) *

                    1000

                );


            // =================================================
            // OBTENER INFORMACIÓN DEL USUARIO
            // =================================================

            const userResponse =
                await axios.get(

                    "https://discord.com/api/users/@me",

                    {

                        headers: {

                            Authorization:
                                `Bearer ${accessToken}`

                        }

                    }

                );


            const discordUser =
                userResponse.data;


            // =================================================
            // GUARDAR / ACTUALIZAR USUARIO
            // =================================================

            await pool.query(

                `
                INSERT INTO usuarios
                (
                    discord_id,
                    username,
                    global_name,
                    avatar,
                    access_token,
                    refresh_token,
                    expires_at,
                    verified_at
                )

                VALUES
                (
                    $1,
                    $2,
                    $3,
                    $4,
                    $5,
                    $6,
                    $7,
                    CURRENT_TIMESTAMP
                )

                ON CONFLICT (discord_id)

                DO UPDATE SET

                    username =
                        EXCLUDED.username,

                    global_name =
                        EXCLUDED.global_name,

                    avatar =
                        EXCLUDED.avatar,

                    access_token =
                        EXCLUDED.access_token,

                    refresh_token =
                        EXCLUDED.refresh_token,

                    expires_at =
                        EXCLUDED.expires_at,

                    verified_at =
                        CURRENT_TIMESTAMP
                `,

                [

                    discordUser.id,

                    discordUser.username,

                    discordUser.global_name ||
                        null,

                    discordUser.avatar ||
                        null,

                    accessToken,

                    refreshToken,

                    expiresAt

                ]

            );


            // =================================================
            // AÑADIR ROL DE VERIFICADO
            // =================================================

            const guild =
                client.guilds.cache.get(
                    guildId
                );


            if (!guild) {

                return res.status(500).send(
                    "❌ El bot no encuentra el servidor."
                );

            }


            const member =
                await guild.members.fetch(
                    discordUser.id
                ).catch(
                    () => null
                );


            if (member) {

                const role =
                    guild.roles.cache.get(
                        config.roleId
                    );


                if (role) {

                    await member.roles.add(
                        role
                    );

                }

            }


            // =================================================
            // AÑADIR USUARIO AL SERVIDOR
            // =================================================

            try {

                await axios.put(

                    `https://discord.com/api/v10/guilds/${guildId}/members/${discordUser.id}`,

                    {

                        access_token:
                            accessToken

                    },

                    {

                        headers: {

                            Authorization:
                                `Bot ${process.env.TOKEN}`,

                            "Content-Type":
                                "application/json"

                        },

                        timeout:
                            15000,

                        validateStatus:
                            () => true

                    }

                );

            } catch (error) {

                console.error(

                    "❌ Error añadiendo usuario al servidor:",

                    error.message

                );

            }


            // =================================================
            // RESPUESTA FINAL
            // =================================================

            return res.send(`

                <!DOCTYPE html>

                <html lang="es">

                <head>

                    <meta charset="UTF-8">

                    <meta name="viewport"
                        content="width=device-width, initial-scale=1.0">

                    <title>Verificación completada</title>

                    <style>

                        * {
                            box-sizing: border-box;
                        }

                        body {

                            margin: 0;

                            min-height: 100vh;

                            display: flex;

                            align-items: center;

                            justify-content: center;

                            background:
                                #111111;

                            font-family:
                                Arial,
                                sans-serif;

                            color:
                                white;

                        }

                        .box {

                            width:
                                min(500px, 90%);

                            padding:
                                40px;

                            text-align:
                                center;

                            background:
                                #1b1b1b;

                            border:
                                1px solid #333;

                            border-radius:
                                20px;

                            box-shadow:
                                0 0 40px
                                rgba(
                                    255,
                                    212,
                                    0,
                                    0.15
                                );

                        }

                        .icon {

                            font-size:
                                70px;

                            margin-bottom:
                                20px;

                        }

                        h1 {

                            margin:
                                0 0 15px;

                            color:
                                #FFD400;

                        }

                        p {

                            color:
                                #cccccc;

                            line-height:
                                1.6;

                        }

                    </style>

                </head>

                <body>

                    <div class="box">

                        <div class="icon">
                            ✅
                        </div>

                        <h1>
                            ¡Verificación completada!
                        </h1>

                        <p>
                            Tu cuenta de Discord ha sido
                            verificada correctamente.
                        </p>

                        <p>
                            Ya puedes volver a Discord.
                        </p>

                    </div>

                </body>

                </html>

            `);


        } catch (error) {

            console.error(

                "❌ Error en callback OAuth:",

                error.response?.data ||
                error.message ||
                error

            );


            return res.status(500).send(`

                <!DOCTYPE html>

                <html lang="es">

                <head>

                    <meta charset="UTF-8">

                    <title>Error</title>

                    <style>

                        body {

                            margin: 0;

                            min-height: 100vh;

                            display: flex;

                            align-items: center;

                            justify-content: center;

                            background:
                                #111;

                            color:
                                white;

                            font-family:
                                Arial,
                                sans-serif;

                        }

                        .box {

                            text-align:
                                center;

                            padding:
                                40px;

                            background:
                                #1b1b1b;

                            border-radius:
                                20px;

                        }

                        h1 {

                            color:
                                #ff4444;

                        }

                    </style>

                </head>

                <body>

                    <div class="box">

                        <h1>
                            ❌ Error de verificación
                        </h1>

                        <p>
                            No se pudo completar la
                            verificación.
                        </p>

                        <p>
                            Vuelve a intentarlo desde
                            Discord.
                        </p>

                    </div>

                </body>

                </html>

            `);

        }

    }
);


// =====================================================
// ARRANCAR SERVIDOR EXPRESS
// =====================================================

const PORT =
    process.env.PORT ||
    8080;


app.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            `🌐 Web funcionando en el puerto ${PORT}`
        );

    }
);


// =====================================================
// LOGIN DEL BOT
// =====================================================

client.login(
    process.env.TOKEN
);