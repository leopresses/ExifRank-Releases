/* web/main.js */
let currentStep = 1;
const totalSteps = 3;
let appConfig = { notifyEnd: true, fontSize: 'normal' };
let currentProjectId = null;
let projetosDB = [];
let clientesDB = [];
let saveTimeout = null;

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

// FORÇAR O USO DO EMULADOR LOCAL PARA TESTES
// Comente a linha abaixo quando for colocar em produção na nuvem!
firebase.functions().useEmulator("localhost", 5001);
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
    
    // Local DB
    loadLocalDB();
    setupAutoSaveListeners();
    
    const lastId = localStorage.getItem("lastActiveProjectId");
    if (lastId && projetosDB.find(p => p.id === lastId)) {
        loadProject(lastId);
    } else {
        switchView('projects');
        loadProjects();
    }
    
    // Check for updates silently after 2 seconds
    setTimeout(checkForUpdates, 2000);
});

// ==== PERSISTENCE LOGIC ====
function loadLocalDB() {
    const pStr = localStorage.getItem("geoRankerProjetos");
    if(pStr) projetosDB = JSON.parse(pStr);
    const cStr = localStorage.getItem("geoRankerClientes");
    if(cStr) clientesDB = JSON.parse(cStr);
}

function persistLocalDB() {
    localStorage.setItem("geoRankerProjetos", JSON.stringify(projetosDB));
    localStorage.setItem("geoRankerClientes", JSON.stringify(clientesDB));
}

function setupAutoSaveListeners() {
    const inputs = ['input-empresa', 'input-telefone', 'input-endereco', 'input-titulo', 'input-desc', 'input-pasta'];
    inputs.forEach(id => {
        const el = document.getElementById(id);
        if(el) {
            el.addEventListener('input', () => {
                updateLivePreview();
                triggerAutoSave();
            });
        }
    });
}

function triggerAutoSave() {
    if (!currentProjectId) return;
    const indicator = document.getElementById("autosave-indicator");
    const text = document.getElementById("autosave-text");
    if(indicator) indicator.classList.remove("opacity-0");
    if(text) text.innerText = "Salvando...";

    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        saveCurrentProjectData();
    }, 1500);
}

async function saveCurrentProjectData() {
    if (!currentProjectId) return;
    
    const pIndex = projetosDB.findIndex(p => p.id === currentProjectId);
    if(pIndex === -1) return;

    projetosDB[pIndex].empresa = document.getElementById("input-empresa").value;
    projetosDB[pIndex].telefone = document.getElementById("input-telefone").value;
    projetosDB[pIndex].endereco = document.getElementById("input-endereco").value;
    projetosDB[pIndex].lat = document.getElementById("input-lat").value;
    projetosDB[pIndex].lon = document.getElementById("input-lon").value;
    projetosDB[pIndex].titulo = document.getElementById("input-titulo").value;
    projetosDB[pIndex].desc = document.getElementById("input-desc").value;
    projetosDB[pIndex].pasta = document.getElementById("input-pasta").value;
    projetosDB[pIndex].step = currentStep;
    projetosDB[pIndex].updatedAt = new Date().toISOString();

    persistLocalDB();
    
    if(currentUser) {
        try {
            await db.collection("users").doc(currentUser.uid).collection("projetos").doc(currentProjectId).set(projetosDB[pIndex]);
        } catch(e) {}
    }

    const text = document.getElementById("autosave-text");
    if(text) text.innerText = "Salvo";
    setTimeout(() => {
        const ind = document.getElementById("autosave-indicator");
        if(ind) ind.classList.add("opacity-0");
    }, 2000);
}

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
    const modal = document.getElementById("new-project-modal");
    const content = document.getElementById("new-project-modal-content");
    document.getElementById("input-new-project-name").value = "";
    
    const select = document.getElementById("select-new-project-client");
    if (select) {
        select.innerHTML = '<option value="">Nenhum (Criar do zero)</option>';
        clientesDB.forEach(c => {
            select.innerHTML += `<option value="${c.id}">${c.empresa}</option>`;
        });
    }

    if(modal) {
        modal.classList.remove("hidden");
        setTimeout(() => { content.classList.remove("scale-95", "opacity-0"); }, 10);
    }
}

