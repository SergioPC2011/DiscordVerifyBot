module.exports = async (client, guildId) => {

    const guild = client.guilds.cache.get(guildId);

    if (!guild)
        throw new Error("Servidor no encontrado");

    return guild.channels.cache
        .filter(c => c.isTextBased() && c.type === 0)
        .sort((a, b) => a.position - b.position)
        .map(c => ({
            id: c.id,
            nombre: c.name
        }));

};