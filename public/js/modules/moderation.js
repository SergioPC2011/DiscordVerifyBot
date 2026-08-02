// ===========================
// CARGAR CANALES
// ===========================

async function cargarCanales() {

    const respuesta = await fetch("/api/moderation/channels");

    const canales = await respuesta.json();

    const select = document.getElementById("canalPurge");

    if (!select) return;

    select.innerHTML = "";

    canales.forEach(canal => {

        select.innerHTML += `
            <option value="${canal.id}">
                #${canal.nombre}
            </option>
        `;

    });

}

cargarCanales();

// ===========================
// BUSCAR USUARIO
// ===========================

document
.getElementById("buscarBtn")
.addEventListener("click", async () => {

    const id = document.getElementById("buscarUsuario").value;

    if (!id) return;

    const respuesta = await fetch(`/api/moderation/user/${id}`);

    const datos = await respuesta.json();

    window.usuarioSeleccionado = datos;

    if (!datos.ok) {

        document.getElementById("usuarioInfo").innerHTML =
            "<h3>❌ Usuario no encontrado.</h3>";

        return;

    }

    document.getElementById("usuarioInfo").innerHTML = `

        <hr>

        <img
        src="${datos.avatar}"
        width="120"
        style="border-radius:50%;">

        <h2>${datos.username}</h2>

        <p><b>ID:</b> ${datos.id}</p>

        <p><b>Entró:</b> ${new Date(datos.joinedAt).toLocaleString()}</p>

        <p><b>Roles</b></p>

        <ul>
            ${datos.roles.map(r => `<li>${r}</li>`).join("")}
        </ul>

        <br>

        <button id="kick">🦶 Kick</button>
        <button id="ban">🔨 Ban</button>
        <button id="timeout">⏳ Timeout</button>
        <button id="removetimeout">🔓 Quitar Timeout</button>

    `;

    // ===========================
    // KICK
    // ===========================

    document.getElementById("kick").addEventListener("click", async () => {

        const motivo = prompt("Motivo del Kick");

        const respuesta = await fetch("/api/moderation/kick", {

            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({

                id: window.usuarioSeleccionado.id,

                motivo

            })

        });

        const r = await respuesta.json();

        if (r.ok) {

            alert("✅ Usuario expulsado.");

        } else {

            alert("❌ No se pudo expulsar.");

        }

    });

    // ===========================
    // BAN
    // ===========================

    document.getElementById("ban").addEventListener("click", async () => {

        const motivo = prompt("Motivo del Ban");

        const respuesta = await fetch("/api/moderation/ban", {

            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({

                id: window.usuarioSeleccionado.id,

                motivo

            })

        });

        const r = await respuesta.json();

        if (r.ok) {

            alert("✅ Usuario baneado.");

        } else {

            alert("❌ No se pudo banear.");

        }

    });

    // ===========================
    // TIMEOUT
    // ===========================

    document.getElementById("timeout").addEventListener("click", async () => {

        const minutos = prompt("¿Cuántos minutos?");

        if (!minutos) return;

        const motivo = prompt("Motivo del Timeout");

        const respuesta = await fetch("/api/moderation/timeout", {

            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({

                id: window.usuarioSeleccionado.id,

                tiempo: Number(minutos) * 60 * 1000,

                motivo

            })

        });

        const r = await respuesta.json();

        if (r.ok) {

            alert("✅ Timeout aplicado.");

        } else {

            alert("❌ Error: " + (r.error || "Desconocido"));

        }

    });

    // ===========================
    // REMOVE TIMEOUT
    // ===========================

    document.getElementById("removetimeout").addEventListener("click", async () => {

        const respuesta = await fetch("/api/moderation/removetimeout", {

            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({

                id: window.usuarioSeleccionado.id

            })

        });

        const r = await respuesta.json();

        if (r.ok) {

            alert("✅ Timeout eliminado.");

        } else {

            alert("❌ Error: " + (r.error || "Desconocido"));

        }

    });

});
// ===========================
// PURGE
// ===========================

document.getElementById("purgeBtn").addEventListener("click", async () => {

    const channelId = document.getElementById("canalPurge").value;

    const cantidad = document.getElementById("cantidadPurge").value;

    if (!channelId || !cantidad) {

        alert("Selecciona un canal y una cantidad.");

        return;

    }

    const confirmar = confirm(`¿Seguro que quieres borrar ${cantidad} mensajes?`);

    if (!confirmar) return;

    const respuesta = await fetch("/api/moderation/purge", {

        method: "POST",

        headers: {
            "Content-Type": "application/json"
        },

        body: JSON.stringify({

            channelId,

            cantidad

        })

    });

    const r = await respuesta.json();

    if (r.ok) {

        alert("✅ Mensajes eliminados.");

    } else {

        alert("❌ Error: " + (r.error || "Desconocido"));

    }

});