function closeNewProjectModal() {
    const modal = document.getElementById("new-project-modal");
    const content = document.getElementById("new-project-modal-content");
    if(content) content.classList.add("scale-95", "opacity-0");
    setTimeout(() => { if(modal) modal.classList.add("hidden"); }, 300);
}

function confirmNewProject() {
    const name = document.getElementById("input-new-project-name").value.trim();
    const clientId = document.getElementById("select-new-project-client").value;
    
    if(!name) {
        showToast("Digite o nome do projeto.", "error");
        return;
    }
    
    const newProj = {
        id: "proj_" + Date.now() + Math.random().toString(36).substring(2, 7),
        nomeProjeto: name,
        empresa: "", telefone: "", endereco: "", lat: "", lon: "", titulo: "", desc: "", pasta: "", step: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    
    if(clientId) {
        const c = clientesDB.find(x => x.id === clientId);
        if(c) {
            newProj.empresa = c.empresa || "";
            newProj.telefone = c.telefone || "";
            newProj.endereco = c.endereco || "";
            newProj.lat = c.lat || "";
            newProj.lon = c.lon || "";
            newProj.titulo = c.titulo || "";
            newProj.desc = c.desc || "";
        }
    }
    
    projetosDB.push(newProj);
    persistLocalDB();
    
    if(currentUser) {
        db.collection("users").doc(currentUser.uid).collection("projetos").doc(newProj.id).set(newProj).catch(e=>{});
    }
    
    closeNewProjectModal();
    showToast("Projeto criado com sucesso!", "success");
    loadProject(newProj.id);
}

function loadProject(id) {
    const p = projetosDB.find(x => x.id === id);
    if(!p) return;
    
    currentProjectId = p.id;
    localStorage.setItem("lastActiveProjectId", currentProjectId);
    
    document.getElementById("input-pasta").value = p.pasta || "";
    document.getElementById("input-empresa").value = p.empresa || "";
    document.getElementById("input-telefone").value = p.telefone || "";
    document.getElementById("input-endereco").value = p.endereco || "";
    document.getElementById("input-lat").value = p.lat || "";
    document.getElementById("input-lon").value = p.lon || "";
    document.getElementById("input-titulo").value = p.titulo || "";
    document.getElementById("input-desc").value = p.desc || "";
    
    currentStep = p.step || 1;
    
    document.getElementById("upload-feedback").classList.add("hidden");
    document.getElementById("preview-total-files").innerText = "0";
    document.getElementById("preview-images").innerText = "0";
    document.getElementById("preview-videos").innerText = "0";
    document.getElementById("preview-time").innerText = "0s";
    
    updateLivePreview();
    switchView('app');
    updateUI();
}

function switchView(viewName) {
    const views = ['app', 'history', 'help', 'settings', 'projects'];
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
    ['app', 'history', 'help', 'settings', 'projects'].forEach(v => {
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
        btnAvancar.classList.remove("invisible");
        btnAvancar.innerHTML = `Próximo Passo →`;
    } else if(currentStep === 2) {
        btnVoltar.classList.remove("invisible");
        btnAvancar.classList.remove("invisible");
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
        triggerAutoSave();
    }
}

function prevStep() {
    if(currentStep > 1) {
        currentStep--;
        updateUI();
        triggerAutoSave();
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
    
    let actionsDiv = document.getElementById("preview-actions-db");
    if(!actionsDiv) {
        const previewPanel = document.querySelector("aside.w-72 .p-6.flex-1");
        if(previewPanel) {
            const div = document.createElement("div");
            div.id = "preview-actions-db";
            div.innerHTML = `<button onclick="salvarComoCliente()" class="w-full mt-4 px-3 py-2 bg-blue-50 text-blue-600 font-medium text-xs rounded border border-blue-100 hover:bg-blue-100 transition-colors shadow-sm font-bold flex items-center justify-center gap-2"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"></path></svg> Salvar no Banco</button>`;
            previewPanel.appendChild(div);
        }
    }
}

// ==== EEL BACKEND CALLS ====
async function selecionarPasta() {
    try {
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
    } catch (e) {
        showToast("Erro ao processar pasta: " + e.message, "error");
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

    try {
        const res = await window.pywebview.api.buscar_gps(endereco);
        if(res.erro) {
            showToast("Erro GPS: " + res.erro, "error");
        } else {
            document.getElementById("input-lat").value = res.lat;
            document.getElementById("input-lon").value = res.lon;
            showToast("Localização encontrada!", "success");
            updateLivePreview();
        }
    } catch (e) {
        showToast("Falha de conexão ou erro no GPS: " + e.message, "error");
    } finally {
        btn.innerText = "Detectar";
        btn.disabled = false;
    }
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

    try {
        const res = await window.pywebview.api.gerar_com_ia(nicho, empresa, telefone, endereco);
        
        if(res.erro) {
            showToast("Erro na IA: " + res.erro, "error");
        } else {
            document.getElementById("input-titulo").value = res.palavras;
            document.getElementById("input-desc").value = res.descricao;
            showToast("Metadados otimizados gerados!", "success");
        }
    } catch (e) {
        showToast("Falha de comunicação com a IA: " + e.message, "error");
    } finally {
        btn.innerHTML = `<svg class="w-4 h-4 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg> Gerar Textos`;
        btn.disabled = false;
    }
}

async function executarSEO() {
    const pasta = document.getElementById("input-pasta").value;
    if(!pasta) {
        showToast("Selecione a pasta no Passo 1!", "error");
        currentStep = 1;
        updateUI();
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

    try {
        await window.pywebview.api.executar_seo_lote(data);
    } catch (e) {
        showToast("Falha de comunicação com o processador: " + e.message, "error");
    } finally {
        btn.disabled = false;
        btn.classList.replace("from-slate-500", "from-emerald-500");
        btn.classList.replace("to-slate-400", "to-teal-500");
        btn.innerText = "Executar Processamento";
    }
}

async function loadProjects() {
    const list = document.getElementById("projects-list");
    if(list) list.innerHTML = `<p class="text-sm text-slate-400">Carregando projetos...</p>`;
    
    if(currentUser) {
        try {
            const snapshot = await db.collection("users").doc(currentUser.uid).collection("projetos").get();
            let cloudProjs = [];
            snapshot.forEach(doc => cloudProjs.push(doc.data()));
            
            let mergedMap = {};
            projetosDB.forEach(p => mergedMap[p.id] = p);
            cloudProjs.forEach(p => {
                if(!mergedMap[p.id] || new Date(p.updatedAt) > new Date(mergedMap[p.id].updatedAt)) {
                    mergedMap[p.id] = p;
                }
            });
            projetosDB = Object.values(mergedMap);
            persistLocalDB();
        } catch(e) {}
    }
    
    if(!list) return;
    
    if(projetosDB.length === 0) {
        list.innerHTML = `<div class="col-span-1 md:col-span-2 text-center py-10 bg-slate-50 rounded-xl border border-dashed border-slate-200">
            <p class="text-slate-500 font-medium">Nenhum projeto encontrado.</p>
        </div>`;
        return;
    }
    
    let html = '';
    projetosDB.sort((a,b) => new Date(b.updatedAt) - new Date(a.updatedAt)).forEach(p => {
        html += `
        <div class="bg-white rounded-xl p-5 border border-slate-100 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow cursor-pointer group" onclick="loadProject('${p.id}')">
            <div class="flex justify-between items-start mb-4">
                <div>
                    <h4 class="font-bold text-slate-900 text-lg group-hover:text-emerald-600 transition-colors">${p.nomeProjeto}</h4>
                    <p class="text-xs text-slate-500 mt-1">Cliente: ${p.empresa || 'Nenhum'}</p>
                </div>
                <div class="text-[10px] text-slate-400 font-mono bg-slate-50 px-2 py-1 rounded border border-slate-100">
                    ${new Date(p.updatedAt).toLocaleDateString()}
                </div>
            </div>
            <div class="flex items-center gap-3 mt-2 pt-3 border-t border-slate-50">
                <button onclick="event.stopPropagation(); abrirGeradorPDF('${p.id}')" class="text-xs flex items-center gap-1 font-medium text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1.5 rounded transition-colors">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                    Gerar PDF
                </button>
                <button onclick="event.stopPropagation(); deleteProject('${p.id}')" class="text-xs text-rose-500 hover:underline">Excluir Projeto</button>
            </div>
        </div>`;
    });
    list.innerHTML = html;
}

function deleteProject(id) {
    if(confirm("Deseja realmente excluir este projeto?")) {
        projetosDB = projetosDB.filter(x => x.id !== id);
        persistLocalDB();
        if(currentUser) {
            db.collection("users").doc(currentUser.uid).collection("projetos").doc(id).delete().catch(e=>{});
        }
        if(currentProjectId === id) {
            currentProjectId = null;
            localStorage.removeItem("lastActiveProjectId");
            switchView("projects");
        }
        loadProjects();
    }
}

function salvarComoCliente() {
    const empresa = document.getElementById("input-empresa").value.trim();
    if(!empresa) {
        showToast("Preencha ao menos o nome da empresa.", "error");
        return;
    }
    
    const c = {
        id: "cli_" + Date.now() + Math.random().toString(36).substring(2, 7),
        empresa: empresa,
        telefone: document.getElementById("input-telefone").value,
        endereco: document.getElementById("input-endereco").value,
        lat: document.getElementById("input-lat").value,
        lon: document.getElementById("input-lon").value,
        titulo: document.getElementById("input-titulo").value,
        desc: document.getElementById("input-desc").value,
        updatedAt: new Date().toISOString()
    };
    
    clientesDB.push(c);
    persistLocalDB();
    if(currentUser) {
        db.collection("users").doc(currentUser.uid).collection("clientes").doc(c.id).set(c).catch(e=>{});
    }
    showToast("Salvo no Banco de Clientes com sucesso!", "success");
    loadHistory();
}

async function loadHistory() {
    const list = document.getElementById("history-list");
    if (list) list.innerHTML = `<p class="text-sm text-slate-400">Carregando...</p>`;
    
    if (currentUser) {
        try {
            const snapshot = await db.collection("users").doc(currentUser.uid).collection("clientes").get();
            let cloudClients = [];
            snapshot.forEach(doc => cloudClients.push(doc.data()));
            
            let mergedMap = {};
            clientesDB.forEach(c => mergedMap[c.id] = c);
            cloudClients.forEach(c => {
                if(!mergedMap[c.id] || new Date(c.updatedAt) > new Date(mergedMap[c.id].updatedAt)) {
                    mergedMap[c.id] = c;
                }
            });
            clientesDB = Object.values(mergedMap);
            persistLocalDB();
        } catch (e) { }
    }
    
    if(!list) return;

    if(clientesDB.length === 0) {
        list.innerHTML = `<div class="col-span-1 md:col-span-2 text-center py-10 bg-slate-50 rounded-xl border border-dashed border-slate-200">
            <p class="text-slate-500 font-medium">Nenhum cliente salvo.</p>
        </div>`;
        return;
    }
    
    let html = '';
    clientesDB.sort((a,b) => new Date(b.updatedAt) - new Date(a.updatedAt)).forEach(c => {
        html += `
        <div class="bg-white rounded-xl p-5 border border-slate-100 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
            <div class="flex justify-between items-start mb-4">
                <div>
                    <h4 class="font-bold text-slate-900 text-lg">${c.empresa || "Sem Nome"}</h4>
                    <p class="text-xs text-slate-500 mt-1">${c.titulo ? c.titulo.substring(0, 40) + '...' : "Sem Nicho"}</p>
                </div>
            </div>
            
            <div class="flex items-center gap-2 mt-4 pt-4 border-t border-slate-50">
                <button onclick="usarCliente('${c.id}')" class="flex-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 font-semibold py-2 rounded-lg text-xs transition-colors flex justify-center items-center gap-1">
                    Criar Projeto Destes Dados
                </button>
                <button onclick="deletarCliente('${c.id}')" class="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-500 rounded-lg transition-colors flex justify-center items-center">
                    Excluir
                </button>
            </div>
        </div>
        `;
    });
    list.innerHTML = html;
}

function usarCliente(id) {
    const c = clientesDB.find(x => x.id === id);
    if(!c) return;
    
    const projName = "Projeto - " + c.empresa + " " + new Date().toLocaleDateString();
    const newProj = {
        id: "proj_" + Date.now() + Math.random().toString(36).substring(2, 7),
        nomeProjeto: projName,
        empresa: c.empresa, telefone: c.telefone, endereco: c.endereco, lat: c.lat, lon: c.lon, titulo: c.titulo, desc: c.desc, pasta: "", step: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    
    projetosDB.push(newProj);
    persistLocalDB();
    if(currentUser) {
        db.collection("users").doc(currentUser.uid).collection("projetos").doc(newProj.id).set(newProj).catch(e=>{});
    }
    showToast("Projeto criado a partir do cliente!", "success");
    loadProject(newProj.id);
}

function deletarCliente(id) {
    if(confirm("Tem certeza que deseja excluir este cliente?")) {
        clientesDB = clientesDB.filter(c => c.id !== id);
        persistLocalDB();
        if (currentUser) {
            db.collection("users").doc(currentUser.uid).collection("clientes").doc(id).delete().catch(e=>{});
        }
        showToast("Cliente removido.", "success");
        loadHistory();
    }
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

// ================= PDF REPORT =================
function abrirGeradorPDF(projId) {
    document.getElementById("report-project-id").value = projId;
    
    // Recuperar configs salvas
    const saved = localStorage.getItem("geoRankerWhiteLabel");
    if(saved) {
        const d = JSON.parse(saved);
        document.getElementById("report-agency-name").value = d.name || "";
        document.getElementById("report-agency-logo").value = d.logo || "";
    }
    
    // Setup File Upload
    const fileInput = document.getElementById("report-agency-logo-file");
    if(fileInput) {
        // Limpar o input
        fileInput.value = "";
        fileInput.onchange = function(e) {
            const file = e.target.files[0];
            if(file) {
                const reader = new FileReader();
                reader.onload = function(evt) {
                    document.getElementById("report-agency-logo").value = evt.target.result;
                };
                reader.readAsDataURL(file);
            }
        };
    }
    
    const modal = document.getElementById("modal-report");
    const content = document.getElementById("modal-report-content");
    modal.classList.remove("hidden");
    setTimeout(() => { 
        modal.classList.remove("opacity-0");
        content.classList.remove("scale-95");
    }, 10);
}

function closeReportModal() {
    const modal = document.getElementById("modal-report");
    const content = document.getElementById("modal-report-content");
    modal.classList.add("opacity-0");
    content.classList.add("scale-95");
    setTimeout(() => { modal.classList.add("hidden"); }, 300);
}

async function generatePDF() {
    const btn = document.getElementById("btn-generate-pdf");
    btn.innerHTML = `<svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Gerando...`;
    btn.disabled = true;

    try {
        const pId = document.getElementById("report-project-id").value;
        const proj = projetosDB.find(p => p.id === pId);
        if(!proj) throw new Error("Projeto não encontrado.");

        const agencyName = document.getElementById("report-agency-name").value.trim() || "Sua Agência";
        const agencyLogo = document.getElementById("report-agency-logo").value.trim();
        
        // Salvar configs
        localStorage.setItem("geoRankerWhiteLabel", JSON.stringify({name: agencyName, logo: agencyLogo}));

        // Baixar template
        const response = await fetch("report_template_v1.html");
        if(!response.ok) throw new Error("Falha ao carregar template do relatório.");
        const htmlTemplate = await response.text();

        // Injetar no DOM invisivel
        const wrapper = document.getElementById("hidden-report-wrapper");
        wrapper.innerHTML = htmlTemplate;

        // Preencher dados
        document.getElementById("rep-agency-name").innerText = agencyName;
        document.getElementById("rep-footer-agency").innerText = "Powered by " + agencyName;
        
        const logoEl = document.getElementById("rep-agency-logo");
        if(agencyLogo) {
            logoEl.src = agencyLogo;
            logoEl.classList.remove("hidden");
        } else {
            logoEl.classList.add("hidden");
        }

        const hoje = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
        document.getElementById("rep-date").innerText = hoje;
        document.getElementById("rep-client-name").innerText = proj.empresa || "Sem Nome";
        document.getElementById("rep-gps-coords").innerText = proj.lat ? "Sim" : "Não";
        
        // Puxar total real de fotos via PyWebView
        let numFotos = 0;
        if(window.pywebview && window.pywebview.api && proj.pasta) {
            try {
                const resumo = await window.pywebview.api.obter_resumo_pasta(proj.pasta);
                if(resumo && resumo.total) numFotos = resumo.total;
            } catch(e) {}
        }
        document.getElementById("rep-total-photos").innerText = numFotos.toString();
        
        // Coordenadas
        document.getElementById("rep-lat-val").innerText = proj.lat || "Não informada";
        document.getElementById("rep-lon-val").innerText = proj.lon || "Não informada";
        
        // Tags
        const tagsArray = proj.desc ? proj.desc.split(",").map(t => t.trim()).filter(t => t) : [];
        const keyCount = tagsArray.length;
        document.getElementById("rep-keywords").innerText = keyCount.toString();
        
        const tagsContainer = document.getElementById("rep-tags-container");
        tagsContainer.innerHTML = "";
        if(keyCount > 0) {
            tagsArray.forEach(tag => {
                tagsContainer.innerHTML += `<span class="px-2 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-md text-[10px] font-bold uppercase tracking-wide">${tag}</span>`;
            });
        } else {
            tagsContainer.innerHTML = `<span class="text-xs text-slate-400">Nenhuma tag injetada.</span>`;
        }

        // Chamar Python para Insights
        let aiInsights = "As mídias foram otimizadas corretamente e estão prontas para upload no Google Meu Negócio.";
        try {
            if (window.pywebview && window.pywebview.api && window.pywebview.api.api_gerar_insights_pdf) {
                const res = await window.pywebview.api.api_gerar_insights_pdf({
                    empresa: proj.empresa,
                    numFotos: numFotos,
                    gps_ok: !!proj.lat,
                    keyCount: keyCount
                });
                if (res && res.ok && res.insight) {
                    aiInsights = res.insight;
                } else if (res && res.erro) {
                    console.warn("Erro na API Python de insights:", res.erro);
                }
            }
        } catch(e) {
            console.warn("Erro ao comunicar com Python para insights:", e);
        }

        document.getElementById("rep-insights").innerText = aiInsights;

        // Gerar PDF em Base64
        const element = document.getElementById("report-v1-container");
        const opt = {
            margin:       0,
            filename:     `Relatorio_SEO_${proj.empresa || 'Projeto'}.pdf`,
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2, useCORS: true, logging: false },
            jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };

        const pdfBase64 = await html2pdf().set(opt).from(element).outputPdf('datauristring');
        
        // Passar Base64 para o Python salvar pelo Windows
        if(window.pywebview && window.pywebview.api && window.pywebview.api.salvar_pdf) {
            const res = await window.pywebview.api.salvar_pdf(pdfBase64, opt.filename);
            if(res.ok) {
                showToast("Relatório salvo com sucesso!", "success");
                closeReportModal();
            } else if(!res.cancelado) {
                throw new Error(res.erro || "Falha ao salvar o arquivo.");
            }
        } else {
            // Fallback caso rode no navegador
            await html2pdf().set(opt).from(element).save();
            showToast("Relatório baixado no navegador!", "success");
            closeReportModal();
        }

    } catch (e) {
        alert("Erro ao gerar PDF: " + e.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg><span>Baixar PDF</span>`;
    }
}

