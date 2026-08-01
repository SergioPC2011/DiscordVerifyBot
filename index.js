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

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes("localhost")
        ? false
        : { rejectUnauthorized: false }
});

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

        console.log("💾 Tabla usuarios lista.");

    } catch(err) {

        console.error("❌ Error PostgreSQL:", err);

    }

}


const client = new Client({
    intents:[
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers
    ]
});
initDB();


// Cuando el bot inicia
client.once("ready", async ()=>{

    console.log(`✅ Bot conectado como ${client.user.tag}`);
    await initDB();


    const canal = client.channels.cache.get("1529576800869683292");


    if(!canal){
        console.log("❌ No encuentro el canal");
        return;
    }


    const boton = new ButtonBuilder()
    .setCustomId("verificar")
    .setLabel("Verificar cuenta")
    .setEmoji("🛡️")
    .setStyle(ButtonStyle.Success);

const fila = new ActionRowBuilder()
    .addComponents(boton);

const embed = new EmbedBuilder()
    .setColor("#FFD400")
    .setAuthor({
        name: "Sistema de Verificación",
        iconURL: "https://cdn.discordapp.com/attachments/1515744948039848068/1527377287773818900/3F26C02F-83C3-42B2-84B0-D5A68C4CFD5F.png"
    })
    .setTitle("🛡️ Verificación del servidor")
    .setThumbnail("https://cdn.discordapp.com/attachments/1515744948039848068/1527377287773818900/3F26C02F-83C3-42B2-84B0-D5A68C4CFD5F.png")
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
`)
    .setImage("https://cdn.discordapp.com/attachments/1515744948039848068/1527377287773818900/3F26C02F-83C3-42B2-84B0-D5A68C4CFD5F.png")
    .setFooter({
        text: "Discord Verify Bot • Verificación segura"
    })
    .setTimestamp();

await canal.send({
    embeds: [embed],
    components: [fila]
});

    console.log("✅ Botón enviado");

});



// Cuando alguien pulsa el botón
client.on(Events.InteractionCreate, async interaction=>{

    if(!interaction.isButton()) return;


   if(interaction.customId === "verificar"){

    await interaction.deferReply({
        flags: 64
    });

    const url =
    `https://discord.com/oauth2/authorize?client_id=${process.env.CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(process.env.REDIRECT_URI)}&scope=identify%20guilds.join`;

    await interaction.editReply({
        content:`Pulsa aquí para verificar:\n${url}`
    });

}{

        
    }

});


// Iniciar bot
const app = express();
const path = require("path");

app.use(express.static(path.join(__dirname, "public")));

app.use("/modules", express.static(path.join(__dirname, "views/modules")));

app.get("/", (req, res) => {
    res.send("✅ Discord Verify Bot funcionando");
}); 
app.get("/api/channels", async (req, res) => {

    try {

        const servidor = client.guilds.cache.get("1515037603219509309");

        if (!servidor) {
            return res.json([]);
        }

        const canales = servidor.channels.cache
            .filter(c => c.isTextBased())
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
app.get("/panel", (req, res) => {

    res.sendFile(path.join(__dirname, "views", "dashboard.html"));

});
app.get("/enviar", async (req, res) => {

    try {

        const canalID = req.query.canal;
        const mensaje = req.query.mensaje;

        const canal = await client.channels.fetch(canalID);

        if (!canal) {
            return res.send("Canal no encontrado");
        }

        await canal.send(mensaje);

        res.send("✅ Mensaje enviado");

    } catch (err) {

        console.error(err);
        res.send("❌ Error");

    }

});
 app.get("/callback", async (req,res)=>{

    const code = req.query.code;

    console.log("Código recibido:", code);


    // Obtener información del usuario
    const axios = require("axios");


    const tokenResponse = await axios.post(
        "https://discord.com/api/oauth2/token",
        new URLSearchParams({
            client_id: process.env.CLIENT_ID,
            client_secret: process.env.CLIENT_SECRET,
            grant_type: "authorization_code",
            code: code,
            redirect_uri: process.env.REDIRECT_URI
        }),
        {
            headers:{
                "Content-Type":"application/x-www-form-urlencoded"
            }
        }
    );


    const accessToken = tokenResponse.data.access_token;


    const userResponse = await axios.get(
        "https://discord.com/api/users/@me",
        {
            headers:{
                Authorization:`Bearer ${accessToken}`
            }
        }
    );


 const usuario = userResponse.data;


    console.log("Usuario verificado:", usuario.username);


    // Guardar usuario
    const refreshToken = tokenResponse.data.refresh_token;

const expiresAt = new Date(
    Date.now() + tokenResponse.data.expires_in * 1000
);

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
]);

console.log("💾 Usuario guardado en PostgreSQL.");

  try {

    console.log("➡️ Voy a intentar asignar el rol");


    const servidor = client.guilds.cache.get("1515037603219509309");


    if(!servidor){
        return res.send("❌ Servidor no encontrado");
    }


    console.log("Servidor encontrado:", servidor.name);


    const miembro = await servidor.members.fetch(usuario.id);


    console.log("Miembro encontrado:", miembro.user.username);


    await miembro.roles.add("1532089874247844010");


    console.log("✅ Rol asignado correctamente");


 return res.send(`
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Verificación del servidor</title>

<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;600;700&display=swap" rel="stylesheet">

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
background:linear-gradient(135deg,#111,#1b1b1b);
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

box-shadow:0 0 40px rgba(255,212,0,.25);

}

.logo{

width:120px;

height:120px;

border-radius:50%;

margin-bottom:25px;

border:4px solid #FFD400;

box-shadow:0 0 25px rgba(255,212,0,.35);

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
src="https://cdn.discordapp.com/attachments/1515744948039848068/1527377287773818900/3F26C02F-83C3-42B2-84B0-D5A68C4CFD5F.png?ex=6a6ce572&is=6a6b93f2&hm=dcf57b54ed5b7db7762a770795e190be1425c748e440df59b64f366f387ec3fb&">

<h1>Verificación del servidor</h1>

<p>
Para acceder al servidor debes autorizar tu cuenta de Discord.
</p>

<p>
No solicitaremos tu contraseña; la autenticación se realiza mediante el sistema oficial de Discord.
</p>

<div class="ok">✅</div>

<div class="box">

<strong>Verificación completada correctamente.</strong>

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

});
 

 


 const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`🌐 Servidor OAuth activo en puerto ${PORT}`);
});


 client.login(process.env.TOKEN)