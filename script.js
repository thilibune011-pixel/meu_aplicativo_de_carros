// ======================================================
// G4 AUTO CAR
// ======================================================


// ======================================================
// CONFIGURAÇÕES
// ======================================================

// Combustíveis: até 5 km
const RAIO_COMBUSTIVEL = 5000;

// Recarga elétrica: até 10 km
const RAIO_RECARGA = 10000;


// Servidores públicos gratuitos do Overpass
const OVERPASS_SERVERS = [

    "https://overpass-api.de/api/interpreter",

    "https://z.overpass-api.de/api/interpreter",

    "https://lz4.overpass-api.de/api/interpreter"

];


let mapa = null;

let marcadorUsuario = null;

let marcadoresLocais = [];

let locaisAtuais = [];

let filtroAtual = "todos";

let localAvaliacaoAtual = "";
let localAtualPreco = null;

// ======================================================
// INICIALIZAÇÃO
// ======================================================

document.addEventListener(
    "DOMContentLoaded",
    function () {

        mapa = new maplibregl.Map({

            container: "mapa-real",

            style:
                "https://tiles.openfreemap.org/styles/liberty",

            center: [
                -46.455,
                -23.667
            ],

            zoom: 13

        });


        mapa.addControl(
            new maplibregl.NavigationControl(),
            "top-right"
        );


        mapa.on(
            "load",
            function () {

                console.log(
                    "Mapa do G4 Auto Car carregado."
                );

            }
        );


        atualizarTiposPreco();

        mostrarLocais();

    }
);


// ======================================================
// MENSAGEM
// ======================================================

function mostrarMensagem(texto) {

    const mensagem =
        document.getElementById(
            "mensagemLocalizacao"
        );


    if (mensagem) {

        mensagem.innerText = texto;

    }

}


// ======================================================
// LOCALIZAÇÃO
// ======================================================

function usarMinhaLocalizacao() {

    mostrarMensagem(
        "📍 Procurando sua localização..."
    );


    if (!navigator.geolocation) {

        mostrarMensagem(
            "❌ Seu navegador não permite localização."
        );

        return;

    }


    navigator.geolocation.getCurrentPosition(

        function (posicao) {

            const latitude =
                posicao.coords.latitude;

            const longitude =
                posicao.coords.longitude;


            console.log(
                "Localização encontrada:",
                latitude,
                longitude
            );


            if (mapa) {

                mapa.flyTo({

                    center: [
                        longitude,
                        latitude
                    ],

                    zoom: 14,

                    essential: true

                });

            }


            if (marcadorUsuario) {

                marcadorUsuario.remove();

            }


            marcadorUsuario =
                new maplibregl.Marker({

                    color: "#e63946"

                })

                .setLngLat([

                    longitude,

                    latitude

                ])

                .setPopup(

                    new maplibregl.Popup()

                    .setHTML(
                        "<strong>📍 Você está aqui</strong>"
                    )

                )

                .addTo(mapa);


            mostrarMensagem(
                "📍 Localização encontrada! Procurando locais próximos..."
            );


            buscarLocaisReais(
                latitude,
                longitude
            );

        },


        function (erro) {

            console.error(
                "Erro de localização:",
                erro
            );


            mostrarMensagem(
                "❌ Não foi possível obter sua localização. Verifique a permissão do navegador."
            );

        },


        {

            enableHighAccuracy: true,

            timeout: 15000,

            maximumAge: 0

        }

    );

}


// ======================================================
// BUSCA REAL NO OPENSTREETMAP
// ======================================================

