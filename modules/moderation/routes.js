const kick = require("./kick");
const ban = require("./ban");
const timeout = require("./timeout");
const purge = require("./purge");
const removeTimeout = require("./removetimeout");
const channels = require("./channels");
const nickname = require("./nickname");
const unban = require("./unban");
const { EmbedBuilder } = require("discord.js");

module.exports = (app, client) => {

    // ===========================
    // BUSCAR USUARIO
    // ===========================

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

    // ===========================
    // KICK
    // ===========================

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

    // ===========================
    // BAN
    // ===========================

    app.post("/api/moderation/ban", async (req, res) => {

        try {

            const { id, motivo } = req.body;

            await ban(

                client,

                "1515037603219509309",

                id,

                motivo || "Ban desde el panel"

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

    // ===========================
    // TIMEOUT
    // ===========================

    app.post("/api/moderation/timeout", async (req, res) => {

        try {

            const { id, motivo, tiempo } = req.body;

            await timeout(

                client,

                "1515037603219509309",

                id,

                tiempo,

                motivo

            );

            res.json({

                ok: true

            });

        } catch (err) {

            console.error("❌ Error Timeout:", err);

            res.status(500).json({

                ok: false,
                error: err.message

            });

        }

    });

    // ===========================
    // REMOVE TIMEOUT
    // ===========================

    app.post("/api/moderation/removetimeout", async (req, res) => {

        try {

            const { id } = req.body;

            await removeTimeout(

                client,

                "1515037603219509309",

                id

            );

            res.json({

                ok: true

            });

        } catch (err) {

            console.error("❌ Error Remove Timeout:", err);

            res.status(500).json({

                ok: false,
                error: err.message

            });

        }

    });

    // ===========================
    // OBTENER CANALES
    // ===========================

    app.get("/api/moderation/channels", async (req, res) => {

        try {

            const lista = await channels(

                client,

                "1515037603219509309"

            );

            res.json(lista);

        } catch (err) {

            console.error(err);

            res.json([]);

        }

    });

    // ===========================
    // PURGE
    // ===========================

    app.post("/api/moderation/purge", async (req, res) => {

        try {

            const { channelId, cantidad } = req.body;

            await purge(

                client,

                "1515037603219509309",

                channelId,

                cantidad

            );

            res.json({

                ok: true

            });

        } catch (err) {

            console.error("❌ Error Purge:", err);

            res.status(500).json({

                ok: false,
                error: err.message

            });

        }

    });
// ===========================
// CAMBIAR APODO
// ===========================

app.post("/api/moderation/nickname", async (req, res) => {

    try {

        const { id, nickname: nuevoApodo } = req.body;

        await nickname(

            client,

            "1515037603219509309",

            id,

            nuevoApodo

        );

        res.json({

            ok: true

        });

    } catch (err) {

        console.error("❌ Error Nickname:", err);

        res.status(500).json({

            ok: false,
            error: err.message

        });

    }

});
// ===========================
// UNBAN
// ===========================

app.post("/api/moderation/unban", async (req, res) => {

    try {

        const { id } = req.body;

        await unban(

            client,

            "1515037603219509309",

            id

        );

        res.json({

            ok: true

        });

    } catch (err) {

        console.error("❌ Error Unban:", err);

        res.status(500).json({

            ok: false,
            error: err.message

        });

    }

});
};