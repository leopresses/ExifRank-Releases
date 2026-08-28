/* web/main.js */
let currentStep = 1;
const totalSteps = 3;
let appConfig = { notifyEnd: true, fontSize: 'normal' };
let currentProjectId = null;
// ==================== PREMIUM BLOCKER ====================
function showPremiumBlocker(title, text) {
    Swal.fire({
        title: title,
        text: text,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#10b981',
        cancelButtonColor: '#94a3b8',
        confirmButtonText: 'Fazer Upgrade',
        cancelButtonText: 'Cancelar'
    }).then((result) => {
        if (result.isConfirmed) {
            switchView('settings');
            setTimeout(() => {
                const btn = document.getElementById('btn-assinar-premium');
                if(btn) btn.click();
            }, 500);
        }
    });
}
// ========================================================

let projetosDB = [];

let listaLocalizacoes = [];

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    })[char]);
}

function parseStoredJson(rawValue, storageKey, fallback, label, isValid = () => true) {
    if (!rawValue) return fallback;
    try {
        const parsed = JSON.parse(rawValue);
        if (!isValid(parsed)) throw new Error('Formato inválido');
        return parsed;
    } catch (error) {
        console.warn(`Dados locais inválidos em ${storageKey}; restaurando o padrão.`, error);
        try { localStorage.removeItem(storageKey); } catch (_) {}
        setTimeout(() => {
            if (typeof showToast === 'function') {
                showToast(`${label} locais estavam corrompidos e foram restaurados.`, 'warning');
            }
        }, 0);
        return fallback;
    }
}

function getFriendlyErrorMessage(error, fallback = "Não foi possível concluir esta ação agora. Tente novamente em alguns instantes.") {
    const code = String(error?.code || "").toLowerCase();
    const rawMessage = typeof error?.message === "string"
        ? error.message.trim()
        : (typeof error === "string" ? error.trim() : "");
    const normalizedMessage = rawMessage.toLowerCase();

    const messagesByCode = {
        "functions/unauthenticated": "Sua sessão expirou. Entre novamente para continuar.",
        "functions/permission-denied": "Você não tem permissão para realizar esta ação.",
        "functions/unavailable": "Não foi possível conectar ao serviço agora. Verifique sua internet e tente novamente.",
        "functions/deadline-exceeded": "A operação demorou mais que o esperado. Tente novamente em alguns instantes.",
        "functions/not-found": "Este recurso ainda não está disponível. Atualize o aplicativo e tente novamente.",
        "auth/network-request-failed": "Não foi possível conectar. Verifique sua internet e tente novamente.",
        "auth/too-many-requests": "Muitas tentativas em pouco tempo. Aguarde alguns minutos antes de tentar novamente.",
        "permission-denied": "Você não tem permissão para realizar esta ação.",
        "unavailable": "Não foi possível conectar ao serviço agora. Verifique sua internet e tente novamente."
    };

    if (messagesByCode[code]) return messagesByCode[code];

    if (code === "functions/failed-precondition") {
        return rawMessage && rawMessage.length <= 180
            ? rawMessage
            : "Conclua os requisitos solicitados e tente novamente.";
    }

    if (
        normalizedMessage === "internal" ||
        normalizedMessage.includes("internal error") ||
        normalizedMessage.includes("failed to fetch") ||
        normalizedMessage.includes("network error") ||
        normalizedMessage.includes("network request failed") ||
        normalizedMessage.includes("permission-denied") ||
        normalizedMessage.includes("unauthenticated")
    ) {
        return "O serviço está temporariamente indisponível. Aguarde alguns segundos e tente novamente.";
    }

    return fallback;
}

function showFriendlyError(context, error, fallback) {
    console.error(context, error);
    showToast(getFriendlyErrorMessage(error, fallback), "error");
}

function renderLocalizacoes() {
    const container = document.getElementById("lista-localizacoes");
    if (!container) return;
    container.innerHTML = "";
    listaLocalizacoes.forEach((loc, index) => {
        container.innerHTML += `
            <div class="flex items-center justify-between gap-3 bg-white border border-slate-200/90 rounded-xl p-2.5 shadow-xs transition-all hover:border-slate-300">
                <div class="flex items-center gap-2.5 overflow-hidden flex-1">
                    <div class="relative w-8 h-8 rounded-lg overflow-hidden border border-emerald-200/80 shrink-0 bg-[#E8F5E9] flex items-center justify-center shadow-xs">
                        <svg class="absolute inset-0 w-full h-full opacity-60" fill="none" stroke="#CBD5E1" stroke-width="1.5" viewBox="0 0 40 40">
                            <path d="M0 15 H40 M0 28 H40 M14 0 V40 M26 0 V40"/>
                            <path d="M-5 10 L45 35" stroke="#A7F3D0" stroke-width="3"/>
                        </svg>
                        <svg class="w-4 h-4 text-rose-500 relative z-10 drop-shadow-sm" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                        </svg>
                    </div>
                    <div class="overflow-hidden flex-1">
                        <p class="text-xs font-semibold text-slate-800 truncate leading-tight">${escapeHtml(loc.nome)}</p>
                        <p class="text-[10px] text-slate-400 font-mono mt-0.5 truncate">${escapeHtml(loc.lat)}, ${escapeHtml(loc.lon)}</p>
                    </div>
                </div>
                <button onclick="removerLocalizacao(${index})" class="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors shrink-0" title="Remover localização">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                </button>
            </div>
        `;
    });
}

function adicionarLocalizacao() {
    if (!hasPremiumAccess() && listaLocalizacoes.length >= 2) {
        showPremiumBlocker('Limite de Bairros', 'O plano Gratuito permite adicionar até 2 localizações por ficha. Assine o Premium para fazer multiposting sem limites!');
        return;
    }
    const nome = document.getElementById("input-endereco").value.trim();
    const lat = document.getElementById("input-lat").value.trim();
    const lon = document.getElementById("input-lon").value.trim();
    
    if (!nome || !lat || !lon) {
        showToast("Preencha o endereço e clique em Detectar primeiro!", "warning");
        return;
    }
    if (coordenadasJaAdicionadas(lat, lon)) {
        showToast("Essa localização já foi adicionada à malha geográfica.", "info");
        return;
    }
    
    listaLocalizacoes.push({ nome, lat, lon });
    
    document.getElementById("input-endereco").value = "";
    document.getElementById("input-lat").value = "";
    document.getElementById("input-lon").value = "";
    
    renderLocalizacoes();
    updateLivePreview();
    triggerAutoSave();
}

function removerLocalizacao(index) {
    listaLocalizacoes.splice(index, 1);
    renderLocalizacoes();
    updateLivePreview();
    triggerAutoSave();
}

function extrairLocalizacoesDaLista(texto) {
    const linhas = String(texto || '')
        .replace(/\r/g, '')
        .split('\n')
        .map(linha => linha.trim().replace(/^[-•]\s*/, ''))
        .filter(Boolean);
    const resultado = [];
    let atual = null;

    const salvarAtual = () => {
        if (!atual || !atual.enderecos.length) return;
        const endereco = atual.enderecos.join(', ').replace(/\s+/g, ' ').trim();
        if (endereco.length >= 6) {
            resultado.push({
                nome: atual.nome || endereco,
                endereco
            });
        }
        atual = null;
    };

    linhas.forEach(linha => {
        if (/^malha\s+geogr[aá]fica\b/i.test(linha)) return;

        const itemNumerado = linha.match(/^\d+\s*[.)-]\s*(.+)$/);
        if (itemNumerado) {
            salvarAtual();
            const nome = itemNumerado[1]
                .replace(/\s*[—–-]\s*endere[cç]o\s+principal.*$/i, '')
                .trim();
            atual = { nome, enderecos: [] };
        } else if (atual) {
            atual.enderecos.push(linha);
        }
    });
    salvarAtual();

    // Também aceita uma lista simples: um endereço completo em cada linha.
    if (!resultado.length) {
        linhas
            .filter(linha => !/^malha\s+geogr[aá]fica\b/i.test(linha))
            .forEach(endereco => resultado.push({ nome: endereco, endereco }));
    }

    const vistos = new Set();
    return resultado.filter(item => {
        const chave = item.endereco.toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ').trim();
        if (!chave || vistos.has(chave)) return false;
        vistos.add(chave);
        return true;
    });
}

function coordenadasJaAdicionadas(lat, lon) {
    const latitude = Number(lat);
    const longitude = Number(lon);
    return listaLocalizacoes.some(localizacao =>
        Math.abs(Number(localizacao.lat) - latitude) < 0.000001 &&
        Math.abs(Number(localizacao.lon) - longitude) < 0.000001
    );
}