async function buscarLocaisReais(
    latitude,
    longitude
) {

    mostrarMensagem("🔎 Buscando postos e eletropostos próximos...");

    // Para o aplicativo funcionar diretamente pelo index.html, usamos
    // o Nominatim (OpenStreetMap), que disponibiliza consultas GET com CORS.
    // A busca é feita em duas etapas para respeitar o limite de uso do serviço.
    const consultas = [
        {
            tipo: "combustivel",
            raio: RAIO_COMBUSTIVEL,
            termos: ["posto de gasolina"]
        },
        {
            tipo: "eletrico",
            raio: RAIO_RECARGA,
            termos: ["estação de recarga elétrica"]
        }
    ];

    const locaisEncontrados = [];

    function esperar(ms) {
        return new Promise(function (resolve) {
            setTimeout(resolve, ms);
        });
    }

    function montarViewbox(raioMetros) {
        const deltaLat = raioMetros / 111000;
        const deltaLon = raioMetros / (111000 * Math.cos(grausParaRadianos(latitude)));

        const esquerda = longitude - deltaLon;
        const direita = longitude + deltaLon;
        const topo = latitude + deltaLat;
        const baixo = latitude - deltaLat;

        // Nominatim: left,top,right,bottom
        return [esquerda, topo, direita, baixo].join(",");
    }

    for (let indice = 0; indice < consultas.length; indice++) {
        const consulta = consultas[indice];
        const viewbox = montarViewbox(consulta.raio);

        for (let termoIndice = 0; termoIndice < consulta.termos.length; termoIndice++) {
            const termo = consulta.termos[termoIndice];

            try {
                mostrarMensagem(
                    consulta.tipo === "eletrico"
                        ? "⚡ Procurando eletropostos próximos..."
                        : "⛽ Procurando postos de combustível próximos..."
                );

                const parametros = new URLSearchParams({
                    format: "jsonv2",
                    q: termo,
                    limit: "50",
                    bounded: "1",
                    viewbox: viewbox,
                    addressdetails: "1",
                    extratags: "1",
                    "accept-language": "pt-BR"
                });

                const resposta = await fetch(
                    "https://nominatim.openstreetmap.org/search?" + parametros.toString(),
                    {
                        method: "GET",
                        mode: "cors",
                        cache: "no-store",
                        headers: {
                            "Accept": "application/json"
                        }
                    }
                );

                if (!resposta.ok) {
                    throw new Error("HTTP " + resposta.status);
                }

                const dados = await resposta.json();

                if (Array.isArray(dados)) {
                    dados.forEach(function (resultado) {
                        const latitudeLocal = Number(resultado.lat);
                        const longitudeLocal = Number(resultado.lon);

                        if (!Number.isFinite(latitudeLocal) || !Number.isFinite(longitudeLocal)) {
                            return;
                        }

                        const distancia = calcularDistancia(
                            latitude,
                            longitude,
                            latitudeLocal,
                            longitudeLocal
                        );

                        if (distancia > consulta.raio / 1000) {
                            return;
                        }

                        const tags = resultado.extratags || {};
                        const nome =
                            resultado.name ||
                            (consulta.tipo === "eletrico"
                                ? "Ponto de recarga elétrica"
                                : "Posto de combustível");

                        const osmId =
                            resultado.osm_type + "-" + resultado.osm_id;

                        if (!locaisEncontrados.some(function (local) {
                            return local.id === "osm-" + osmId;
                        })) {
                            locaisEncontrados.push({
                                id: "osm-" + osmId,
                                nome: nome,
                                tipo: consulta.tipo,
                                latitude: latitudeLocal,
                                longitude: longitudeLocal,
                                distancia: distancia,
                                tags: tags,
                                endereco: resultado.display_name || "",
                                fonte: "OpenStreetMap / Nominatim"
                            });
                        }
                    });
                }

            } catch (erro) {
                console.error(
                    "Erro ao buscar no Nominatim:",
                    consulta.tipo,
                    erro
                );
            }
        }

        // Evita disparar consultas seguidas contra o serviço público.
        if (indice < consultas.length - 1) {
            await esperar(1100);
        }
    }

    locaisEncontrados.sort(function (a, b) {
        return a.distancia - b.distancia;
    });

    locaisAtuais = locaisEncontrados;

    limparMarcadoresLocais();

    locaisAtuais.forEach(function (local) {
        adicionarMarcador(local);
    });

    mostrarLocais();

    if (locaisAtuais.length > 0) {
        mostrarMensagem(
            "✅ Encontramos " + locaisAtuais.length + " local(is) real(is) próximo(s)."
        );
    } else {
        mostrarMensagem(
            "⚠️ Nenhum posto ou eletroposto foi encontrado nessa região. Tente novamente ou aumente o zoom do mapa."
        );
    }
}

