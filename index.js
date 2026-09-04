require("dotenv").config();
const express = require("express");
const {
    Client,
    GatewayIntentBits,
    ButtonBuilder,
    ButtonStyle,
    ActionRowBuilder,
    EmbedBuilder,
    Events
} = require("discord.js");
const { Pool } = require("pg");
const crypto = require("crypto");


// =====================================================
// CONFIGURACIÓN DE VERIFICACIÓN POR SERVIDOR
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


// Estados temporales de OAuth
const oauthStates = new Map();


// =====================================================
// POSTGRESQL
// =====================================================

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,

    ssl: process.env.DATABASE_URL?.includes("localhost")
        ? false
        : { rejectUnauthorized: false }
});


// =====================================================
// INICIALIZAR BASE DE DATOS
// =====================================================

async function initDB() {

    const query = `
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
    `;

    try {

        await pool.query(query);

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

        console.log("💾 Tabla tickets lista.");
        console.log("💾 Tabla usuarios lista.");

    } catch(err) {

        console.error("❌ Error PostgreSQL:", err);

    }

}


// =====================================================
// CLIENTE DISCORD
// =====================================================

const client = new Client({

    intents: [

        GatewayIntentBits.Guilds,

        GatewayIntentBits.GuildMembers

    ]

});


initDB();


// =====================================================
// CUANDO EL BOT INICIA
// =====================================================

client.once("ready", async () => {

    console.log(`✅ Bot conectado como ${client.user.tag}`);


    // =================================================
    // SISTEMA DE TICKETS
    // =================================================

    const ticketPanel = require("./modules/tickets/panel");

    await ticketPanel(client);

    require("./modules/tickets/createTicket")(client);

    require("./modules/tickets/closeTicket")(client);


    await initDB();


    // =================================================
    // BOTÓN DE VERIFICACIÓN
    // =================================================

    const boton = new ButtonBuilder()

        .setCustomId("verificar")

        .setLabel("Verificar cuenta")

        .setEmoji("🛡️")

        .setStyle(ButtonStyle.Success);


    const fila = new ActionRowBuilder()

        .addComponents(boton);


    // =================================================
    // EMBED DE VERIFICACIÓN
    // =================================================

    const embed = new EmbedBuilder()

        .setColor("#FFD400")

        .setAuthor({

            name: "Sistema de Verificación",

            iconURL:
                "https://cdn.discordapp.com/attachments/1515744948039848068/1527377287773818900/3F26C02F-83C3-42B2-84B0-D5A68C4CFD5F.png"

        })

        .setTitle("🛡️ Verificación del servidor")

        .setThumbnail(
            "https://cdn.discordapp.com/attachments/1515744948039848068/1527377287773818900/3F26C02F-83C3-42B2-84B0-D5A68C4CFD5F.png"
        )

        .setDescription(

`# 👋 ¡Bienvenido!

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
`
        )

        .setImage(
            "https://cdn.discordapp.com/attachments/1515744948039848068/1527377287773818900/3F26C02F-83C3-42B2-84B0-D5A68C4CFD5F.png"
        )

        .setFooter({

            text: "Discord Verify Bot • Verificación segura"

        })

        .setTimestamp();


    // =================================================
    // ENVIAR PANEL A LOS DOS SERVIDORES
    // =================================================

    for (
        const [guildId, config]
        of Object.entries(verificationServers)
    ) {

        try {

            const servidor =
                client.guilds.cache.get(guildId);


            if (!servidor) {

                console.log(
                    `❌ No encuentro el servidor ${guildId}`
                );

                continue;

            }


            const canal =
                await client.channels.fetch(
                    config.channelId
                );


            if (!canal) {

                console.log(
                    `❌ No encuentro el canal ${config.channelId}`
                );

                continue;

            }


            await canal.send({

                embeds: [embed],

                components: [fila]

            });


            console.log(
                `✅ Panel enviado en ${servidor.name}`
            );


        } catch (error) {

            console.error(

                `❌ Error enviando el panel al servidor ${guildId}:`,

                error

            );

        }

    }

});


// =====================================================
// CUANDO ALGUIEN PULSA VERIFICAR
// =====================================================

client.on(
    Events.InteractionCreate,
    async interaction => {

        if (!interaction.isButton())
            return;


        if (interaction.customId !== "verificar")
            return;


        // =============================================
        // SERVIDOR DONDE SE PULSÓ EL BOTÓN
        // =============================================

        const guildId =
            interaction.guild?.id;


        const config =
            verificationServers[guildId];


        // =============================================
        // COMPROBAR SERVIDOR
        // =============================================

        if (!config) {

            return interaction.reply({

                content:
                    "❌ Este servidor no está configurado para la verificación.",

                ephemeral: true

            });

        }


        // =============================================
        // RESPUESTA PRIVADA
        // =============================================

        await interaction.deferReply({

            flags: 64

        });


        // =============================================
        // CREAR STATE DE OAUTH
        // =============================================

        const state =
            crypto.randomBytes(32).toString("hex");


        oauthStates.set(

            state,

            {

                guildId: guildId,

                createdAt: Date.now()

            }

        );


        // =============================================
        // URL DE DISCORD OAUTH
        // =============================================

        const url =

            `https://discord.com/oauth2/authorize` +

            `?client_id=${process.env.CLIENT_ID}` +

            `&response_type=code` +

            `&redirect_uri=${encodeURIComponent(
                process.env.REDIRECT_URI
            )}` +

            `&scope=identify%20guilds.join` +

            `&state=${encodeURIComponent(state)}`;


        // =============================================
        // ENVIAR ENLACE
        // =============================================

        await interaction.editReply({

            content:
                `Pulsa aquí para verificar:\n${url}`

        });

    }

);


