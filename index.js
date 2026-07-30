require("dotenv").config();
const express = require("express");
const { 
    Client, 
    GatewayIntentBits,
    ButtonBuilder,
    ButtonStyle,
    ActionRowBuilder,
    Events
} = require("discord.js");


const client = new Client({
    intents:[
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers
    ]
});


// Cuando el bot inicia
client.once("ready", async ()=>{

    console.log(`✅ Bot conectado como ${client.user.tag}`);


    const canal = client.channels.cache.get("1529576800869683292");


    if(!canal){
        console.log("❌ No encuentro el canal");
        return;
    }


    const boton = new ButtonBuilder()
        .setCustomId("verificar")
        .setLabel("✅ Verificar")
        .setStyle(ButtonStyle.Success);


    const fila = new ActionRowBuilder()
        .addComponents(boton);


    await canal.send({
        content:"Pulsa el botón para verificarte:",
        components:[fila]
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
app.get("/", (req, res) => {
    res.send("✅ Discord Verify Bot funcionando");
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
    const fs = require("fs");

    let usuarios = JSON.parse(
        fs.readFileSync("usuarios.json")
    );


    usuarios.push({
        id: usuario.id,
        nombre: usuario.username,
        fecha: new Date()
    });


    fs.writeFileSync(
        "usuarios.json",
        JSON.stringify(usuarios,null,2)
    );


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
<title>Verificación completada</title>

<style>
body{
    margin:0;
    background:#0f172a;
    display:flex;
    justify-content:center;
    align-items:center;
    height:100vh;
    font-family:Arial,sans-serif;
}

.card{
    background:#1e293b;
    padding:40px;
    border-radius:20px;
    width:420px;
    text-align:center;
    color:white;
    box-shadow:0 0 30px rgba(0,0,0,.4);
}

.check{
    font-size:70px;
}

h1{
    margin-top:15px;
    margin-bottom:10px;
}

p{
    color:#cbd5e1;
    font-size:18px;
}
</style>

</head>

<body>

<div class="card">

<div class="check">✅</div>

<h1>¡Verificación completada!</h1>

<p>Tu cuenta ha sido verificada correctamente.</p>

<p>Ya puedes volver a Discord y disfrutar del servidor.</p>

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