// ======================================================
// DISTÂNCIA
// ======================================================

function calcularDistancia(

    lat1,
    lon1,
    lat2,
    lon2

) {


    const R =
        6371;


    const dLat =
        grausParaRadianos(
            lat2 - lat1
        );


    const dLon =
        grausParaRadianos(
            lon2 - lon1
        );


    const a =

        Math.sin(
            dLat / 2
        ) *
        Math.sin(
            dLat / 2
        )

        +

        Math.cos(
            grausParaRadianos(lat1)
        )

        *

        Math.cos(
            grausParaRadianos(lat2)
        )

        *

        Math.sin(
            dLon / 2
        )
        *
        Math.sin(
            dLon / 2
        );


    const c =

        2 *

        Math.atan2(

            Math.sqrt(a),

            Math.sqrt(1 - a)

        );


    return R * c;

}


// ======================================================
// GRAUS → RADIANOS
// ======================================================

function grausParaRadianos(
    graus
) {

    return (
        graus *
        Math.PI /
        180
    );

}


// ======================================================
// FORMATAR DISTÂNCIA
// ======================================================

function formatarDistancia(
    distancia
) {


    if (
        distancia < 1
    ) {

        return (

            Math.round(
                distancia * 1000
            )

            +

            " m"

        );

    }


    return (

        distancia.toFixed(1)

        +

        " km"

    );

}


// ======================================================
// MARCADOR
// ======================================================

function adicionarMarcador(
    local
) {


    if (!mapa) {

        return;

    }


    const cor =

        local.tipo ===
        "eletrico"

            ? "#f4b400"

            : "#e85d04";


    const marcador =

        new maplibregl.Marker({

            color: cor

        })

        .setLngLat([

            local.longitude,

            local.latitude

        ])

        .setPopup(

            new maplibregl.Popup({

                offset: 25

            })

            .setHTML(

                `

                <strong>
                    ${escaparTexto(local.nome)}
                </strong>

                <br><br>

                ${
                    local.tipo === "eletrico"
                    ? "⚡ Recarga elétrica"
                    : "⛽ Posto de combustível"
                }

                <br><br>

                📍 ${formatarDistancia(local.distancia)}

                `

            )

        )

        .addTo(mapa);


    marcadoresLocais.push(
        marcador
    );

}


// ======================================================
// LIMPAR MARCADORES
// ======================================================

function limparMarcadoresLocais() {


    marcadoresLocais.forEach(

        function (marcador) {

            marcador.remove();

        }

    );


    marcadoresLocais = [];

}


// ======================================================
// BUSCA
// ======================================================

function buscarLocais() {

    mostrarLocais();

}


// ======================================================
// FILTRO COMBUSTÍVEIS
// ======================================================

function mostrarCombustiveis() {

    filtroAtual =
        "combustiveis";

    mostrarLocais();

}


// ======================================================
// FILTRO RECARGAS
// ======================================================

function mostrarRecargas() {

    filtroAtual =
        "eletrico";

    mostrarLocais();

}


// ======================================================
// FILTRO TODOS
// ======================================================

function mostrarTodos() {

    filtroAtual =
        "todos";

    mostrarLocais();

}


// ======================================================
// MOSTRAR LOCAIS
// ======================================================

