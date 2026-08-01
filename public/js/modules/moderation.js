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

    `;

    document
    .getElementById("kick")
    .addEventListener("click", async () => {

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

});