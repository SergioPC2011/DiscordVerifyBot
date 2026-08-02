module.exports = async (client, guildId, channelId, cantidad) => {

    const guild = client.guilds.cache.get(guildId);

    if (!guild)
        throw new Error("Servidor no encontrado");

    const canal = await guild.channels.fetch(channelId);

    if (!canal)
        throw new Error("Canal no encontrado");

    const mensajes = await canal.messages.fetch({

        limit: Number(cantidad)

    });

    await canal.bulkDelete(mensajes, true);

};