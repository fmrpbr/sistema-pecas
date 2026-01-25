import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";
import { GoogleGenerativeAI } from "https://esm.run/@google/generative-ai";

// --- 1. CONFIGURAÇÕES ---
const firebaseConfig = {
    apiKey: "AIzaSyCoN6SK7Erhh5f67vGNwuP_cGA_LGeNm4U",
    authDomain: "controledeos-2de2c.firebaseapp.com",
    projectId: "controledeos-2de2c",
    storageBucket: "controledeos-2de2c.firebasestorage.app",
    messagingSenderId: "1037478732552",
    appId: "1:1037478732552:web:3d32412d5a713c3cc042bd"
};

const API_KEY_IA = "AIzaSyCha6XRWgfXY1PxtreksvS_rP4SLBF9nh0";

// --- 2. INICIALIZAÇÃO ---
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const genAI = new GoogleGenerativeAI(API_KEY_IA);

let dadosLocais = [];
let meuGrafico = null;

// --- 3. MOTOR DE DADOS (FIREBASE) ---
async function carregarDados() {
    try {
        const q = query(collection(db, "controle_os"), orderBy("data", "desc"));
        const snap = await getDocs(q);
        dadosLocais = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        processarFinancas();
        renderizarTabela(); // Certifique-se de que essa função existe no seu HTML
        atualizarGrafico();
    } catch (e) {
        console.error("Erro ao carregar dados:", e);
    }
}

// --- 4. LÓGICA DE BI E FLUXO DE CAIXA ---
function processarFinancas() {
    let lucroTotal = 0;
    let comprometidoMesAtual = 0;
    const hoje = new Date();
    const mesAtual = hoje.getMonth() + 1;
    const anoAtual = hoje.getFullYear();

    dadosLocais.forEach(os => {
        // Lucro Bruto: Venda - Custo Total (conforme sua regra)
        const lucroBruto = (parseFloat(os.valorOS) || 0) - (parseFloat(os.valorPeca) || 0);
        lucroTotal += lucroBruto;

        // Verifica parcelas de peças que vencem no mês atual
        if (os.cronogramaForn) {
            os.cronogramaForn.forEach(parcela => {
                if (parcela.mes === mesAtual && parcela.ano === anoAtual) {
                    comprometidoMesAtual += parcela.valor;
                }
            });
        }
    });

    // Atualiza a Interface
    document.getElementById('total-lucro').innerText = fmtMoeda(lucroTotal);
    document.getElementById('total-divida').innerText = fmtMoeda(comprometidoMesAtual);
    
    // Alimenta a IA com o cenário atual
    atualizarPromptIA(lucroTotal, comprometidoMesAtual);
}

// --- 5. GRÁFICOS DINÂMICOS (CHART.JS) ---
function atualizarGrafico() {
    const ctx = document.getElementById('grafico-bi').getContext('2d');
    if (meuGrafico) meuGrafico.destroy();

    // Criando projeção de compromissos para os próximos 4 meses
    const hoje = new Date();
    const labels = [];
    const valoresComprometidos = [];

    for (let i = 0; i < 4; i++) {
        const d = new Date();
        d.setMonth(hoje.getMonth() + i);
        const m = d.getMonth() + 1;
        const a = d.getFullYear();
        
        labels.push(d.toLocaleDateString('pt-BR', { month: 'short' }).toUpperCase());
        
        let somaMes = 0;
        dadosLocais.forEach(os => {
            if (os.cronogramaForn) {
                os.cronogramaForn.forEach(p => {
                    if (p.mes === m && p.ano === a) somaMes += p.valor;
                });
            }
        });
        valoresComprometidos.push(somaMes);
    }

    meuGrafico = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Dívida de Peças (R$)',
                data: valoresComprometidos,
                backgroundColor: '#ef4444',
                borderRadius: 8
            }]
        },
        options: { 
            responsive: true, 
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true } }
        }
    });
}

// --- 6. INTEGRAÇÃO COM IA GEMINI ---
async function atualizarPromptIA(lucro, dividaMes) {
    const out = document.getElementById('ai-insight');
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `Aja como consultor financeiro de uma assistência técnica. 
    Dados: Lucro Bruto Total acumulado é ${fmtMoeda(lucro)}. 
    Compromisso de pagamento de peças NESTE MÊS: ${fmtMoeda(dividaMes)}.
    Dê um conselho curto e direto sobre a liquidez do caixa para honrar os fornecedores este mês.`;

    try {
        const result = await model.generateContent(prompt);
        out.innerHTML = `<i class="fa-solid fa-robot text-blue-400 mr-2"></i> ${result.response.text()}`;
    } catch (e) { 
        console.error("Erro IA:", e);
        out.innerHTML = "IA aguardando dados...";
    }
}

// --- 7. EVENTO DE SALVAMENTO (NOVA OS) ---
document.getElementById('formOS').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const vendaTotal = parseFloat(document.getElementById('valorOS').value);
    const custoTotal = parseFloat(document.getElementById('valorPeca').value);
    const qtdParcelas = parseInt(document.getElementById('parcelasForn').value);
    
    // Gerar cronograma de parcelamento da PEÇA
    const pagamentosPeca = [];
    const valorParcela = custoTotal / qtdParcelas;
    const dataBase = new Date();

    for (let i = 0; i < qtdParcelas; i++) {
        const dataParcela = new Date(dataBase);
        dataParcela.setMonth(dataBase.getMonth() + i);
        pagamentosPeca.push({
            mes: dataParcela.getMonth() + 1,
            ano: dataParcela.getFullYear(),
            valor: valorParcela,
            pago: false
        });
    }

    const novaOS = {
        modelo: document.getElementById('modelo').value,
        data: new Date().toISOString().split('T')[0],
        valorOS: vendaTotal,
        valorPeca: custoTotal,
        fornecedor: document.getElementById('fornecedor').value,
        status: 'ENCOMENDA',
        cronogramaForn: pagamentosPeca,
        lucroBruto: vendaTotal - custoTotal
    };

    try {
        await addDoc(collection(db, "controle_os"), novaOS);
        alert(`OS salva! Custo de ${fmtMoeda(custoTotal)} parcelado em ${qtdParcelas}x no financeiro.`);
        fecharModal();
        carregarDados();
    } catch (e) { alert("Erro ao salvar no Firebase."); }
});

// --- AUXILIARES ---
const fmtMoeda = (v) => (v || 0).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
window.mudarVisao = (view) => {
    document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active-view'));
    document.getElementById('view-' + view).classList.add('active-view');
    // Adicione lógica para mudar classe do botão ativo se desejar
};
window.fecharModal = () => document.getElementById('modal').classList.add('hidden');
window.abrirModal = () => document.getElementById('modal').classList.remove('hidden');

// --- INÍCIO ---
carregarDados();