function aguardar(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function abrirImportacaoLocalizacoes() {
    if (navigator.onLine === false) {
        showToast('A importação de endereços precisa de internet para localizar as coordenadas.', 'warning');
        return;
    }

    const resposta = await Swal.fire({
        title: 'Importar malha geográfica',
        input: 'textarea',
        inputPlaceholder: 'Cole aqui a lista de bairros e endereços.\n\n1. Vila Adelaide — Endereço principal\nRua Exemplo, 61 — Varginha/MG\n\n2. Jardim Petrópolis\nRua Exemplo, 999 — Varginha/MG',
        inputAttributes: { 'aria-label': 'Lista de localizações e endereços' },
        html: '<p style="margin:0; color:#64748b; line-height:1.5; font-size:13px;">O ExifRank reconhece listas numeradas como a da sua malha geográfica. Cada endereço será localizado e adicionado à ficha. A busca é feita uma por vez para garantir precisão.</p>',
        width: 680,
        showCancelButton: true,
        confirmButtonColor: '#059669',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'Reconhecer endereços',
        cancelButtonText: 'Cancelar',
        inputValidator: valor => {
            const itens = extrairLocalizacoesDaLista(valor);
            return itens.length ? undefined : 'Cole pelo menos um endereço completo para importar.';
        }
    });

    if (!resposta.isConfirmed) return;
    const itens = extrairLocalizacoesDaLista(resposta.value);
    const capacidade = hasPremiumAccess() ? Infinity : Math.max(0, 2 - listaLocalizacoes.length);
    if (itens.length > capacidade) {
        showPremiumBlocker(
            'Limite de Localizações',
            `A lista possui ${itens.length} localização(ões), mas o plano Gratuito permite até 2 por ficha. Assine o Premium para importar malhas geográficas sem limite.`
        );
        return;
    }

    const botao = document.getElementById('btn-importar-localizacoes');
    const conteudoOriginal = botao?.innerHTML;
    const possuiPrincipal = Boolean(
        document.getElementById('input-lat')?.value.trim() &&
        document.getElementById('input-lon')?.value.trim()
    );
    let adicionadas = 0;
    const naoEncontradas = [];
    const repetidas = [];

    if (botao) botao.disabled = true;
    try {
        for (let indice = 0; indice < itens.length; indice += 1) {
            const item = itens[indice];
            if (botao) botao.textContent = `Localizando ${indice + 1}/${itens.length}...`;
            try {
                const dados = await window.pywebview.api.buscar_gps(item.endereco);
                if (!dados || dados.erro || !Number.isFinite(Number(dados.lat)) || !Number.isFinite(Number(dados.lon))) {
                    naoEncontradas.push(item.nome);
                } else if (coordenadasJaAdicionadas(dados.lat, dados.lon)) {
                    repetidas.push(item.nome);
                } else {
                    listaLocalizacoes.push({
                        nome: item.nome,
                        lat: String(dados.lat),
                        lon: String(dados.lon)
                    });
                    adicionadas += 1;

                    if (!possuiPrincipal && adicionadas === 1) {
                        document.getElementById('input-endereco').value = item.endereco;
                        document.getElementById('input-lat').value = dados.lat;
                        document.getElementById('input-lon').value = dados.lon;
                    }
                }
            } catch (erro) {
                console.warn('Falha ao localizar endereço importado:', item.endereco, erro);
                naoEncontradas.push(item.nome);
            }

            // Evita disparar muitas consultas seguidas ao serviço de geocodificação.
            if (indice < itens.length - 1) await aguardar(1100);
        }
    } finally {
        if (botao) {
            botao.disabled = false;
            botao.innerHTML = conteudoOriginal;
        }
    }

    if (adicionadas) {
        renderLocalizacoes();
        updateLivePreview();
        triggerAutoSave();
    }

    const detalhes = [];
    if (naoEncontradas.length) detalhes.push(`${naoEncontradas.length} não localizada(s): ${naoEncontradas.slice(0, 3).join(', ')}${naoEncontradas.length > 3 ? '…' : ''}.`);
    if (repetidas.length) detalhes.push(`${repetidas.length} já constava(m) na malha.`);
    if (adicionadas) {
        showToast(`${adicionadas} localização(ões) adicionada(s).${detalhes.length ? ` ${detalhes.join(' ')}` : ''}`, naoEncontradas.length ? 'warning' : 'success');
    } else {
        showToast(detalhes.join(' ') || 'Nenhuma nova localização pôde ser adicionada.', 'warning');
    }
}
let saveTimeout = null;

// ==== FIREBASE INIT ====
const firebaseConfig = {
  apiKey: "AIzaSyASvV-eeNbziXUjmPvv2mkpzV8Kdl7l77s",
  authDomain: "exifrankapp.firebaseapp.com",
  projectId: "exifrankapp",
  storageBucket: "exifrankapp.firebasestorage.app",
  messagingSenderId: "357347824730",
  appId: "1:357347824730:web:58fa237653cb2162b13463",
  measurementId: "G-5GSE31PTD8"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();
const cloudFunctions = firebase.functions();

// Firebase Functions (produção - sem emulador)
const auth = firebase.auth();
let currentUser = null;
let currentUserToken = null;
let pendingExternalLogin = null;
let googleLoginTimeout = null;
let emailAuthFlowInProgress = false;
let offlinePremiumLicense = { isPremium: false, offline: false };
// Evita que um snapshot local antigo do Firestore esconda momentaneamente uma
// licença que acabou de ser confirmada pelo servidor nesta mesma sessão.
let awaitingFreshPremiumSnapshot = false;
// A confirmação da Callable Function é autoritativa. Mantemos esse estado
// apenas até recebermos o próximo snapshot do servidor para impedir que um
// cache local antigo volte a mostrar a oferta para uma conta Premium.
let claimedPremiumAccess = false;

const EXIFRANK_ADMIN_EMAILS = new Set([
    'lpresses17@gmail.com',
    'lprcampos17@gmail.com'
]);

function isAdministratorAccount(user = currentUser) {
    const email = typeof user?.email === 'string' ? user.email.trim().toLowerCase() : '';
    return EXIFRANK_ADMIN_EMAILS.has(email);
}

function hasPremiumAccess() {
    return isAdministratorAccount() || window.isUserPremium === true || claimedPremiumAccess === true || offlinePremiumLicense.isPremium === true;
}

function applyPremiumAvailabilityUI() {
    const premiumAvailable = hasPremiumAccess();
    const overlay = document.getElementById('premium-lock-overlay');
    const premiumCard = document.getElementById('premium-sidebar-card');
    const purchaseButtons = [
        document.getElementById('btn-assinar-premium'),
        document.getElementById('btn-assinar-premium-annual')
    ].filter(Boolean);
    if (premiumAvailable) {
        if (overlay) overlay.classList.add('hidden');
        if (premiumCard) premiumCard.classList.add('hidden');
        purchaseButtons.forEach((button) => button.classList.add('hidden'));
    }
}

async function refreshOfflineLicenseStatus(user) {
    if (!user?.uid || !window.pywebview?.api?.obter_status_licenca_offline) {
        offlinePremiumLicense = { isPremium: false, offline: false };
        return offlinePremiumLicense;
    }
    try {
        const hardwareId = await window.pywebview.api.obter_hardware_id();
        const status = await window.pywebview.api.obter_status_licenca_offline(user.uid, hardwareId);
        offlinePremiumLicense = status?.isPremium
            ? { ...status, isPremium: true, offline: true }
            : { isPremium: false, offline: false };
        if (offlinePremiumLicense.isPremium) {
            applyPremiumAvailabilityUI();
            setCloudSyncStatus('offline', `Premium disponível offline até ${new Date(offlinePremiumLicense.expiresAt).toLocaleDateString('pt-BR')}.`);
        }
    } catch (error) {
        console.warn('Não foi possível ler a licença offline:', error);
        offlinePremiumLicense = { isPremium: false, offline: false };
    }
    return offlinePremiumLicense;
}

function isNetworkFailure(error) {
    const code = String(error?.code || '').toLowerCase();
    const message = String(error?.message || error || '').toLowerCase();
    return code.includes('network') || code.includes('unavailable') ||
        message.includes('network') || message.includes('failed to fetch') ||
        message.includes('offline') || message.includes('unavailable');
}

function hasNativeFirebaseSession(user) {
    const nativeUser = firebase.auth().currentUser;
    return !!(
        nativeUser &&
        nativeUser.emailVerified === true &&
        user &&
        nativeUser.uid === user.uid
    );
}

function showAuthenticationNotice(message) {
    const errorMsg = document.getElementById('auth-error-msg');
    if (errorMsg) {
        errorMsg.innerText = message;
        errorMsg.classList.remove('hidden');
    } else {
        showToast(message, 'error');
    }
}

async function claimPremiumLicense() {
    if (!hasNativeFirebaseSession(currentUser)) return;
    return cloudFunctions.httpsCallable('claimPremiumLicense')({});
}

const LEGAL_DOCUMENTS_VERSION = window.EXIFRANK_LEGAL_DOCUMENTS?.version || "2026-08-24";

function setLegalAcceptanceModalVisible(visible) {
    const modal = document.getElementById("legal-acceptance-modal");
    if (!modal) return;
    modal.classList.toggle("hidden", !visible);
    modal.setAttribute("aria-hidden", visible ? "false" : "true");
}

function isCurrentLegalAcceptance(acceptance) {
    return acceptance?.termsVersion === LEGAL_DOCUMENTS_VERSION &&
        acceptance?.privacyVersion === LEGAL_DOCUMENTS_VERSION;
}

async function ensureLegalDocumentsAccepted(uid) {
    if (!uid || !hasNativeFirebaseSession(currentUser)) {
        setLegalAcceptanceModalVisible(false);
        return;
    }

    try {
        const snapshot = await db.collection("users").doc(uid).get();
        setLegalAcceptanceModalVisible(!isCurrentLegalAcceptance(snapshot.data()?.legalAcceptance));
    } catch (error) {
        // Na dúvida, não libera a interface sem conseguir confirmar o aceite.
        console.warn("Não foi possível verificar o aceite dos documentos:", error);
        setLegalAcceptanceModalVisible(true);
    }
}

window.openLegalDocument = function(kind) {
    const documents = window.EXIFRANK_LEGAL_DOCUMENTS;
    const documentData = documents?.[kind];
    const modal = document.getElementById("legal-document-modal");
    const title = document.getElementById("legal-document-title");
    const updatedAt = document.getElementById("legal-document-updated-at");
    const content = document.getElementById("legal-document-content");
    if (!documentData || !modal || !title || !updatedAt || !content) return;

    title.textContent = documentData.title;
    updatedAt.textContent = "Atualizado em " + documents.updatedAt;
    content.innerHTML = "<p class=\"legal-document-intro\">" + documentData.intro + "</p>" +
        documentData.sections.map(function(section) {
            return "<section class=\"legal-document-section\"><h4>" + section[0] + "</h4><p>" + section[1] + "</p></section>";
        }).join("") +
        "<p class=\"legal-document-contact\">Canal de suporte: <a href=\"mailto:" + documents.supportEmail + "\">" + documents.supportEmail + "</a></p>";

    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
};

window.closeLegalDocument = function() {
    const modal = document.getElementById("legal-document-modal");
    if (!modal) return;
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
};

window.acceptLegalDocuments = async function() {
    if (!hasNativeFirebaseSession(currentUser)) {
        showToast("Entre e confirme seu e-mail antes de aceitar os documentos.", "error");
        return;
    }

    const checkbox = document.getElementById("legal-acceptance-checkbox");
    const button = document.getElementById("legal-acceptance-button");
    const feedback = document.getElementById("legal-acceptance-feedback");
    if (!checkbox?.checked) {
        if (feedback) feedback.textContent = "Marque a caixa para confirmar que leu e aceita os documentos.";
        return;
    }

    if (feedback) feedback.textContent = "";
    if (button) {
        button.disabled = true;
        button.textContent = "Registrando aceite...";
    }

    try {
        await cloudFunctions.httpsCallable("acceptLegalDocuments")({
            termsVersion: LEGAL_DOCUMENTS_VERSION,
            privacyVersion: LEGAL_DOCUMENTS_VERSION
        });
        setLegalAcceptanceModalVisible(false);
        showToast("Termos e Política de Privacidade aceitos.", "success");
    } catch (error) {
        console.error("Falha ao registrar o aceite dos documentos:", error);
        if (feedback) {
            feedback.textContent = getFriendlyErrorMessage(
                error,
                "Não foi possível registrar seu aceite agora. Aguarde alguns instantes e tente novamente."
            );
        }
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = "Aceitar e continuar";
        }
    }
};

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
        setCloudSyncStatus('syncing');
        refreshOfflineLicenseStatus(user);
        refreshGoogleLinkButton(user);
        
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
            if (isAdministratorAccount(user)) adminBtn.classList.remove("hidden");
            else adminBtn.classList.add("hidden");
        }

        // O backend concede Premium às contas administrativas. Refletimos a
        // mesma regra imediatamente no layout, inclusive se o Firestore ainda
        // estiver entregando um snapshot antigo ou a rede oscilar.
        if (isAdministratorAccount(user)) {
            window.isUserPremium = true;
            claimedPremiumAccess = true;
            applyPremiumAvailabilityUI();
        }
        
        // A Function é a única responsável pelo perfil e pela licença.
        if (hasNativeFirebaseSession(user)) {
            claimPremiumLicense()
                .then((result) => {
                    // A Function calcula a licença diretamente no servidor e
                    // grava o perfil antes de responder. Aplicamos esse retorno
                    // já na interface para que contas Premium nunca vejam uma
                    // oferta enquanto o listener do Firestore se atualiza.
                    if (result?.data?.isPremium === true) {
                        window.isUserPremium = true;
                        claimedPremiumAccess = true;
                        awaitingFreshPremiumSnapshot = true;
                        applyPremiumAvailabilityUI();
                    }
                    setCloudSyncStatus('ok');
                    if (typeof checkPremiumStatus === 'function') checkPremiumStatus(user.uid);
                    ensureLegalDocumentsAccepted(user.uid);
                })
                .catch(e => {
                    if (offlinePremiumLicense.isPremium) {
                        setCloudSyncStatus('offline', `Premium disponível offline até ${new Date(offlinePremiumLicense.expiresAt).toLocaleDateString('pt-BR')}.`);
                    } else {
                        setCloudSyncStatus('error', getFriendlyErrorMessage(e, 'Não foi possível sincronizar a licença.'));
                    }
                    console.warn("Não foi possível sincronizar a licença neste momento:", e);
                    if (typeof checkPremiumStatus === 'function') checkPremiumStatus(user.uid);
                    ensureLegalDocumentsAccepted(user.uid);
                });
        } else {
            setCloudSyncStatus('error', 'A sessão não foi validada pelo Firebase.');
            setLegalAcceptanceModalVisible(false);
            showAuthenticationNotice('Confirme seu e-mail e entre novamente para continuar.');
        }
        
        // Iniciar Tour automático se nunca foi feito
        if (localStorage.getItem('tour_v1_0_13') !== 'done' && !window.tourQueued) {
            window.tourQueued = true;
            setTimeout(() => {
                if(typeof startAppTour === 'function') startAppTour('light');
            }, 1000);
        }
    } else {
        offlinePremiumLicense = { isPremium: false, offline: false };
        window.isUserPremium = false;
        claimedPremiumAccess = false;
        awaitingFreshPremiumSnapshot = false;
        if(mandatoryOverlay) mandatoryOverlay.classList.remove("hidden");
        document.getElementById("auth-unlogged").classList.remove("hidden");
        document.getElementById("auth-logged").classList.add("hidden");
        
        // Reset state so that project view is clear after logout
        projetosDB = [];

        currentProject = null;
        if(typeof renderProjectView === 'function') renderProjectView();
        if(typeof renderClientsList === 'function') renderClientsList();
        if(typeof renderProjectsList === 'function') renderProjectsList();
        
        const adminBtn = document.getElementById("menu-adminPanel");
        if (adminBtn) adminBtn.classList.add("hidden");
        const premiumCard = document.getElementById("premium-sidebar-card");
        if (premiumCard) premiumCard.classList.add("hidden");
        
        if (typeof unsubscribePremium !== 'undefined' && unsubscribePremium) {
            unsubscribePremium();
            unsubscribePremium = null;
        }
        const overlay = document.getElementById("premium-lock-overlay");
        if (overlay) overlay.classList.remove("hidden");
        setLegalAcceptanceModalVisible(false);
        refreshGoogleLinkButton(null);
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
    } else if (status === 'offline') {
        el.className = "text-[9px] text-amber-600 font-medium truncate flex items-center gap-1";
        el.innerHTML = `<svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 5.636a9 9 0 10.001 12.728M18 9v-4h4M6 15l12-12"></path></svg> Modo Offline Seguro`;
        el.title = errorMsg;
    } else if (status === 'error') {
        el.className = "text-[9px] text-rose-500 font-medium truncate flex items-center gap-1";
        el.innerHTML = `<svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg> Falha na Nuvem`;
        el.title = errorMsg;
    }
}

function setGoogleLoginState(isPending) {
    const button = document.getElementById('auth-google-button');
    const label = document.getElementById('auth-google-button-label');
    const cancel = document.getElementById('auth-google-cancel');
    if (button) button.disabled = isPending;
    if (label) label.textContent = isPending ? 'Aguardando no navegador...' : 'Acessar com Google';
    if (cancel) cancel.classList.toggle('hidden', !isPending);

    const linkButton = document.getElementById('btn-vincular-google');
    const linkCancel = document.getElementById('btn-cancelar-vinculo-google');
    if (linkButton && isPending) {
        linkButton.disabled = true;
        linkButton.textContent = 'Aguardando Google...';
    }
    if (linkCancel) linkCancel.classList.toggle('hidden', !isPending || !currentUser);
}

function refreshGoogleLinkButton(user = currentUser) {
    const button = document.getElementById('btn-vincular-google');
    const description = document.getElementById('google-link-description');
    if (!button || !description) return;

    const providers = Array.isArray(user?.providerData)
        ? user.providerData.map(provider => provider?.providerId)
        : [];
    const hasGoogle = providers.includes('google.com');
    const hasPassword = providers.includes('password');

    if (!user || hasGoogle || !hasPassword) {
        button.classList.add('hidden');
        button.disabled = false;
        button.textContent = 'Conectar Google';
        description.textContent = hasGoogle
            ? 'Sua conta Google já está conectada a este acesso.'
            : 'Use o método de entrada associado à sua conta.';
        return;
    }

    button.classList.remove('hidden');
    button.disabled = false;
    button.textContent = 'Conectar Google';
    description.textContent = 'Conecte o Google para também entrar sem digitar sua senha.';
}

function clearPendingGoogleLogin() {
    pendingExternalLogin = null;
    if (googleLoginTimeout) {
        clearTimeout(googleLoginTimeout);
        googleLoginTimeout = null;
    }
    setGoogleLoginState(false);
    refreshGoogleLinkButton();
}

function googleLoginMessage(error) {
    const code = String(error?.code || '').toLowerCase();
    if (code === 'auth/account-exists-with-different-credential') {
        return 'Este e-mail já possui acesso por e-mail e senha. Entre com sua senha e conecte o Google em Configurações.';
    }
    if (code === 'auth/credential-already-in-use') {
        return 'Esta conta Google já está conectada a outro acesso ExifRank. Entre pelo método usado nessa conta ou fale com o suporte.';
    }
    if (code === 'auth/popup-closed-by-user') {
        return 'O login com Google foi cancelado.';
    }
    if (code === 'auth/popup-blocked') {
        return 'O navegador bloqueou a abertura do Google. Permita a abertura e tente novamente.';
    }
    return getFriendlyErrorMessage(error, 'Não foi possível concluir o login com Google. Tente novamente.');
}

