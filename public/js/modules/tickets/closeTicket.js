const {
    Events,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");
const { Pool } = require("pg");

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes("localhost")
        ? false
        : { rejectUnauthorized: false }
});

module.exports = (client) => {

client.on(Events.InteractionCreate, async interaction=>{

    if(!interaction.isButton()) return;

    // Cerrar

    if(interaction.customId==="cerrar_ticket"){

        const botones=new ActionRowBuilder()

        .addComponents(

            new ButtonBuilder()

            .setCustomId("confirmar_eliminar")

            .setLabel("Eliminar Ticket")

            .setEmoji("🗑️")

            .setStyle(ButtonStyle.Danger)

        );
await pool.query(
`
UPDATE tickets

SET

status='closed',

closed_at=CURRENT_TIMESTAMP

WHERE channel_id=$1
`,
[
    interaction.channel.id
]);

console.log("🔒 Ticket cerrado en PostgreSQL.");
        await interaction.reply({

            content:
            "🔒 Ticket cerrado.\n\nSolo el Staff puede escribir ahora.",

            components:[botones]

        });

        await interaction.channel.permissionOverwrites.edit(

            interaction.channel.permissionOverwrites.cache.find(p=>p.type===1).id,

            {

                SendMessages:false

            }

        );

    }

    // Eliminar

    if(interaction.customId==="confirmar_eliminar"){

        await interaction.reply({

            content:"🗑️ Eliminando ticket en 5 segundos..."

        });

        setTimeout(async()=>{

            await interaction.channel.delete();

        },5000);

    }

});

}