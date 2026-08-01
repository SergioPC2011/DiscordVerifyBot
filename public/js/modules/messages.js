async function cargarCanales(){

    const respuesta = await fetch("/api/channels");

    const canales = await respuesta.json();

    const select = document.getElementById("canal");

    select.innerHTML = "";

    canales.forEach(canal=>{

        select.innerHTML += `
            <option value="${canal.id}">
                #${canal.nombre}
            </option>
        `;

    });

}

cargarCanales();


document
.getElementById("enviarMensaje")
.addEventListener("click",async()=>{

    const canal =
        document.getElementById("canal").value;

    const mensaje =
        document.getElementById("mensaje").value;

    const respuesta = await fetch(
        `/enviar?canal=${canal}&mensaje=${encodeURIComponent(mensaje)}`
    );

    const texto = await respuesta.text();

    document.getElementById("resultado").innerHTML = texto;

});