function beginGoogleLogin(mode = 'signin', customToken = '') {
    if (pendingExternalLogin) {
        showAuthenticationNotice('Já existe uma tentativa de login em andamento. Conclua-a ou cancele para tentar novamente.');
        return false;
    }

    const bytes = new Uint8Array(32);
    window.crypto.getRandomValues(bytes);
    const state = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
    pendingExternalLogin = { state, mode };
    setGoogleLoginState(true);

    const params = new URLSearchParams({ state, mode });
    if (customToken) params.set('customToken', customToken);
    const popup = window.open(
        "http://127.0.0.1:45321/auth_popup.html#" + params.toString(),
        "_blank",
        "noopener,noreferrer"
    );

    if (!popup && !window.pywebview?.api) {
        clearPendingGoogleLogin();
        showAuthenticationNotice('O navegador bloqueou a abertura do Google. Permita a abertura e tente novamente.');
        return false;
    }

    googleLoginTimeout = setTimeout(() => {
        if (pendingExternalLogin?.state === state) {
            clearPendingGoogleLogin();
            const message = 'Não recebemos a confirmação do Google. Verifique a janela do navegador e tente novamente.';
            if (currentUser) showToast(message, 'warning');
            else showAuthenticationNotice(message);
        }
    }, 5 * 60 * 1000);
    return true;
}

function loginGoogle() {
    beginGoogleLogin();
}

async function vincularGoogle() {
    if (!hasNativeFirebaseSession(currentUser)) {
        showToast('Entre com e-mail e senha antes de conectar o Google.', 'warning');
        return;
    }

    const button = document.getElementById('btn-vincular-google');
    if (button) {
        button.disabled = true;
        button.textContent = 'Preparando conexão...';
    }
    try {
        const result = await cloudFunctions.httpsCallable('createGoogleLinkToken')({});
        const customToken = result?.data?.customToken;
        if (!customToken || typeof customToken !== 'string') {
            throw new Error('Não foi possível preparar a conexão com Google.');
        }
        if (!beginGoogleLogin('link', customToken)) refreshGoogleLinkButton();
    } catch (error) {
        showFriendlyError('Falha ao preparar vínculo Google:', error, 'Não foi possível preparar a conexão com Google. Tente novamente.');
        refreshGoogleLinkButton();
    }
}

function cancelarLoginGoogle() {
    if (!pendingExternalLogin) return;
    clearPendingGoogleLogin();
    if (currentUser) showToast('A tentativa de login com Google foi cancelada.', 'info');
    else showAuthenticationNotice('A tentativa de login com Google foi cancelada.');
}

// Chamada pelo servidor Python quando o navegador externo completa o login.
// A sessão é criada com APIs públicas do Firebase Auth, sem tocar no IndexedDB.
window.completeExternalLogin = async function(jsonStr) {
    try {
        const userData = JSON.parse(jsonStr);
        const pending = pendingExternalLogin;
        if (!pending || userData.state !== pending.state) {
            throw new Error("Resposta de login não corresponde à solicitação atual.");
        }
        if (userData.errorCode) {
            const externalError = new Error('Falha informada pelo Google.');
            externalError.code = userData.errorCode;
            throw externalError;
        }
        if (!userData.customToken || typeof userData.customToken !== 'string') {
            throw new Error('Sessão Google incompleta recebida do navegador.');
        }

        await firebase.auth().signInWithCustomToken(userData.customToken);
        clearPendingGoogleLogin();
    } catch (error) {
        const message = googleLoginMessage(error);
        console.error('Falha ao processar o login externo:', error);
        clearPendingGoogleLogin();
        if (currentUser) showToast(message, 'error');
        else showAuthenticationNotice(message);
    }
};

