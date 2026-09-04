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
const MASS_JOIN_DELAY_MS = 500;


// Estados temporales OAuth
const oauthStates = new Map();


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

    let accessToken =

        await getValidAccessToken(user);


    async function request() {

        return axios.put(

            `https://discord.com/api/v10/guilds/${guildId}/members/${user.discord_id}`,

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

                validateStatus:
                    () => true

            }

        );

    }


    try {

        let response =
            await request();


        // Usuario añadido
        if (
            response.status === 201
        ) {

            return {

                ok: true,

                already: false

            };

        }


        // Usuario ya estaba
        if (
            response.status === 204
        ) {

            return {

                ok: true,

                already: true

            };

        }


        // Token caducado
        if (
            response.status === 401
        ) {

            console.log(
                `🔄 Renovando token de ${user.username}...`
            );


            accessToken =
                await refreshUserToken(user);


            response =
                await request();


            if (
                response.status === 201
            ) {

                return {

                    ok: true,

                    already: false

                };

            }


            if (
                response.status === 204
            ) {

                return {

                    ok: true,

                    already: true

                };

            }

        }


        // Rate limit
        if (
            response.status === 429
        ) {

            const retryAfter =

                Number(
                    response.data?.retry_after ||
                    1
                );


            console.log(

                `⏳ Rate limit. Esperando ${retryAfter}s...`

            );


            await sleep(

                Math.ceil(
                    retryAfter * 1000
                )

            );


            response =
                await request();


            if (
                response.status === 201
            ) {

                return {

                    ok: true,

                    already: false

                };

            }


            if (
                response.status === 204
            ) {

                return {

                    ok: true,

                    already: true

                };

            }

        }


        return {

            ok: false,

            reason:

                response.data?.message ||

                `Discord HTTP ${response.status}`

        };


    } catch (error) {

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

}


// =====================================================
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


        await initDB();


        // Registrar comando
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
// LIMPIAR STATES
// =====================================================

setInterval(

    () => {

        const now =
            Date.now();


        for (

            const [

                state,

                data

            ]

            of oauthStates.entries()

        ) {

            if (

                now -

                data.createdAt >

                10 * 60 * 1000

            ) {

                oauthStates.delete(

                    state

                );

            }

        }

    },

    10 * 60 * 1000

);


// =====================================================
// EXPRESS
// =====================================================

const app =
    express();


app.use(

    express.static(

        path.join(

            __dirname,

            "public"

        )

    )

);


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
// HOME
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
// API CANALES
// =====================================================

app.get(

    "/api/channels",

    async (req, res) => {

        try {

            // IMPORTANTE:
            // Este panel utiliza el servidor principal.

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

                        c =>

                            c.isTextBased()

                    )

                    .map(

                        c => ({

                            id:
                                c.id,

                            nombre:
                                c.name

                        })

                    );


            res.json(

                channels

            );


        } catch (error) {

            console.error(

                error

            );

            res.json([]);

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
// ESTADÍSTICAS
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

                    "SELECT COUNT(*) FROM tickets WHERE status='open'"

                );


            const cerrados =

                await pool.query(

                    "SELECT COUNT(*) FROM tickets WHERE status='closed'"

                );


            res.json({

                usuarios:
                    usuarios.rows[0].count,

                tickets:
                    tickets.rows[0].count,

                abiertos:
                    abiertos.rows[0].count,

                cerrados:
                    cerrados.rows[0].count

            });


        } catch (error) {

            console.error(

                error

            );


            res.json({

                usuarios:
                    0,

                tickets:
                    0,

                abiertos:
                    0,

                cerrados:
                    0

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

            const channel =

                await client.channels.fetch(

                    req.query.canal

                );


            if (!channel) {

                return res.send(

                    "Canal no encontrado"

                );

            }


            await channel.send(

                req.query.mensaje

            );


            res.send(

                "✅ Mensaje enviado"

            );


        } catch (error) {

            console.error(

                error

            );

            res.send(

                "❌ Error"

            );

        }

    }

);


// =====================================================
// CALLBACK OAUTH
// =====================================================

