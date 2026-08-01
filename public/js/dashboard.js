document.addEventListener("DOMContentLoaded", () => {

    const botones = document.querySelectorAll(".menu-item");

    const contenido = document.getElementById("contenido");

    botones.forEach(boton => {

        boton.addEventListener("click", async () => {

            const modulo = boton.dataset.module;

            try {

                const respuesta = await fetch(`/modules/${modulo}.html`);

                const html = await respuesta.text();

                contenido.innerHTML = html;

            } catch {

                contenido.innerHTML =
                "<h2>Error al cargar el módulo.</h2>";

            }

        });

    });

});