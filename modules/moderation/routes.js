const kick = require("./kick");
const { EmbedBuilder } = require("discord.js");

module.exports = (app, client) => {

    app.get("/api/moderation/user/:id", async (req, res) => {

        try {

            const servidor = client.guilds.cache.get("1515037603219509309");

            if (!servidor)
                return res.json({ ok: false });

            const miembro = await servidor.members.fetch(req.params.id);

            res.json({

                ok: true,

                id: miembro.id,

                username: miembro.user.username,

                avatar: miembro.user.displayAvatarURL({

                    extension: "png",

                    size: 512

                }),

                joinedAt: miembro.joinedAt,

                roles: miembro.roles.cache
                    .filter(r => r.name !== "@everyone")
                    .map(r => r.name)

            });

        } catch (err) {

            console.error(err);

            res.json({

                ok: false

            });

        }

    });

    // 👇 PEGA ESTO DEBAJO
    app.post("/api/moderation/kick", async (req, res) => {

        try {

            const { id, motivo } = req.body;

            await kick(

                client,

                "1515037603219509309",

                id,

                motivo || "Kick desde el panel"

            );

            res.json({
                ok: true
            });

        } catch (err) {

            console.error(err);

            res.json({
                ok: false
            });

        }

    });

};