app.get(

    "/callback",

    async (req, res) => {

        try {

            const code =
                req.query.code;

            const state =
                req.query.state;


            if (

                !code ||

                !state

            ) {

                return res.send(

                    "❌ Falta información de verificación."

                );

            }


            // =================================================
            // RECUPERAR STATE
            // =================================================

            const oauthData =

                oauthStates.get(

                    state

                );


            if (!oauthData) {

                return res.send(

                    "❌ La sesión de verificación ha caducado o no es válida. Vuelve a pulsar el botón de verificar."

                );

            }


            // Usar solo una vez

            oauthStates.delete(

                state

            );


            // =================================================
            // CONFIGURACIÓN DEL SERVIDOR
            // =================================================

            const config =

                verificationServers[

                    oauthData.guildId

                ];


            if (!config) {

                return res.send(

                    "❌ El servidor no está configurado."

                );

            }


            // =================================================
            // CONSEGUIR TOKEN
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

                tokenResponse.data
                    .access_token;


            const refreshToken =

                tokenResponse.data
                    .refresh_token;


            const expiresAt =

                new Date(

                    Date.now() +

                    tokenResponse.data
                        .expires_in *

                    1000

                );


            // =================================================
            // OBTENER USUARIO
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


            const user =
                userResponse.data;


            console.log(

                "👤 Usuario verificado:",

                user.username

            );


            // =================================================
            // GUARDAR USUARIO
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

                    expires_at

                )

                VALUES

                ($1,$2,$3,$4,$5,$6,$7)

                ON CONFLICT(discord_id)

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

                    user.id,

                    user.username,

                    user.global_name,

                    user.avatar,

                    accessToken,

                    refreshToken,

                    expiresAt

                ]

            );


            console.log(

                "💾 Usuario guardado en PostgreSQL."

            );


            // =================================================
            // ASIGNAR ROL
            // =================================================

            try {

                const guild =

                    client.guilds.cache.get(

                        oauthData.guildId

                    );


                if (!guild) {

                    return res.send(

                        "❌ Servidor no encontrado."

                    );

                }


                console.log(

                    `🏠 Servidor: ${guild.name}`

                );


                const member =

                    await guild.members.fetch(

                        user.id

                    );


                await member.roles.add(

                    config.roleId

                );


                console.log(

                    "✅ Rol asignado correctamente."

                );


            } catch (error) {

                console.error(

                    "❌ Error al asignar el rol:",

                    error

                );


                return res.send(

                    "❌ La verificación se completó, pero no se pudo asignar el rol."

                );

            }


            // =================================================
            // PÁGINA ÉXITO
            // =================================================

            return res.send(`

<!DOCTYPE html>

<html lang="es">

<head>

<meta charset="UTF-8">

<meta

    name="viewport"

    content="width=device-width, initial-scale=1.0"

>

<title>

    Verificación del servidor

</title>


<style>

* {

    box-sizing:
        border-box;

}


body {

    margin:
        0;

    height:
        100vh;

    display:
        flex;

    justify-content:
        center;

    align-items:
        center;

    background:
        linear-gradient(

            135deg,

            #111,

            #1b1b1b

        );

    font-family:
        Arial,

        sans-serif;

    color:
        #ddd;

}


.card {

    width:
        480px;

    background:
        #181818;

    border:
        2px solid #FFD400;

    border-radius:
        22px;

    padding:
        45px;

    text-align:
        center;

    box-shadow:
        0 0 40px

        rgba(

            255,

            212,

            0,

            .25

        );

}


.logo {

    width:
        120px;

    height:
        120px;

    border-radius:
        50%;

    margin-bottom:
        25px;

    border:
        4px solid #FFD400;

}


h1 {

    color:
        #FFD400;

    font-size:
        34px;

}


p {

    line-height:
        1.7;

}


.box {

    margin-top:
        30px;

    padding:
        18px;

    background:
        #222;

    border-radius:
        12px;

    border-left:
        5px solid #FFD400;

}


.ok {

    font-size:
        70px;

    margin-top:
        30px;

}

</style>

</head>


<body>


<div class="card">


<img

    class="logo"

    src="https://cdn.discordapp.com/attachments/1515744948039848068/1527377287773818900/3F26C02F-83C3-42B2-84B0-D5A68C4CFD5F.png"

>


<h1>

    Verificación del servidor

</h1>


<p>

    Para acceder al servidor debes autorizar tu cuenta de Discord.

</p>


<p>

    No solicitaremos tu contraseña; la autenticación se realiza mediante el sistema oficial de Discord.

</p>


<div class="ok">

    ✅

</div>


<div class="box">

    <strong>

        Verificación completada correctamente.

    </strong>

    <br>

    <br>

    Ya puedes volver a Discord y disfrutar del servidor.

</div>


</div>


</body>

</html>

`);

        } catch (error) {

            console.error(

                "❌ Error en callback OAuth:",

                error.response?.data ||

                error

            );


            return res.send(

                "❌ Ha ocurrido un error durante la verificación."

            );

        }

    }

);


// =====================================================
// PUERTO
// =====================================================

const PORT =

    process.env.PORT ||

    3000;


app.listen(

    PORT,

    () => {

        console.log(

            `🌐 Servidor OAuth activo en puerto ${PORT}`

        );

    }

);


// =====================================================
// INICIAR
// =====================================================

initDB().catch(

    console.error

);


client.login(

    process.env.TOKEN

);