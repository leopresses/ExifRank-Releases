/* web/main.js */
let currentStep = 1;
const totalSteps = 3;
let appConfig = { notifyEnd: true, fontSize: 'normal' };

// ==== FIREBASE INIT ====
const firebaseConfig = {
  apiKey: "AIzaSyC9asZ5jRJQXn5xzjLk6LXpWZLZoNNgguY",
  authDomain: "georankerferramentaseo.firebaseapp.com",
  projectId: "georankerferramentaseo",
  storageBucket: "georankerferramentaseo.firebasestorage.app",
  messagingSenderId: "704354868186",
  appId: "1:704354868186:web:fef3bfc6f170c430963ee3"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();
const auth = firebase.auth();
let currentUser = null;
let currentUserToken = null;

// Auth: sessão será carregada no pywebviewready via carregar_sessao

function updateAuthUI(user) {
    if (user) {
        document.getElementById("auth-unlogged").classList.add("hidden");
        document.getElementById("auth-logged").classList.remove("hidden");
        document.getElementById("auth-name").innerText = user.displayName || user.email;
        const photoEl = document.getElementById("auth-photo");
        photoEl.referrerPolicy = "no-referrer";
        photoEl.crossOrigin = "anonymous";
        photoEl.src = user.photoURL || ('https://ui-avatars.com/api/?name=' + (user.displayName || 'U'));
    } else {
        document.getElementById("auth-unlogged").classList.remove("hidden");
        document.getElementById("auth-logged").classList.add("hidden");
    }
}

function loginGoogle() {
    // Abre a página de autenticação no navegador padrão do sistema
    window.open("http://127.0.0.1:45321/auth_popup.html", "_blank");
}

// Chamada pelo servidor Python quando o navegador externo completa o login
window.completeExternalLogin = async function(jsonStr) {
    try {
        const userData = JSON.parse(jsonStr);
        currentUser = userData;
        currentUserToken = userData.idToken;
        updateAuthUI(userData);
        // Salva sessão via Python para persistir entre execuções
        await window.pywebview.api.salvar_sessao(userData);
        loadHistory();
        showToast("Bem-vindo, " + (userData.displayName || userData.email) + "!", "success");
    } catch(e) {
        showToast("Erro ao processar login: " + e.message, "error");
    }
};

async function logoutGoogle() {
    currentUser = null;
    currentUserToken = null;
    await window.pywebview.api.limpar_sessao();
    updateAuthUI(null);
    showToast("Logout realizado com sucesso.", "success");
}

// ==== INITIALIZATION ====
window.addEventListener('pywebviewready', async () => {
    loadSettings();
    await window.pywebview.api.init_app();
    
    // Carregar sessão salva do Python
    const savedSession = await window.pywebview.api.carregar_sessao();
    if (savedSession && savedSession.uid) {
        currentUser = savedSession;
        currentUserToken = savedSession.idToken;
        updateAuthUI(savedSession);
    }
    
    updateUI();
    updateLivePreview();
    
    // Check for updates silently after 2 seconds
    setTimeout(checkForUpdates, 2000);
});

function loadSettings() {
    let saved = localStorage.getItem("geoRankerConfig");
    if(saved) {
        appConfig = Object.assign(appConfig, JSON.parse(saved));
    }
    const toggle = document.getElementById("toggle-notify");
    if(toggle) toggle.checked = appConfig.notifyEnd;
    
    applyFontSize(appConfig.fontSize);
}

function saveSettings() {
    const toggle = document.getElementById("toggle-notify");
    if(toggle) {
        appConfig.notifyEnd = toggle.checked;
        localStorage.setItem("geoRankerConfig", JSON.stringify(appConfig));
        showToast("Configurações salvas!", "success");
    }
}

function changeFontSize(size) {
    appConfig.fontSize = size;
    localStorage.setItem("geoRankerConfig", JSON.stringify(appConfig));
    applyFontSize(size);
}

function applyFontSize(size) {
    const root = document.documentElement;
    if(size === 'small') {
        root.style.fontSize = '14px';
    } else if(size === 'large') {
        root.style.fontSize = '18px';
    } else {
        root.style.fontSize = '16px';
    }
    
    ['small', 'normal', 'large'].forEach(s => {
        const btn = document.getElementById(`font-${s}`);
        if(btn) {
            if(s === size) {
                btn.classList.add('bg-slate-800', 'text-white', 'border-slate-800');
                btn.classList.remove('bg-white', 'text-slate-600', 'border-slate-200');
            } else {
                btn.classList.add('bg-white', 'text-slate-600', 'border-slate-200');
                btn.classList.remove('bg-slate-800', 'text-white', 'border-slate-800');
            }
        }
    });
}

function startNewProject() {
    switchView('app');
    document.getElementById("input-pasta").value = "";
    document.getElementById("input-empresa").value = "";
    document.getElementById("input-telefone").value = "";
    document.getElementById("input-endereco").value = "";
    document.getElementById("input-lat").value = "";
    document.getElementById("input-lon").value = "";
    document.getElementById("input-titulo").value = "";
    document.getElementById("input-desc").value = "";
    
    // Reset Live Preview
    document.getElementById("upload-feedback").classList.add("hidden");
    document.getElementById("preview-total-files").innerText = "0";
    document.getElementById("preview-images").innerText = "0";
    document.getElementById("preview-videos").innerText = "0";
    document.getElementById("preview-time").innerText = "0s";
    
    updateLivePreview();
    
    currentStep = 1;
    updateUI();
}

function switchView(viewName) {
    const views = ['app', 'history', 'help', 'settings'];
    views.forEach(v => {
        const el = document.getElementById(`view-${v}`);
        if (el) {
            el.classList.add('hidden');
        }
    });

    const target = document.getElementById(`view-${viewName}`);
    if (target) {
        target.classList.remove('hidden');
    }

    // Update active state on sidebar
    ['app', 'history', 'help', 'settings'].forEach(v => {
        const btn = document.getElementById(`menu-${v}`);
        if(btn) {
            if(v === viewName) {
                btn.className = "w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg bg-slate-100 text-slate-900 transition-colors";
            } else {
                btn.className = "w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg text-slate-500 hover:bg-slate-50 hover:text-slate-900 transition-colors";
            }
        }
    });
}

function updateUI() {
    for(let i = 1; i <= totalSteps; i++) {
        const el = document.getElementById(`step-${i}`);
        if(i === currentStep) {
            el.classList.remove("hidden");
            setTimeout(() => {
                el.classList.add("fade-enter-active");
                el.classList.remove("fade-enter");
            }, 10);
        } else {
            el.classList.remove("fade-enter-active");
            el.classList.add("fade-enter");
            setTimeout(() => { if(currentStep !== i) el.classList.add("hidden"); }, 300);
        }
    }

    // Modern Stepper Logic
    const stepsData = [
        { num: 1, title: "Dados e Pasta" },
        { num: 2, title: "Metadados (IA)" },
        { num: 3, title: "Processamento" }
    ];
    
    let stepperHTML = '';
    stepsData.forEach((s, idx) => {
        if(s.num < currentStep) {
            stepperHTML += `<div class="flex items-center gap-2">
                <svg class="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
                <span class="text-sm font-medium text-slate-900 whitespace-nowrap">${s.title}</span>
            </div>`;
        } else if(s.num === currentStep) {
            stepperHTML += `<div class="flex items-center gap-2">
                <div class="w-2 h-2 rounded-full bg-slate-900"></div>
                <span class="text-sm font-bold text-slate-900 whitespace-nowrap">${s.title}</span>
            </div>`;
        } else {
            stepperHTML += `<div class="flex items-center gap-2">
                <div class="w-2 h-2 rounded-full bg-slate-200"></div>
                <span class="text-sm font-medium text-slate-400 whitespace-nowrap">${s.title}</span>
            </div>`;
        }
        
        if(idx < stepsData.length - 1) {
            stepperHTML += `<div class="w-4 h-px bg-slate-200 mx-2"></div>`;
        }
    });
    
    document.getElementById("stepper-ui").innerHTML = stepperHTML;

    // Buttons
    const btnVoltar = document.getElementById("btn-voltar");
    const btnAvancar = document.getElementById("btn-avancar");

    if(currentStep === 1) {
        btnVoltar.classList.add("invisible");
        btnAvancar.innerHTML = `Próximo Passo →`;
    } else if(currentStep === 2) {
        btnVoltar.classList.remove("invisible");
        btnAvancar.innerHTML = `Revisar & Injetar →`;
    } else {
        btnVoltar.classList.remove("invisible");
        btnAvancar.classList.add("invisible"); 
    }
}

function nextStep() {
    if(currentStep < totalSteps) {
        currentStep++;
        updateUI();
    }
}

function prevStep() {
    if(currentStep > 1) {
        if(currentStep === 3) document.getElementById("btn-avancar").classList.remove("invisible");
        currentStep--;
        updateUI();
    }
}

// ==== LIVE PREVIEW ====
function updateLivePreview() {
    const e = document.getElementById("input-empresa").value;
    const t = document.getElementById("input-telefone").value;
    const end = document.getElementById("input-endereco").value;
    const lat = document.getElementById("input-lat").value;
    const lon = document.getElementById("input-lon").value;

    document.getElementById("preview-empresa").innerText = e || "-";
    document.getElementById("preview-telefone").innerText = t || "-";
    document.getElementById("preview-endereco").innerText = end || "-";
    document.getElementById("preview-lat").innerText = lat ? `Lat: ${lat.substring(0,6)}` : "Lat: --";
    document.getElementById("preview-lon").innerText = lon ? `Lon: ${lon.substring(0,6)}` : "Lon: --";
}

// ==== EEL BACKEND CALLS ====
async function selecionarPasta() {
    let pasta = await window.pywebview.api.selecionar_pasta();
    if(pasta) {
        document.getElementById("input-pasta").value = pasta;
        const feedback = document.getElementById("upload-feedback");
        const stats = document.getElementById("upload-stats");
        
        feedback.classList.remove("hidden");
        stats.innerText = "Analisando pasta...";
        
        const res = await window.pywebview.api.obter_resumo_pasta(pasta);
        if(res.erro) {
            showToast(res.erro, "error");
        } else {
            stats.innerText = `${res.total} arquivos (Pronto)`;
            document.getElementById("preview-total-files").innerText = res.total;
            document.getElementById("preview-images").innerText = res.jpg + res.png;
            document.getElementById("preview-videos").innerText = res.video + res.outros;
            
            // Estimated time: ~0.5s per image + ~3s per video
            const estimatedSec = Math.round((res.jpg + res.png) * 0.5 + (res.video) * 3);
            let timeStr = `${estimatedSec} seg`;
            if (estimatedSec > 60) {
                timeStr = `${Math.floor(estimatedSec / 60)}m ${estimatedSec % 60}s`;
            }
            document.getElementById("preview-time").innerText = timeStr;
            showToast("Mídias detectadas com sucesso!", "success");
        }
    }
}

async function buscarGPS() {
    const endereco = document.getElementById("input-endereco").value;
    if(!endereco) {
        showToast("Digite um endereço para buscar.", "error");
        return;
    }
    
    const btn = document.getElementById("btn-gps");
    btn.innerText = "...";
    btn.disabled = true;

    const res = await window.pywebview.api.buscar_gps(endereco);
    if(res.erro) {
        showToast("Erro GPS: " + res.erro, "error");
    } else {
        document.getElementById("input-lat").value = res.lat;
        document.getElementById("input-lon").value = res.lon;
        showToast("Localização encontrada!", "success");
        updateLivePreview();
    }

    btn.innerText = "Detectar";
    btn.disabled = false;
}

async function gerarIA() {
    const nicho = document.getElementById("input-titulo").value;
    const empresa = document.getElementById("input-empresa").value;
    const telefone = document.getElementById("input-telefone").value;
    const endereco = document.getElementById("input-endereco").value;

    if(!nicho) {
        showToast("Digite o Nicho/Assunto.", "error");
        return;
    }

    const btn = document.getElementById("btn-ia");
    btn.innerHTML = "⏳ Gerando...";
    btn.disabled = true;

    const res = await window.pywebview.api.gerar_com_ia(nicho, empresa, telefone, endereco);
    
    if(res.erro) {
        showToast("Erro na IA: " + res.erro, "error");
    } else {
        document.getElementById("input-titulo").value = res.palavras;
        document.getElementById("input-desc").value = res.descricao;
        showToast("Metadados otimizados gerados!", "success");
    }

    btn.innerHTML = `<svg class="w-4 h-4 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg> Gerar Textos`;
    btn.disabled = false;
}

async function executarSEO() {
    const pasta = document.getElementById("input-pasta").value;
    if(!pasta) {
        showToast("Selecione a pasta no Passo 1!", "error");
        prevStep();
        prevStep();
        return;
    }

    let data = {
        pasta: pasta,
        empresa: document.getElementById("input-empresa").value.trim(),
        telefone: document.getElementById("input-telefone").value.trim(),
        lat: document.getElementById("input-lat").value.trim(),
        lon: document.getElementById("input-lon").value.trim(),
        titulo: document.getElementById("input-titulo").value.trim(),
        desc: document.getElementById("input-desc").value.trim(),
        notificar: appConfig.notifyEnd
    };

    const btn = document.getElementById("btn-executar");
    btn.disabled = true;
    btn.classList.replace("from-emerald-500", "from-slate-500");
    btn.classList.replace("to-teal-500", "to-slate-400");
    btn.innerText = "PROCESSANDO...";

    await window.pywebview.api.executar_seo_lote(data);

    btn.disabled = false;
    btn.classList.replace("from-slate-500", "from-emerald-500");
    btn.classList.replace("to-slate-400", "to-teal-500");
    btn.innerText = "Executar Processamento";
}

let clientesDB = [];

async function salvarClienteAtual() {
    let data = {
        empresa: document.getElementById("input-empresa").value.trim(),
        telefone: document.getElementById("input-telefone").value.trim(),
        endereco: document.getElementById("input-endereco").value.trim(),
        lat: document.getElementById("input-lat").value.trim(),
        lon: document.getElementById("input-lon").value.trim(),
        titulo: document.getElementById("input-titulo").value.trim(),
        desc: document.getElementById("input-desc").value.trim(),
        id: document.getElementById("current-cliente-id") ? document.getElementById("current-cliente-id").value : ""
    };
    
    if(!data.empresa) {
        showToast("Preencha ao menos o nome da empresa antes de salvar.", "error");
        return;
    }
    
    const res = await window.pywebview.api.salvar_cliente_api(data);
    
    let hiddenId = document.getElementById("current-cliente-id");
    if(!hiddenId) {
        hiddenId = document.createElement("input");
        hiddenId.type = "hidden";
        hiddenId.id = "current-cliente-id";
        document.body.appendChild(hiddenId);
    }
    hiddenId.value = res.id;
    
    if (currentUser) {
        try {
            await db.collection("users").doc(currentUser.uid).collection("clientes").doc(res.id).set({
                ...data,
                id: res.id,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (e) {
            console.error(e);
        }
    }
    
    showToast("Ficha do cliente salva com sucesso!", "success");
    loadHistory();
}

async function deletarCliente(id) {
    if(confirm("Tem certeza que deseja excluir esta ficha?")) {
        await window.pywebview.api.deletar_cliente_api(id);
        
        if (currentUser) {
            try {
                await db.collection("users").doc(currentUser.uid).collection("clientes").doc(id).delete();
            } catch (e) {}
        }
        
        showToast("Cliente removido.", "success");
        loadHistory();
    }
}

function usarCliente(id) {
    const c = clientesDB.find(x => x.id === id);
    if(c) {
        document.getElementById("input-empresa").value = c.empresa || "";
        document.getElementById("input-telefone").value = c.telefone || "";
        document.getElementById("input-endereco").value = c.endereco || "";
        document.getElementById("input-lat").value = c.lat || "";
        document.getElementById("input-lon").value = c.lon || "";
        document.getElementById("input-titulo").value = c.titulo || "";
        document.getElementById("input-desc").value = c.desc || "";
        
        let hiddenId = document.getElementById("current-cliente-id");
        if(!hiddenId) {
            hiddenId = document.createElement("input");
            hiddenId.type = "hidden";
            hiddenId.id = "current-cliente-id";
            document.body.appendChild(hiddenId);
        }
        hiddenId.value = c.id;
        
        updateLivePreview();
        switchTab('app');
        showToast("Dados do cliente carregados!", "success");
    }
}

async function loadHistory() {
    const list = document.getElementById("history-list");
    if (list) list.innerHTML = `<p class="text-sm text-slate-400">Carregando...</p>`;
    
    let localClients = await window.pywebview.api.get_clientes_json();
    
    if (currentUser) {
        try {
            const snapshot = await db.collection("users").doc(currentUser.uid).collection("clientes").get();
            let cloudClients = [];
            snapshot.forEach(doc => cloudClients.push(doc.data()));
            
            let mergedMap = {};
            localClients.forEach(c => mergedMap[c.id] = c);
            
            for (let c of cloudClients) {
                if (!mergedMap[c.id]) {
                     await window.pywebview.api.salvar_cliente_api(c);
                }
                mergedMap[c.id] = c;
            }
            localClients = Object.values(mergedMap);
        } catch (e) {
            console.error("Cloud Sync Error", e);
        }
    }
    
    clientesDB = localClients;
    
    if(!list) return;

    if(!clientesDB || clientesDB.length === 0) {
        list.innerHTML = `<div class="col-span-1 md:col-span-2 text-center py-10 bg-slate-50 rounded-xl border border-dashed border-slate-200">
            <p class="text-slate-500 font-medium">Nenhum cliente salvo ainda.</p>
            <p class="text-xs text-slate-400 mt-1">Preencha os dados e clique em "Salvar Cliente".</p>
        </div>`;
        return;
    }
    
    let html = '';
    clientesDB.forEach(c => {
        html += `
        <div class="bg-white rounded-xl p-5 border border-slate-100 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
            <div class="flex justify-between items-start mb-4">
                <div>
                    <h4 class="font-bold text-slate-900 text-lg">${c.empresa || "Sem Nome"}</h4>
                    <p class="text-xs text-slate-500 mt-1">${c.titulo ? c.titulo.substring(0, 40) + '...' : "Sem Nicho"}</p>
                </div>
                <div class="text-[10px] text-slate-400 font-mono bg-slate-50 px-2 py-1 rounded border border-slate-100">
                    ${c.data_atualizacao || ""}
                </div>
            </div>
            
            <div class="flex items-center gap-2 mt-4 pt-4 border-t border-slate-50">
                <button onclick="usarCliente('${c.id}')" class="flex-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 font-semibold py-2 rounded-lg text-xs transition-colors flex justify-center items-center gap-1">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg>
                    Usar Ficha
                </button>
                <button onclick="deletarCliente('${c.id}')" class="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-500 rounded-lg transition-colors flex justify-center items-center">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                </button>
            </div>
        </div>
        `;
    });
    list.innerHTML = html;
}

// ==== UTILS ====
function atualizarProgresso(porcentagem, texto) {
    document.getElementById("progresso-barra").style.width = porcentagem + "%";
    document.getElementById("progresso-porc").innerText = parseInt(porcentagem) + "%";
    document.getElementById("progresso-texto").innerText = texto;
}

function alertaUI(msg) {
    if(msg.includes("Erro") || msg.includes("Falha")) {
        showToast(msg, "error");
    } else {
        showToast(msg, "success");
    }
}

function updateApiLed(status, color) {
    document.getElementById("status-api").innerText = status;
    const led = document.getElementById("led-api");
    if(color === "red") {
        led.classList.replace("bg-emerald-500", "bg-red-500");
        led.classList.replace("shadow-[0_0_8px_rgba(16,185,129,0.5)]", "shadow-[0_0_8px_rgba(239,68,68,0.5)]");
    }
}

function showToast(message, type="success") {
    const toast = document.createElement("div");
    const bgColor = type === "success" ? "bg-emerald-500" : (type === "error" ? "bg-rose-500" : "bg-blue-500");
    toast.className = `fixed bottom-10 right-10 ${bgColor} text-white px-6 py-4 rounded-xl shadow-float z-[9999] transition-all duration-300 transform translate-y-10 opacity-0 flex items-center gap-3`;
    
    let icon = type === "success" 
        ? '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>'
        : '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>';
        
    toast.innerHTML = `${icon} <span class="font-medium text-sm tracking-wide">${message}</span>`;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.remove("translate-y-10", "opacity-0");
    }, 10);
    
    setTimeout(() => {
        toast.classList.add("translate-y-10", "opacity-0");
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// ==== AUTO UPDATE ====
let updateDownloadUrl = "";

async function checkForUpdates() {
    try {
        const res = await window.pywebview.api.check_for_updates();
        if (res && res.update_available) {
            updateDownloadUrl = res.download_url;
            document.getElementById("update-version-text").innerText = res.version;
            
            const modal = document.getElementById("update-modal");
            modal.classList.remove("hidden");
            setTimeout(() => {
                modal.classList.remove("translate-y-10", "opacity-0");
            }, 50);
            
            document.getElementById("btn-do-update").onclick = async () => {
                document.getElementById("update-actions").classList.add("hidden");
                document.getElementById("update-progress-container").classList.remove("hidden");
                await window.pywebview.api.aplicar_atualizacao(updateDownloadUrl);
            };
        }
    } catch (e) {
        console.error("Erro no update", e);
    }
}

function updateDownloadProgress(percent, status) {
    if (status === "downloading") {
        document.getElementById("update-progress-bar").style.width = percent + "%";
        document.getElementById("update-status-text").innerText = `Baixando nova versão (${percent}%)...`;
    } else if (status === "done") {
        document.getElementById("update-progress-bar").style.width = "100%";
        document.getElementById("update-status-text").innerText = "Reiniciando o aplicativo...";
    } else if (status === "error") {
        document.getElementById("update-status-text").innerText = "Erro ao baixar. Tente mais tarde.";
        document.getElementById("update-status-text").classList.add("text-rose-400");
    }
}