function mostrarLocais() {


    const container =
        document.getElementById(
            "locais"
        );


    if (!container) {

        return;

    }


    const busca =
        document.getElementById(
            "busca"
        );


    const textoBusca =

        busca

            ? busca.value
                .toLowerCase()
                .trim()

            : "";


    let cards =
        Array.from(
            container.querySelectorAll(
                ".local"
            )
        );


    // ==================================================
    // FILTRO DOS EXEMPLOS
    // ==================================================

    cards.forEach(

        function (card) {

            const nome =

                (
                    card.dataset.nome ||
                    ""
                )

                .toLowerCase();


            const ehRecarga =
                card.classList.contains(
                    "recarga"
                );


            const ehCombustivel =
                card.classList.contains(
                    "combustivel"
                );


            let mostrar = true;


            if (
                filtroAtual ===
                "combustiveis"
            ) {

                mostrar =
                    ehCombustivel;

            }


            if (
                filtroAtual ===
                "eletrico"
            ) {

                mostrar =
                    ehRecarga;

            }


            if (
                textoBusca
                &&
                !nome.includes(
                    textoBusca
                )
            ) {

                mostrar = false;

            }


            card.style.display =
                mostrar
                    ? "block"
                    : "none";

        }

    );


    // ==================================================
    // CARDS REAIS
    // ==================================================

    const cardsReais =
        container.querySelectorAll(
            ".card-real"
        );


    cardsReais.forEach(
        function (card) {

            card.remove();

        }
    );


    let locaisFiltrados =
        [...locaisAtuais];


    if (
        filtroAtual ===
        "combustiveis"
    ) {

        locaisFiltrados =
            locaisFiltrados.filter(

                function (local) {

                    return (
                        local.tipo ===
                        "combustivel"
                    );

                }

            );

    }


    if (
        filtroAtual ===
        "eletrico"
    ) {

        locaisFiltrados =
            locaisFiltrados.filter(

                function (local) {

                    return (
                        local.tipo ===
                        "eletrico"
                    );

                }

            );

    }


    if (textoBusca) {

        locaisFiltrados =
            locaisFiltrados.filter(

                function (local) {

                    return (

                        local.nome
                            .toLowerCase()
                            .includes(
                                textoBusca
                            )

                    );

                }

            );

    }


    locaisFiltrados.forEach(

        function (local) {

            const card =
                criarCardReal(
                    local
                );


            container.appendChild(
                card
            );

        }

    );

}


// ======================================================
// CARD REAL
// ======================================================

function criarCardReal(
    local
) {


    const card =
        document.createElement(
            "div"
        );


    card.className =
        "local card-real";


    card.dataset.nome =
        local.nome;


    const icone =

        local.tipo ===
        "eletrico"

            ? "⚡"

            : "⛽";


    let precoHTML = "";


    if (
        local.tipo ===
        "combustivel"
    ) {

        precoHTML = `

            <p>
                ⛽ Gasolina:
                <strong>
                    ${obterPreco(local.id, "Gasolina")}
                </strong>
            </p>

            <p>
                🌱 Etanol:
                <strong>
                    ${obterPreco(local.id, "Etanol")}
                </strong>
            </p>

            <p>
                🛢️ Diesel:
                <strong>
                    ${obterPreco(local.id, "Diesel")}
                </strong>
            </p>

        `;

    }
    else {

        precoHTML = `

            <p>
                ⚡ Recarga elétrica:
                <strong>
                    Informação não cadastrada
                </strong>
            </p>

        `;

    }


    card.innerHTML = `

        <h3>
            ${icone}
            ${escaparTexto(local.nome)}
        </h3>

        <p>
            📏
            ${formatarDistancia(local.distancia)}
        </p>

        <div class="precos">

            ${precoHTML}

        </div>

        <small>
            🗺️ Fonte: OpenStreetMap
        </small>

        <button class="ver-mapa">
            📍 Ver no mapa
        </button>

        <button class="avaliar">
            ⭐ Avaliar este local
        </button>

        <button class="atualizar">
            📝 Informar preço
        </button>

    `;


    const botaoMapa =
        card.querySelector(
            ".ver-mapa"
        );


    botaoMapa.onclick =
        function () {

            mostrarNoMapaLocal(
                local
            );

        };


    const botaoAvaliar =
        card.querySelector(
            ".avaliar"
        );


    botaoAvaliar.onclick =
        function () {

            abrirAvaliacao(
                local.nome
            );

        };


    const botaoAtualizar =
        card.querySelector(
            ".atualizar"
        );


    botaoAtualizar.onclick =
        function () {

            abrirFormulario();
            localAtualPreco = local;

            document.getElementById(
                "nomeLocal"
            ).value =
                local.nome;

        };


    return card;

}


// ======================================================
// MOSTRAR NO MAPA
// ======================================================