async function logoutGoogle() {
    clearPendingGoogleLogin();
    currentUser = null;
    currentUserToken = null;
    await window.pywebview.api.limpar_sessao();
    try { await firebase.auth().signOut(); } catch(e) {}
    updateAuthUI(null);
    showToast("Logout realizado. Seus projetos locais foram preservados.", "success");
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
    // Remove o arquivo legado que guardava token em texto puro.
    try { await window.pywebview.api.limpar_sessao(); } catch(e) {}
    
    // Iniciar Auth State nativo do Firebase
    // Com private_mode=False, o Firebase persiste a sessão via IndexedDB automaticamente
    firebase.auth().onAuthStateChanged(async (user) => {
        if (user) {
            try {
                await user.reload();
                const verifiedUser = firebase.auth().currentUser;
                if (!verifiedUser || verifiedUser.emailVerified !== true) {
                    if (emailAuthFlowInProgress) return;
                    await firebase.auth().signOut();
                    currentUser = null;
                    currentUserToken = null;
                    updateAuthUI(null);
                    showAuthenticationNotice('Confirme o e-mail enviado para sua caixa de entrada antes de entrar.');
                    return;
                }
                currentUser = verifiedUser;
                currentUserToken = await verifiedUser.getIdToken();
                updateAuthUI(verifiedUser);
            } catch (e) {
                // Uma sessão já confirmada pode continuar localmente quando a conexão cair.
                // Não renovamos credenciais offline; apenas permitimos o uso do cache seguro de licença.
                if (user.emailVerified === true && isNetworkFailure(e)) {
                    currentUser = user;
                    currentUserToken = null;
                    updateAuthUI(user);
                    refreshOfflineLicenseStatus(user);
                    setCloudSyncStatus('offline', 'Sem conexão. Recursos locais continuam disponíveis.');
                } else {
                    currentUser = null;
                    currentUserToken = null;
                    try { await firebase.auth().signOut(); } catch(_) {}
                    updateAuthUI(null);
                    showAuthenticationNotice('Não foi possível validar sua sessão. Entre novamente.');
                }
            }
        } else {
            currentUser = null;
            currentUserToken = null;
            updateAuthUI(null);
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

    let projectsStorageKey = "geoRankerProjetos_" + uid;
    let pStr = localStorage.getItem(projectsStorageKey);
    let cStr = localStorage.getItem("geoRankerClientes_" + uid);

    if (!pStr && !cStr && localStorage.getItem("migrationDone_" + uid) !== "true") {
        const oldPStr = localStorage.getItem("geoRankerProjetos");
        const oldCStr = localStorage.getItem("geoRankerClientes");
        if (oldPStr || oldCStr) {
            pStr = oldPStr;
            cStr = oldCStr;
            projectsStorageKey = "geoRankerProjetos";
        }
        localStorage.setItem("migrationDone_" + uid, "true");
    }

    if(pStr) {
        projetosDB = parseStoredJson(
            pStr,
            projectsStorageKey,
            [],
            'Os projetos salvos neste dispositivo',
            Array.isArray
        );
    }
}

function persistLocalDB() {
    if(!currentUser) return;
    localStorage.setItem("geoRankerProjetos_" + currentUser.uid, JSON.stringify(projetosDB));
}

function setupAutoSaveListeners() {
    const inputs = ['input-empresa', 'input-telefone', 'input-endereco', 'input-titulo', 'input-desc', 'input-pasta'];
    inputs.forEach(id => {
        const el = document.getElementById(id);
        if(el) {
            el.addEventListener('input', () => {
                updateLivePreview();
                updateMetadataCounters();
                triggerAutoSave();
            });
        }
    });
    updateMetadataCounters();
}

function updateMetadataCounters() {
    const keywordsInput = document.getElementById('input-titulo');
    const descriptionInput = document.getElementById('input-desc');
    const keywordsCounter = document.getElementById('metadata-keyword-count');
    const descriptionCounter = document.getElementById('metadata-description-count');

    if (keywordsCounter) {
        const count = (keywordsInput?.value || '')
            .split(',')
            .map(term => term.trim())
            .filter(Boolean)
            .length;
        keywordsCounter.textContent = `${count} palavra${count === 1 ? '' : 's'}-chave`;
    }
    if (descriptionCounter) {
        const count = (descriptionInput?.value || '').trim().length;
        descriptionCounter.textContent = `${count} caractere${count === 1 ? '' : 's'}`;
    }
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
    projetosDB[pIndex].localizacoes = JSON.parse(JSON.stringify(listaLocalizacoes));
    projetosDB[pIndex].step = currentStep;
    projetosDB[pIndex].updatedAt = new Date().toISOString();

    persistLocalDB();
    
    if(currentUser) {
        try {
            setCloudSyncStatus('syncing');
            await db.collection("users").doc(currentUser.uid).collection("projetos").doc(currentProjectId).set(projetosDB[pIndex]);
            setCloudSyncStatus('ok');
        } catch(e) {
            setCloudSyncStatus('error', getFriendlyErrorMessage(e, 'Não foi possível sincronizar o projeto.'));
            const text = document.getElementById("autosave-text");
            if(text) text.innerText = "Salvo localmente";
        }
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
        const savedConfig = parseStoredJson(
            saved,
            "geoRankerConfig",
            {},
            'As configurações',
            value => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
        );
        appConfig = Object.assign(appConfig, savedConfig);
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
    if (!hasPremiumAccess() && projetosDB.length >= 1) {
        showPremiumBlocker('Limite de Projetos', 'O plano Gratuito permite ter apenas 1 projeto. Assine o Premium para criar projetos ilimitados para todos os seus clientes!');
        return;
    }
    const name = document.getElementById("input-new-project-name").value.trim();

    
    if(!name) {
        showToast("Digite o nome do projeto.", "error");
        return;
    }
    
    const newProj = {
        id: "proj_" + Date.now() + Math.random().toString(36).substring(2, 7),
        nomeProjeto: name,
        // O nome informado na criação normalmente é o cliente. Mantê-lo aqui
        // evita que o usuário tenha de preencher a identidade duas vezes.
        empresa: name, telefone: "", endereco: "", lat: "", lon: "", titulo: "", desc: "", pasta: "", step: 1,
        localizacoes: [], clientLogo: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    

    
    projetosDB.push(newProj);
    persistLocalDB();
    
    if(currentUser) {
        setCloudSyncStatus('syncing');
        db.collection("users").doc(currentUser.uid).collection("projetos").doc(newProj.id).set(newProj)
            .then(() => setCloudSyncStatus('ok'))
            .catch(e => setCloudSyncStatus('error', getFriendlyErrorMessage(e, 'Não foi possível sincronizar o projeto.')));
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
    updateClientLogoPreview(p.clientLogo || '');
    updateMetadataCounters();
    
    // Limpar explicitamente a memória
    listaLocalizacoes = [];
    if (p.localizacoes && Array.isArray(p.localizacoes)) {
        listaLocalizacoes = JSON.parse(JSON.stringify(p.localizacoes));
    }
    renderLocalizacoes();
    
    document.getElementById("upload-feedback").classList.add("hidden");
    renderProjectMediaStats(p.mediaStats);
    if (!p.mediaStats && p.pasta) refreshProjectMediaStatsFromFolder(p);
    
    updateLivePreview();
    switchView('app');
    updateUI();
}

function switchView(viewName) {
    const views = ['app', 'projects', 'history', 'settings', 'adminPanel', 'help'];
    views.forEach(v => {
        const el = document.getElementById('view-' + v);
        if(el) el.classList.add('hidden');
    });
    
    const target = document.getElementById('view-' + viewName);
    if(target) target.classList.remove('hidden');
    
    document.querySelectorAll('aside nav button').forEach(btn => {
        btn.classList.remove('bg-emerald-50', 'text-emerald-600', 'font-bold');
        if(btn.id !== 'menu-app' && btn.id !== 'btn-assinar-premium') {
            btn.classList.add('text-slate-500');
        }
    });
    
    const activeBtn = document.getElementById('menu-' + viewName);
    if(activeBtn && viewName !== 'app') {
        activeBtn.classList.remove('text-slate-500');
        activeBtn.classList.add('bg-emerald-50', 'text-emerald-600', 'font-bold');
    }
    
    if(viewName === 'projects') {
        currentProjectId = null;
    }
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
        if (!isOptimizing) {
            document.getElementById("btn-cancelar")?.classList.add("hidden");
        }
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
function setProjectSummaryVisible(visible) {
    const panel = document.getElementById('project-summary-panel');
    if (panel) panel.classList.toggle('hidden', !visible);
}

function renderProjectMediaStats(mediaStats) {
    const stats = mediaStats && typeof mediaStats === 'object' ? mediaStats : {};
    const total = Number(stats.total) || 0;
    const images = Number(stats.images) || 0;
    const videos = Number(stats.videos) || 0;
    const estimatedSeconds = Number(stats.estimatedSeconds) || 0;

    const totalEl = document.getElementById('preview-total-files');
    const imagesEl = document.getElementById('preview-images');
    const videosEl = document.getElementById('preview-videos');
    const timeEl = document.getElementById('preview-time');

    if (totalEl) totalEl.textContent = String(total);
    if (imagesEl) imagesEl.textContent = String(images);
    if (videosEl) videosEl.textContent = String(videos);
    if (timeEl) {
        if (stats.lastProcessingDurationSeconds) {
            timeEl.textContent = `Concluído em ${formatProcessingDuration(stats.lastProcessingDurationSeconds)}`;
        } else if (estimatedSeconds > 0) {
            timeEl.textContent = `~${formatProcessingDuration(estimatedSeconds)}`;
        } else {
            timeEl.textContent = '--';
        }
    }
}

function persistProjectMediaStats(mediaStats) {
    if (!currentProjectId) return;
    const project = projetosDB.find(item => item.id === currentProjectId);
    if (!project) return;

    project.mediaStats = { ...mediaStats, updatedAt: new Date().toISOString() };
    project.updatedAt = new Date().toISOString();
    persistLocalDB();

    if (currentUser) {
        db.collection('users').doc(currentUser.uid).collection('projetos').doc(currentProjectId)
            .set({ mediaStats: project.mediaStats, updatedAt: project.updatedAt }, { merge: true })
            .catch(error => console.warn('Não foi possível sincronizar as estatísticas do projeto:', error));
    }
}

async function refreshProjectMediaStatsFromFolder(project) {
    if (!project?.id || !project.pasta || !window.pywebview?.api?.obter_resumo_pasta) return;

    try {
        const summary = await window.pywebview.api.obter_resumo_pasta(project.pasta);
        if (summary?.erro || currentProjectId !== project.id) return;

        const estimatedSeconds = summary.estimated_seconds ?? Math.round((summary.jpg + summary.png) * 0.5 + summary.video * 3);
        const mediaStats = {
            total: summary.total,
            images: Number(summary.images ?? (summary.jpg + summary.png)),
            videos: Number(summary.video || 0),
            estimatedSeconds,
            totalBytes: summary.total_bytes || 0
        };
        persistProjectMediaStats(mediaStats);
        renderProjectMediaStats(mediaStats);
    } catch (error) {
        console.warn('Não foi possível restaurar as estatísticas da pasta:', error);
    }
}

function markCurrentProjectAsOptimized() {
    if (!currentProjectId) return;
    const project = projetosDB.find(item => item.id === currentProjectId);
    if (!project) return;

    const currentStats = project.mediaStats || {};
    const startedAt = optimizationStartedAt || Date.now();
    const elapsedSeconds = Math.max(1, Math.floor((Date.now() - startedAt) / 1000));
    const updatedStats = {
        ...currentStats,
        lastProcessingDurationSeconds: elapsedSeconds,
        optimizedAt: new Date().toISOString()
    };
    persistProjectMediaStats(updatedStats);
    renderProjectMediaStats(updatedStats);
}

function updateLivePreview() {
    const selectedProject = currentProjectId && projetosDB.some(project => project.id === currentProjectId);
    setProjectSummaryVisible(Boolean(selectedProject));
    if (!selectedProject) return;

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
function formatProcessingDuration(totalSeconds) {
    const seconds = Math.max(0, Math.round(Number(totalSeconds) || 0));
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return remainingSeconds ? `${minutes}min ${remainingSeconds}s` : `${minutes}min`;
}

async function selecionarPasta() {
    try {
        let pasta = await window.pywebview.api.selecionar_pasta();
        if(pasta) {
            const inputPasta = document.getElementById("input-pasta");
            const pastaAnterior = inputPasta.value;
            inputPasta.value = pasta;
            const feedback = document.getElementById("upload-feedback");
            const stats = document.getElementById("upload-stats");
            
            feedback.classList.remove("hidden");
            stats.innerText = "Analisando pasta...";
            
            const res = await window.pywebview.api.obter_resumo_pasta(pasta);
            if(res.erro) {
                // Esta resposta vem do motor local e já contém uma orientação
                // segura e específica (por exemplo, pasta de resultados já
                // otimizada). Não a substitua por um aviso genérico.
                inputPasta.value = pastaAnterior;
                if (!pastaAnterior) feedback.classList.add("hidden");
                showToast(String(res.erro), "warning");
                return;
            } else {
                if (!hasPremiumAccess() && currentUser) await refreshOfflineLicenseStatus(currentUser);
                if (!hasPremiumAccess() && res.total > 20) {
                    showPremiumBlocker('Limite de Arquivos', `O plano Gratuito permite processar no máximo 20 mídias por vez. A pasta selecionada possui ${res.total} arquivos. Assine o Premium para fazer envios ilimitados!`);
                    document.getElementById("input-pasta").value = "";
                    feedback.classList.add("hidden");
                    return;
                }
                
                const estimatedSec = res.estimated_seconds ?? Math.round((res.jpg + res.png) * 0.5 + res.video * 3);
                const mediaStats = {
                    total: res.total,
                    images: Number(res.images ?? (res.jpg + res.png)),
                    videos: Number(res.video || 0),
                    estimatedSeconds: estimatedSec,
                    totalBytes: res.total_bytes || 0
                };
                stats.innerText = `${res.total} arquivos (Pronto)`;
                persistProjectMediaStats(mediaStats);
                renderProjectMediaStats(mediaStats);
                if (Number(res.itens_inacessiveis || 0) > 0) {
                    showToast(`Mídias detectadas. ${res.itens_inacessiveis} item(ns) não puderam ser lidos pelo Windows.`, "warning");
                } else {
                    showToast("Mídias detectadas com sucesso!", "success");
                }
                triggerAutoSave();
            }
        }
    } catch (e) {
        showFriendlyError("Falha ao analisar a pasta:", e, "Não foi possível analisar a pasta selecionada.");
    }
}

async function buscarGPS() {
    const endereco = document.getElementById("input-endereco").value;
    if(!endereco) {
        showToast("Digite um endereço para buscar.", "error");
        return;
    }
    if (navigator.onLine === false) {
        showToast("A busca de endereço precisa de internet. Você ainda pode usar localizações já salvas.", "warning");
        return;
    }
    
    const btn = document.getElementById("btn-gps");
    btn.innerText = "...";
    btn.disabled = true;

    try {
        const res = await window.pywebview.api.buscar_gps(endereco);
        if(res.erro) {
            showToast(getFriendlyErrorMessage(res.erro, "Não foi possível localizar esse endereço. Confira os dados e tente novamente."), "error");
        } else {
            document.getElementById("input-lat").value = res.lat;
            document.getElementById("input-lon").value = res.lon;
            showToast("Localização encontrada!", "success");
            updateLivePreview();
            triggerAutoSave();
        }
    } catch (e) {
        showFriendlyError("Falha ao buscar coordenadas:", e, "Não foi possível localizar esse endereço. Verifique sua internet e tente novamente.");
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
    if (navigator.onLine === false) {
        showToast("A geração de textos por IA precisa de internet. Revise ou preencha os textos manualmente.", "warning");
        return;
    }

    const btn = document.getElementById("btn-ia");
    btn.innerHTML = "⏳ Gerando...";
    btn.disabled = true;

    try {
        const res = await window.pywebview.api.gerar_com_ia(nicho, empresa, telefone, endereco);
        
        if(res.erro) {
            showToast(getFriendlyErrorMessage(res.erro, "Não foi possível gerar os textos agora. Verifique sua chave de IA e tente novamente."), "error");
        } else {
            document.getElementById("input-titulo").value = res.palavras;
            document.getElementById("input-desc").value = res.descricao;
            updateMetadataCounters();
            triggerAutoSave();
            showToast("Metadados otimizados gerados!", "success");
        }
    } catch (e) {
        showFriendlyError("Falha ao gerar textos com IA:", e, "Não foi possível gerar os textos agora. Verifique sua conexão e tente novamente.");
    } finally {
        btn.innerHTML = `<svg class="w-4 h-4 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg> Gerar Textos`;
        btn.disabled = false;
    }
}

let isOptimizing = false;
let optimizationStartedAt = null;
let optimizationTimer = null;
let optimizationPausedAt = null;
let isCancelConfirmationOpen = false;

function updateOptimizationElapsedTime() {
    if (!optimizationStartedAt) return;
    const elapsedSeconds = Math.floor((Date.now() - optimizationStartedAt) / 1000);
    const previewTime = document.getElementById('preview-time');
    if (previewTime) previewTime.textContent = `Em andamento: ${formatProcessingDuration(elapsedSeconds)}`;
}

function startOptimizationTimer() {
    optimizationStartedAt = Date.now();
    optimizationPausedAt = null;
    clearInterval(optimizationTimer);
    updateOptimizationElapsedTime();
    optimizationTimer = setInterval(updateOptimizationElapsedTime, 1000);
}

function pauseOptimizationTimer() {
    if (!optimizationStartedAt || optimizationPausedAt) return;
    optimizationPausedAt = Date.now();
    clearInterval(optimizationTimer);
    optimizationTimer = null;
}

function resumeOptimizationTimer() {
    if (!optimizationStartedAt || !optimizationPausedAt) return;
    optimizationStartedAt += Date.now() - optimizationPausedAt;
    optimizationPausedAt = null;
    updateOptimizationElapsedTime();
    clearInterval(optimizationTimer);
    optimizationTimer = setInterval(updateOptimizationElapsedTime, 1000);
}

function stopOptimizationTimer(finalStatus) {
    clearInterval(optimizationTimer);
    optimizationTimer = null;
    if (!optimizationStartedAt) return;

    const endTime = optimizationPausedAt || Date.now();
    const elapsedSeconds = Math.floor((endTime - optimizationStartedAt) / 1000);
    optimizationStartedAt = null;
    optimizationPausedAt = null;
    const previewTime = document.getElementById('preview-time');
    if (!previewTime) return;

    if (finalStatus === 'completed') {
        previewTime.textContent = `Concluído em ${formatProcessingDuration(elapsedSeconds)}`;
    } else if (finalStatus === 'cancelled') {
        previewTime.textContent = `Cancelado após ${formatProcessingDuration(elapsedSeconds)}`;
    } else if (finalStatus === 'error') {
        previewTime.textContent = `Interrompido após ${formatProcessingDuration(elapsedSeconds)}`;
    }
}

function buildProcessingLocations() {
    const savedLocations = Array.isArray(listaLocalizacoes)
        ? listaLocalizacoes.map(location => ({ ...location }))
        : [];
    const address = document.getElementById('input-endereco')?.value.trim() || '';
    const latitude = document.getElementById('input-lat')?.value.trim() || '';
    const longitude = document.getElementById('input-lon')?.value.trim() || '';

    if ((latitude && !longitude) || (!latitude && longitude)) {
        return { error: 'Informe latitude e longitude da localização antes de iniciar.' };
    }

    if (latitude && longitude) {
        const alreadyAdded = savedLocations.some(location =>
            String(location.lat).trim() === latitude && String(location.lon).trim() === longitude
        );
        if (!alreadyAdded) {
            savedLocations.push({
                nome: address || document.getElementById('input-empresa')?.value.trim() || 'Localização principal',
                lat: latitude,
                lon: longitude
            });
        }
    }

    if (!savedLocations.length) {
        return { error: 'Adicione ao menos uma localização. Digite o endereço, clique em Detectar e depois em Adicionar Localização.' };
    }

    for (const location of savedLocations) {
        const lat = Number(String(location.lat).replace(',', '.'));
        const lon = Number(String(location.lon).replace(',', '.'));
        if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
            return { error: `Revise as coordenadas de "${location.nome || 'uma localização'}" antes de iniciar.` };
        }
    }

    return { locations: savedLocations };
}

function renderOrganizationPreview(preview) {
    const distribution = Array.isArray(preview?.distribuicao) ? preview.distribuicao : [];
    const rows = distribution.map(item => `
        <li class="flow-distribution-row">
            <span class="flow-distribution-count">${escapeHtml(item.quantidade)}</span>
            <div class="flow-distribution-copy">
                <span class="flow-distribution-source">${escapeHtml(item.bloco === 'Geral' ? 'Arquivos da pasta selecionada' : item.bloco)}</span>
                <span class="flow-distribution-destination">${escapeHtml(item.localizacao)}</span>
            </div>
        </li>
    `).join('');
    return `
        <div class="flow-confirmation">
            <div class="flow-confirmation-intro">
                <div class="flow-confirmation-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="m5 12 4 4L19 6"/></svg>
                </div>
                <div>
                    <strong>Pronto para organizar com segurança</strong>
                    <p>Os arquivos originais não serão alterados. O ExifRank criará cópias otimizadas em uma nova pasta.</p>
                </div>
            </div>
            <div class="flow-confirmation-metrics">
                <span><b>${escapeHtml(preview?.total || 0)}</b> mídias</span>
                <span><b>${escapeHtml(distribution.length)}</b> destino${distribution.length === 1 ? '' : 's'}</span>
            </div>
            <div class="flow-output-folder">
                <span>PASTA DE RESULTADOS</span>
                <strong>ExifRank - Otimizadas</strong>
            </div>
            <p class="flow-distribution-heading">Distribuição planejada</p>
            <ul class="flow-distribution-list">${rows || '<li class="flow-empty-state">Nenhuma mídia elegível encontrada.</li>'}</ul>
        </div>
    `;
}

async function escolherDistribuicaoGeografica(preview, locations) {
    const blocos = Array.isArray(preview?.blocos) ? preview.blocos : [];
    if (locations.length < 2) {
        return { modoDistribuicao: 'automatico', mapeamentoPastas: {} };
    }

    const opcoes = locations.map((location, index) =>
        `<option value="${index}">${escapeHtml(location.nome || `Localização ${index + 1}`)}</option>`
    ).join('');
    const blocosDisponiveis = blocos.length ? blocos : [{
        id: 'Geral',
        nome: 'Arquivos na pasta principal',
        quantidade: Number(preview?.total || 0)
    }];
    const linhas = blocosDisponiveis.map((bloco, index) => `
        <label style="display:grid; grid-template-columns:minmax(0, 1fr) 210px; align-items:center; gap:12px; padding:10px 0; border-bottom:1px solid #e2e8f0; text-align:left;">
            <span style="min-width:0; color:#334155; font-size:13px; line-height:1.35;">
                <strong style="display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(bloco.nome)}</strong>
                <small style="color:#64748b;">${Number(bloco.quantidade) || 0} mídia(s)</small>
            </span>
            <select data-bloco-index="${index}" style="width:100%; border:1px solid #cbd5e1; border-radius:8px; padding:8px; color:#0f172a; background:#fff;">${opcoes}</select>
        </label>
    `).join('');

    while (true) {
        const escolha = await Swal.fire({
            title: 'Qual endereço usar nas fotos e vídeos?',
            html: `
                <p style="margin:0 0 14px; color:#475569; line-height:1.5;">Escolha qual endereço será associado aos arquivos. Isso ajuda a identificar de qual região as fotos e vídeos são.</p>
                <div style="display:grid; gap:10px; text-align:left;">
                    <label style="display:flex; gap:11px; align-items:flex-start; padding:13px; border:1px solid #a7f3d0; border-radius:12px; background:#ecfdf5; cursor:pointer;">
                        <input type="radio" name="modo-distribuicao" value="automatico" checked style="margin-top:4px; accent-color:#059669;">
                        <span>
                            <strong style="display:block; color:#065f46; font-size:14px;">Dividir as mídias entre todos os endereços</strong>
                            <small style="display:block; margin-top:4px; color:#047857; line-height:1.45; font-size:12px;">Recomendado para criar uma pasta por localização. O app distribui as fotos e vídeos de forma equilibrada entre todos os endereços cadastrados.</small>
                        </span>
                    </label>
                    <label style="display:flex; gap:11px; align-items:flex-start; padding:13px; border:1px solid #cbd5e1; border-radius:12px; background:#fff; cursor:pointer;">
                        <input type="radio" name="modo-distribuicao" value="por-pasta" style="margin-top:4px; accent-color:#059669;">
                        <span>
                            <strong style="display:block; color:#0f172a; font-size:14px;">Usar um endereço diferente para cada pasta</strong>
                            <small style="display:block; margin-top:4px; color:#64748b; line-height:1.45; font-size:12px;">Use quando as pastas tiverem fotos de locais diferentes, como matriz e filial. Na próxima tela você escolhe o endereço de cada uma.</small>
                        </span>
                    </label>
                </div>
            `,
            width: 650,
            showCancelButton: true,
            confirmButtonColor: '#059669',
            cancelButtonColor: '#64748b',
            confirmButtonText: 'Avançar',
            cancelButtonText: 'Cancelar',
            buttonsStyling: false,
            customClass: {
                popup: 'exifrank-flow-modal',
                title: 'exifrank-flow-title',
                htmlContainer: 'exifrank-flow-content',
                confirmButton: 'exifrank-flow-confirm',
                cancelButton: 'exifrank-flow-cancel'
            },
            preConfirm: () => {
                const selecionada = document.querySelector('input[name="modo-distribuicao"]:checked')?.value;
                if (!selecionada) {
                    Swal.showValidationMessage('Selecione uma opção para continuar.');
                    return false;
                }
                return selecionada;
            }
        });

        if (!escolha.isConfirmed) return null;
        if (escolha.value !== 'por-pasta') {
            return { modoDistribuicao: 'automatico', mapeamentoPastas: {} };
        }

        const mapeamento = await Swal.fire({
            title: 'Escolha o endereço de cada pasta',
            html: `
                <p style="margin:0 0 10px; color:#475569; line-height:1.45;">Use esta opção apenas se as pastas tiverem fotos ou vídeos de endereços diferentes. Selecione, ao lado de cada pasta, o endereço correspondente.</p>
                <div style="max-height:320px; overflow:auto; border-top:1px solid #e2e8f0;">${linhas}</div>
            `,
            width: 680,
            showCancelButton: true,
            confirmButtonColor: '#059669',
            cancelButtonColor: '#64748b',
            confirmButtonText: 'Confirmar endereços',
            cancelButtonText: 'Voltar',
            buttonsStyling: false,
            customClass: {
                popup: 'exifrank-flow-modal',
                title: 'exifrank-flow-title',
                htmlContainer: 'exifrank-flow-content',
                confirmButton: 'exifrank-flow-confirm',
                cancelButton: 'exifrank-flow-cancel'
            },
            preConfirm: () => {
                const resultado = {};
                document.querySelectorAll('[data-bloco-index]').forEach(select => {
                    const bloco = blocosDisponiveis[Number(select.dataset.blocoIndex)];
                    if (bloco?.id) resultado[bloco.id] = Number(select.value);
                });
                return resultado;
            }
        });

        if (mapeamento.isConfirmed) {
            return { modoDistribuicao: 'por-pasta', mapeamentoPastas: mapeamento.value || {} };
        }
        // O botão "Voltar" retorna à escolha inicial e preserva o fluxo.
    }
}

async function executarSEO() {
    if (isOptimizing) return;

    const pasta = document.getElementById("input-pasta").value;
    if(!pasta) {
        showToast("Selecione a pasta no Passo 1!", "error");
        currentStep = 1;
        updateUI();
        return;
    }

    const locationResult = buildProcessingLocations();
    if (locationResult.error) {
        showToast(locationResult.error, 'error');
        currentStep = 1;
        updateUI();
        return;
    }

    let data = {
        pasta: pasta,
        empresa: document.getElementById("input-empresa").value.trim(),
        telefone: document.getElementById("input-telefone").value.trim(),
        endereco: document.getElementById("input-endereco").value.trim(),
        lat: document.getElementById("input-lat").value.trim(),
        lon: document.getElementById("input-lon").value.trim(),
        localizacoes: locationResult.locations,
        titulo: document.getElementById("input-titulo").value.trim(),
        desc: document.getElementById("input-desc").value.trim(),
        notificar: appConfig.notifyEnd
    };

    if (!hasNativeFirebaseSession(currentUser)) {
        showToast("Entre e confirme seu e-mail antes de processar mídias.", "error");
        return;
    }
    try {
        const nativeUser = firebase.auth().currentUser;
        data.firebaseUid = nativeUser.uid;
        data.hardwareId = await window.pywebview.api.obter_hardware_id();
        try {
            data.firebaseIdToken = await nativeUser.getIdToken();
        } catch (tokenError) {
            // Sem rede, o motor decide entre Premium offline válido e limite Gratuito.
            console.warn('Token online indisponível; tentando modo offline seguro.', tokenError);
            data.firebaseIdToken = '';
        }
    } catch (e) {
        showToast("Não foi possível identificar este computador para o modo offline. Reinicie o aplicativo e tente novamente.", "error");
        return;
    }

    try {
        let preview = await window.pywebview.api.obter_previa_organizacao(data);
        if (!preview?.ok) {
            showToast(getFriendlyErrorMessage(preview?.erro, 'Não foi possível preparar a organização da pasta.'), 'error');
            return;
        }
        if (!preview.total) {
            showToast('Nenhuma mídia nova elegível foi encontrada. A pasta de resultados anterior não será reprocessada.', 'warning');
            return;
        }

        const previewInicial = preview;
        while (true) {
            const distribuicao = await escolherDistribuicaoGeografica(previewInicial, locationResult.locations);
            if (!distribuicao) return;
            data = { ...data, ...distribuicao };

            // Sempre refazemos a prévia: assim a confirmação mostra exatamente a
            // divisão escolhida, inclusive no modo automático.
            preview = await window.pywebview.api.obter_previa_organizacao(data);
            if (!preview?.ok) {
                showToast(getFriendlyErrorMessage(preview?.erro, 'Não foi possível preparar a distribuição das pastas.'), 'error');
                return;
            }
            if (!preview.total) {
                showToast('Nenhuma mídia nova elegível foi encontrada. A pasta de resultados anterior não será reprocessada.', 'warning');
                return;
            }

            const confirmation = await Swal.fire({
                title: 'Confirmar otimização segura',
                html: renderOrganizationPreview(preview),
                icon: 'info',
                showCancelButton: true,
                confirmButtonColor: '#059669',
                cancelButtonColor: '#64748b',
                confirmButtonText: `Processar ${preview.total} mídia(s)`,
                cancelButtonText: 'Revisar dados',
                width: 720,
                buttonsStyling: false,
                customClass: {
                    popup: 'exifrank-flow-modal exifrank-flow-modal--confirmation',
                    title: 'exifrank-flow-title',
                    htmlContainer: 'exifrank-flow-content',
                    confirmButton: 'exifrank-flow-confirm',
                    cancelButton: 'exifrank-flow-cancel',
                    icon: 'exifrank-flow-info-icon'
                }
            });

            if (confirmation.isConfirmed) break;

            // "Revisar dados" volta à escolha de distribuição. Com uma única
            // localização não há escolha anterior, então retornamos aos dados do projeto.
            if (locationResult.locations.length < 2) {
                currentStep = 2;
                updateUI();
                return;
            }
        }
    } catch (e) {
        showFriendlyError('Falha ao preparar a prévia da organização:', e, 'Não foi possível preparar a organização da pasta. Tente novamente.');
        return;
    }

    isOptimizing = true;
    const btn = document.getElementById("btn-executar");
    const btnCancelar = document.getElementById("btn-cancelar");
    btn.disabled = true;
    btn.classList.replace("from-emerald-500", "from-slate-500");
    btn.classList.replace("to-teal-500", "to-slate-400");
    btn.innerText = "PROCESSANDO...";
    if (btnCancelar) btnCancelar.classList.remove("hidden");
    startOptimizationTimer();

    try {
        const res = await window.pywebview.api.executar_seo_lote(data);
        if (res && typeof res === 'object' && res.ok === false) {
            showToast(getFriendlyErrorMessage(res.erro, "Não foi possível iniciar o processamento. Confira os dados e tente novamente."), "error");
            resetOptimizationUI('error');
        }
    } catch (e) {
        showFriendlyError("Falha ao iniciar o processamento:", e, "Não foi possível iniciar o processamento. Tente novamente.");
        resetOptimizationUI('error');
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
    
    renderProjectsList();
}

function renderProjectsList() {
    const list = document.getElementById("projects-list");
    if(!list) return;

    const validProjects = projetosDB
        .filter(project => project && typeof project === 'object')
        .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
    
    if(validProjects.length === 0) {
        list.innerHTML = `<div class="col-span-1 md:col-span-2 text-center py-10 bg-slate-50 rounded-xl border border-dashed border-slate-200">
            <p class="text-slate-500 font-medium">Nenhum projeto encontrado.</p>
        </div>`;
        return;
    }
    
    let html = '';
    validProjects.forEach(p => {
        const projectId = escapeHtml(p.id || '');
        const projectName = escapeHtml(p.nomeProjeto || 'Projeto sem nome');
        const companyName = escapeHtml(p.empresa || 'Nenhum');
        const updatedAt = p.updatedAt ? new Date(p.updatedAt).toLocaleDateString() : 'Sem data';
        html += `
        <!-- Card Principal -->
        <div class="bg-white rounded-xl p-5 border border-slate-100 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow cursor-pointer group" data-project-card data-project-id="${projectId}">
            
            <!-- Cabeçalho do Card (Título e Data) -->
            <div class="flex justify-between items-start mb-4">
                <div>
                    <h4 class="font-bold text-slate-900 text-lg group-hover:text-emerald-600 transition-colors">${projectName}</h4>
                    <p class="text-xs text-slate-500 mt-1">Cliente: ${companyName}</p>
                </div>
                <div class="text-[10px] text-slate-400 font-mono bg-slate-50 px-2 py-1 rounded border border-slate-100">
                    ${updatedAt}
                </div>
            </div>
            
            <!-- Rodapé do Card (Ações) -->
            <div class="flex items-center gap-3 mt-2 pt-3 border-t border-slate-50">
                <!-- Ação Primária -->
                <button type="button" data-project-action="report" data-project-id="${projectId}" class="text-xs flex items-center gap-1 font-medium text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1.5 rounded transition-colors">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                    Gerar relatório
                </button>
                
                <!-- Ações Secundárias -->
                <div class="flex items-center gap-2 ml-auto">
                    <button type="button" data-project-action="rename" data-project-id="${projectId}" data-project-name="${projectName}" class="text-xs text-slate-500 hover:text-slate-800 hover:underline">Renomear</button>
                    <span class="text-slate-300">|</span>
                    <button type="button" data-project-action="delete" data-project-id="${projectId}" class="text-xs text-rose-500 hover:underline">Excluir</button>
                </div> <!-- Fecha Ações Secundárias -->
            </div> <!-- Fecha Rodapé -->
            
        </div> <!-- Fecha Card Principal -->`;
    });
    list.innerHTML = html;

    list.querySelectorAll('[data-project-card]').forEach(card => {
        card.addEventListener('click', () => loadProject(card.dataset.projectId));
    });
    list.querySelectorAll('[data-project-action]').forEach(button => {
        button.addEventListener('click', event => {
            event.stopPropagation();
            const { projectAction, projectId, projectName } = button.dataset;
            if (!projectId) return;
            if (projectAction === 'report') abrirGeradorPDF(projectId);
            if (projectAction === 'rename') openRenameProjectModal(projectId, projectName || '');
            if (projectAction === 'delete') deleteProject(projectId);
        });
    });
}

async function deleteProject(id) {
    if(confirm("Deseja realmente excluir este projeto?")) {
        projetosDB = projetosDB.filter(x => x.id !== id);
        persistLocalDB();
        if(currentUser) {
            setCloudSyncStatus('syncing');
            try {
                await db.collection("users").doc(currentUser.uid).collection("projetos").doc(id).delete();
                setCloudSyncStatus('ok');
            } catch(e) {
                setCloudSyncStatus('error', getFriendlyErrorMessage(e, 'Não foi possível sincronizar a exclusão do projeto.'));
            }
        }
        if(currentProjectId === id) {
            currentProjectId = null;
            if(currentUser) localStorage.removeItem("lastActiveProjectId_" + currentUser.uid);
            switchView("projects");
        }
        renderProjectsList();
        showToast("Projeto excluído com sucesso.", "success");
    }
}



// ==== UTILS ====
function atualizarProgresso(porcentagem, texto, status) {
    document.getElementById("progresso-barra").style.width = porcentagem + "%";
    document.getElementById("progresso-porc").innerText = parseInt(porcentagem) + "%";
    document.getElementById("progresso-texto").textContent = texto;
    if (status === "completed" || status === "cancelled" || status === "error") {
        if (status === "completed") markCurrentProjectAsOptimized();
        resetOptimizationUI(status);
    }
}

function alertaUI(msg, requestedType = "") {
    const text = String(msg || "");
    const type = String(requestedType || "").toLowerCase();
    if(type === "error" || /erro|falha|internal|exception|não foi possível|não pôde|não permitiu|nenhuma mídia|bloquead|indisponível|impediu/i.test(text)) {
        showToast(getFriendlyErrorMessage(text, "Não foi possível concluir essa ação. Tente novamente."), "error");
    } else if(type === "info") {
        showToast(text, "info");
    } else {
        showToast(text, "success");
    }
}

function updateApiLed(status, color) {
    if(color === "red") {
        showToast(getFriendlyErrorMessage(status, "O serviço local apresentou uma falha. Tente novamente."), "error");
    }
}

function showToast(message, type="success") {
    const toast = document.createElement("div");
    const bgColor = type === "success" ? "bg-emerald-500" : (type === "error" ? "bg-rose-500" : "bg-blue-500");
    toast.className = `fixed bottom-10 right-10 ${bgColor} text-white px-6 py-4 rounded-xl shadow-float z-[9999] transition-all duration-300 transform translate-y-10 opacity-0 flex items-center gap-3`;
    
    let icon = type === "success" 
        ? '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>'
        : '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>';
        
    toast.innerHTML = `${icon} <span class="font-medium text-sm tracking-wide">${escapeHtml(message)}</span>`;
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

function prepareUpdateBrowserFallback() {
    const browserButton = document.getElementById("btn-update-browser-download");
    if(!browserButton) return;
    browserButton.classList.add("hidden");
    browserButton.onclick = async () => {
        try {
            const result = await window.pywebview.api.abrir_download_atualizacao(updateDownloadUrl);
            if(!result || !result.ok) {
                showToast((result && result.erro) || "Não foi possível abrir o navegador.", "error");
            }
        } catch (error) {
            showToast("Não foi possível abrir o navegador.", "error");
        }
    };
}

async function checkForUpdates() {
    try {
        const res = await window.pywebview.api.check_for_updates();
        if (res && res.update_available) {
            updateDownloadUrl = res.download_url;
            prepareUpdateBrowserFallback();
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
            prepareUpdateBrowserFallback();
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
        document.getElementById("update-status-text").innerText = "Preparando a instalação...";
    } else if (status === "installing") {
        document.getElementById("update-progress-bar").style.width = "100%";
        document.getElementById("update-status-text").innerText = "Fechando o ExifRank. Autorize o Windows para concluir a atualização.";
    } else if (status === "error") {
        document.getElementById("update-status-text").innerText = "Não foi possível preparar a atualização. Tente novamente mais tarde.";
        document.getElementById("update-status-text").classList.add("text-rose-400");
        const browserButton = document.getElementById("btn-update-browser-download");
        if(browserButton && updateDownloadUrl) browserButton.classList.remove("hidden");
    }
}

// ================= PDF REPORT =================
const PDF_LOGO_MAX_BYTES = 400 * 1024;

function isPdfCompatibleLogoData(dataUrl) {
    return typeof dataUrl === 'string' && /^data:image\/(png|jpeg);base64,/i.test(dataUrl);
}

function isPdfCompatibleLogoFile(file) {
    return Boolean(file && ['image/png', 'image/jpeg'].includes(file.type));
}

function updateClientLogoPreview(dataUrl) {
    const hasLogo = isPdfCompatibleLogoData(dataUrl);
    const previewMarkup = hasLogo
        ? `<img src="${dataUrl}" alt="Logo do cliente" class="h-full max-w-full object-contain p-1">`
        : 'Sem logo';

    ['report-client-logo-preview', 'identity-client-logo-preview'].forEach(id => {
        const preview = document.getElementById(id);
        if (!preview) return;
        preview.innerHTML = previewMarkup;
        preview.classList.toggle('text-slate-400', !hasLogo);
    });
    ['report-client-logo-remove', 'identity-client-logo-remove'].forEach(id => {
        const removeButton = document.getElementById(id);
        if (removeButton) removeButton.classList.toggle('hidden', !hasLogo);
    });

    const hiddenInput = document.getElementById('report-client-logo');
    if (hiddenInput) hiddenInput.value = hasLogo ? dataUrl : '';
}

function persistClientLogoForProject(projectId, clientLogo) {
    const project = projetosDB.find(item => item.id === projectId);
    if (!project) return false;

    project.clientLogo = clientLogo || null;
    project.updatedAt = new Date().toISOString();
    persistLocalDB();

    if (currentUser) {
        db.collection('users').doc(currentUser.uid).collection('projetos').doc(projectId)
            .set({ clientLogo: project.clientLogo, updatedAt: project.updatedAt }, { merge: true })
            .catch(error => console.warn('Não foi possível sincronizar a logo do cliente:', error));
    }
    return true;
}

function removeClientLogo() {
    const projectId = document.getElementById('report-project-id')?.value || currentProjectId;
    if (!projectId) return;

    persistClientLogoForProject(projectId, null);
    const hiddenInput = document.getElementById('report-client-logo');
    const fileInput = document.getElementById('report-client-logo-file');
    const identityFileInput = document.getElementById('identity-client-logo-file');
    if (hiddenInput) hiddenInput.value = '';
    if (fileInput) fileInput.value = '';
    if (identityFileInput) identityFileInput.value = '';
    updateClientLogoPreview(null);
    showToast('Logo do cliente removida desta ficha.', 'info');
}

function handleClientLogoUpload(input) {
    const file = input?.files && input.files[0];
    const projectId = currentProjectId || document.getElementById('report-project-id')?.value;
    if (!file || !projectId) return;

    if (!isPdfCompatibleLogoFile(file)) {
        showToast('Use uma logo em PNG ou JPG.', 'error');
        input.value = '';
        return;
    }
    if (file.size > PDF_LOGO_MAX_BYTES) {
        showToast('A logo do cliente deve ter no máximo 400 KB.', 'error');
        input.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = function(evt) {
        const dataUrl = String(evt.target?.result || '');
        if (!isPdfCompatibleLogoData(dataUrl)) {
            showToast('Não foi possível ler esta logo. Tente um PNG ou JPG.', 'error');
            input.value = '';
            return;
        }
        persistClientLogoForProject(projectId, dataUrl);
        updateClientLogoPreview(dataUrl);
        showToast('Logo do cliente salva e vinculada aos relatórios.', 'success');
    };
    reader.onerror = function() {
        showToast('Não foi possível ler a logo selecionada.', 'error');
        input.value = '';
    };
    reader.readAsDataURL(file);
}

function abrirGeradorPDF(projId) {
    const project = projetosDB.find(item => item.id === projId);
    if (!project) {
        showToast('Não foi possível localizar este projeto.', 'error');
        return;
    }

    document.getElementById("report-project-id").value = projId;
    const hiddenInput = document.getElementById('report-client-logo');
    const fileClient = document.getElementById("report-client-logo-file");
    const savedClientLogo = isPdfCompatibleLogoData(project.clientLogo) ? project.clientLogo : '';

    // Sempre reinicia o modal com a logo da ficha aberta. Isso evita que a
    // marca de um cliente apareça no relatório de outro projeto.
    if (hiddenInput) hiddenInput.value = savedClientLogo;
    updateClientLogoPreview(savedClientLogo);

    if(fileClient) fileClient.value = "";

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
    if (!hasPremiumAccess() && currentUser) await refreshOfflineLicenseStatus(currentUser);
    if (!hasPremiumAccess()) {
        showPremiumBlocker('Relatórios Bloqueados', 'A geração de relatórios avançados em PDF é exclusiva do plano Premium. Adquira a licença para exportar laudos profissionais para seus clientes!');
        return;
    }
    const btn = document.getElementById("btn-generate-pdf");
    btn.innerHTML = `<svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Gerando...`;
    btn.disabled = true;

    try {
        const pId = document.getElementById("report-project-id").value;
        const proj = projetosDB.find(p => p.id === pId);
        if(!proj) throw new Error("Projeto não encontrado.");

        const agencyLogo = isPdfCompatibleLogoData(window.currentAgencyLogoBase64)
            ? window.currentAgencyLogoBase64
            : null;
        const agencyName = (window.currentAgencyName || '').trim() || (agencyLogo ? 'Agência Parceira' : 'ExifRank');
        const reportClientLogo = document.getElementById("report-client-logo").value.trim();
        const clientLogo = isPdfCompatibleLogoData(reportClientLogo)
            ? reportClientLogo
            : (isPdfCompatibleLogoData(proj.clientLogo) ? proj.clientLogo : '');

        // Puxar total real de fotos via PyWebView
        let numFotos = 0;
        if(window.pywebview && window.pywebview.api && proj.pasta) {
            try {
                const resumo = await window.pywebview.api.obter_resumo_pasta(proj.pasta);
                if(resumo && resumo.total) numFotos = resumo.total;
            } catch(e) {}
        }

        // Tags / Keywords
        const tagsArray = proj.titulo ? proj.titulo.split(",").map(t => t.trim()).filter(t => t) : [];

        // Ao adicionar uma localização, a ficha salva as coordenadas em
        // `localizacoes` e limpa os campos principais para permitir incluir a
        // próxima. O relatório deve usar essa lista como fonte de verdade.
        const rawGpsLocations = [];
        if (proj.lat && proj.lon) {
            rawGpsLocations.push({
                name: proj.endereco || 'Localização principal',
                lat: proj.lat,
                lon: proj.lon
            });
        }
        if (Array.isArray(proj.localizacoes)) {
            proj.localizacoes.forEach((location, index) => {
                if (!location || !location.lat || !location.lon) return;
                rawGpsLocations.push({
                    name: location.nome || `Localização ${index + 1}`,
                    lat: location.lat,
                    lon: location.lon
                });
            });
        }
        const gpsLocations = rawGpsLocations.filter((location, index, locations) =>
            locations.findIndex(item => String(item.lat) === String(location.lat) && String(item.lon) === String(location.lon)) === index
        );
        const primaryGpsLocation = gpsLocations[0] || null;

        // Chamar Python para Insights
        let aiInsights = "As mídias do projeto estão organizadas para apoiar a estratégia de presença local da empresa.";
        try {
            if (navigator.onLine !== false && window.pywebview && window.pywebview.api && window.pywebview.api.api_gerar_insights_pdf) {
                const res = await window.pywebview.api.api_gerar_insights_pdf({
                    empresa: proj.empresa,
                    numFotos: numFotos,
                    gps_ok: gpsLocations.length > 0,
                    keyCount: tagsArray.length
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

        // Data formatada
        const hoje = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

        // Montar o objeto reportData para o motor pdfmake
        const reportData = {
            clientName:       proj.empresa || "Sem Nome",
            clientLogoBase64: clientLogo || null,
            agencyName:       agencyName,
            agencyLogoBase64: agencyLogo,
            date:             hoje,
            numPhotos:        numFotos,
            hasGps:           gpsLocations.length > 0,
            gpsLocations:     gpsLocations,
            gpsLocationCount: gpsLocations.length,
            lat:              primaryGpsLocation ? primaryGpsLocation.lat : "Não informada",
            lon:              primaryGpsLocation ? primaryGpsLocation.lon : "Não informada",
            keywords:         tagsArray,
            keywordCount:     tagsArray.length,
            aiInsights:       aiInsights
        };

        // Gerar e salvar via motor pdfmake
        await PdfExporter.generateAndSave(reportData);

    } catch (e) {
        showFriendlyError("Falha ao gerar o relatório em PDF:", e, "Não foi possível gerar o relatório em PDF. Tente novamente.");
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg><span>Baixar PDF</span>`;
    }
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
        const purchaseButtons = [
            document.getElementById("btn-assinar-premium"),
            document.getElementById("btn-assinar-premium-annual")
        ].filter(Boolean);

        const userIsPremium = doc.exists && doc.data().isPremium === true;
        const administratorPremium = isAdministratorAccount(currentUser);
        const staleCachedSnapshot = awaitingFreshPremiumSnapshot &&
            doc.metadata?.fromCache === true && !userIsPremium;
        const receivedFreshServerSnapshot = doc.metadata?.fromCache === false;
        if (receivedFreshServerSnapshot) {
            awaitingFreshPremiumSnapshot = false;
            claimedPremiumAccess = userIsPremium || administratorPremium;
        }

        const recentlyClaimedPremium = awaitingFreshPremiumSnapshot && claimedPremiumAccess;
        const premiumAvailable = administratorPremium || userIsPremium || recentlyClaimedPremium || staleCachedSnapshot || offlinePremiumLicense.isPremium === true;
        const premiumCard = document.getElementById("premium-sidebar-card");
        if (premiumCard) premiumCard.classList.toggle("hidden", premiumAvailable);
        window.isUserPremium = administratorPremium || userIsPremium || recentlyClaimedPremium || staleCachedSnapshot;

        if (!premiumAvailable) {
            purchaseButtons.forEach((button) => button.classList.remove("hidden"));
            if (overlay) overlay.classList.remove("hidden");
            return;
        }

        applyPremiumAvailabilityUI();

        // A autorização das contas administrativas já é validada novamente nas
        // Functions. Não exibimos uma oferta de compra por falha temporária na
        // verificação de dispositivo do cliente.
        if (administratorPremium) return;

        // A concessão offline já foi emitida pelo servidor em uma conexão anterior
        // e está vinculada a este usuário e computador. Não tentamos a Function sem rede.
        if (offlinePremiumLicense.isPremium) return;

        // O servidor valida e registra o hardware: o cliente não tem permissão
        // para escrever hardware_id nem isPremium no Firestore.
        try {
            const hwid = await window.pywebview.api.obter_hardware_id();
            if (!hasNativeFirebaseSession(currentUser)) {
                if (overlay) overlay.classList.remove("hidden");
                return;
            }

            const result = await cloudFunctions.httpsCallable('verifyPremiumDevice')({ hardwareId: hwid });
            if (result.data && result.data.deviceAllowed) {
                overlay.classList.add("hidden");
                return;
            }
        } catch (e) {
            // Durante a atualização do app, a Function pode ainda não ter sido
            // publicada. Mantemos a licença já existente utilizável no teste,
            // sem transformar isso em erro de sincronização de projetos.
            if (e?.code === 'functions/not-found') {
                const hardwareLegado = doc.exists ? doc.data().hardware_id : null;
                if (!hardwareLegado || hardwareLegado === hwid) {
                    overlay.classList.add("hidden");
                    return;
                }
            }
            console.error("Falha ao validar dispositivo Premium:", e);
        }

        if (overlay) overlay.classList.remove("hidden");
        const lockMsg = document.getElementById("premium-lock-msg");
        if (lockMsg) {
            lockMsg.innerHTML = "<span class=\"font-bold\">Licença Premium em outro computador.</span><br>O limite é de uma máquina por assinatura. Solicite o reset do dispositivo ao suporte caso seja necessário.";
        }
        purchaseButtons.forEach((button) => button.classList.add("hidden"));
    }, error => {
        if (offlinePremiumLicense.isPremium) {
            applyPremiumAvailabilityUI();
            setCloudSyncStatus('offline', `Premium disponível offline até ${new Date(offlinePremiumLicense.expiresAt).toLocaleDateString('pt-BR')}.`);
        } else {
            setCloudSyncStatus('error', getFriendlyErrorMessage(error, 'Não foi possível sincronizar sua licença.'));
        }
        console.error("Falha ao observar licença Premium:", error);
    });
}

function setPremiumPurchaseButtons(label = "", disabled = false) {
    const buttons = [
        document.getElementById("btn-assinar-premium"),
        document.getElementById("btn-assinar-premium-annual"),
        document.getElementById("menu-buy-premium"),
        document.getElementById("menu-buy-premium-annual")
    ].filter(Boolean);

    buttons.forEach((button) => {
        if (!button.dataset.defaultContent) button.dataset.defaultContent = button.innerHTML;
        button.disabled = disabled;
        button.setAttribute("aria-busy", disabled ? "true" : "false");
        button.innerHTML = label || button.dataset.defaultContent;
    });
}


function isPendingCheckoutPlanConflict(error) {
    const code = String(error?.code || "").toLowerCase();
    const message = String(error?.message || "").toLowerCase();
    return (code === "functions/failed-precondition" || code === "failed-precondition") &&
        message.includes("checkout pendente para outro plano");
}

async function confirmPendingCheckoutReplacement(planLabel) {
    const message = `Há um checkout pendente de uma tentativa anterior. Deseja cancelá-lo e abrir o plano ${planLabel}?`;
    if (typeof window.Swal?.fire === "function") {
        const result = await window.Swal.fire({
            icon: "warning",
            title: "Trocar plano?",
            text: message,
            showCancelButton: true,
            confirmButtonText: "Cancelar anterior e continuar",
            cancelButtonText: "Manter checkout atual",
            confirmButtonColor: "#059669",
            cancelButtonColor: "#64748b"
        });
        return result.isConfirmed;
    }
    return window.confirm(message);
}

async function assinarPremium(plan = "monthly", replacePending = false) {
    if (!hasNativeFirebaseSession(currentUser)) {
        showToast("Entre e confirme seu e-mail antes de iniciar a compra.", "error");
        return;
    }

    const selectedPlan = plan === "annual" ? "annual" : "monthly";
    const selectedPlanLabel = selectedPlan === "annual" ? "anual" : "mensal";
    
    setPremiumPurchaseButtons("⏳ Redirecionando...", true);

    try {
        // A Function valida o plano e cria a assinatura com preço, periodicidade,
        // e-mail e referência vinculados à conta Firebase. O app recebe somente
        // o checkout; nenhum valor é decidido localmente.
        const checkout = await cloudFunctions.httpsCallable('createMercadoPagoSubscription')({
            plan: selectedPlan,
            replacePending
        });
        const checkoutUrl = checkout?.data?.checkoutUrl;
        if (typeof checkoutUrl !== 'string' || !checkoutUrl.startsWith('https://')) {
            throw new Error("O Mercado Pago não retornou um checkout de assinatura válido.");
        }
        const checkoutWindow = window.open(checkoutUrl, "_blank");
        // No pywebview o navegador externo pode ser aberto corretamente, mas
        // window.open retorna null porque não existe uma janela filha dentro
        // da WebView. Em um navegador comum, null continua indicando popup
        // bloqueado e mantemos a mensagem de erro apropriada.
        const openedByDesktopApp = Boolean(window.pywebview?.api);
        if (!checkoutWindow && !openedByDesktopApp) {
            throw new Error("O navegador bloqueou a abertura do checkout.");
        }
        showToast(
            openedByDesktopApp
                ? `Checkout ${selectedPlanLabel} aberto no seu navegador. Conclua o pagamento por lá e volte ao ExifRank.`
                : `Checkout ${selectedPlanLabel} aberto. Conclua o pagamento para liberar o Premium.`,
            "info"
        );
        
        setPremiumPurchaseButtons("Aguardando confirmação...", true);
        setTimeout(async () => {
            try {
                await claimPremiumLicense();
            } catch (_) {
                // O listener em tempo real também atualiza a licença quando o
                // webhook concluir; não exibimos sucesso antes dessa confirmação.
            }
            setPremiumPurchaseButtons();
        }, 15000);
    } catch (e) {
        setPremiumPurchaseButtons();
        if (!replacePending && isPendingCheckoutPlanConflict(e)) {
            const shouldReplace = await confirmPendingCheckoutReplacement(selectedPlanLabel);
            if (shouldReplace) return assinarPremium(selectedPlan, true);
            return;
        }
        showFriendlyError("Falha ao iniciar a assinatura:", e, "Não foi possível iniciar a assinatura. Tente novamente em alguns instantes.");
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
    if (!isPdfCompatibleLogoFile(file)) {
        showToast("Use uma logo em PNG ou JPG.", "error");
        input.value = "";
        return;
    }
    if(file.size > 2 * 1024 * 1024) {
        showToast("A imagem deve ter no máximo 2MB", "error");
        input.value = "";
        return;
    }
    showToast("Salvando logomarca...", "info");
    
    const reader = new FileReader();
    reader.onload = async function(e) {
        const base64Data = e.target.result;
        if (!isPdfCompatibleLogoData(base64Data)) {
            showToast("Não foi possível ler esta logo. Tente um PNG ou JPG.", "error");
            return;
        }
        try {
            if (window.pywebview && window.pywebview.api) {
                await window.pywebview.api.salvar_logo_agencia(base64Data);
            }
            window.currentAgencyLogoBase64 = base64Data;
            document.getElementById('agency-logo-preview').innerHTML = `<img src="${base64Data}" class="max-w-full max-h-full object-contain p-1" />`;
            
            showToast("Logo da Agência salva com sucesso!", "success");
        } catch(err) {
            showFriendlyError("Falha ao salvar a logomarca:", err, "Não foi possível salvar a logomarca. Tente novamente.");
        }
    };
    reader.onerror = function() {
        showToast("Não foi possível ler a logo selecionada.", "error");
    };
    reader.readAsDataURL(file);
}

async function removeAgencyLogo() {
    window.currentAgencyLogoBase64 = null;
    document.getElementById('agency-logo-preview').innerHTML = `<svg class="w-5 h-5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>`;
    try {
        if (window.pywebview && window.pywebview.api) {
            await window.pywebview.api.salvar_logo_agencia("");
        }
        showToast("Logo removida.", "info");
    } catch(e) {}
}

async function loadAdminData() {
    loadGlobalStats();
    if (!currentUser || !currentUser.email) return;
    const mail = currentUser.email.toLowerCase();
    if (mail !== 'lpresses17@gmail.com' && mail !== 'lprcampos17@gmail.com') return;
    
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
                <tr class="group hover:bg-slate-50/80 transition-colors border-b border-slate-100 last:border-0">
                    <td class="px-4 py-3">
                        <div class="flex items-center gap-2.5 font-medium text-slate-700">
                            <span class="w-7 h-7 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center">
                                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 4.26a2.25 2.25 0 002.22 0L21 8m-18 8.25V18a2.25 2.25 0 002.25 2.25h13.5A2.25 2.25 0 0021 18v-1.75M3 8V6a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 6v2"></path></svg>
                            </span>
                            ${escapeHtml(d.id)}
                        </div>
                    </td>
                    <td class="px-4 py-3 text-right w-28">
                        <button type="button" title="Remover e-mail pré-aprovado" aria-label="Remover ${escapeHtml(d.id)}" data-remove-premium-email="${escapeHtml(d.id)}" class="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-50 hover:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-500/20">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1H10a1 1 0 00-1 1v3m-4 0h14"></path></svg>
                            Remover
                        </button>
                    </td>
                </tr>`;
            });
            if (!preHtml) preHtml = `<tr><td class="px-4 py-3 text-center text-slate-400">Nenhum e-mail pré-aprovado.</td></tr>`;
            preTbody.innerHTML = preHtml;
            preTbody.querySelectorAll("[data-remove-premium-email]").forEach((button) => {
                button.addEventListener("click", () => removePremiumEmail(button.dataset.removePremiumEmail));
            });
        } catch(e) {
            preTbody.innerHTML = `<tr><td class="px-4 py-3 text-center text-rose-500">${escapeHtml(getFriendlyErrorMessage(e, "Não foi possível carregar a lista de e-mails Premium."))}</td></tr>`;
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
            const safeUid = escapeHtml(uid);
            
            const btnPremium = isPremium 
                ? `<button type="button" title="Revogar acesso Premium" data-premium-action="revoke" data-user-id="${safeUid}" class="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-100 hover:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-500/20 whitespace-nowrap"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 5.636l-12.728 12.728m0-12.728l12.728 12.728"></path></svg>Revogar premium</button>`
                : `<button type="button" title="Conceder acesso Premium" data-premium-action="grant" data-user-id="${safeUid}" class="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 hover:border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 whitespace-nowrap"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>Dar premium</button>`;
                
            const btnResetHWID = hwid !== 'Não Registrado'
                ? `<button type="button" title="Desvincular o dispositivo atual" data-reset-device="true" data-user-id="${safeUid}" class="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 shadow-sm transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 focus:outline-none focus:ring-2 focus:ring-rose-500/20 whitespace-nowrap"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 1.12-3 2.5S10.343 13 12 13s3-1.12 3-2.5S13.657 8 12 8zm0 0V4m0 9v7m8-7a8 8 0 10-16 0"></path></svg>Liberar novo PC</button>`
                : '';

            html += `
            <tr class="group hover:bg-slate-50/80 transition-colors">
                <td class="px-4 py-3">
                    <div class="font-semibold text-slate-800">${escapeHtml(email)}</div>
                    <span class="mt-1 inline-block text-[10px] text-slate-400 font-mono">${escapeHtml(uid)}</span>
                </td>
                <td class="px-4 py-3 text-center">
                    ${isPremium ? '<span class="inline-flex items-center gap-1 rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>Premium</span>' : '<span class="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600"><span class="w-1.5 h-1.5 rounded-full bg-slate-400"></span>Padrão</span>'}
                </td>
                <td class="px-4 py-3" title="${escapeHtml(hwid)}">
                    <span class="inline-flex max-w-[180px] items-center gap-1.5 truncate rounded-lg bg-slate-100 px-2.5 py-1.5 font-mono text-[11px] text-slate-600">
                        <svg class="w-3.5 h-3.5 shrink-0 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L8.5 21m7-4l1.25 4M5 13.5h14M6.5 3h11A2.5 2.5 0 0120 5.5v6A2.5 2.5 0 0117.5 14h-11A2.5 2.5 0 014 11.5v-6A2.5 2.5 0 016.5 3z"></path></svg>
                        <span class="truncate">${escapeHtml(hwid)}</span>
                    </span>
                </td>
                <td class="px-4 py-3 align-middle">
                    <div class="flex flex-wrap gap-2 items-center justify-end">
                        ${btnPremium}
                        ${btnResetHWID}
                    </div>
                </td>
            </tr>`;
        });
        
        if (html === '') html = `<tr><td colspan="4" class="px-4 py-8 text-center text-slate-400">Nenhum usuário encontrado no banco.</td></tr>`;
        tbody.innerHTML = html;
        tbody.querySelectorAll("[data-premium-action]").forEach((button) => {
            button.addEventListener("click", () => {
                togglePremium(button.dataset.userId, button.dataset.premiumAction === "grant");
            });
        });
        tbody.querySelectorAll("[data-reset-device]").forEach((button) => {
            button.addEventListener("click", () => resetHWID(button.dataset.userId));
        });
        
    } catch(e) {
        tbody.innerHTML = `<tr><td colspan="4" class="px-4 py-8 text-center text-rose-500">${escapeHtml(getFriendlyErrorMessage(e, "Não foi possível carregar os usuários agora."))}</td></tr>`;
    }
}

async function togglePremium(uid, status) {
    if(!confirm(`Deseja ${status ? 'DAR' : 'REVOGAR'} o acesso Premium deste usuário?`)) return;
    try {
        await cloudFunctions.httpsCallable('setPremiumAccess')({ uid, enabled: status });
        showToast("Status Premium atualizado com sucesso!", "success");
        loadAdminData();
    } catch(e) {
        showFriendlyError("Falha ao atualizar o acesso Premium:", e, "Não foi possível atualizar o acesso Premium. Tente novamente.");
    }
}

async function resetHWID(uid) {
    if(!confirm("Deseja apagar a Trava de Hardware deste usuário? Ele poderá fazer login em um novo PC.")) return;
    try {
        await cloudFunctions.httpsCallable('resetPremiumDevice')({ uid });
        showToast("Hardware ID resetado com sucesso!", "success");
        loadAdminData();
    } catch(e) {
        showFriendlyError("Falha ao liberar novo computador:", e, "Não foi possível liberar um novo computador agora. Tente novamente.");
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
        try {
            await cloudFunctions.httpsCallable('addPremiumEmail')({ email });
        } catch (e) {
            // Compatibilidade temporária para o teste local com a Function
            // anterior. A publicação da nova Function elimina este caminho.
            if (e?.code !== 'functions/not-found') throw e;
            await db.collection("premium_emails").doc(email).set({
                addedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
        showToast("E-mail adicionado à lista Premium!", "success");
        input.value = '';
        loadAdminData();
    } catch(e) {
        showFriendlyError("Falha ao adicionar e-mail Premium:", e, "Não foi possível adicionar esse e-mail. Tente novamente.");
    }
}

async function removePremiumEmail(email) {
    if(!confirm(`Deseja remover o e-mail ${email} da lista de pré-aprovados? O acesso será recalculado imediatamente.`)) return;
    try {
        try {
            await cloudFunctions.httpsCallable('removePremiumEmail')({ email });
        } catch (e) {
            // Compatibilidade temporária para o teste local com a Function
            // anterior. A publicação da nova Function elimina este caminho.
            if (e?.code !== 'functions/not-found') throw e;
            await db.collection("premium_emails").doc(email).delete();
        }
        showToast("E-mail removido da lista Premium.", "success");
        loadAdminData();
    } catch(e) {
        showFriendlyError("Falha ao remover e-mail Premium:", e, "Não foi possível remover esse e-mail. Tente novamente.");
    }
}



// ==========================================
// TOUR GUIADO (DRIVER.JS)
// ==========================================
function startAppTour(theme = 'light') {
    localStorage.setItem('tour_v1_0_13', 'done');
    switchView('app');
    currentStep = 1;
    updateUI();
    
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
                element: '#menu-app',
                popover: {
                    title: 'Comece por um projeto',
                    description: 'Crie um projeto para cada cliente. O nome escolhido já é levado para a identidade do negócio e os dados ficam prontos para continuar depois.',
                    side: "right", align: 'start'
                },
                onHighlightStarted: forceHidePremiumLock
            },
            {
                element: '#folder-dropzone',
                popover: {
                    title: '1. Selecione a pasta original',
                    description: 'Escolha a pasta com as fotos e vídeos do cliente. O aplicativo lê a estrutura existente, mas mantém os arquivos originais intactos.',
                    side: "right", align: 'start'
                },
                onHighlightStarted: () => {
                    forceHidePremiumLock();
                    switchView('app');
                    currentStep = 1;
                    updateUI();
                }
            },
            {
                element: '#btn-gps',
                popover: {
                    title: '2. Encontre o endereço principal',
                    description: 'Digite o endereço do cliente e clique em Detectar. Confirme se a latitude e a longitude encontradas fazem sentido antes de avançar.',
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
                element: '#btn-importar-localizacoes',
                popover: {
                    title: 'Vários endereços? Importe a lista',
                    description: 'Cole vários endereços de uma vez ou adicione um por um. Cada ponto salvo pode virar uma pasta de resultado com a sua própria geolocalização.',
                    side: "bottom", align: 'start'
                },
                onHighlightStarted: () => {
                    forceHidePremiumLock();
                    switchView('app');
                    currentStep = 1;
                    updateUI();
                }
            },
            {
                element: '#btn-ia',
                popover: {
                    title: '3. Revise os textos',
                    description: 'Gere um rascunho ou escreva manualmente as palavras-chave e a descrição. O conteúdo é editável: deixe apenas informações reais do negócio.',
                    side: "bottom", align: 'start'
                },
                onHighlightStarted: () => {
                    forceHidePremiumLock();
                    switchView('app');
                    currentStep = 2;
                    updateUI();
                }
            },
            {
                element: '#btn-executar',
                popover: {
                    title: '4. Confira a distribuição antes de processar',
                    description: 'Com vários endereços, o ExifRank pergunta se deve dividir as mídias entre todos eles ou associar cada pasta a um endereço. A tela de confirmação mostra todos os destinos antes do início.',
                    side: "bottom", align: 'start'
                },
                onHighlightStarted: () => {
                    forceHidePremiumLock();
                    switchView('app');
                    currentStep = 3;
                    updateUI();
                }
            },
            {
                element: '#menu-settings',
                popover: {
                    title: 'Relatórios e sua marca',
                    description: 'A logo do cliente é cadastrada na identidade do projeto. Em Configurações, assinantes Premium podem incluir o nome e a logo da agência para personalizar os relatórios em PDF.',
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
            const modal = document.getElementById("report-modal");
            if (modal) modal.classList.add("hidden");
            if (typeof switchView === 'function') switchView('app');
            if (typeof currentStep !== 'undefined') currentStep = 1;
            if (typeof updateUI === 'function') updateUI();
        }
    });

    driverObj.drive();
}


// ==========================================
// EMAIL & PASSWORD AUTHENTICATION LOGIC
// ==========================================
let isSignUpMode = false;

function openAuthModal() {
    const overlay = document.getElementById('mandatory-login-overlay');
    if (overlay) overlay.classList.remove('hidden');
}

function toggleAuthMode() {
    isSignUpMode = !isSignUpMode;
    const title = document.getElementById('auth-btn-text');
    const toggleText = document.getElementById('auth-toggle-text');
    const errorMsg = document.getElementById('auth-error-msg');
    const confirmGroup = document.getElementById('auth-password-confirm-group');
    const confirmInput = document.getElementById('auth-password-confirm');
    const forgotButton = document.getElementById('auth-forgot-password');
    const passwordInput = document.getElementById('auth-password');
    
    if (errorMsg) errorMsg.classList.add('hidden');
    
    if (isSignUpMode) {
        if(title) title.innerText = 'Criar Conta Segura';
        if(toggleText) toggleText.innerText = 'Já tenho senha';
        if (confirmGroup) confirmGroup.classList.remove('hidden');
        if (forgotButton) forgotButton.classList.add('hidden');
        if (passwordInput) passwordInput.autocomplete = 'new-password';
        const parent = toggleText.parentElement;
        if(parent) parent.innerHTML = `Já tem uma senha? <span id="auth-toggle-text" class="text-emerald-600 font-bold hover:underline decoration-emerald-200 underline-offset-2">Entrar agora</span>`;
    } else {
        if(title) title.innerText = 'Entrar no Sistema';
        if(toggleText) toggleText.innerText = 'Criar sua senha';
        if (confirmGroup) confirmGroup.classList.add('hidden');
        if (confirmInput) confirmInput.value = '';
        if (forgotButton) forgotButton.classList.remove('hidden');
        if (passwordInput) passwordInput.autocomplete = 'current-password';
        const parent = toggleText.parentElement;
        if(parent) parent.innerHTML = `Primeiro acesso? <span id="auth-toggle-text" class="text-emerald-600 font-bold hover:underline decoration-emerald-200 underline-offset-2">Criar sua senha</span>`;
    }
}

function togglePasswordVisibility(inputId, button) {
    const input = document.getElementById(inputId);
    if (!input || !button) return;
    const willShow = input.type === 'password';
    input.type = willShow ? 'text' : 'password';
    button.textContent = willShow ? 'Ocultar' : 'Mostrar';
}

async function handleAuthSubmit(e) {
    e.preventDefault();
    const email = document.getElementById('auth-email').value.trim().toLowerCase();
    const password = document.getElementById('auth-password').value;
    const passwordConfirmation = document.getElementById('auth-password-confirm')?.value || '';
    const errorMsg = document.getElementById('auth-error-msg');
    const btn = document.getElementById('auth-submit-btn');
    
    errorMsg.classList.add('hidden');
    
    if (isSignUpMode) {
        // Validation: At least 8 chars, 1 number
        if (password.length < 8) {
            errorMsg.innerText = 'Sua senha deve ter no mínimo 8 caracteres para sua segurança.';
            errorMsg.classList.remove('hidden');
            return;
        }
        if (!/\d/.test(password)) {
            errorMsg.innerText = 'Sua senha deve conter pelo menos um número para ser segura.';
            errorMsg.classList.remove('hidden');
            return;
        }
        if (password !== passwordConfirmation) {
            errorMsg.innerText = 'As duas senhas não coincidem. Confira e tente novamente.';
            errorMsg.classList.remove('hidden');
            return;
        }
    }
    
    btn.disabled = true;
    const originalText = btn.innerHTML;
    btn.innerHTML = `<svg class="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Aguarde...`;

    emailAuthFlowInProgress = true;
    let signOutUnverifiedUser = false;
    try {
        if (isSignUpMode) {
            const credential = await firebase.auth().createUserWithEmailAndPassword(email, password);
            signOutUnverifiedUser = true;
            await credential.user.sendEmailVerification();
            await firebase.auth().signOut();
            signOutUnverifiedUser = false;
            toggleAuthMode();
            showToast('Conta criada. Enviamos um link de confirmação para seu e-mail.', 'success');
            showAuthenticationNotice('Confirme seu e-mail e depois entre com sua senha.');
        } else {
            const credential = await firebase.auth().signInWithEmailAndPassword(email, password);
            await credential.user.reload();
            if (credential.user.emailVerified !== true) {
                signOutUnverifiedUser = true;
                await credential.user.sendEmailVerification();
                await firebase.auth().signOut();
                signOutUnverifiedUser = false;
                showAuthenticationNotice('Seu e-mail ainda não foi confirmado. Enviamos um novo link de confirmação.');
                return;
            }
        }
        // updateAuthUI is called automatically by onAuthStateChanged listener in main.source.js
    } catch (error) {
        console.error(error);
        if (signOutUnverifiedUser) {
            errorMsg.innerText = 'Não foi possível enviar a confirmação agora. Aguarde alguns instantes e entre com sua senha para tentar reenviar.';
        } else if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password') {
            errorMsg.innerText = 'Não foi possível concluir a autenticação. Confira os dados ou recupere sua senha.';
        } else if (error.code === 'auth/email-already-in-use') {
            errorMsg.innerText = 'Não foi possível criar a conta agora. Se você já possui acesso, entre ou recupere sua senha.';
        } else if (error.code === 'auth/invalid-email') {
            errorMsg.innerText = 'Digite um e-mail válido para continuar.';
        } else if (error.code === 'auth/too-many-requests') {
            errorMsg.innerText = 'Muitas tentativas falhas. Tente novamente mais tarde ou recupere sua senha.';
        } else {
            errorMsg.innerText = 'Não foi possível concluir a autenticação agora. Tente novamente.';
        }
        errorMsg.classList.remove('hidden');
    } finally {
        if (signOutUnverifiedUser) {
            try { await firebase.auth().signOut(); } catch (_) {}
        }
        emailAuthFlowInProgress = false;
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

async function handleForgotPassword() {
    const email = document.getElementById('auth-email').value.trim();
    const errorMsg = document.getElementById('auth-error-msg');
    
    if (!email) {
        errorMsg.innerText = 'Por favor, digite seu e-mail no campo acima para recuperar a senha.';
        errorMsg.classList.remove('hidden');
        return;
    }
    
    errorMsg.classList.add('hidden');
    try {
        await firebase.auth().sendPasswordResetEmail(email);
        showToast('Se houver uma conta por e-mail e senha, enviaremos as instruções. Se você usa Google, volte e escolha “Acessar com Google”.', 'success');
    } catch (error) {
        console.error(error);
        showToast('Se houver uma conta por e-mail e senha, enviaremos as instruções. Se você usa Google, volte e escolha “Acessar com Google”.', 'success');
    }
}


// ==========================================
// GLOBAL STATS COUNTER
// ==========================================
async function registerOptimizationSuccess(count) {
    if(!count || count <= 0) return;
    try {
        await cloudFunctions.httpsCallable('recordOptimization')({ count });
        console.log('Stats globais atualizadas: +' + count);
    } catch(e) {
        console.error('Erro ao atualizar stats:', e);
    }
}

async function loadGlobalStats() {
    const counterEl = document.getElementById('admin-global-counter');
    if(!counterEl) return;
    try {
        counterEl.innerText = '...';
        const doc = await db.collection('stats').doc('global').get();
        if(doc.exists && doc.data().totalImagesOptimized) {
            counterEl.innerText = doc.data().totalImagesOptimized.toLocaleString('pt-BR');
        } else {
            counterEl.innerText = '0';
        }
    } catch(e) {
        console.error('Erro ao carregar stats globais:', e);
        counterEl.innerText = 'ERRO';
    }
}


function openRenameProjectModal(id, currentName) {
    document.getElementById('rename-project-id').value = id;
    document.getElementById('rename-project-name').value = currentName;
    const modal = document.getElementById('rename-project-modal');
    const content = document.getElementById('rename-project-modal-content');
    modal.classList.remove('hidden');
    setTimeout(() => {
        content.classList.remove('scale-95', 'opacity-0');
        content.classList.add('scale-100', 'opacity-100');
    }, 10);
}

function closeRenameProjectModal() {
    const modal = document.getElementById('rename-project-modal');
    const content = document.getElementById('rename-project-modal-content');
    content.classList.remove('scale-100', 'opacity-100');
    content.classList.add('scale-95', 'opacity-0');
    setTimeout(() => modal.classList.add('hidden'), 200);
}

async function confirmRenameProject() {
    const id = document.getElementById('rename-project-id').value;
    const newName = document.getElementById('rename-project-name').value.trim();
    if(!newName) {
        showToast('O nome não pode estar vazio.', 'error');
        return;
    }
    const proj = projetosDB.find(p => p.id === id);
    if(proj) {
        proj.nomeProjeto = newName;
        proj.updatedAt = new Date().toISOString();
        persistLocalDB();
        if(currentUser) {
            setCloudSyncStatus('syncing');
            try {
                await db.collection('users').doc(currentUser.uid).collection('projetos').doc(id).set(proj, {merge: true});
                setCloudSyncStatus('ok');
            } catch(e) {
                setCloudSyncStatus('error', getFriendlyErrorMessage(e, 'Não foi possível sincronizar a alteração do projeto.'));
            }
        }
        loadProjects();
        closeRenameProjectModal();
        showToast('Projeto renomeado com sucesso!', 'success');
    }
}


function resetOptimizationUI(finalStatus) {
    isOptimizing = false;
    stopOptimizationTimer(finalStatus);
    const btn = document.getElementById("btn-executar");
    const btnCancelar = document.getElementById("btn-cancelar");
    
    if (btn) {
        btn.disabled = false;
        btn.classList.replace("from-slate-500", "from-emerald-500");
        btn.classList.replace("to-slate-400", "to-teal-500");
        btn.innerText = "Iniciar Otimização Local";
    }
    
    if (btnCancelar) {
        btnCancelar.classList.add("hidden");
    }
}

function cancelarSEO() {
    if (!isOptimizing || isCancelConfirmationOpen) return;

    const cancelButton = document.getElementById('btn-cancelar');
    isCancelConfirmationOpen = true;
    if (cancelButton) {
        cancelButton.disabled = true;
        cancelButton.textContent = 'Pausando...';
    }

    (async () => {
        let cancellationRequested = false;
        try {
            const pauseResult = await window.pywebview.api.api_pausar_processamento();
            if (pauseResult && pauseResult.ok === false) {
                throw new Error(pauseResult.erro || 'Não foi possível pausar o processamento.');
            }

            pauseOptimizationTimer();
            const progressText = document.getElementById('progresso-texto');
            if (progressText) progressText.textContent = 'Pausado — aguardando sua confirmação...';

            const result = await Swal.fire({
                title: 'Processamento pausado',
                text: 'A mídia atual é concluída com segurança; as próximas aguardam sua decisão.',
                icon: 'warning',
                showCancelButton: true,
                allowOutsideClick: false,
                allowEscapeKey: false,
                confirmButtonColor: '#e11d48',
                cancelButtonColor: '#64748b',
                confirmButtonText: 'Cancelar otimização',
                cancelButtonText: 'Continuar processando'
            });

            if (result.isConfirmed) {
                cancellationRequested = true;
                if (cancelButton) {
                    cancelButton.textContent = 'Cancelando...';
                    cancelButton.disabled = true;
                }
                await window.pywebview.api.api_cancelar_processamento();
            } else {
                await window.pywebview.api.api_retomar_processamento();
                resumeOptimizationTimer();
                if (progressText) progressText.textContent = 'Processamento retomado...';
            }
        } catch (error) {
            // Se a confirmação não puder ser exibida ou comunicada ao motor,
            // retomamos o processamento para não deixá-lo parado sem explicação.
            if (!cancellationRequested) {
                try { await window.pywebview.api.api_retomar_processamento(); } catch (_) {}
                resumeOptimizationTimer();
            }
            showFriendlyError('Falha ao pausar o processamento:', error, 'Não foi possível pausar o processamento. Ele foi retomado com segurança.');
        } finally {
            isCancelConfirmationOpen = false;
            if (cancelButton && isOptimizing && !cancellationRequested) {
                cancelButton.disabled = false;
                cancelButton.textContent = 'Cancelar Otimização';
            }
        }
    })();
}
