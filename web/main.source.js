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
  authDomain: "exifrankferramentaseo.firebaseapp.com",
  projectId: "exifrankferramentaseo",
  storageBucket: "exifrankferramentaseo.firebasestorage.app",
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
    const mandatoryOverlay = document.getElementById("mandatory-login-overlay");
    if (user) {
        if(mandatoryOverlay) mandatoryOverlay.classList.add("hidden");
        document.getElementById("auth-unlogged").classList.add("hidden");
        document.getElementById("auth-logged").classList.remove("hidden");
        document.getElementById("auth-name").innerText = user.displayName || user.email;
        const photoEl = document.getElementById("auth-photo");
        photoEl.referrerPolicy = "no-referrer";
        photoEl.crossOrigin = "anonymous";
        photoEl.src = user.photoURL || ('https://ui-avatars.com/api/?name=' + (user.displayName || 'U'));
        setCloudSyncStatus('ok');
        
        loadLocalDB(user.uid);
        const lastId = localStorage.getItem("lastActiveProjectId_" + user.uid);
        if (lastId && projetosDB.find(p => p.id === lastId)) {
            loadProject(lastId);
        } else {
            switchView('projects');
            loadProjects();
        }
        
        // Mostrar painel admin se for o dono
        const adminBtn = document.getElementById("menu-adminPanel");
        if (adminBtn) {
            if (user.email && user.email.toLowerCase() === 'lpresses17@gmail.com') adminBtn.classList.remove("hidden");
            else adminBtn.classList.add("hidden");
        }
        
        // Escutar status de Assinatura Premium
        if (typeof checkPremiumStatus === 'function') {
            checkPremiumStatus(user.uid);
        }
        
        // Iniciar Tour automático se nunca foi feito
        if (localStorage.getItem('tour_v1_0_12') !== 'done' && !window.tourQueued) {
            window.tourQueued = true;
            setTimeout(() => {
                if(typeof startAppTour === 'function') startAppTour('light');
            }, 1000);
        }
    } else {
        if(mandatoryOverlay) mandatoryOverlay.classList.remove("hidden");
        document.getElementById("auth-unlogged").classList.remove("hidden");
        document.getElementById("auth-logged").classList.add("hidden");
        
        // Reset state so that project view is clear after logout
        projetosDB = [];
        clientesDB = [];
        currentProject = null;
        if(typeof renderProjectView === 'function') renderProjectView();
        if(typeof renderClientsList === 'function') renderClientsList();
        if(typeof renderProjectsList === 'function') renderProjectsList();
        
        const adminBtn = document.getElementById("menu-adminPanel");
        if (adminBtn) adminBtn.classList.add("hidden");
        
        if (typeof unsubscribePremium !== 'undefined' && unsubscribePremium) {
            unsubscribePremium();
            unsubscribePremium = null;
        }
        const overlay = document.getElementById("premium-lock-overlay");
        if (overlay) overlay.classList.remove("hidden");
    }
}

function setCloudSyncStatus(status, errorMsg = "") {
    const el = document.getElementById('cloud-sync-status');
    if (!el) return;
    if (status === 'syncing') {
        el.className = "text-[9px] text-blue-500 font-medium truncate flex items-center gap-1";
        el.innerHTML = `<svg class="w-2.5 h-2.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg> Sincronizando...`;
    } else if (status === 'ok') {
        el.className = "text-[9px] text-emerald-500 font-medium truncate flex items-center gap-1";
        el.innerHTML = `<svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"></path></svg> Cloud Sync On`;
    } else if (status === 'error') {
        el.className = "text-[9px] text-rose-500 font-medium truncate flex items-center gap-1";
        el.innerHTML = `<svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg> Falha na Nuvem`;
        el.title = errorMsg;
    }
}

function loginGoogle() {
    // Abre a página de autenticação no navegador padrão do sistema, usando timestamp para evitar cache
    window.open("http://127.0.0.1:45321/auth_popup.html?t=" + new Date().getTime(), "_blank");
}

// Chamada pelo servidor Python quando o navegador externo completa o login
window.completeExternalLogin = async function(jsonStr) {
    try {
        const userData = JSON.parse(jsonStr);
        
        if (userData.firebaseUserJson) {
            // Nova Abordagem Infalível:
            // Pegamos o JSON da sessão completa (gerado pelo user.toJSON() no navegador externo)
            // e injetamos DIRETAMENTE no banco de dados interno do Firebase no pywebview.
            const userObj = JSON.parse(userData.firebaseUserJson);
            
            const request = indexedDB.open("firebaseLocalStorageDb");
            request.onsuccess = function(event) {
                const db = event.target.result;
                
                // Se a store não existir, não conseguimos injetar (embora o Firebase já deva ter criado)
                if (!db.objectStoreNames.contains("firebaseLocalStorage")) {
                    alert("Aguarde o Firebase inicializar completamente e tente novamente.");
                    return;
                }
                
                const transaction = db.transaction(["firebaseLocalStorage"], "readwrite");
                const objectStore = transaction.objectStore("firebaseLocalStorage");
                const firebaseKey = `firebase:authUser:${firebaseConfig.apiKey}:[DEFAULT]`;
                
                const putRequest = objectStore.put({
                    fbase_key: firebaseKey,
                    value: userObj
                });
                
                putRequest.onsuccess = async function() {
                    // Sessão injetada com sucesso!
                    // Salvar também no Python para fallback e persistência extra
                    await window.pywebview.api.salvar_sessao({
                        uid: userData.uid,
                        email: userData.email,
                        displayName: userData.displayName,
                        photoURL: userData.photoURL,
                        idToken: userData.idToken
                    });
                    
                    // Recarrega a janela do app.
                    // Quando o app abrir, o Firebase vai ler o IndexedDB e iniciar LOGADO NATIVAMENTE.
                    window.location.reload();
                };
            };
            
            request.onerror = function() {
                alert("Erro ao injetar sessão do Firebase no IndexedDB.");
            };
        } else {
            showToast("Sessão incompleta recebida do navegador.", "error");
        }
    } catch(e) {
        showToast("Erro ao processar login: " + e.message, "error");
    }
};

async function logoutGoogle() {
    currentUser = null;
    currentUserToken = null;
    await window.pywebview.api.limpar_sessao();
    try { await firebase.auth().signOut(); } catch(e) {}
    localStorage.clear();
    updateAuthUI(null);
    showToast("Logout realizado com sucesso. Banco local limpo.", "success");
}