function mostrarNoMapa(
    nome
) {


    const cards =
        document.querySelectorAll(
            ".local"
        );


    for (
        let i = 0;
        i < cards.length;
        i++
    ) {


        const card =
            cards[i];


        if (
            card.dataset.nome ===
            nome
        ) {


            const latitude =
                Number(
                    card.dataset.lat
                );


            const longitude =
                Number(
                    card.dataset.lng
                );


            if (mapa) {

                mapa.flyTo({

                    center: [
                        longitude,
                        latitude
                    ],

                    zoom: 16,

                    essential: true

                });


                new maplibregl.Marker({

                    color:
                        "#1d3557"

                })

                .setLngLat([

                    longitude,

                    latitude

                ])

                .addTo(mapa);

            }


            return;

        }

    }

}


// ======================================================
// MOSTRAR LOCAL REAL NO MAPA
// ======================================================

function mostrarNoMapaLocal(
    local
) {


    if (!mapa) {

        return;

    }


    mapa.flyTo({

        center: [

            local.longitude,

            local.latitude

        ],

        zoom: 17,

        essential: true

    });


    const marcador =
        new maplibregl.Marker({

            color: "#1d3557"

        })

        .setLngLat([

            local.longitude,

            local.latitude

        ])

        .setPopup(

            new maplibregl.Popup()

            .setHTML(

                "<strong>" +
                escaparTexto(local.nome) +
                "</strong>"

            )

        )

        .addTo(mapa);


    marcador.togglePopup();

}


// ======================================================
// FORMULÁRIO
// ======================================================

function abrirFormulario() {


    const formulario =
        document.getElementById(
            "formulario"
        );


    if (formulario) {

        formulario.style.display =
            "block";

        formulario.scrollIntoView({

            behavior: "smooth"

        });

    }

}


// ======================================================
// FECHAR FORMULÁRIO
// ======================================================

function fecharFormulario() {


    const formulario =
        document.getElementById(
            "formulario"
        );


    if (formulario) {

        formulario.style.display =
            "none";

    }

}


// ======================================================
// ALTERAR TIPO DE PREÇO
// ======================================================

function atualizarTiposPreco() {


    const tipo =
        document.getElementById(
            "tipo"
        );


    const select =
        document.getElementById(
            "tipoCombustivel"
        );


    if (
        !tipo ||
        !select
    ) {

        return;

    }


    if (
        tipo.value ===
        "recarga"
    ) {

        select.innerHTML = `

            <option value="Recarga">
                ⚡ Recarga elétrica
            </option>

        `;

    }
    else {

        select.innerHTML = `

            <option value="Gasolina">
                ⛽ Gasolina
            </option>

            <option value="Etanol">
                🌱 Etanol
            </option>

            <option value="Diesel">
                🛢️ Diesel
            </option>

            <option value="GNV">
                🔵 GNV
            </option>

        `;

    }

}


// ======================================================
// SALVAR INFORMAÇÃO
// ======================================================

function salvarInformacao() {


    const tipo =
        document.getElementById(
            "tipo"
        ).value;


    const combustivel =
        document.getElementById(
            "tipoCombustivel"
        ).value;


    const nome =
        document.getElementById(
            "nomeLocal"
        ).value.trim();


    const preco =
        document.getElementById(
            "preco"
        ).value;


    const mensagem =
        document.getElementById(
            "mensagem"
        );


    if (!nome) {

        mensagem.innerText =
            "❌ Informe o nome do local.";

        return;

    }


    if (!preco) {

        mensagem.innerText =
            "❌ Informe o preço.";

        return;

    }


    const precos =
        obterPrecos();


    precos.push({

    localId:
        localAtualPreco
            ? localAtualPreco.id
            : null,

    nome:
        nome,

    tipo:
        tipo,

    combustivel:
        combustivel,

    preco:
        Number(preco),

    data:
        new Date().toLocaleString(
            "pt-BR"
        )

});

    localStorage.setItem(

        "g4AutoCarPrecos",

        JSON.stringify(
            precos
        )

    );


    mensagem.innerText =
        "✅ Informação salva com sucesso!";


    document.getElementById(
        "preco"
    ).value = "";


    mostrarLocais();

}


