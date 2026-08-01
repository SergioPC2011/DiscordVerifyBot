document.addEventListener("DOMContentLoaded", () => {

    const botones = document.querySelectorAll(".menu-item");
    const contenido = document.getElementById("contenido");

    async function cargarModulo(modulo){

        try{

            const respuesta = await fetch(`/modules/${modulo}.html`);
            const html = await respuesta.text();

            contenido.innerHTML = html;

            // Eliminar script anterior
            const anterior = document.getElementById("modulo-script");
            if(anterior) anterior.remove();

            // Cargar JS del módulo
            const script = document.createElement("script");
            script.src = `/js/modules/${modulo}.js?v=` + Date.now();
            script.id = "modulo-script";

            document.body.appendChild(script);

        }catch(err){

            console.error(err);

            contenido.innerHTML =
            "<h2>Error al cargar el módulo.</h2>";

        }

    }

    botones.forEach(boton=>{

        boton.addEventListener("click",()=>{

            cargarModulo(boton.dataset.module);

        });

    });

    // Cargar Dashboard al abrir el panel
    cargarModulo("dashboard");

});