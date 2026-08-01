module.exports = async (client, guildId, userId, reason) => {

    const guild = client.guilds.cache.get(guildId);

    if (!guild)
        throw new Error("Servidor no encontrado");

    const member = await guild.members.fetch(userId);

    await member.kick(reason);

};