// ======================================================
// PREÇOS
// ======================================================

function obterPrecos() {


    try {

        return JSON.parse(

            localStorage.getItem(
                "g4AutoCarPrecos"
            )

        ) || [];

    }
    catch (erro) {

        return [];

    }

}


// ======================================================
// MOSTRAR PREÇO
// ======================================================

function obterPreco(
    localId,
    combustivel
) {


    const precos =
        obterPrecos();


    const encontrados =
        precos.filter(

            function (item) {

                return (
                    item.localId === localId &&
                    item.combustivel === combustivel
                    
                );

            }

        );


    if (
        encontrados.length === 0
    ) {

        return "Não informado";

    }


    const ultimo =
        encontrados[
            encontrados.length - 1
        ];


    return (

        "R$ " +

        Number(
            ultimo.preco
        ).toFixed(2)

        .replace(".", ",")

    );

}


// ======================================================
// AVALIAÇÃO
// ======================================================

function abrirAvaliacao(
    nome
) {


    localAvaliacaoAtual =
        nome;


    const formulario =
        document.getElementById(
            "avaliacao"
        );


    const local =
        document.getElementById(
            "localAvaliacao"
        );


    if (local) {

        local.innerText =
            nome;

    }


    if (formulario) {

        formulario.style.display =
            "block";

        formulario.scrollIntoView({

            behavior: "smooth"

        });

    }

}


// ======================================================
// SALVAR AVALIAÇÃO
// ======================================================

function salvarAvaliacao() {


    const notaGeral =
        Number(
            document.getElementById(
                "notaGeral"
            ).value
        );


    const qualidade =
        Number(
            document.getElementById(
                "qualidade"
            ).value
        );


    const atendimento =
        Number(
            document.getElementById(
                "atendimento"
            ).value
        );


    const limpeza =
        Number(
            document.getElementById(
                "limpeza"
            ).value
        );


    const confiabilidade =
        Number(
            document.getElementById(
                "confiabilidade"
            ).value
        );


    const comentario =
        document.getElementById(
            "comentario"
        ).value.trim();


    const avaliacoes =
        obterAvaliacoes();


    avaliacoes.push({

        local:
            localAvaliacaoAtual,

        notaGeral:
            notaGeral,

        qualidade:
            qualidade,

        atendimento:
            atendimento,

        limpeza:
            limpeza,

        confiabilidade:
            confiabilidade,

        comentario:
            comentario,

        data:
            new Date().toLocaleString(
                "pt-BR"
            )

    });


    localStorage.setItem(

        "g4AutoCarAvaliacoes",

        JSON.stringify(
            avaliacoes
        )

    );


    const mensagem =
        document.getElementById(
            "mensagemAvaliacao"
        );


    mensagem.innerText =
        "✅ Avaliação enviada com sucesso!";


    document.getElementById(
        "comentario"
    ).value = "";


    setTimeout(

        function () {

            fecharAvaliacao();

        },

        800

    );

}


// ======================================================
// OBTER AVALIAÇÕES
// ======================================================

function obterAvaliacoes() {


    try {

        return JSON.parse(

            localStorage.getItem(
                "g4AutoCarAvaliacoes"
            )

        ) || [];

    }
    catch (erro) {

        return [];

    }

}


// ======================================================
// FECHAR AVALIAÇÃO
// ======================================================

function fecharAvaliacao() {


    const formulario =
        document.getElementById(
            "avaliacao"
        );


    if (formulario) {

        formulario.style.display =
            "none";

    }

}


// ======================================================
// SEGURANÇA
// ======================================================

function escaparTexto(
    texto
) {


    if (
        texto === null ||
        texto === undefined
    ) {

        return "";

    }


    return String(texto)

        .replace(
            /&/g,
            "&amp;"
        )

        .replace(
            /</g,
            "&lt;"
        )

        .replace(
            />/g,
            "&gt;"
        )

        .replace(
            /"/g,
            "&quot;"
        )

        .replace(
            /'/g,
            "&#039;"
        );

}


// ======================================================
// FINAL
// ======================================================

console.log(
    "🚗 G4 Auto Car — sistema carregado."
);