// =====================================================
// LIMPIAR STATES ANTIGUOS
// =====================================================

setInterval(() => {

    const ahora = Date.now();


    for (
        const [state, data]
        of oauthStates.entries()
    ) {

        // 10 minutos

        if (
            ahora - data.createdAt >
            10 * 60 * 1000
        ) {

            oauthStates.delete(state);

        }

    }

}, 10 * 60 * 1000);


// =====================================================
// SERVIDOR WEB
// =====================================================

const app = express();

const path = require("path");


app.use(

    express.static(
        path.join(__dirname, "public")
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

app.get("/", (req, res) => {

    res.send(
        "✅ Discord Verify Bot funcionando"
    );

});


// =====================================================
// API DE CANALES
// =====================================================

app.get("/api/channels", async (req, res) => {

    try {

        // Servidor principal del panel

        const servidor =
            client.guilds.cache.get(
                "1515037603219509309"
            );


        if (!servidor) {

            return res.json([]);

        }


        const canales =
            servidor.channels.cache

                .filter(
                    c => c.isTextBased()
                )

                .map(c => ({

                    id: c.id,

                    nombre: c.name

                }));


        res.json(canales);


    } catch (err) {

        console.error(err);

        res.json([]);

    }

});


// =====================================================
// PANEL
// =====================================================

app.get("/panel", (req, res) => {

    res.sendFile(

        path.join(
            __dirname,
            "views",
            "dashboard.html"
        )

    );

});


// =====================================================
// ESTADÍSTICAS
// =====================================================

app.get("/api/stats", async (req, res) => {

    try {

        const usuarios =
            await pool.query(
                "SELECT COUNT(*) FROM usuarios"
            );


        const tickets =
            await pool.query(
                "SELECT COUNT(*) FROM tickets"
            );


        const ticketsAbiertos =
            await pool.query(
                "SELECT COUNT(*) FROM tickets WHERE status='open'"
            );


        const ticketsCerrados =
            await pool.query(
                "SELECT COUNT(*) FROM tickets WHERE status='closed'"
            );


        res.json({

            usuarios:
                usuarios.rows[0].count,

            tickets:
                tickets.rows[0].count,

            abiertos:
                ticketsAbiertos.rows[0].count,

            cerrados:
                ticketsCerrados.rows[0].count

        });


    } catch(err) {

        console.error(err);


        res.json({

            usuarios: 0,

            tickets: 0,

            abiertos: 0,

            cerrados: 0

        });

    }

});


// =====================================================
// ENVIAR MENSAJE
// =====================================================

app.get("/enviar", async (req, res) => {

    try {

        const canalID =
            req.query.canal;


        const mensaje =
            req.query.mensaje;


        const canal =
            await client.channels.fetch(
                canalID
            );


        if (!canal) {

            return res.send(
                "Canal no encontrado"
            );

        }


        await canal.send(mensaje);


        res.send(
            "✅ Mensaje enviado"
        );


    } catch (err) {

        console.error(err);

        res.send("❌ Error");

    }

});


// =====================================================
// CALLBACK DE DISCORD OAUTH
// =====================================================

app.get("/callback", async (req, res) => {

    try {

        const code =
            req.query.code;


        const state =
            req.query.state;


        // =============================================
        // COMPROBAR CODE Y STATE
        // =============================================

        if (!code || !state) {

            return res.send(
                "❌ Falta información de verificación."
            );

        }


        // =============================================
        // RECUPERAR SERVIDOR
        // =============================================

        const oauthData =
            oauthStates.get(state);


        if (!oauthData) {

            return res.send(

                "❌ La sesión de verificación ha caducado o no es válida. Vuelve a pulsar el botón de verificar."

            );

        }


        // =============================================
        // EL STATE SOLO SE USA UNA VEZ
        // =============================================

        oauthStates.delete(state);


        // =============================================
        // CONFIGURACIÓN DEL SERVIDOR
        // =============================================

        const config =
            verificationServers[
                oauthData.guildId
            ];


        if (!config) {

            return res.send(
                "❌ El servidor no está configurado."
            );

        }


        console.log(
            "Código recibido:",
            code
        );


        // =============================================
        // AXIOS
        // =============================================

        const axios =
            require("axios");


        // =============================================
        // OBTENER TOKEN
        // =============================================

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


        // =============================================
        // OBTENER USUARIO
        // =============================================

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


        const usuario =
            userResponse.data;


        console.log(
            "Usuario verificado:",
            usuario.username
        );


        // =============================================
        // REFRESH TOKEN
        // =============================================

        const refreshToken =
            tokenResponse.data.refresh_token;


        // =============================================
        // EXPIRACIÓN
        // =============================================

        const expiresAt =
            new Date(

                Date.now() +

                tokenResponse.data.expires_in *
                1000

            );


        // =============================================
        // GUARDAR EN POSTGRESQL
        // =============================================

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

VALUES($1,$2,$3,$4,$5,$6,$7)

ON CONFLICT(discord_id)

DO UPDATE SET

    username = EXCLUDED.username,

    global_name = EXCLUDED.global_name,

    avatar = EXCLUDED.avatar,

    access_token = EXCLUDED.access_token,

    refresh_token = EXCLUDED.refresh_token,

    expires_at = EXCLUDED.expires_at,

    verified_at = CURRENT_TIMESTAMP;
`,

            [

                usuario.id,

                usuario.username,

                usuario.global_name,

                usuario.avatar,

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

            console.log(
                "➡️ Voy a intentar asignar el rol"
            );


            // =============================================
            // USAR EL SERVIDOR DONDE SE PULSÓ VERIFICAR
            // =============================================

            const servidor =
                client.guilds.cache.get(
                    oauthData.guildId
                );


            if (!servidor) {

                return res.send(
                    "❌ Servidor no encontrado"
                );

            }


            console.log(
                "Servidor encontrado:",
                servidor.name
            );


            // =============================================
            // BUSCAR MIEMBRO
            // =============================================

            const miembro =
                await servidor.members.fetch(
                    usuario.id
                );


            console.log(
                "Miembro encontrado:",
                miembro.user.username
            );


            // =============================================
            // DAR EL ROL CORRESPONDIENTE
            // =============================================

            await miembro.roles.add(
                config.roleId
            );


            console.log(
                "✅ Rol asignado correctamente"
            );


            // =================================================
            // PÁGINA DE ÉXITO
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


<link
    href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;600;700&display=swap"
    rel="stylesheet"
>


<style>


*{

    margin:0;

    padding:0;

    box-sizing:border-box;

    font-family:'Poppins',sans-serif;

}


body{

    height:100vh;

    display:flex;

    justify-content:center;

    align-items:center;

    background:
        linear-gradient(
            135deg,
            #111,
            #1b1b1b
        );

    overflow:hidden;

}


body::before{

    content:"";

    position:absolute;

    width:500px;

    height:500px;

    background:#FFD400;

    filter:blur(180px);

    opacity:.18;

    top:-150px;

    right:-150px;

}


.card{

    position:relative;

    z-index:2;

    width:480px;

    background:#181818;

    border:2px solid #FFD400;

    border-radius:22px;

    padding:45px;

    text-align:center;

    box-shadow:
        0 0 40px
        rgba(
            255,
            212,
            0,
            .25
        );

}


.logo{

    width:120px;

    height:120px;

    border-radius:50%;

    margin-bottom:25px;

    border:4px solid #FFD400;

    box-shadow:
        0 0 25px
        rgba(
            255,
            212,
            0,
            .35
        );

}


h1{

    color:#FFD400;

    font-size:34px;

    margin-bottom:18px;

    font-weight:700;

}


p{

    color:#DDD;

    font-size:17px;

    line-height:1.7;

    margin-bottom:14px;

}


.box{

    margin-top:30px;

    padding:18px;

    background:#222;

    border-radius:12px;

    border-left:5px solid #FFD400;

    color:#EEE;

    font-size:15px;

}


.ok{

    font-size:70px;

    margin-top:30px;

}


.footer{

    margin-top:30px;

    font-size:13px;

    color:#888;

}


</style>

</head>


<body>


<div class="card">


<img

    class="logo"

    src="https://cdn.discordapp.com/attachments/1515744948039848068/1527377287773818900/3F26C02F-83C3-42B2-84B0-D5A68C4CFD5F.png?ex=6a6ce572&is=6a6b93f2&hm=dcf57b54ed5b7db7762a770795e190be1425c748e440df59b64f366f387ec3fb&"


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


<br><br>


Ya puedes volver a Discord y disfrutar del servidor.


</div>


<div class="footer">

    Discord Verify Bot © 2026

</div>


</div>


</body>

</html>

`);


        } catch(error) {


            console.error(

                "❌ Error al asignar el rol:",

                error

            );


            return res.send(

                "❌ La verificación se completó, pero no se pudo asignar el rol."

            );

        }


    } catch(error) {

        console.error(
            "❌ Error en callback OAuth:",
            error
        );


        return res.send(
            "❌ Ha ocurrido un error durante la verificación."
        );

    }

});


// =====================================================
// PUERTO
// =====================================================

const PORT =
    process.env.PORT || 3000;


app.listen(PORT, () => {

    console.log(
        `🌐 Servidor OAuth activo en puerto ${PORT}`
    );

});


// =====================================================
// LOGIN DISCORD
// =====================================================

client.login(
    process.env.TOKEN
);