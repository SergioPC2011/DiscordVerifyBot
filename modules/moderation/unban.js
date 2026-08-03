module.exports = async (client, guildId, userId) => {

    const guild = client.guilds.cache.get(guildId);

    if (!guild)
        throw new Error("Servidor no encontrado");

    await guild.members.unban(userId);

};