// ==== INITIALIZATION ====
window.addEventListener('pywebviewready', async () => {
    try {
        const v = await window.pywebview.api.get_app_version();
        if (v) document.getElementById('sidebar-version').textContent = v;
        const key = await window.pywebview.api.obter_chave_groq();
        if (key && key !== "") {
            const inputKey = document.getElementById('groq-api-key');
            if (inputKey) inputKey.value = key;
        }

        // Carrega logo da agência (White-label)
        const savedLogo = await window.pywebview.api.carregar_logo_agencia();
        if (savedLogo && savedLogo !== "") {
            window.currentAgencyLogoBase64 = savedLogo;
            const logoPreview = document.getElementById('agency-logo-preview');
            if(logoPreview) logoPreview.innerHTML = `<img src="${savedLogo}" class="max-w-full max-h-full object-contain p-1" />`;
        }
        
        // Carrega nome da agência
        const savedAgencyName = await window.pywebview.api.carregar_nome_agencia();
        if (savedAgencyName) {
            window.currentAgencyName = savedAgencyName;
            const inputName = document.getElementById('agency-name-input');
            if(inputName) inputName.value = savedAgencyName;
        }

    } catch(e) {}

    loadSettings();
    await window.pywebview.api.init_app();
    
    // Iniciar Auth State nativo do Firebase
    // Com private_mode=False, o Firebase persiste a sessão via IndexedDB automaticamente
    firebase.auth().onAuthStateChanged(async (user) => {
        if (user) {
            currentUser = user;
            currentUserToken = await user.getIdToken();
            updateAuthUI(user);
        } else {
            // Sem usuário autenticado pelo Firebase — tentar sessão local como fallback visual
            const savedSessionStr = await window.pywebview.api.carregar_sessao();
            if (savedSessionStr && savedSessionStr !== "") {
                try {
                    const savedSession = JSON.parse(savedSessionStr);
                    if (savedSession && savedSession.uid) {
                        currentUser = savedSession;
                        currentUserToken = savedSession.idToken;
                        updateAuthUI(savedSession);
                    } else {
                        currentUser = null;
                        updateAuthUI(null);
                    }
                } catch(e) {
                    currentUser = null;
                    updateAuthUI(null);
                }
            } else {
                currentUser = null;
                updateAuthUI(null);
            }
        }
    });
    
    // Auto Save Listeners (DB now loads after auth)
    setupAutoSaveListeners();
    
    // Check for updates silently after 2 seconds
    setTimeout(checkForUpdates, 2000);
});

// ==== PERSISTENCE LOGIC ====
function loadLocalDB(uid) {
    if(!uid) return;
    projetosDB = [];
    clientesDB = [];
    let pStr = localStorage.getItem("geoRankerProjetos_" + uid);
    let cStr = localStorage.getItem("geoRankerClientes_" + uid);

    if (!pStr && !cStr && localStorage.getItem("migrationDone_" + uid) !== "true") {
        const oldPStr = localStorage.getItem("geoRankerProjetos");
        const oldCStr = localStorage.getItem("geoRankerClientes");
        if (oldPStr || oldCStr) {
            pStr = oldPStr;
            cStr = oldCStr;
        }
        localStorage.setItem("migrationDone_" + uid, "true");
    }

    if(pStr) projetosDB = JSON.parse(pStr);
    if(cStr) clientesDB = JSON.parse(cStr);
}

function persistLocalDB() {
    if(!currentUser) return;
    localStorage.setItem("geoRankerProjetos_" + currentUser.uid, JSON.stringify(projetosDB));
    localStorage.setItem("geoRankerClientes_" + currentUser.uid, JSON.stringify(clientesDB));
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
    let sliderVal = 1;
    
    if(size === 'small') {
        root.style.fontSize = '14px';
        sliderVal = 0;
    } else if(size === 'large') {
        root.style.fontSize = '18px';
        sliderVal = 2;
    } else {
        root.style.fontSize = '16px';
        sliderVal = 1;
    }
    
    const slider = document.getElementById("font-size-slider");
    if(slider) {
        slider.value = sliderVal;
    }
}

