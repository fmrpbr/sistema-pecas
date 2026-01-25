import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, updateDoc, query, orderBy } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";
import { GoogleGenerativeAI } from "https://esm.run/@google/generative-ai";

const firebaseConfig = {
    apiKey: "AIzaSyCoN6SK7Erhh5f67vGNwuP_cGA_LGeNm4U",
    authDomain: "controledeos-2de2c.firebaseapp.com",
    projectId: "controledeos-2de2c",
    storageBucket: "controledeos-2de2c.firebasestorage.app",
    messagingSenderId: "1037478732552",
    appId: "1:1037478732552:web:3d32412d5a713c3cc042bd",
    measurementId: "G-FQ94ZVSLF5"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const genAI = new GoogleGenerativeAI("AIzaSyCha6XRWgfXY1PxtreksvS_rP4SLBF9nh0");

let todosDados = [];
let userLogado = null;
let meuGrafico = null;

// --- AUTH ---
window.login = async () => {
    const email = document.getElementById('loginEmail').value;
    const pass = document.getElementById('loginPass').value;
    try { await signInWithEmailAndPassword(auth, email, pass); } catch(e) { alert("Erro de acesso."); }
};

onAuthStateChanged(auth, (user) => {
    if (user) {
        userLogado = user;
        document.getElementById('auth-screen').classList.add('hidden');
        document.getElementById('app').classList.remove('hidden');
        document.getElementById('userDisplay').innerText = user.email;
        carregarDados();
    } else {
        document.getElementById('app').classList.add('hidden');
        document.getElementById('auth-screen').classList.remove('hidden');
    }
});

window.logout = () => signOut(auth);

// --- CARREGAR DADOS ---
async function carregarDados() {
    const q = query(collection(db, "controle_os"), orderBy("data", "desc"));
    const snap = await getDocs(q);
    todosDados = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    processarFinancas();
    renderizarTabela();
    atualizarIA();
}

// --- BI: PROCESSAMENTO DE SAÚDE FINANCEIRA ---
function processarFinancas() {
    const hoje = new Date();
    const mesAtual = hoje.getMonth();
    const anoAtual = hoje.getFullYear();

    let permanente = { pedido: 0, aberto: 0, pago: 0, lucro: 0 };
    let mensal = { pedido: 0, aberto: 0, pago: 0 };
    
    let fornecedores = {
        Aracruz: { pedidoP: 0, abertoP: 0, pagoP: 0, pedidoM: 0, abertoM: 0, pagoM: 0 },
        Colatina: { pedidoP: 0, abertoP: 0, pagoP: 0, pedidoM: 0, abertoM: 0, pagoM: 0 },
        Outros: { pedidoP: 0, abertoP: 0, pagoP: 0, pedidoM: 0, abertoM: 0, pagoM: 0 }
    };

    todosDados.forEach(os => {
        const d = new Date(os.data + "T12:00:00");
        const custo = parseFloat(os.valorPeca) || 0;
        const venda = parseFloat(os.valorOS) || 0;
        const isMesAtual = (d.getMonth() === mesAtual && d.getFullYear() === anoAtual);
        const fKey = fornecedores[os.fornecedor] ? os.fornecedor : 'Outros';

        // Lógica de Status
        let vAberto = 0;
        let vPago = 0;
        
        if (os.status === 'Utilizado') {
            vAberto = custo;
            permanente.lucro += (venda - custo);
        } else if (os.status === 'Devolvida') {
            vAberto = 0; // Descontado
        } else if (os.status === 'Garantia') {
            vAberto = 0; // Não entra nas contas
        }

        // Permanente
        permanente.pedido += custo;
        permanente.aberto += vAberto;
        fornecedores[fKey].pedidoP += custo;
        fornecedores[fKey].abertoP += vAberto;

        // Mensal
        if (isMesAtual) {
            mensal.pedido += custo;
            mensal.aberto += vAberto;
            fornecedores[fKey].pedidoM += custo;
            fornecedores[fKey].abertoM += vAberto;
        }
    });

    // Atualizar UI Geral
    document.getElementById('val-lucro-liquido').innerText = fmtMoeda(permanente.lucro);
    document.getElementById('p-total-pedido').innerText = fmtMoeda(permanente.pedido);
    document.getElementById('p-total-aberto').innerText = fmtMoeda(permanente.aberto);
    document.getElementById('m-total-pedido').innerText = fmtMoeda(mensal.pedido);
    document.getElementById('m-total-aberto').innerText = fmtMoeda(mensal.aberto);

    // Renderizar Cards Fornecedores
    const gridF = document.getElementById('grid-fornecedores');
    gridF.innerHTML = '';
    Object.entries(fornecedores).forEach(([nome, dados]) => {
        gridF.innerHTML += `
            <div class="p-6 bg-slate-50 rounded-[2rem] border border-white space-y-4 shadow-inner">
                <p class="font-black text-blue-600 uppercase text-[10px] text-center tracking-tighter">${nome}</p>
                <div class="grid grid-cols-2 gap-y-3">
                    <div class="text-center"><p class="text-[8px] text-slate-400 uppercase">Permanente</p><p class="font-bold text-xs text-red-500">${fmtMoeda(dados.abertoP)}</p></div>
                    <div class="text-center"><p class="text-[8px] text-slate-400 uppercase">Mês Atual</p><p class="font-bold text-xs text-red-400">${fmtMoeda(dados.abertoM)}</p></div>
                </div>
            </div>`;
    });
}

// --- RENDERIZAR TABELA ---
function renderizarTabela() {
    const filtro = document.getElementById('filtroForn').value;
    const tb = document.getElementById('tabela-os');
    tb.innerHTML = '';

    const filtrados = filtro === 'Todos' ? todosDados : todosDados.filter(i => i.fornecedor === filtro);

    filtrados.forEach(os => {
        const isAdmin = userLogado?.email === 'nortecolor@gmail.com';
        tb.innerHTML += `
            <tr class="hover:bg-blue-50/30 transition">
                <td class="p-6 font-bold text-slate-400">${fmtData(os.data)}</td>
                <td class="p-6 font-black italic">#${os.os}</td>
                <td class="p-6">
                    <div class="font-black text-slate-700">${os.modelo}</div>
                    <div class="text-[9px] text-slate-400 uppercase">${os.marca} • ${os.fornecedor}</div>
                </td>
                <td class="p-6 font-black text-blue-600">${fmtMoeda(os.valorOS)}</td>
                <td class="p-6"><span class="px-3 py-1 rounded-full bg-white border text-[9px] font-bold">${os.status}</span></td>
                <td class="p-6 text-right">
                    ${isAdmin ? `<button onclick="editarOS('${os.id}')" class="text-slate-300 hover:text-blue-500"><i class="fa-solid fa-pen"></i></button>` : `<i class="fa-solid fa-lock text-slate-200"></i>`}
                </td>
            </tr>`;
    });
}

// --- IA INSIGHTS ---
async function atualizarIA() {
    const out = document.getElementById('ai-insight');
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const resumo = {
            totalAberto: document.getElementById('p-total-aberto').innerText,
            lucro: document.getElementById('val-lucro-liquido').innerText
        };
        const prompt = `Como analista financeiro, analise estes dados de assistência técnica: ${JSON.stringify(resumo)}. Dê um conselho curto em 15 palavras.`;
        const result = await model.generateContent(prompt);
        out.innerText = result.response.text();
    } catch(e) { out.innerText = "IA aguardando dados..."; }
}

