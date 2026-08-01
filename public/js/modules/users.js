async function cargarUsuarios() {

    const respuesta = await fetch("/api/users");

    const usuarios = await respuesta.json();

    const tbody = document.querySelector("#tablaUsuarios tbody");

    tbody.innerHTML = "";

    usuarios.forEach(usuario => {

        const avatar = usuario.avatar
            ? `https://cdn.discordapp.com/avatars/${usuario.discord_id}/${usuario.avatar}.png`
            : "https://cdn.discordapp.com/embed/avatars/0.png";

        tbody.innerHTML += `
        <tr>

            <td>
                <img src="${avatar}" width="45" style="border-radius:50%;">
            </td>

            <td>${usuario.username}</td>

            <td>${usuario.discord_id}</td>

            <td>${new Date(usuario.verified_at).toLocaleString()}</td>

        </tr>
        `;

    });

}

cargarUsuarios();