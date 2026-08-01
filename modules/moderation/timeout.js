const { PermissionsBitField } = require("discord.js");

module.exports = async (client, guildId, userId, tiempo, motivo) => {

    const guild = client.guilds.cache.get(guildId);

    if (!guild)
        throw new Error("Servidor no encontrado");

    const member = await guild.members.fetch(userId);

    await member.timeout(

        tiempo,

        motivo || "Timeout desde el panel"

    );

};