// --- FORM SUBMIT ---
document.getElementById('formOS').addEventListener('submit', async (e) => {
    e.preventDefault();
    const dados = {
        data: document.getElementById('data').value,
        os: document.getElementById('os').value,
        fornecedor: document.getElementById('fornecedor').value,
        marca: document.getElementById('marca').value,
        modelo: document.getElementById('modelo').value,
        valorPeca: document.getElementById('valorPeca').value,
        valorOS: document.getElementById('valorOS').value,
        pagamentoTipo: document.getElementById('pagamentoTipo').value,
        status: document.getElementById('status').value
    };
    await addDoc(collection(db, "controle_os"), dados);
    fecharModal(); carregarDados();
});

// --- AUXILIARES ---
window.mudarVisao = (view) => {
    document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active-view'));
    document.getElementById('view-' + view).classList.add('active-view');
    document.querySelectorAll('.sidebar-btn').forEach(b => b.classList.remove('active-tab', 'text-slate-400'));
    event.currentTarget.classList.add('active-tab');
};
window.abrirModal = () => document.getElementById('modal').classList.remove('hidden');
window.fecharModal = () => document.getElementById('modal').classList.add('hidden');
const fmtMoeda = (v) => (v||0).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
const fmtData = (d) => d ? new Date(d + "T12:00:00").toLocaleDateString('pt-BR') : '-';

// Iniciar
carregarDados();
