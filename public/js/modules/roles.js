async function cargarRoles() {

    const respuesta = await fetch("/api/roles");

    const roles = await respuesta.json();

    const tbody = document.querySelector("#tablaRoles tbody");

    tbody.innerHTML = "";

    roles.forEach(role => {

        tbody.innerHTML += `

        <tr>

            <td>

                <div style="
                width:22px;
                height:22px;
                border-radius:50%;
                background:${role.color};
                border:1px solid #555;
                "></div>

            </td>

            <td>${role.nombre}</td>

            <td>${role.miembros}</td>

            <td>

                <button>✏️</button>

                <button>🗑️</button>

            </td>

        </tr>

        `;

    });

}

cargarRoles();