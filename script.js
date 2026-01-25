import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";
import { GoogleGenerativeAI } from "https://esm.run/@google/generative-ai";

// --- CONFIGURAÇÕES ---
const firebaseConfig = {
    apiKey: "AIzaSyCoN6SK7Erhh5f67vGNwuP_cGA_LGeNm4U",
    authDomain: "controledeos-2de2c.firebaseapp.com",
    projectId: "controledeos-2de2c",
    storageBucket: "controledeos-2de2c.firebasestorage.app",
    messagingSenderId: "1037478732552",
    appId: "1:1037478732552:web:3d32412d5a713c3cc042bd"
};

const API_KEY_IA = "AIzaSyCha6XRWgfXY1PxtreksvS_rP4SLBF9nh0";

// --- INICIALIZAÇÃO ---
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const genAI = new GoogleGenerativeAI(API_KEY_IA);

let dadosLocais = [];
let meuGrafico = null;

// --- 1. LÓGICA DE DADOS (FIREBASE) ---
async function carregarDados() {
    const q = query(collection(db, "controle_os"), orderBy("data", "desc"));
    const snap = await getDocs(q);
    dadosLocais = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    processarFinancas();
    renderizarTabela();
    atualizarGrafico();
}

// --- 2. CÁLCULOS E PAGAMENTOS PARCELADOS ---
function processarFinancas() {
    let lucroTotal = 0;
    let dividaTotal = 0;
    const fluxoCaixa = { jan: 0, fev: 0, mar: 0, abr: 0 }; // Exemplo para gráfico

    dadosLocais.forEach(os => {
        const custo = parseFloat(os.valorPeca) || 0;
        const venda = parseFloat(os.valorOS) || 0;
        
        // Lucro real (considerando se foi parcelado)
        let taxaCartao = 0;
        if(os.recebimento?.forma1 === 'Crédito') taxaCartao = venda * 0.05; // 5% taxa média
        
        lucroTotal += (venda - custo - taxaCartao);

        if(os.status === 'ENCOMENDA') dividaTotal += custo;
    });

    document.getElementById('total-lucro').innerText = fmtMoeda(lucroTotal);
    document.getElementById('total-divida').innerText = fmtMoeda(dividaTotal);
}

// --- 3. GRÁFICOS VISUAIS (CHART.JS) ---
function atualizarGrafico() {
    const ctx = document.getElementById('grafico-bi').getContext('2d');
    if(meuGrafico) meuGrafico.destroy();

    // Agrupando dados simples para exemplo
    const labels = ['Semana 1', 'Semana 2', 'Semana 3', 'Semana 4'];
    const valores = [1200, 1900, 3000, 2500]; // Aqui viria a soma real por data

    meuGrafico = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Lucro Líquido (R$)',
                data: valores,
                borderColor: '#2563eb',
                backgroundColor: 'rgba(37, 99, 235, 0.1)',
                fill: true,
                tension: 0.4
            }]
        },
        options: { responsive: true, plugins: { legend: { display: false } } }
    });
}

// --- 4. INTEGRAÇÃO IA GEMINI ---
window.analisarComIA = async () => {
    const out = document.getElementById('ai-insight');
    out.innerHTML = "<i class='fa-solid fa-spinner animate-spin'></i> IA processando BI...";

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const resumo = {
            lucro: document.getElementById('total-lucro').innerText,
            divida: document.getElementById('total-divida').innerText,
            totalOS: dadosLocais.length
        };

        const prompt = `Analise financeiramente os dados dessa assistência técnica: ${JSON.stringify(resumo)}. 
        Dê um conselho curto para aumentar o lucro líquido.`;

        const result = await model.generateContent(prompt);
        out.innerHTML = `<i class="fa-solid fa-robot text-blue-400 mr-2"></i> ${result.response.text()}`;
    } catch (e) {
        out.innerHTML = "Erro ao conectar com a IA. Verifique as restrições da chave.";
    }
};

// --- AUXILIARES ---
const fmtMoeda = (v) => v.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});

// Iniciar
carregarDados();