function changeFontSizeSlider(val) {
    let size = 'normal';
    if(val == 0) size = 'small';
    if(val == 2) size = 'large';
    changeFontSize(size);
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
    if(currentUser) localStorage.setItem("lastActiveProjectId_" + currentUser.uid, currentProjectId);
    currentStep = p.step || 1;
    document.getElementById("input-pasta").value = p.pasta || "";
    document.getElementById("input-empresa").value = p.empresa || "";
    document.getElementById("input-telefone").value = p.telefone || "";
    document.getElementById("input-endereco").value = p.endereco || "";
    document.getElementById("input-lat").value = p.lat || "";
    document.getElementById("input-lon").value = p.lon || "";
    document.getElementById("input-titulo").value = p.titulo || "";
    document.getElementById("input-desc").value = p.desc || "";
    
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
    const views = ['app', 'history', 'help', 'settings', 'projects', 'audit', 'audit-history', 'adminPanel'];
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
    
    if (viewName === 'audit-history') {
        carregarHistoricoAuditorias();
    }

    // Update active state on sidebar
    ['app', 'history', 'help', 'settings', 'projects', 'audit'].forEach(v => {
        const btn = document.getElementById(`menu-${v}`);
        if(btn) {
            if(v === viewName || (viewName === 'audit-history' && v === 'audit')) {
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

// ==========================================
// GERAR TEXTOS IA
// ==========================================
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
            
            // Auto-sync de segurança: garante que TODOS os projetos locais antigos subam pra nuvem do usuário
            projetosDB.forEach(p => {
                db.collection("users").doc(currentUser.uid).collection("projetos").doc(p.id).set(p, { merge: true }).catch(()=>{});
            });
            
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
            setCloudSyncStatus('syncing');
            db.collection("users").doc(currentUser.uid).collection("projetos").doc(id).delete()
                .then(() => setCloudSyncStatus('ok'))
                .catch(e => setCloudSyncStatus('error', e.message));
        }
        if(currentProjectId === id) {
            currentProjectId = null;
            if(currentUser) localStorage.removeItem("lastActiveProjectId_" + currentUser.uid);
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
        setCloudSyncStatus('syncing');
        db.collection("users").doc(currentUser.uid).collection("clientes").doc(c.id).set(c)
            .then(() => setCloudSyncStatus('ok'))
            .catch(e => setCloudSyncStatus('error', e.message));
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
        setCloudSyncStatus('syncing');
        db.collection("users").doc(currentUser.uid).collection("projetos").doc(newProj.id).set(newProj)
            .then(() => setCloudSyncStatus('ok'))
            .catch(e => setCloudSyncStatus('error', e.message));
    }
    showToast("Projeto criado a partir do cliente!", "success");
    loadProject(newProj.id);
}

function deletarCliente(id) {
    if(confirm("Tem certeza que deseja excluir este cliente?")) {
        clientesDB = clientesDB.filter(c => c.id !== id);
        persistLocalDB();
        if (currentUser) {
            setCloudSyncStatus('syncing');
            db.collection("users").doc(currentUser.uid).collection("clientes").doc(id).delete()
                .then(() => setCloudSyncStatus('ok'))
                .catch(e => setCloudSyncStatus('error', e.message));
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
    if(color === "red") {
        showToast("Falha de Sistema: " + status, "error");
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
            
            if (res.release_notes) {
                document.getElementById("update-release-notes").innerText = res.release_notes;
                document.getElementById("update-release-notes-container").classList.remove("hidden");
            } else {
                document.getElementById("update-release-notes-container").classList.add("hidden");
            }
            
            const modal = document.getElementById("update-modal");
            modal.classList.remove("hidden");
            setTimeout(() => {
                modal.classList.remove("scale-95", "opacity-0");
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

async function checkForUpdatesManual() {
    const btn = document.getElementById('btn-check-updates');
    if (!btn) return;
    const originalText = btn.innerHTML;
    btn.innerHTML = `<svg class="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Buscando...`;
    btn.disabled = true;
    
    try {
        const res = await window.pywebview.api.check_for_updates();
        if (res && res.update_available) {
            updateDownloadUrl = res.download_url;
            document.getElementById("update-version-text").innerText = res.version;
            
            if (res.release_notes) {
                document.getElementById("update-release-notes").innerText = res.release_notes;
                document.getElementById("update-release-notes-container").classList.remove("hidden");
            } else {
                document.getElementById("update-release-notes-container").classList.add("hidden");
            }
            
            const modal = document.getElementById("update-modal");
            modal.classList.remove("hidden");
            setTimeout(() => {
                modal.classList.remove("scale-95", "opacity-0");
            }, 50);
            
            document.getElementById("btn-do-update").onclick = async () => {
                document.getElementById("update-actions").classList.add("hidden");
                document.getElementById("update-progress-container").classList.remove("hidden");
                await window.pywebview.api.aplicar_atualizacao(updateDownloadUrl);
            };
        } else {
            showToast("Você já está na versão mais recente!", "success");
        }
    } catch (e) {
        showToast("Erro ao buscar atualizações.", "error");
    }
    
    btn.innerHTML = originalText;
    btn.disabled = false;
}

async function salvarApiKey() {
    const key = document.getElementById('groq-api-key').value;
    const btn = document.getElementById('btn-save-key');
    const originalText = btn.innerHTML;
    btn.innerHTML = `<svg class="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Salvando...`;
    
    try {
        const success = await window.pywebview.api.salvar_chave_groq(key);
        if (success) {
            showToast("Chave da API salva com sucesso!", "success");
        } else {
            showToast("Erro ao salvar chave da API.", "error");
        }
    } catch (e) {
        showToast("Erro ao comunicar com backend.", "error");
    }
    
    btn.innerHTML = originalText;
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
    
    // Setup File Upload Listeners
    const fileClient = document.getElementById("report-client-logo-file");
    if(fileClient) {
        fileClient.value = "";
        fileClient.onchange = function(e) {
            const file = e.target.files[0];
            if(file) {
                const reader = new FileReader();
                reader.onload = function(evt) { document.getElementById("report-client-logo").value = evt.target.result; };
                reader.readAsDataURL(file);
            }
        };
    }

    const saved = localStorage.getItem("geoRankerWhiteLabel");
    if(saved) {
        try {
            const data = JSON.parse(saved);
            if(data.clientLogo) document.getElementById("report-client-logo").value = data.clientLogo;
        } catch(e) {}
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

        const agencyName = window.currentAgencyLogoBase64 
            ? (window.currentAgencyName || "Agência Parceira") 
            : "ExifRank";
        const agencyLogo = window.currentAgencyLogoBase64 || null; // Puxa o Base64 do White-label
        const clientLogo = document.getElementById("report-client-logo").value.trim();

        // Baixar template
        const response = await fetch("report_template_v1.html");
        if(!response.ok) throw new Error("Falha ao carregar template do relatório.");
        const htmlTemplate = await response.text();

        // Injetar no DOM invisivel
        const wrapper = document.getElementById("hidden-report-wrapper");
        wrapper.innerHTML = htmlTemplate;

        // Preencher dados
        document.getElementById("rep-agency-name").innerText = agencyName;
        document.querySelectorAll("[id^='rep-footer-agency']").forEach(el => el.innerText = agencyName);
        
        const logoEl = document.getElementById("rep-agency-logo");
        if(agencyLogo) {
            logoEl.src = agencyLogo;
            logoEl.classList.remove("hidden");
        } else {
            logoEl.classList.add("hidden");
        }

        const clientLogoEl = document.getElementById("rep-client-logo");
        const clientLogoContainer = document.getElementById("rep-client-logo-container");
        if(clientLogo) {
            clientLogoEl.src = clientLogo;
            clientLogoContainer.classList.remove("hidden");
        } else {
            clientLogoContainer.classList.add("hidden");
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
        const tagsArray = proj.titulo ? proj.titulo.split(",").map(t => t.trim()).filter(t => t) : [];
        const keyCount = tagsArray.length;
        document.getElementById("rep-keywords").innerText = keyCount.toString();
        
        const tagsContainer = document.getElementById("rep-tags-container");
        tagsContainer.innerHTML = "";
        if(keyCount > 0) {
            tagsArray.forEach(tag => {
                tagsContainer.innerHTML += `<span class="px-2 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-md text-[9px] font-bold uppercase tracking-wide shadow-sm">${tag}</span>`;
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

// ==========================================
// AUDITORIA EXPRESSA VISION
// ==========================================
let auditImagesBase64 = [];

function handleAuditFiles(files) {
    const previewContainer = document.getElementById("audit-image-preview");
    
    // Limite de 4 imagens
    const filesToProcess = Array.from(files).slice(0, 4 - auditImagesBase64.length);
    
    if (files.length > 4 || auditImagesBase64.length >= 4) {
        showToast("Limite de 4 imagens por auditoria.", "warning");
    }

    filesToProcess.forEach(file => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const b64 = e.target.result;
            auditImagesBase64.push(b64);
            
            // Adicionar thumbnail na tela
            previewContainer.classList.remove("hidden");
            const div = document.createElement("div");
            div.className = "relative w-16 h-16 rounded-lg overflow-hidden border border-slate-200 shadow-sm";
            div.innerHTML = `
                <img src="${b64}" class="w-full h-full object-cover">
                <button onclick="removeAuditImage(${auditImagesBase64.length - 1}, event)" class="absolute top-0.5 right-0.5 bg-red-500 text-white rounded-full p-0.5 hover:bg-red-600 transition-colors">
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
            `;
            previewContainer.appendChild(div);
        };
        reader.readAsDataURL(file);
    });
}

function removeAuditImage(index, event) {
    event.stopPropagation();
    auditImagesBase64.splice(index, 1);
    
    // Re-render preview
    const previewContainer = document.getElementById("audit-image-preview");
    previewContainer.innerHTML = '';
    
    if(auditImagesBase64.length === 0) {
        previewContainer.classList.add("hidden");
        return;
    }
    
    auditImagesBase64.forEach((b64, i) => {
        const div = document.createElement("div");
        div.className = "relative w-16 h-16 rounded-lg overflow-hidden border border-slate-200 shadow-sm";
        div.innerHTML = `
            <img src="${b64}" class="w-full h-full object-cover">
            <button onclick="removeAuditImage(${i}, event)" class="absolute top-0.5 right-0.5 bg-red-500 text-white rounded-full p-0.5 hover:bg-red-600 transition-colors">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
        `;
        previewContainer.appendChild(div);
    });
}

// Drag and drop setup
setTimeout(() => {
    const dropzone = document.getElementById("audit-dropzone");
    if(dropzone) {
        dropzone.addEventListener("dragover", (e) => {
            e.preventDefault();
            dropzone.classList.add("bg-emerald-50", "border-emerald-300");
        });
        dropzone.addEventListener("dragleave", (e) => {
            e.preventDefault();
            dropzone.classList.remove("bg-emerald-50", "border-emerald-300");
        });
        dropzone.addEventListener("drop", (e) => {
            e.preventDefault();
            dropzone.classList.remove("bg-emerald-50", "border-emerald-300");
            if(e.dataTransfer.files) {
                handleAuditFiles(e.dataTransfer.files);
            }
        });
    }

    // Suporte para Ctrl+V (Paste) globalmente, mas só processa se a view-audit estiver visível
    document.addEventListener("paste", (e) => {
        const viewAudit = document.getElementById("view-audit");
        if (viewAudit && !viewAudit.classList.contains("hidden")) {
            const items = (e.clipboardData || e.originalEvent.clipboardData).items;
            const files = [];
            for (let index in items) {
                const item = items[index];
                if (item.kind === 'file' && item.type.startsWith('image/')) {
                    const blob = item.getAsFile();
                    files.push(blob);
                }
            }
            if (files.length > 0) {
                e.preventDefault();
                handleAuditFiles(files);
            }
        }
    });

}, 1000);

async function gerarAuditoriaVision() {
    const nicho = document.getElementById("audit-nicho").value.trim();
    const local = document.getElementById("audit-local").value.trim();
    
    if(!nicho || !local) {
        showToast("Preencha o nicho e a localização.", "error");
        return;
    }
    
    if(auditImagesBase64.length === 0) {
        showToast("Anexe ao menos 1 print do perfil do cliente.", "error");
        return;
    }

    const btn = document.getElementById("btn-gerar-audit");
    const originalHtml = btn.innerHTML;
    btn.innerHTML = "⏳ Analisando...";
    btn.disabled = true;

    try {
        const res = await window.pywebview.api.groq_audit_vision(nicho, local, auditImagesBase64);
        if(res.erro) {
            showToast("Erro na Auditoria: " + res.erro, "error");
        } else {
            // Sucesso! Mostrar resultado
            document.getElementById("audit-result-container").classList.remove("hidden");
            document.getElementById("btn-export-audit").classList.remove("hidden");
            
            let htmlText = res.resultado
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*(.*?)\*/g, '<em>$1</em>')
                .replace(/### (.*?)\n/g, '<h3>$1</h3>')
                .replace(/## (.*?)\n/g, '<h2>$1</h2>')
                .replace(/# (.*?)\n/g, '<h1>$1</h1>')
                .replace(/\n- (.*?)/g, '<br>• $1')
                .replace(/\n/g, '<br>');
                
            document.getElementById("audit-result-text").innerHTML = htmlText;
            document.getElementById("btn-nova-audit").classList.remove("hidden");
            showToast("Auditoria gerada com sucesso!", "success");
            
            // Salvar no Histórico Automaticamente
            const auditData = {
                nicho: nicho,
                localizacao: local,
                resultado_html: htmlText
            };
            window.pywebview.api.salvar_auditoria(auditData).then(res => {
                if(res.ok && currentUser) {
                    setCloudSyncStatus('syncing');
                    db.collection("users").doc(currentUser.uid).collection("auditorias").doc(res.auditoria.id).set(res.auditoria)
                        .then(() => setCloudSyncStatus('ok'))
                        .catch(e => setCloudSyncStatus('error', e.message));
                }
            }).catch(e => console.log("Erro ao salvar histórico", e));
        }
    } catch (e) {
        showToast("Falha ao comunicar com IA: " + e.message, "error");
    } finally {
        btn.innerHTML = originalHtml;
        btn.disabled = false;
    }
}

function novaAuditoria() {
    // Reseta campos
    document.getElementById("audit-nicho").value = "";
    document.getElementById("audit-local").value = "";
    
    // Reseta imagens
    auditImagesBase64 = [];
    const previewContainer = document.getElementById("audit-image-preview");
    if(previewContainer) {
        previewContainer.innerHTML = "";
        previewContainer.classList.add("hidden");
    }
    
    // Reseta botões e resultados
    document.getElementById("audit-result-container").classList.add("hidden");
    document.getElementById("audit-result-text").innerHTML = "";
    document.getElementById("btn-export-audit").classList.add("hidden");
    document.getElementById("btn-nova-audit").classList.add("hidden");
    
    // Rolar para o topo
    const viewAudit = document.getElementById("view-audit");
    if(viewAudit) viewAudit.scrollTop = 0;
}

function exportAuditPDF() {
    const conteudo = document.getElementById("audit-result-text").innerHTML;
    const nicho = document.getElementById("audit-nicho").value || "Nicho";
    const local = document.getElementById("audit-local").value || "Local";
    
    // Configura o botão como carregando
    const btn = document.getElementById("btn-export-audit");
    const originalHtml = btn.innerHTML;
    btn.innerHTML = "⏳ Gerando PDF...";
    btn.disabled = true;

    // Busca logo da agência caso exista
    const agencyLogo = window.currentAgencyLogoBase64 || null;
    const agencyNameText = window.currentAgencyName || "Agência Parceira";
    
    const headerContent = agencyLogo 
        ? `<div style="text-align: center; margin-bottom: 40px;">
                <div style="display: inline-block; text-align: center;">
                    <img src="${agencyLogo}" style="max-height: 60px; vertical-align: middle; margin-right: 15px;" />
                    <span style="font-size: 22px; font-weight: bold; color: #333; vertical-align: middle;">${agencyNameText}</span>
                </div>
           </div>
           <div style="text-align: center; margin-bottom: 50px;">
                <h1 style="color: #059669; border-bottom: 2px solid #059669; padding-bottom: 10px; margin: 0 0 10px 0; font-size: 28px;">Diagnóstico Estratégico GMB</h1>
                <p style="margin: 0; color: #666; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">${nicho} | ${local}</p>
           </div>`
        : `<div style="text-align: center; margin-bottom: 50px;">
                <h1 style="color: #059669; border-bottom: 2px solid #059669; padding-bottom: 10px; margin: 0 0 10px 0; font-size: 28px;">Diagnóstico Estratégico GMB</h1>
                <p style="margin: 0; color: #666; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">${nicho} | ${local}</p>
           </div>`;

    // Cria um container temporário para formatar a exportação
    const element = document.createElement('div');
    element.innerHTML = `
        <div style="font-family: Arial, sans-serif; padding: 40px; color: #333; line-height: 1.6;">
            ${headerContent}
            ${conteudo}
        </div>
    `;

    // Aplica estilos CSS inline para as tags que vieram do Markdown para manter a cor no Canvas
    const h1s = element.querySelectorAll('h1');
    h1s.forEach(h => { h.style.color = '#059669'; h.style.marginTop = '30px'; h.style.fontSize = '24px'; });
    const h2s = element.querySelectorAll('h2');
    h2s.forEach(h => { h.style.color = '#047857'; h.style.marginTop = '25px'; h.style.fontSize = '20px'; });
    const h3s = element.querySelectorAll('h3');
    h3s.forEach(h => { h.style.color = '#065f46'; h.style.marginTop = '20px'; h.style.fontSize = '18px'; });
    const strongs = element.querySelectorAll('strong');
    strongs.forEach(s => { s.style.color = '#111'; });
    
    // Evitar quebra de página grosseira
    const blocks = element.querySelectorAll('p, h1, h2, h3, h4, li, div');
    blocks.forEach(b => { 
        b.style.pageBreakInside = 'avoid'; 
        b.style.breakInside = 'avoid'; 
    });

    const opt = {
        margin:       15,
        filename:     `Auditoria_${nicho}_${local}.pdf`.replace(/ /g, "_"),
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true, letterRendering: true },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak:    { mode: ['avoid-all', 'css', 'legacy'] }
    };

    // Gera o PDF como base64 (string) e envia para o backend do Python abrir a janela Salvar Como do Windows
    html2pdf().set(opt).from(element).outputPdf('datauristring').then(function(pdfBase64) {
        window.pywebview.api.salvar_pdf(pdfBase64, opt.filename).then(res => {
            btn.innerHTML = originalHtml;
            btn.disabled = false;
            
            if(res.ok) {
                showToast("PDF salvo com sucesso!", "success");
            } else if (!res.cancelado) {
                showToast("Erro ao salvar PDF: " + res.erro, "error");
            }
        });
    }).catch(err => {
        btn.innerHTML = originalHtml;
        btn.disabled = false;
        showToast("Erro ao gerar PDF internamente.", "error");
    });
}

// ==========================================
// WHITE-LABEL / AGENCY LOGO LOGIC
// ==========================================
window.currentAgencyLogoBase64 = null;
window.currentAgencyName = "";

// Escuta em tempo real o documento do usuário para destravar recursos Premium
let unsubscribePremium = null;

async function checkPremiumStatus(uid) {
    if (unsubscribePremium) unsubscribePremium();
    unsubscribePremium = db.collection("users").doc(uid).onSnapshot(async (doc) => {
        const overlay = document.getElementById("premium-lock-overlay");
        if (!overlay) return;
        
        let userIsPremium = false;
        if (doc.exists && doc.data().isPremium === true) {
            userIsPremium = true;
        }

        // Se não for premium, verificar se o e-mail está na lista de pré-aprovados
        if (!userIsPremium && currentUser && currentUser.email) {
            const currentLower = currentUser.email.toLowerCase().trim();
            if (currentLower === 'lpresses17@gmail.com' || currentLower === 'lprcampos17@gmail.com' || currentLower.includes('operacionalnexus')) {
                userIsPremium = true;
                db.collection("users").doc(uid).set({ isPremium: true, email: currentUser.email }, { merge: true }).catch(()=>{});
            } else {
                try {
                    const emailToCheck = currentUser.email.trim().toLowerCase();
                    const preDoc = await db.collection("premium_emails").doc(emailToCheck).get();
                    if (preDoc.exists) {
                        userIsPremium = true;
                        db.collection("users").doc(uid).set({ isPremium: true, email: currentUser.email }, { merge: true }).catch(()=>{});
                    } else {
                        // showToast("DEBUG: " + emailToCheck + " não está na lista VIP", "info");
                    }
                } catch(e) {
                    showToast("Erro ao verificar email VIP: " + e.message, "error");
                }
            }
        }

        // Esconder o botão 'Assinar Premium' do menu lateral se for Premium
        const buyBtn = document.getElementById("menu-buy-premium");
        if (buyBtn) {
            if (userIsPremium) buyBtn.classList.add("hidden");
            else buyBtn.classList.remove("hidden");
        }

        if (userIsPremium) {
            // Admin supremo ignora trava de hardware
            if (currentUser && currentUser.email && currentUser.email.toLowerCase() === 'lpresses17@gmail.com') {
                overlay.classList.add("hidden");
                return;
            }

            let hwid = "";
            try {
                hwid = await window.pywebview.api.obter_hardware_id();
            } catch(e) {}
            
            const dbHwid = doc.exists ? doc.data().hardware_id : null;
            if (!dbHwid) {
                if (hwid) {
                    db.collection("users").doc(uid).set({ hardware_id: hwid }, { merge: true }).catch(()=>{});
                }
                overlay.classList.add("hidden");
            } else if (dbHwid === hwid) {
                overlay.classList.add("hidden");
            } else {
                overlay.classList.remove("hidden");
                const lockMsg = document.getElementById("premium-lock-msg");
                const lockBtn = document.getElementById("btn-assinar-premium");
                if (lockMsg) {
                    lockMsg.innerHTML = `<span class="font-bold">⚠️ LICENÇA BLOQUEADA:</span><br>Esta conta Premium já está ativada em outro computador. O limite é de 1 máquina por licença.`;
                }
                if (lockBtn) lockBtn.classList.add("hidden");
            }
        } else {
            overlay.classList.remove("hidden");
        }
    });
}

async function assinarPremium() {
    if (!currentUser) {
        showToast("Você precisa fazer login no Google primeiro para assinar.", "error");
        return;
    }
    
    const btn = document.getElementById("btn-assinar-premium");
    if(btn) {
        btn.innerHTML = `⏳ Redirecionando...`;
    }

    try {
        const checkoutUrl = `https://pay.kiwify.com.br/nOURNRj?email=${encodeURIComponent(currentUser.email)}`;
        window.open(checkoutUrl, "_blank");
        
        setTimeout(() => {
            if(btn) btn.innerHTML = `Ir para o Pagamento`;
        }, 2000);
    } catch (e) {
        console.error(e);
        showToast("Erro ao abrir checkout.", "error");
    }
}

async function saveAgencyName() {
    const input = document.getElementById("agency-name-input");
    if (!input) return;
    const val = input.value.trim();
    window.currentAgencyName = val;
    await window.pywebview.api.salvar_nome_agencia(val);
}

async function handleAgencyLogoUpload(input) {
    if(!input.files || input.files.length === 0) return;
    const file = input.files[0];
    if(file.size > 2 * 1024 * 1024) {
        showToast("A imagem deve ter no máximo 2MB", "error");
        return;
    }
    const reader = new FileReader();
    reader.onload = async (e) => {
        const base64 = e.target.result;
        window.currentAgencyLogoBase64 = base64;
        document.getElementById('agency-logo-preview').innerHTML = `<img src="${base64}" class="max-w-full max-h-full object-contain p-1" />`;
        
        // Salva no backend
        const salvou = await window.pywebview.api.salvar_logo_agencia(base64);
        if(salvou) showToast("Logo da Agência salva com sucesso!", "success");
        else showToast("Erro ao salvar logo.", "error");
    };
    reader.readAsDataURL(file);
}

async function removeAgencyLogo() {
    window.currentAgencyLogoBase64 = null;
    document.getElementById('agency-logo-preview').innerHTML = `<svg class="w-5 h-5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>`;
    await window.pywebview.api.salvar_logo_agencia("");
    showToast("Logo removida.", "info");
}

// ==========================================
// HISTÓRICO DE AUDITORIAS
// ==========================================
let auditHistoryDB = [];

async function carregarHistoricoAuditorias() {
    const emptyState = document.getElementById("audit-history-empty");
    const grid = document.getElementById("audit-history-grid");
    
    if(grid) grid.innerHTML = `<p class="text-sm text-slate-400">Carregando histórico...</p>`;
    
    try {
        let audits = await window.pywebview.api.listar_auditorias();
        auditHistoryDB = audits || [];
        
        // Sincronizar com Firebase
        if (currentUser) {
            try {
                const snapshot = await db.collection("users").doc(currentUser.uid).collection("auditorias").get();
                let cloudAudits = [];
                snapshot.forEach(doc => cloudAudits.push(doc.data()));
                
                let mergedMap = {};
                auditHistoryDB.forEach(a => mergedMap[a.id] = a);
                cloudAudits.forEach(a => {
                    // Prevalece o mais recente se houver conflito, mas como ID é único, mescla
                    mergedMap[a.id] = a;
                });
                auditHistoryDB = Object.values(mergedMap);
                
                // Opcional: Atualizar localmente os que vieram da nuvem
                auditHistoryDB.forEach(a => {
                    window.pywebview.api.salvar_auditoria(a).catch(e=>{});
                });
            } catch(e) { console.log("Erro sync firebase auditorias", e); }
        }
        
        renderAuditHistory();
    } catch (e) {
        if(grid) grid.innerHTML = `<p class="text-sm text-rose-500">Erro ao carregar histórico: ${e.message}</p>`;
    }
}

function renderAuditHistory() {
    const emptyState = document.getElementById("audit-history-empty");
    const grid = document.getElementById("audit-history-grid");
    
    if(!grid || !emptyState) return;
    
    if(auditHistoryDB.length === 0) {
        emptyState.classList.remove("hidden");
        grid.innerHTML = "";
        return;
    }
    
    emptyState.classList.add("hidden");
    let html = '';
    
    auditHistoryDB.sort((a,b) => new Date(b.data_atualizacao.split('/').reverse().join('-')) - new Date(a.data_atualizacao.split('/').reverse().join('-'))).forEach(a => {
        html += `
        <div class="bg-white rounded-xl p-5 border border-slate-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow cursor-pointer group" onclick="visualizarAuditoria('${a.id}')">
            <div class="flex justify-between items-start mb-4">
                <div>
                    <h4 class="font-bold text-slate-900 text-lg group-hover:text-emerald-600 transition-colors">${a.nicho || 'Auditoria'}</h4>
                    <p class="text-xs text-slate-500 mt-1">${a.localizacao || 'Sem Localização'}</p>
                </div>
                <div class="text-[10px] text-slate-400 font-mono bg-slate-50 px-2 py-1 rounded border border-slate-100">
                    ${a.data_atualizacao}
                </div>
            </div>
            <div class="flex items-center gap-3 mt-2 pt-3 border-t border-slate-50">
                <button onclick="event.stopPropagation(); visualizarAuditoria('${a.id}')" class="text-xs flex items-center gap-1 font-medium text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1.5 rounded transition-colors">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
                    Visualizar
                </button>
                <button onclick="event.stopPropagation(); excluirAuditoria('${a.id}')" class="text-xs text-rose-500 hover:underline">Excluir</button>
            </div>
        </div>`;
    });
    grid.innerHTML = html;
}

function visualizarAuditoria(id) {
    const a = auditHistoryDB.find(x => x.id === id);
    if(!a) return;
    
    // Repopular a tela principal
    document.getElementById("audit-nicho").value = a.nicho || "";
    document.getElementById("audit-local").value = a.localizacao || "";
    
    document.getElementById("audit-result-text").innerHTML = a.resultado_html || "";
    document.getElementById("audit-result-container").classList.remove("hidden");
    
    document.getElementById("btn-export-audit").classList.remove("hidden");
    document.getElementById("btn-nova-audit").classList.remove("hidden");
    
    switchView("audit");
    showToast("Auditoria carregada!", "success");
}

async function excluirAuditoria(id) {
    if(confirm("Deseja realmente excluir esta auditoria salva?")) {
        try {
            await window.pywebview.api.deletar_auditoria(id);
            auditHistoryDB = auditHistoryDB.filter(x => x.id !== id);
            
            if (currentUser) {
                setCloudSyncStatus('syncing');
                db.collection("users").doc(currentUser.uid).collection("auditorias").doc(id).delete()
                    .then(() => setCloudSyncStatus('ok'))
                    .catch(e => setCloudSyncStatus('error', e.message));
            }
            
            renderAuditHistory();
            showToast("Auditoria excluída.", "success");
        } catch(e) {
            showToast("Erro ao excluir: " + e.message, "error");
        }
    }
}

// Funcionalidades de Recuperação removidas.

// ==========================================
// PAINEL DE ADMINISTRAÇÃO
// ==========================================
async function loadAdminData() {
    if (!currentUser || currentUser.email !== 'lpresses17@gmail.com') return;
    
    const tbody = document.getElementById("admin-users-list");
    if (!tbody) return;
    
    tbody.innerHTML = `<tr><td colspan="4" class="px-4 py-8 text-center text-slate-400">Carregando usuários...</td></tr>`;
    
    // Carregar E-mails Premium
    const preTbody = document.getElementById("admin-premium-emails-list");
    if (preTbody) {
        preTbody.innerHTML = `<tr><td class="px-4 py-3 text-center text-slate-400">Carregando...</td></tr>`;
        try {
            const preSnap = await db.collection("premium_emails").get();
            let preHtml = '';
            preSnap.forEach(d => {
                preHtml += `
                <tr class="hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0">
                    <td class="px-4 py-3 font-medium text-slate-700">${d.id}</td>
                    <td class="px-4 py-3 text-right w-24">
                        <button onclick="removePremiumEmail('${d.id}')" class="px-2 py-1 bg-rose-50 text-rose-600 rounded hover:bg-rose-100 text-xs font-medium transition-colors">Remover</button>
                    </td>
                </tr>`;
            });
            if (!preHtml) preHtml = `<tr><td class="px-4 py-3 text-center text-slate-400">Nenhum e-mail pré-aprovado.</td></tr>`;
            preTbody.innerHTML = preHtml;
        } catch(e) {
            preTbody.innerHTML = `<tr><td class="px-4 py-3 text-center text-rose-500">Erro: ${e.message}</td></tr>`;
        }
    }
    
    try {
        const snapshot = await db.collection("users").get();
        let html = '';
        snapshot.forEach(doc => {
            const data = doc.data();
            const uid = doc.id;
            const email = data.email || 'Email Desconhecido';
            const isPremium = data.isPremium === true;
            const hwid = data.hardware_id || 'Não Registrado';
            
            const btnPremium = isPremium 
                ? `<button onclick="togglePremium('${uid}', false)" class="px-2 py-1 bg-amber-50 text-amber-600 rounded hover:bg-amber-100 text-xs font-medium whitespace-nowrap">Revogar Premium</button>`
                : `<button onclick="togglePremium('${uid}', true)" class="px-2 py-1 bg-emerald-50 text-emerald-600 rounded hover:bg-emerald-100 text-xs font-medium whitespace-nowrap">Dar Premium</button>`;
                
            const btnResetHWID = hwid !== 'Não Registrado'
                ? `<button onclick="resetHWID('${uid}')" class="px-2 py-1 bg-rose-50 text-rose-600 rounded hover:bg-rose-100 text-xs font-medium whitespace-nowrap">Resetar PC</button>`
                : '';

            html += `
            <tr class="hover:bg-slate-50 transition-colors">
                <td class="px-4 py-3 font-medium text-slate-900">${email}<br><span class="text-[10px] text-slate-400 font-mono">${uid}</span></td>
                <td class="px-4 py-3 text-center">
                    ${isPremium ? '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800">SIM</span>' : '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-800">NÃO</span>'}
                </td>
                <td class="px-4 py-3 font-mono text-xs text-slate-500 truncate max-w-[150px]" title="${hwid}">${hwid}</td>
                <td class="px-4 py-3 align-middle">
                    <div class="flex flex-col gap-1.5 items-end justify-center">
                        ${btnPremium}
                        ${btnResetHWID}
                    </div>
                </td>
            </tr>`;
        });
        
        if (html === '') html = `<tr><td colspan="4" class="px-4 py-8 text-center text-slate-400">Nenhum usuário encontrado no banco.</td></tr>`;
        tbody.innerHTML = html;
        
    } catch(e) {
        tbody.innerHTML = `<tr><td colspan="4" class="px-4 py-8 text-center text-rose-500">Erro ao buscar usuários: ${e.message}</td></tr>`;
    }
}

async function togglePremium(uid, status) {
    if(!confirm(`Deseja ${status ? 'DAR' : 'REVOGAR'} o acesso Premium deste usuário?`)) return;
    try {
        await db.collection("users").doc(uid).set({ isPremium: status }, { merge: true });
        showToast("Status Premium atualizado com sucesso!", "success");
        loadAdminData();
    } catch(e) {
        showToast("Erro ao atualizar Premium: " + e.message, "error");
    }
}

async function resetHWID(uid) {
    if(!confirm("Deseja apagar a Trava de Hardware deste usuário? Ele poderá fazer login em um novo PC.")) return;
    try {
        await db.collection("users").doc(uid).update({
            hardware_id: firebase.firestore.FieldValue.delete()
        });
        showToast("Hardware ID resetado com sucesso!", "success");
        loadAdminData();
    } catch(e) {
        showToast("Erro ao resetar HWID: " + e.message, "error");
    }
}

async function addPremiumEmail() {
    const input = document.getElementById("admin-new-premium-email");
    const email = input.value.trim().toLowerCase();
    if (!email || !email.includes("@")) {
        showToast("Digite um e-mail válido.", "error");
        return;
    }
    try {
        await db.collection("premium_emails").doc(email).set({ addedAt: firebase.firestore.FieldValue.serverTimestamp() });
        showToast("E-mail adicionado à lista Premium!", "success");
        input.value = '';
        loadAdminData();
    } catch(e) {
        showToast("Erro ao adicionar e-mail: " + e.message, "error");
    }
}

async function removePremiumEmail(email) {
    if(!confirm(`Deseja remover o e-mail ${email} da lista de pré-aprovados? (Isso não tira o premium atual dele se já fez login, apenas remove o convite automático)`)) return;
    try {
        await db.collection("premium_emails").doc(email).delete();
        showToast("E-mail removido da lista Premium.", "success");
        loadAdminData();
    } catch(e) {
        showToast("Erro ao remover e-mail: " + e.message, "error");
    }
}



// ==========================================
// TOUR GUIADO (DRIVER.JS)
// ==========================================
function startAppTour(theme = 'light') {
    localStorage.setItem('tour_v1_0_12', 'done');
    switchView('app'); // Garante que a tela de Otimizador esteja aberta
    
    if (!window.driver || !window.driver.js) {
        console.warn("Driver.js não carregado.");
        return;
    }

    // Injeta estilo premium se ainda não existir
    if (!document.getElementById('driver-premium-theme')) {
        const style = document.createElement('style');
        style.id = 'driver-premium-theme';
        style.innerHTML = `
            .driverjs-theme-premium {
                background: #ffffff;
                color: #1e293b;
                border: 1px solid #e2e8f0;
                border-radius: 16px;
                box-shadow: 0 25px 50px -12px rgba(0,0,0,0.15);
                padding: 24px;
                font-family: 'Inter', sans-serif;
            }
            .driverjs-theme-premium .driver-popover-title {
                color: #059669; /* emerald-600 */
                font-weight: 800;
                font-size: 1.25rem;
                margin-bottom: 12px;
                letter-spacing: -0.025em;
            }
            .driverjs-theme-premium .driver-popover-description {
                color: #475569;
                font-size: 0.95rem;
                line-height: 1.6;
                margin-bottom: 20px;
            }
            .driverjs-theme-premium .driver-popover-footer button {
                background: #f1f5f9;
                color: #475569;
                border: 1px solid #e2e8f0;
                border-radius: 8px;
                padding: 8px 16px;
                text-shadow: none;
                font-weight: 600;
                font-size: 0.875rem;
                transition: all 0.2s ease-in-out;
            }
            .driverjs-theme-premium .driver-popover-footer button:hover {
                background: #059669;
                color: white;
                border-color: #059669;
                transform: translateY(-1px);
                box-shadow: 0 4px 6px -1px rgba(16, 185, 129, 0.2);
            }
            .driverjs-theme-premium .driver-popover-progress-text {
                color: #94a3b8;
                font-size: 0.875rem;
                font-weight: 500;
            }
            /* Cores das setinhas */
            .driver-popover.driverjs-theme-premium .driver-popover-arrow-side-top { border-bottom-color: #ffffff; }
            .driver-popover.driverjs-theme-premium .driver-popover-arrow-side-bottom { border-top-color: #ffffff; }
            .driver-popover.driverjs-theme-premium .driver-popover-arrow-side-left { border-right-color: #ffffff; }
            .driver-popover.driverjs-theme-premium .driver-popover-arrow-side-right { border-left-color: #ffffff; }
        `;
        document.head.appendChild(style);
    }

    // Função auxiliar para esconder o lock overlay independentemente da navegação
    const forceHidePremiumLock = () => {
        const premiumOverlay = document.getElementById("premium-lock-overlay");
        if (premiumOverlay) {
            premiumOverlay.setAttribute('data-tour-hidden', 'true');
            premiumOverlay.classList.add("hidden");
        }
    };

    forceHidePremiumLock();

    const driverObj = window.driver.js.driver({
        showProgress: true,
        allowClose: true,
        popoverClass: 'driverjs-theme-premium',
        doneBtnText: 'Pronto!',
        closeBtnText: 'Pular Tour',
        nextBtnText: 'Próximo →',
        prevBtnText: '← Voltar',
        steps: [
            {
                element: '#menu-projects',
                popover: {
                    title: 'Meus Projetos',
                    description: 'Onde você vai gerenciar campanhas ativas e clientes antigos salvos no banco de dados.',
                    side: "right", align: 'start'
                },
                onHighlightStarted: forceHidePremiumLock
            },
            {
                element: 'button[onclick="startNewProject()"]',
                popover: {
                    title: 'Novo Projeto',
                    description: 'Comece vinculando um cliente. Todos os dados preenchem sozinhos e você não precisa digitar nada duas vezes.',
                    side: "bottom", align: 'start'
                },
                onHighlightStarted: forceHidePremiumLock
            },
            {
                element: '#btn-gps',
                popover: {
                    title: 'Detecção de GPS',
                    description: 'Digite o endereço da empresa e clique aqui. O sistema busca a Latitude e Longitude exatas no mapa.',
                    side: "bottom", align: 'start'
                },
                onHighlightStarted: () => {
                    forceHidePremiumLock();
                    if (typeof switchView === 'function') switchView('app');
                    if (typeof currentStep !== 'undefined') currentStep = 1;
                    if (typeof updateUI === 'function') updateUI();
                }
            },
            {
                element: 'button[onclick="gerarComIA()"]',
                popover: {
                    title: 'Geração com IA',
                    description: 'Coloque o Nicho (Ex: Pizzaria). A inteligência vai escrever a descrição persuasiva perfeita com foco em SEO Local.',
                    side: "bottom", align: 'start'
                },
                onHighlightStarted: () => {
                    forceHidePremiumLock();
                    if (typeof switchView === 'function') switchView('app');
                    if (typeof currentStep !== 'undefined') currentStep = 2;
                    if (typeof updateUI === 'function') updateUI();
                }
            },
            {
                element: '#menu-audit',
                popover: {
                    title: 'Auditoria Expressa',
                    description: 'Envie um print do Google Meu Negócio do seu cliente. Nossa IA (Vision) aponta falhas visuais e gera um relatório Premium!',
                    side: "right", align: 'start'
                },
                onHighlightStarted: forceHidePremiumLock
            },
            {
                element: '#menu-settings',
                popover: {
                    title: 'White-label Premium',
                    description: 'Suba a SUA LOGOMARCA aqui. Assim, todos os PDFs gerados sairão com a sua marca, mostrando enorme autoridade.',
                    side: "right", align: 'start'
                },
                onHighlightStarted: forceHidePremiumLock
            }
        ],
        onDestroyed: () => {
            const premiumOverlay = document.getElementById("premium-lock-overlay");
            if (premiumOverlay && premiumOverlay.getAttribute('data-tour-hidden') === 'true') {
                premiumOverlay.removeAttribute('data-tour-hidden');
                // Deixa o updateAuthUI decidir se deve mostrar baseado na assinatura
                if (currentUser && typeof isPremium !== 'undefined' && !isPremium) {
                    premiumOverlay.classList.remove("hidden");
                }
            }
            if (typeof switchView === 'function') switchView('app');
            if (typeof currentStep !== 'undefined') currentStep = 1;
            if (typeof updateUI === 'function') updateUI();
        }
    });

    driverObj.drive();
}
