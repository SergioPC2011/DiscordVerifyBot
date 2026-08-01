async function cargarDashboard(){

    const respuesta = await fetch("/api/stats");

    const datos = await respuesta.json();

    document.getElementById("usuarios").innerHTML = datos.usuarios;

    document.getElementById("tickets").innerHTML = datos.tickets;

    document.getElementById("abiertos").innerHTML = datos.abiertos;

    document.getElementById("cerrados").innerHTML = datos.cerrados;

}

cargarDashboard();