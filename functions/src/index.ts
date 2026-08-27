import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import axios from "axios";
import { Groq } from "groq-sdk";
import { createHash, createHmac, timingSafeEqual } from "crypto";
import { defineSecret } from "firebase-functions/params";

admin.initializeApp();

const db = admin.firestore();
const MAX_DAILY_REQUESTS = 15;
const ADMIN_EMAILS = new Set(["lpresses17@gmail.com", "lprcampos17@gmail.com"]);
const MERCADOPAGO_ACCESS_TOKEN = defineSecret("MERCADOPAGO_ACCESS_TOKEN");
const MERCADOPAGO_WEBHOOK_SECRET = defineSecret("MERCADOPAGO_WEBHOOK_SECRET");
// O prefixo do token não identifica de forma confiável o ambiente: tokens de
// teste e produção podem começar com APP_USR. O ambiente é configurado de
// forma explícita antes de cada deploy.
const MERCADOPAGO_ENVIRONMENT = defineSecret("MERCADOPAGO_ENVIRONMENT");
// O valor mensal é guardado em centavos (ex.: R$ 97,00 = 9700) para nunca
// depender de um valor informado pelo app ou de arredondamento de ponto flutuante.
const MERCADOPAGO_MONTHLY_PRICE_CENTS = defineSecret("MERCADOPAGO_MONTHLY_PRICE_CENTS");
// O plano anual também é definido exclusivamente no servidor, em centavos.
const MERCADOPAGO_ANNUAL_PRICE_CENTS = defineSecret("MERCADOPAGO_ANNUAL_PRICE_CENTS");
// Esta versão precisa acompanhar o conteúdo exibido no site e no aplicativo.
// O servidor a valida para que o cliente não consiga registrar um aceite para
// uma versão diferente dos documentos vigentes.
const LEGAL_DOCUMENTS_VERSION = "2026-08-24";

function normalizedEmail(value: unknown): string {
    return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function isAdmin(context: functions.https.CallableContext): boolean {
    return context.auth?.token.email_verified === true &&
        ADMIN_EMAILS.has(normalizedEmail(context.auth?.token.email));
}

function requireAuthenticatedEmail(context: functions.https.CallableContext): string {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Faça login para continuar.");
    }
    if (context.auth.token.email_verified !== true) {
        throw new functions.https.HttpsError(
            "failed-precondition",
            "Confirme seu e-mail antes de acessar sua licença."
        );
    }
    const email = normalizedEmail(context.auth.token.email);
    if (!email) {
        throw new functions.https.HttpsError("failed-precondition", "A conta autenticada não possui e-mail.");
    }
    return email;
}

function readGoogleIdToken(data: unknown): string {
    const idToken = typeof (data as { idToken?: unknown })?.idToken === "string"
        ? (data as { idToken: string }).idToken.trim()
        : "";
    if (!idToken || idToken.length > 12000) {
        throw new functions.https.HttpsError("invalid-argument", "Token de autenticação Google inválido.");
    }
    return idToken;
}

/**
 * Troca uma credencial Google validada por um custom token do Firebase.
 * Assim o desktop usa apenas APIs públicas do SDK, em vez de gravar a sessão
 * diretamente no IndexedDB do WebView.
 */
export const exchangeGoogleIdToken = functions.https.onCall(async (data) => {
    const idToken = readGoogleIdToken(data);
    let decoded: admin.auth.DecodedIdToken;
    try {
        // O token acabou de ser emitido pelo login Google nesta mesma ação. A
        // validação de assinatura e expiração é suficiente aqui; a verificação
        // de revogação faz uma consulta extra e pode falhar transitoriamente.
        decoded = await admin.auth().verifyIdToken(idToken);
    } catch {
        throw new functions.https.HttpsError(
            "unauthenticated",
            "Não foi possível validar sua conta Google. Tente entrar novamente."
        );
    }

    const googleIdentity = decoded.firebase?.identities?.["google.com"];
    if (decoded.email_verified !== true || !normalizedEmail(decoded.email) || !googleIdentity?.length) {
        throw new functions.https.HttpsError(
            "failed-precondition",
            "A conta escolhida não pôde ser confirmada como uma conta Google válida."
        );
    }

    return { customToken: await admin.auth().createCustomToken(decoded.uid) };
});

/**
 * Permite que uma conta que já usa e-mail/senha conecte o Google ao mesmo UID.
 * O token é de uso único pelo fluxo de vínculo e só representa o próprio usuário.
 */
export const createGoogleLinkToken = functions.https.onCall(async (_data, context) => {
    requireAuthenticatedEmail(context);
    const user = await admin.auth().getUser(context.auth!.uid);
    const hasPassword = user.providerData.some((provider) => provider.providerId === "password");
    if (!hasPassword) {
        throw new functions.https.HttpsError(
            "failed-precondition",
            "Entre com e-mail e senha antes de conectar uma conta Google."
        );
    }
    return { customToken: await admin.auth().createCustomToken(user.uid) };
});

function readSecret(name: string, parameter?: ReturnType<typeof defineSecret>): string {
    try {
        return process.env[name] || parameter?.value() || "";
    } catch {
        return process.env[name] || "";
    }
}

/**
 * Radar SEO Local Function
 */
export const analyzeRadarSEO = functions.https.onCall(async (data, context) => {
    const uid = context.auth?.uid;
    if (!uid) {
        throw new functions.https.HttpsError(
            "unauthenticated",
            "Você precisa estar logado (ou sua sessão expirou) para usar o Radar SEO Local."
        );
    }

    const keyword = typeof data.keyword === "string" ? data.keyword.trim() : "";
    const local = typeof data.local === "string" ? data.local.trim() : "";

    if (!keyword || !local || keyword.length > 160 || local.length > 160) {
        throw new functions.https.HttpsError(
            "invalid-argument",
            "Parâmetros 'keyword' e 'local' são obrigatórios."
        );
    }

    // 2. Verificar Rate Limit (Ignorar falhas no emulador local)
    const today = new Date().toISOString().split("T")[0];
    let currentUsage = 0;
    
    if (!process.env.FUNCTIONS_EMULATOR) {
        try {
            const userLimitRef = db.collection("users_limits").doc(uid);
            const limitDoc = await userLimitRef.get();
            if (limitDoc.exists) {
                const limitData = limitDoc.data();
                if (limitData?.date === today) {
                    currentUsage = limitData.count || 0;
                }
            }
        } catch (e) {
            console.warn("Pulando validação de Rate Limit (ambiente sem credenciais GCE).");
        }
    }

    if (currentUsage >= MAX_DAILY_REQUESTS) {
        throw new functions.https.HttpsError(
            "resource-exhausted",
            "Limite diário de pesquisas atingido. Tente novamente amanhã."
        );
    }

    // 3. Verificar Cache Global (Ignorar falhas no emulador)
    const cacheKey = createHash("sha256")
        .update(`${keyword.toLowerCase()}\u0000${local.toLowerCase()}`)
        .digest("hex");
    let cacheData = null;
    
    if (!process.env.FUNCTIONS_EMULATOR) {
        try {
            const cacheRef = db.collection("radar_cache").doc(cacheKey);
            const cacheDoc = await cacheRef.get();
            if (cacheDoc.exists) {
                cacheData = cacheDoc.data();
            }
        } catch (e) {
            console.warn("Pulando verificação de Cache (ambiente sem credenciais GCE).");
        }
    }

    if (cacheData) {
        const diffTime = Math.abs(new Date().getTime() - new Date(cacheData.timestamp).getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
        
        // Se o cache tem menos de 7 dias, retorna ele
        if (diffDays <= 7 && cacheData?.result) {
            if (!process.env.FUNCTIONS_EMULATOR) {
                try {
                    await db.collection("users_limits").doc(uid).set({ date: today, count: currentUsage + 1 }, { merge: true });
                } catch (e) {}
            }
            return cacheData.result;
        }
    }

    // --- CACHE MISS: Iniciar Processamento Estrutural ---
    const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY || functions.config().places?.api_key;
    const GROQ_API_KEY = process.env.GROQ_API_KEY || functions.config().groq?.api_key;

    if (!GOOGLE_API_KEY || !GROQ_API_KEY) {
        throw new functions.https.HttpsError(
            "internal",
            "Serviço temporariamente indisponível. (Chaves de API ausentes)"
        );
    }

    try {
        // 4. Coletar do Google Places (Top 3)
        // Usamos a Text Search API (New)
        const searchQuery = `${keyword} em ${local}`;
        
        const placesResponse = await axios.post(
            'https://places.googleapis.com/v1/places:searchText',
            {
                textQuery: searchQuery,
                languageCode: "pt-BR",
                maxResultCount: 3
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'X-Goog-Api-Key': GOOGLE_API_KEY,
                    'X-Goog-FieldMask': 'places.displayName,places.rating,places.userRatingCount,places.primaryType,places.types,places.formattedAddress,places.websiteUri,places.regularOpeningHours,places.reviews'
                }
            }
        );

        const places = placesResponse.data.places || [];

        if (places.length === 0) {
            return {
                status: "empty",
                message: "Nenhum concorrente relevante encontrado para esta busca."
            };
        }

        // 5. Normalizar Dados e Calcular Score Determinístico
        const concorrentesNormalizados = places.map((place: any) => {
            const rating = place.rating || 0;
            const reviewsCount = place.userRatingCount || 0;
            
            // Score Determinístico
            // Reputação (30%): (rating/5) * 30
            const scoreReputation = (rating / 5.0) * 30;
            
            // Autoridade (30%): Logarítmico (max 30 pts em ~500 reviews)
            // Log base 10: log10(500) ≈ 2.69 -> (log10(reviews+1) / 2.7) * 30
            let scoreAuthority = (Math.log10(reviewsCount + 1) / 2.7) * 30;
            if (scoreAuthority > 30) scoreAuthority = 30;

            // Completude (40%)
            let scoreCompleteness = 0;
            if (place.websiteUri) scoreCompleteness += 15;
            if (place.regularOpeningHours) scoreCompleteness += 10;
            if (place.types && place.types.length > 1) scoreCompleteness += 15; // Possui categorias secundárias
            
            const totalScore = Math.min(Math.round(scoreReputation + scoreAuthority + scoreCompleteness), 100);

            // Filtrar apenas o texto das reviews (máximo 5) para enviar pra IA
            const textosReviews = (place.reviews || []).slice(0, 5).map((r: any) => r.text?.text).filter(Boolean);

            return {
                nome: place.displayName?.text || "Desconhecido",
                rating: rating,
                reviews: reviewsCount,
                categoriaPrincipal: place.primaryType || "N/A",
                categoriasSecundarias: place.types || [],
                website: !!place.websiteUri,
                score: totalScore,
                amostraAvaliacoes: textosReviews
            };
        });

        // 6. Gerar Insights com Groq (Llama-3)
        // Mandamos o JSON formatado, sem textos brutos sujos, para análise tática
        const groq = new Groq({ apiKey: GROQ_API_KEY });
        
        const systemPrompt = `Você é um Analista de SEO Local Sênior. Sua tarefa é analisar o JSON com os dados dos Top 3 concorrentes de uma região e extrair inteligência.
Retorne EXCLUSIVAMENTE um objeto JSON válido (sem markdown, sem crases, sem texto adicional) com a seguinte estrutura:
{
  "palavras_chave_mercado": ["kw1", "kw2", "kw3", "kw4", "kw5"],
  "oportunidades_crescimento": [
    {"pontos_ganhos": "+15", "acao": "Adicionar X na ficha"},
    {"pontos_ganhos": "+10", "acao": "Fazer Y"}
  ],
  "estrategia_ofensiva": ["Ação prática 1", "Ação prática 2", "Ação prática 3"]
}`;

        const userPrompt = `DADOS DOS CONCORRENTES TOP 3 PARA O TERMO "${keyword}" EM "${local}":\n\n${JSON.stringify(concorrentesNormalizados, null, 2)}`;

        const chatCompletion = await groq.chat.completions.create({
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            model: "llama3-8b-8192",
            temperature: 0.1, // Temperatura baixa para consistência JSON
        });

        const iaResponseText = chatCompletion.choices[0]?.message?.content || "{}";
        let iaData;
        try {
            // Tentar extrair apenas o JSON se a IA responder com sujeira
            const jsonMatch = iaResponseText.match(/\{[\s\S]*\}/);
            iaData = JSON.parse(jsonMatch ? jsonMatch[0] : iaResponseText);
        } catch (e) {
            console.error("Falha ao fazer parse do retorno da IA", iaResponseText);
            iaData = {
                palavras_chave_mercado: [],
                oportunidades_crescimento: [],
                estrategia_ofensiva: ["Erro ao processar insights da IA."]
            };
        }

        // 7. Consolidar Resposta Final
        const finalResult = {
            status: "success",
            busca: { keyword, local },
            concorrentes: concorrentesNormalizados,
            insights: iaData,
            timestamp: new Date().toISOString()
        };

        // 8. Salvar no Cache Global e Atualizar Limite do Usuário
        if (!process.env.FUNCTIONS_EMULATOR) {
            try {
                await db.collection("radar_cache").doc(cacheKey).set({
                    timestamp: new Date().toISOString(),
                    result: finalResult
                });
                await db.collection("users_limits").doc(uid).set({ date: today, count: currentUsage + 1 }, { merge: true });
            } catch (e) {
                console.warn("Pulando gravação no Firestore.");
            }
        }

        return finalResult;

    } catch (error: any) {
        console.error("Erro na Análise Radar SEO", error?.response?.data || error);
        
        const details = error?.response?.data?.error?.message || error.message;
        
        throw new functions.https.HttpsError(
            "internal",
            `Falha ao executar a análise: ${details}`
        );
    }
});

// ============================================================================
// LICENÇAS PREMIUM
// ============================================================================

function validEmail(value: unknown): string {
    const email = normalizedEmail(value);
    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new functions.https.HttpsError("invalid-argument", "E-mail inválido.");
    }
    return email;
}

function manualPremiumOverride(user: FirebaseFirestore.DocumentData | undefined): boolean | null {
    if (typeof user?.manualPremiumOverride === "boolean") {
        return user.manualPremiumOverride;
    }
    // Migração dos acessos manuais criados antes do campo explícito.
    if (user?.subscriptionStatus === "manual" && user?.isPremium === true) return true;
    if (user?.subscriptionStatus === "revoked") return false;
    return null;
}

function needsManualOverrideMigration(user: FirebaseFirestore.DocumentData | undefined): boolean {
    return typeof user?.manualPremiumOverride !== "boolean" &&
        (user?.subscriptionStatus === "manual" || user?.subscriptionStatus === "revoked");
}

function accessFromSources(
    user: FirebaseFirestore.DocumentData | undefined,
    license: FirebaseFirestore.DocumentData | undefined,
    hasManualInvitation: boolean
) {
    const override = manualPremiumOverride(user);
    if (override !== null) {
        return {
            isPremium: override,
            subscriptionStatus: override ? "manual-granted" : "manual-revoked"
        };
    }
    if (hasManualInvitation) {
        return { isPremium: true, subscriptionStatus: "manual-invitation" };
    }
    return {
        isPremium: license?.isPremium === true,
        subscriptionStatus: license?.subscriptionStatus || "free"
    };
}

async function syncUsersForEmail(email: string) {
    const [licenseSnapshot, manualSnapshot, usersSnapshot] = await Promise.all([
        db.collection("licenses").doc(email).get(),
        db.collection("premium_emails").doc(email).get(),
        db.collection("users").where("email", "==", email).get()
    ]);

    const verifiedUserDocs = (await Promise.all(usersSnapshot.docs.map(async (userDoc) => {
        try {
            const authUser = await admin.auth().getUser(userDoc.id);
            return authUser.emailVerified && normalizedEmail(authUser.email) === email
                ? userDoc
                : null;
        } catch {
            return null;
        }
    }))).filter((userDoc): userDoc is FirebaseFirestore.QueryDocumentSnapshot => userDoc !== null);

    const updates = verifiedUserDocs.map((userDoc) => {
        const access = accessFromSources(
            userDoc.data(),
            licenseSnapshot.data(),
            manualSnapshot.exists
        );
        return { ref: userDoc.ref, ...access };
    });

    for (let index = 0; index < updates.length; index += 450) {
        const batch = db.batch();
        updates.slice(index, index + 450).forEach((update) => {
            batch.set(update.ref, {
                isPremium: update.isPremium,
                subscriptionStatus: update.subscriptionStatus,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        });
        await batch.commit();
    }
}

/**
 * Atualiza o perfil autenticado a partir das fontes de acesso registradas
 * pelo servidor. O e-mail vem exclusivamente do token Firebase, nunca do app.
 */
async function claimPremiumAccess(context: functions.https.CallableContext) {
    const email = requireAuthenticatedEmail(context);
    const uid = context.auth!.uid;

    const [userSnapshot, licenseSnapshot, manualSnapshot] = await Promise.all([
        db.collection("users").doc(uid).get(),
        db.collection("licenses").doc(email).get(),
        db.collection("premium_emails").doc(email).get()
    ]);

    const access = isAdmin(context)
        ? { isPremium: true, subscriptionStatus: "admin" }
        : accessFromSources(userSnapshot.data(), licenseSnapshot.data(), manualSnapshot.exists);

    await db.collection("users").doc(uid).set({
        email,
        displayName: context.auth!.token.name || null,
        photoURL: context.auth!.token.picture || null,
        licenseEmailVerified: true,
        isPremium: access.isPremium,
        subscriptionStatus: access.subscriptionStatus,
        ...(needsManualOverrideMigration(userSnapshot.data())
            ? { manualPremiumOverride: manualPremiumOverride(userSnapshot.data()) }
            : {}),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    return access;
}

export const claimPremiumLicense = functions.https.onCall(async (_data, context) => {
    return claimPremiumAccess(context);
});

// Compatibilidade para versões do desktop que ainda chamam o nome anterior.
// Esta função não cria novas compras Kiwify; somente atualiza acessos já existentes.
export const claimKiwifyLicense = functions.https.onCall(async (_data, context) => {
    return claimPremiumAccess(context);
});

/**
 * Registra no servidor o aceite explícito dos documentos legais vigentes.
 * O documento em /legal_acceptances é privado: ele não pode ser criado nem
 * alterado pelo cliente pelas regras do Firestore, servindo como trilha de
 * auditoria independente do perfil visível no app.
 */
export const acceptLegalDocuments = functions.https.onCall(async (data, context) => {
    const email = requireAuthenticatedEmail(context);
    const uid = context.auth!.uid;
    const termsVersion = typeof data?.termsVersion === "string" ? data.termsVersion : "";
    const privacyVersion = typeof data?.privacyVersion === "string" ? data.privacyVersion : "";

    if (termsVersion !== LEGAL_DOCUMENTS_VERSION || privacyVersion !== LEGAL_DOCUMENTS_VERSION) {
        throw new functions.https.HttpsError(
            "failed-precondition",
            "Atualize o aplicativo para revisar e aceitar os documentos vigentes."
        );
    }

    const userRef = db.collection("users").doc(uid);
    const auditRef = db.collection("legal_acceptances").doc(`${uid}_${LEGAL_DOCUMENTS_VERSION}`);

    const result = await db.runTransaction(async (transaction) => {
        const [userSnapshot, auditSnapshot] = await Promise.all([
            transaction.get(userRef),
            transaction.get(auditRef)
        ]);
        const previousAcceptance = userSnapshot.data()?.legalAcceptance;
        const alreadyAccepted = previousAcceptance?.termsVersion === LEGAL_DOCUMENTS_VERSION &&
            previousAcceptance?.privacyVersion === LEGAL_DOCUMENTS_VERSION;

        if (!alreadyAccepted) {
            transaction.set(userRef, {
                email,
                legalAcceptance: {
                    termsVersion: LEGAL_DOCUMENTS_VERSION,
                    privacyVersion: LEGAL_DOCUMENTS_VERSION,
                    acceptedAt: admin.firestore.FieldValue.serverTimestamp(),
                    source: "desktop-app"
                },
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        }

        // Mantém o primeiro aceite desta versão imutável no registro de auditoria.
        if (!auditSnapshot.exists) {
            transaction.create(auditRef, {
                userId: uid,
                email,
                termsVersion: LEGAL_DOCUMENTS_VERSION,
                privacyVersion: LEGAL_DOCUMENTS_VERSION,
                acceptedAt: admin.firestore.FieldValue.serverTimestamp(),
                source: "desktop-app"
            });
        }

        return { alreadyAccepted };
    });

    return {
        accepted: true,
        version: LEGAL_DOCUMENTS_VERSION,
        alreadyAccepted: result.alreadyAccepted
    };
});

/**
 * Confirma e grava a máquina apenas no servidor. Isso impede que o navegador
 * associe ou altere o hardware_id por conta própria.
 */
export const verifyPremiumDevice = functions.https.onCall(async (data, context) => {
    requireAuthenticatedEmail(context);
    const hardwareId = typeof data.hardwareId === "string" ? data.hardwareId.trim() : "";
    if (!hardwareId || hardwareId.length > 200) {
        throw new functions.https.HttpsError("invalid-argument", "Identificador de dispositivo inválido.");
    }

    const userRef = db.collection("users").doc(context.auth!.uid);
    const result = await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(userRef);
        const user = snapshot.data() || {};
        const premium = user.isPremium === true || isAdmin(context);
        if (!premium) return { isPremium: false, deviceAllowed: false };

        if (isAdmin(context) || !user.hardware_id) {
            transaction.set(userRef, {
                hardware_id: hardwareId,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            return { isPremium: true, deviceAllowed: true };
        }

        return { isPremium: true, deviceAllowed: user.hardware_id === hardwareId };
    });

    return result;
});

export const setPremiumAccess = functions.https.onCall(async (data, context) => {
    if (!isAdmin(context)) {
        throw new functions.https.HttpsError("permission-denied", "Apenas administradores podem alterar licenças.");
    }
    const uid = typeof data.uid === "string" ? data.uid.trim() : "";
    if (!uid || uid.length > 128 || typeof data.enabled !== "boolean") {
        throw new functions.https.HttpsError("invalid-argument", "Dados de licença inválidos.");
    }

    await db.collection("users").doc(uid).set({
        manualPremiumOverride: data.enabled,
        isPremium: data.enabled,
        subscriptionStatus: data.enabled ? "manual-granted" : "manual-revoked",
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    return { ok: true };
});

export const resetPremiumDevice = functions.https.onCall(async (data, context) => {
    if (!isAdmin(context)) {
        throw new functions.https.HttpsError("permission-denied", "Apenas administradores podem resetar dispositivos.");
    }
    const uid = typeof data.uid === "string" ? data.uid.trim() : "";
    if (!uid || uid.length > 128) {
        throw new functions.https.HttpsError("invalid-argument", "Usuário inválido.");
    }

    await db.collection("users").doc(uid).set({
        hardware_id: admin.firestore.FieldValue.delete(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    return { ok: true };
});

export const addPremiumEmail = functions.https.onCall(async (data, context) => {
    if (!isAdmin(context)) {
        throw new functions.https.HttpsError("permission-denied", "Apenas administradores podem alterar convites Premium.");
    }
    const email = validEmail(data?.email);
    await db.collection("premium_emails").doc(email).set({
        addedAt: admin.firestore.FieldValue.serverTimestamp(),
        addedBy: context.auth!.uid
    }, { merge: true });
    await syncUsersForEmail(email);
    return { ok: true };
});

export const removePremiumEmail = functions.https.onCall(async (data, context) => {
    if (!isAdmin(context)) {
        throw new functions.https.HttpsError("permission-denied", "Apenas administradores podem alterar convites Premium.");
    }
    const email = validEmail(data?.email);
    await db.collection("premium_emails").doc(email).delete();
    await syncUsersForEmail(email);
    return { ok: true };
});

export const recordOptimization = functions.https.onCall(async (data, context) => {
    requireAuthenticatedEmail(context);
    const count = Number(data?.count);
    if (!Number.isInteger(count) || count < 1 || count > 2000) {
        throw new functions.https.HttpsError("invalid-argument", "Quantidade inválida.");
    }

    await db.collection("stats").doc("global").set({
        totalImagesOptimized: admin.firestore.FieldValue.increment(count),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    return { ok: true };
});

// ============================================================================
// ASSINATURAS E WEBHOOK MERCADO PAGO
// ============================================================================

const MERCADOPAGO_SUBSCRIPTION_NOTIFICATION_URL =
    "https://us-central1-exifrankapp.cloudfunctions.net/mercadoPagoWebhook?source_news=webhooks";
// O Checkout de Assinaturas exige uma URL pública de retorno. Como o ExifRank
// é um app desktop, esta página apenas orienta o cliente a voltar ao aplicativo;
// a confirmação do acesso é feita exclusivamente pelo webhook validado.
const MERCADOPAGO_CHECKOUT_RETURN_URL =
    "https://us-central1-exifrankapp.cloudfunctions.net/mercadoPagoCheckoutReturn";
const CHECKOUT_CREATION_GRACE_MS = 60_000;
const FINAL_PAYMENT_FAILURE_STATUSES = new Set([
    "rejected", "cancelled", "refunded", "charged_back", "charged-back"
]);

type MercadoPagoPlanCode = "monthly" | "annual";

type MercadoPagoSubscriptionPlan = {
    code: MercadoPagoPlanCode;
    label: string;
    reason: string;
    amountCents: number;
    frequency: number;
    frequencyType: "months";
};

type MercadoPagoSubscription = {
    id: string;
    status: string;
    amountCents: number;
    currency: string;
    frequency: number;
    frequencyType: string;
    externalReference: string;
    payerEmail: string | null;
    updatedAt: string | null;
};

type MercadoPagoAuthorizedPayment = {
    id: string;
    subscriptionId: string;
    status: string;
    paymentStatus: string | null;
    amountCents: number | null;
    currency: string;
    updatedAt: string | null;
};

type MercadoPagoCheckoutReservation = {
    orderRef: FirebaseFirestore.DocumentReference;
    sessionRef: FirebaseFirestore.DocumentReference;
    externalReference: string;
    checkoutUrl: string | null;
};

function configuredMercadoPagoPriceCents(configured: string, label: string): number {
    if (!/^\d+$/.test(configured)) {
        throw new Error(`Preço ${label} do Mercado Pago não configurado em centavos.`);
    }
    const amount = Number(configured);
    if (!Number.isSafeInteger(amount) || amount < 100 || amount > 10_000_000) {
        throw new Error(`Preço ${label} do Mercado Pago fora da faixa permitida.`);
    }
    return amount;
}

function mercadoPagoSubscriptionPlan(data: unknown): MercadoPagoSubscriptionPlan {
    const requestedPlan = typeof (data as { plan?: unknown })?.plan === "string"
        ? (data as { plan: string }).plan.trim().toLowerCase()
        : "monthly";

    if (requestedPlan === "monthly") {
        return {
            code: "monthly",
            label: "Mensal",
            reason: "ExifRank Premium — assinatura mensal",
            amountCents: configuredMercadoPagoPriceCents(
                readSecret("MERCADOPAGO_MONTHLY_PRICE_CENTS", MERCADOPAGO_MONTHLY_PRICE_CENTS).trim(),
                "mensal"
            ),
            frequency: 1,
            frequencyType: "months"
        };
    }

    if (requestedPlan === "annual") {
        return {
            code: "annual",
            label: "Anual",
            reason: "ExifRank Premium — assinatura anual",
            amountCents: configuredMercadoPagoPriceCents(
                readSecret("MERCADOPAGO_ANNUAL_PRICE_CENTS", MERCADOPAGO_ANNUAL_PRICE_CENTS).trim(),
                "anual"
            ),
            frequency: 12,
            frequencyType: "months"
        };
    }

    throw new functions.https.HttpsError("invalid-argument", "Plano Premium inválido.");
}

function mercadoPagoAccessToken(): string {
    const token = readSecret("MERCADOPAGO_ACCESS_TOKEN", MERCADOPAGO_ACCESS_TOKEN).trim();
    if (!token) throw new Error("Access Token do Mercado Pago não configurado.");
    return token;
}

function mercadoPagoIsSandbox(accessToken: string): boolean {
    const configured = readSecret("MERCADOPAGO_ENVIRONMENT", MERCADOPAGO_ENVIRONMENT)
        .trim()
        .toLowerCase();
    if (configured === "sandbox") return true;
    if (configured === "production") return false;
    // Compatibilidade com as credenciais TEST- já configuradas. Novas
    // configurações devem sempre definir MERCADOPAGO_ENVIRONMENT.
    return accessToken.startsWith("TEST-");
}

function mercadoPagoPayerEmail(isSandbox: boolean, licenseEmail: string): string {
    if (!isSandbox) return licenseEmail;
    // O Mercado Pago reserva este e-mail para transações de sandbox. A conta
    // Comprador de teste é usada no checkout para autenticar e concluir o teste.
    return "test@testuser.com";
}

function mercadoPagoSubscriptionEndDate(): string {
    // O fluxo de assinatura pendente documentado pelo Mercado Pago inclui um
    // término da recorrência. Uma janela longa mantém a assinatura mensal
    // contínua na prática, sem depender do comportamento implícito da API.
    const endDate = new Date();
    endDate.setUTCFullYear(endDate.getUTCFullYear() + 10);
    return endDate.toISOString();
}

function mercadoPagoCheckoutContext(accessToken: string, planCode: MercadoPagoPlanCode): string {
    // Guarda somente um hash, nunca o Access Token. Isso impede que um
    // checkout pendente de outra conta/ambiente seja reutilizado após a troca
    // de credenciais, sem registrar dados sensíveis no Firestore.
    const environment = mercadoPagoIsSandbox(accessToken) ? "sandbox" : "production";
    return createHash("sha256").update(environment + ":" + planCode + ":" + accessToken).digest("hex");
}

function mercadoPagoWebhookSecret(): string {
    const secret = readSecret("MERCADOPAGO_WEBHOOK_SECRET", MERCADOPAGO_WEBHOOK_SECRET).trim();
    if (!secret) throw new Error("Assinatura do webhook do Mercado Pago não configurada.");
    return secret;
}

function mercadoPagoHeaders(accessToken: string, contentType = false): Record<string, string> {
    const headers: Record<string, string> = { Authorization: "Bearer " + accessToken };
    // No ambiente de teste, a própria documentação de Assinaturas usa este
    // escopo. Sem ele, a API pode responder apenas com 500 genérico para uma
    // credencial de vendedor de teste, sem apontar o campo incorreto.
    if (mercadoPagoIsSandbox(accessToken)) headers["X-scope"] = "stage";
    if (contentType) headers["Content-Type"] = "application/json";
    return headers;
}

function centsFromAmount(value: unknown): number | null {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0) return null;
    const cents = Math.round(amount * 100);
    return Math.abs(amount * 100 - cents) < 0.000001 && Number.isSafeInteger(cents) ? cents : null;
}

function timestampMillis(value: unknown): number {
    return value instanceof admin.firestore.Timestamp ? value.toMillis() : 0;
}

function isFinalPaymentFailure(paymentStatus: unknown): boolean {
    return typeof paymentStatus === "string" &&
        FINAL_PAYMENT_FAILURE_STATUSES.has(paymentStatus.trim().toLowerCase());
}

function mercadoPagoErrorSummary(error: any) {
    const payload = error?.response?.data || {};
    const firstCause = Array.isArray(payload?.cause) ? payload.cause[0] : null;
    const responseHeaders = error?.response?.headers || {};
    return {
        httpStatus: Number.isInteger(error?.response?.status) ? error.response.status : null,
        error: typeof payload?.error === "string" ? payload.error : null,
        message: typeof payload?.message === "string" ? payload.message : null,
        causeCode: typeof firstCause?.code === "string" ? firstCause.code : null,
        causeDescription: typeof firstCause?.description === "string" ? firstCause.description : null,
        requestId: typeof responseHeaders["x-request-id"] === "string"
            ? responseHeaders["x-request-id"]
            : null,
        networkMessage: !error?.response && typeof error?.message === "string" ? error.message : null
    };
}

async function mercadoPagoTokenAccountSummary(accessToken: string) {
    try {
        const response = await axios.get(
            "https://api.mercadolibre.com/users/me",
            { headers: mercadoPagoHeaders(accessToken), timeout: 10000 }
        );
        const account = response.data || {};
        return {
            httpStatus: response.status,
            userId: Number.isSafeInteger(Number(account.id)) ? Number(account.id) : null,
            siteId: typeof account.site_id === "string" ? account.site_id : null
        };
    } catch (error: any) {
        return { ...mercadoPagoErrorSummary(error), userId: null, siteId: null };
    }
}

async function reserveMercadoPagoCheckout(
    uid: string,
    email: string,
    plan: MercadoPagoSubscriptionPlan,
    checkoutContext: string
): Promise<MercadoPagoCheckoutReservation> {
    const sessionRef = db.collection("mercadopago_checkout_sessions").doc(uid);

    return db.runTransaction(async (transaction) => {
        const sessionSnapshot = await transaction.get(sessionRef);
        const session = sessionSnapshot.data() || {};
        const existingOrderId = typeof session.orderId === "string" && /^[A-Za-z0-9]{20}$/.test(session.orderId)
            ? session.orderId
            : "";
        const existingStatus = typeof session.status === "string" ? session.status : "";
        const existingCheckoutUrl = typeof session.checkoutUrl === "string" &&
            session.checkoutUrl.startsWith("https://")
            ? session.checkoutUrl
            : "";
        const sameCheckoutContext = session.checkoutContext === checkoutContext;
        const existingPlanCode = typeof session.planCode === "string" ? session.planCode : "";

        // O mesmo checkout pendente é devolvido em qualquer nova tentativa,
        // impedindo que recarregar o app ou clicar novamente crie outra cobrança.
        if (sameCheckoutContext && existingOrderId && existingStatus === "ready" && existingCheckoutUrl) {
            return {
                orderRef: db.collection("mercadopago_subscriptions").doc(existingOrderId),
                sessionRef,
                externalReference: "exifrank-mp-sub:" + existingOrderId,
                checkoutUrl: existingCheckoutUrl
            };
        }

        if (existingOrderId && (existingStatus === "active" || existingStatus === "payment-failed")) {
            throw new functions.https.HttpsError(
                "failed-precondition",
                existingStatus === "active"
                    ? "Já existe uma assinatura ativa para esta conta. Aguarde a atualização do acesso Premium."
                    : "Existe uma cobrança pendente nesta assinatura. Regularize-a no Mercado Pago antes de iniciar uma nova."
            );
        }

        if (existingOrderId && existingStatus === "ready" && existingCheckoutUrl) {
            throw new functions.https.HttpsError(
                "failed-precondition",
                "Existe um checkout pendente para outro plano. Conclua ou cancele essa assinatura no Mercado Pago antes de trocar de plano."
            );
        }

        if (existingOrderId && existingStatus === "creating") {
            if (!sameCheckoutContext || existingPlanCode !== plan.code) {
                throw new functions.https.HttpsError(
                    "aborted",
                    "Estamos preparando outro checkout. Aguarde alguns segundos antes de trocar de plano."
                );
            }
            const ageMs = Date.now() - timestampMillis(session.updatedAt || session.createdAt);
            if (ageMs >= 0 && ageMs < CHECKOUT_CREATION_GRACE_MS) {
                throw new functions.https.HttpsError(
                    "aborted",
                    "Estamos preparando seu checkout. Aguarde alguns segundos e tente novamente."
                );
            }

            // Se a execução anterior terminou de forma inesperada, retomamos o
            // mesmo pedido e a mesma chave de idempotência, nunca criamos outro.
            transaction.set(sessionRef, {
                uid,
                email,
                amountCents: plan.amountCents,
                planCode: plan.code,
                billingFrequency: plan.frequency,
                billingFrequencyType: plan.frequencyType,
                status: "creating",
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            return {
                orderRef: db.collection("mercadopago_subscriptions").doc(existingOrderId),
                sessionRef,
                externalReference: "exifrank-mp-sub:" + existingOrderId,
                checkoutUrl: null
            };
        }

        const orderRef = db.collection("mercadopago_subscriptions").doc();
        const externalReference = "exifrank-mp-sub:" + orderRef.id;
        transaction.set(orderRef, {
            uid,
            email,
            planCode: plan.code,
            planLabel: plan.label,
            amountCents: plan.amountCents,
            billingFrequency: plan.frequency,
            billingFrequencyType: plan.frequencyType,
            currency: "BRL",
            externalReference,
            isPremium: false,
            status: "subscription-created",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        transaction.set(sessionRef, {
            uid,
            email,
            planCode: plan.code,
            amountCents: plan.amountCents,
            billingFrequency: plan.frequency,
            billingFrequencyType: plan.frequencyType,
            checkoutContext,
            orderId: orderRef.id,
            status: "creating",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        return { orderRef, sessionRef, externalReference, checkoutUrl: null };
    });
}

async function updateMercadoPagoCheckoutSession(
    reservation: MercadoPagoCheckoutReservation,
    data: Record<string, unknown>
) {
    await db.runTransaction(async (transaction) => {
        const sessionSnapshot = await transaction.get(reservation.sessionRef);
        const session = sessionSnapshot.data() || {};
        // Nunca permita que uma tentativa antiga altere uma sessão mais nova.
        if (session.orderId !== reservation.orderRef.id) return;
        transaction.set(reservation.sessionRef, {
            ...data,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    });
}

function resourceIdFromRequest(req: functions.https.Request): string {
    const candidate = req.query["data.id"];
    const value = Array.isArray(candidate) ? candidate[0] : candidate;
    const id = typeof value === "string" ? value.trim().toLowerCase() : "";
    if (!/^[a-z0-9_-]{1,128}$/.test(id)) {
        throw new Error("Notificação sem identificador de pagamento válido.");
    }
    return id;
}

function headerString(req: functions.https.Request, name: string): string {
    const value = req.get(name);
    return typeof value === "string" ? value.trim() : "";
}

function signedHeaderParts(xSignature: string): { timestamp: string; signature: string } | null {
    const parts = new Map<string, string>();
    xSignature.split(",").forEach((part) => {
        const separator = part.indexOf("=");
        if (separator <= 0) return;
        parts.set(part.slice(0, separator).trim(), part.slice(separator + 1).trim());
    });
    const timestamp = parts.get("ts") || "";
    const signature = parts.get("v1") || "";
    if (!/^\d{10,16}$/.test(timestamp) || !/^[a-f0-9]{64}$/i.test(signature)) return null;
    return { timestamp, signature: signature.toLowerCase() };
}

function validMercadoPagoWebhook(req: functions.https.Request, resourceId: string, secret: string): boolean {
    const signed = signedHeaderParts(headerString(req, "x-signature"));
    if (!signed) return false;

    const requestId = headerString(req, "x-request-id");
    const manifest = [
        `id:${resourceId};`,
        ...(requestId ? [`request-id:${requestId};`] : []),
        `ts:${signed.timestamp};`
    ].join("");
    const expected = createHmac("sha256", secret).update(manifest).digest("hex");
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signed.signature, "hex"));
}

function subscriptionOrderIdFromExternalReference(reference: unknown): string {
    const value = typeof reference === "string" ? reference.trim() : "";
    const prefix = "exifrank-mp-sub:";
    const orderId = value.startsWith(prefix) ? value.slice(prefix.length) : "";
    return /^[A-Za-z0-9]{20}$/.test(orderId) ? orderId : "";
}

async function fetchMercadoPagoSubscription(subscriptionId: string): Promise<MercadoPagoSubscription> {
    const accessToken = mercadoPagoAccessToken();
    const response = await axios.get(
        "https://api.mercadopago.com/preapproval/" + encodeURIComponent(subscriptionId),
        { headers: mercadoPagoHeaders(accessToken), timeout: 10000 }
    );
    const subscription = response.data || {};
    const id = String(subscription.id || "").trim().toLowerCase();
    const amountCents = centsFromAmount(subscription.auto_recurring?.transaction_amount);
    const status = String(subscription.status || "").trim().toLowerCase();
    const currency = String(subscription.auto_recurring?.currency_id || "").trim().toUpperCase();
    const frequency = Number(subscription.auto_recurring?.frequency);
    const frequencyType = String(subscription.auto_recurring?.frequency_type || "").trim().toLowerCase();
    const externalReference = String(subscription.external_reference || "").trim();

    if (
        id !== subscriptionId || amountCents === null || !status || !currency || !externalReference ||
        !Number.isSafeInteger(frequency) || frequency < 1 || !frequencyType
    ) {
        throw new Error("A API do Mercado Pago retornou uma assinatura inválida.");
    }
    return {
        id,
        status,
        amountCents,
        currency,
        frequency,
        frequencyType,
        externalReference,
        payerEmail: normalizedEmail(subscription.payer_email) || null,
        updatedAt: typeof subscription.last_modified === "string" ? subscription.last_modified : null
    };
}

function shouldReplacePendingMercadoPagoCheckout(data: unknown): boolean {
    return (data as { replacePending?: unknown })?.replacePending === true;
}

async function hasPendingMercadoPagoCheckoutForDifferentPlan(
    uid: string,
    checkoutContext: string
): Promise<boolean> {
    const sessionSnapshot = await db.collection("mercadopago_checkout_sessions").doc(uid).get();
    const session = sessionSnapshot.data() || {};
    const hasOrder = typeof session.orderId === "string" && /^[A-Za-z0-9]{20}$/.test(session.orderId);
    const hasCheckoutUrl = typeof session.checkoutUrl === "string" && session.checkoutUrl.startsWith("https://");
    return hasOrder && hasCheckoutUrl && session.status === "ready" &&
        session.checkoutContext !== checkoutContext;
}

/**
 * Cancela somente um checkout ainda pendente e vinculado à própria conta do
 * usuário. Isso permite trocar o plano sem deixar uma cobrança incompleta no
 * Mercado Pago e sem jamais cancelar uma assinatura já autorizada.
 */
async function cancelPendingMercadoPagoCheckoutForPlanChange(
    uid: string,
    email: string,
    accessToken: string
): Promise<boolean> {
    const sessionRef = db.collection("mercadopago_checkout_sessions").doc(uid);
    const sessionSnapshot = await sessionRef.get();
    const session = sessionSnapshot.data() || {};
    const orderId = typeof session.orderId === "string" && /^[A-Za-z0-9]{20}$/.test(session.orderId)
        ? session.orderId
        : "";
    const sessionStatus = typeof session.status === "string" ? session.status : "";
    const hasCheckoutUrl = typeof session.checkoutUrl === "string" && session.checkoutUrl.startsWith("https://");

    if (!orderId || sessionStatus !== "ready" || !hasCheckoutUrl) return false;

    const orderRef = db.collection("mercadopago_subscriptions").doc(orderId);
    const orderSnapshot = await orderRef.get();
    if (!orderSnapshot.exists) return false;

    const order = orderSnapshot.data() || {};
    if (order.uid !== uid || validEmail(order.email) !== email) {
        throw new functions.https.HttpsError(
            "permission-denied",
            "Não foi possível alterar um checkout vinculado a outra conta."
        );
    }

    const rawSubscriptionId = typeof session.subscriptionId === "string"
        ? session.subscriptionId
        : order.subscriptionId;
    const subscriptionId = typeof rawSubscriptionId === "string"
        ? rawSubscriptionId.trim().toLowerCase()
        : "";
    if (!/^[a-z0-9_-]{1,128}$/.test(subscriptionId)) return false;

    const subscription = await fetchMercadoPagoSubscription(subscriptionId);
    if (subscription.externalReference !== "exifrank-mp-sub:" + orderId) {
        throw new functions.https.HttpsError(
            "permission-denied",
            "Não foi possível confirmar a propriedade do checkout pendente."
        );
    }

    let remoteStatus = subscription.status;
    if (remoteStatus === "pending") {
        try {
            // A API legada que atende esta conta usa "cancelled". A grafia
            // "canceled" documentada atualmente é rejeitada por esse endpoint.
            const response = await axios.put(
                "https://api.mercadopago.com/preapproval/" + encodeURIComponent(subscriptionId),
                { status: "cancelled" },
                { headers: mercadoPagoHeaders(accessToken, true), timeout: 10000 }
            );
            const responseId = String(response.data?.id || "").trim().toLowerCase();
            remoteStatus = String(response.data?.status || "").trim().toLowerCase();
            if (
                responseId !== subscriptionId ||
                (remoteStatus !== "canceled" && remoteStatus !== "cancelled")
            ) {
                throw new Error("O Mercado Pago não confirmou o cancelamento do checkout pendente.");
            }
        } catch (error: any) {
            // Nunca registre o AxiosError completo: ele contém os cabeçalhos da
            // requisição, incluindo a credencial usada na API.
            console.error("Falha sanitizada ao cancelar checkout Mercado Pago:", mercadoPagoErrorSummary(error));
            throw new functions.https.HttpsError(
                "unavailable",
                "Não foi possível encerrar o checkout anterior. Aguarde alguns segundos e tente novamente."
            );
        }
    } else if (remoteStatus === "authorized") {
        // Não cancelamos uma assinatura que já foi concluída, mesmo que o
        // webhook ainda esteja a caminho. Primeiro sincronizamos o acesso.
        await applyVerifiedMercadoPagoSubscription(subscription);
        return false;
    } else if (remoteStatus !== "canceled" && remoteStatus !== "cancelled") {
        return false;
    }

    let cleared = false;
    await db.runTransaction(async (transaction) => {
        const currentSessionSnapshot = await transaction.get(sessionRef);
        const currentSession = currentSessionSnapshot.data() || {};
        if (
            currentSession.orderId !== orderId ||
            currentSession.status !== "ready" ||
            String(currentSession.subscriptionId || "").trim().toLowerCase() !== subscriptionId
        ) {
            return;
        }

        transaction.set(orderRef, {
            isPremium: false,
            status: "canceled",
            canceledAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        transaction.set(sessionRef, {
            status: "canceled",
            canceledAt: admin.firestore.FieldValue.serverTimestamp(),
            cancellationReason: "plan-change",
            checkoutUrl: admin.firestore.FieldValue.delete(),
            subscriptionId: admin.firestore.FieldValue.delete(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        cleared = true;
    });

    return cleared;
}

async function fetchMercadoPagoAuthorizedPayment(invoiceId: string): Promise<MercadoPagoAuthorizedPayment> {
    const accessToken = mercadoPagoAccessToken();
    const response = await axios.get(
        "https://api.mercadopago.com/authorized_payments/" + encodeURIComponent(invoiceId),
        { headers: mercadoPagoHeaders(accessToken), timeout: 10000 }
    );
    const invoice = response.data || {};
    const id = String(invoice.id || "").trim().toLowerCase();
    const subscriptionId = String(invoice.preapproval_id || "").trim().toLowerCase();
    const status = String(invoice.status || "").trim().toLowerCase();
    const currency = String(invoice.currency_id || "").trim().toUpperCase();
    if (id !== invoiceId || !subscriptionId || !status || !currency) {
        throw new Error("A API do Mercado Pago retornou uma fatura inválida.");
    }
    return {
        id,
        subscriptionId,
        status,
        paymentStatus: typeof invoice.payment?.status === "string" ? invoice.payment.status.toLowerCase() : null,
        amountCents: centsFromAmount(invoice.transaction_amount),
        currency,
        updatedAt: typeof invoice.last_modified === "string" ? invoice.last_modified : null
    };
}

/** Cria uma assinatura mensal ou anual; preço, e-mail e referência não vêm do app. */
export const createMercadoPagoSubscription = functions
    .runWith({
        secrets: [
            MERCADOPAGO_ACCESS_TOKEN,
            MERCADOPAGO_MONTHLY_PRICE_CENTS,
            MERCADOPAGO_ANNUAL_PRICE_CENTS,
            MERCADOPAGO_ENVIRONMENT
        ]
    })
    .https.onCall(async (data, context) => {
        const email = requireAuthenticatedEmail(context);
        const plan = mercadoPagoSubscriptionPlan(data);
        const accessToken = mercadoPagoAccessToken();
        const isSandbox = mercadoPagoIsSandbox(accessToken);
        const payerEmail = mercadoPagoPayerEmail(isSandbox, email);
        const checkoutContext = mercadoPagoCheckoutContext(accessToken, plan.code);
        // Checkouts antigos (criados antes de existir a escolha mensal/anual)
        // não possuem checkoutContext. Quando o cliente escolhe um plano, eles
        // são substituídos automaticamente, sempre após a validação de dono e
        // de status pendente feita na função de cancelamento abaixo.
        const mustReplacePendingCheckout = shouldReplacePendingMercadoPagoCheckout(data) ||
            await hasPendingMercadoPagoCheckoutForDifferentPlan(context.auth!.uid, checkoutContext);
        if (mustReplacePendingCheckout) {
            const wasCancelled = await cancelPendingMercadoPagoCheckoutForPlanChange(
                context.auth!.uid,
                email,
                accessToken
            );
            if (!wasCancelled) {
                throw new functions.https.HttpsError(
                    "failed-precondition",
                    "O checkout anterior já não está pendente. Atualize sua conta e tente novamente."
                );
            }
        }
        const reservation = await reserveMercadoPagoCheckout(
            context.auth!.uid,
            email,
            plan,
            checkoutContext
        );
        if (reservation.checkoutUrl) return { checkoutUrl: reservation.checkoutUrl };

        const subscriptionPayload = {
            reason: plan.reason,
            external_reference: reservation.externalReference,
            payer_email: payerEmail,
            auto_recurring: {
                frequency: plan.frequency,
                frequency_type: plan.frequencyType,
                end_date: mercadoPagoSubscriptionEndDate(),
                transaction_amount: plan.amountCents / 100,
                currency_id: "BRL"
            },
            back_url: MERCADOPAGO_CHECKOUT_RETURN_URL,
            notification_url: MERCADOPAGO_SUBSCRIPTION_NOTIFICATION_URL,
            status: "pending"
        };

        try {
            const response = await axios.post(
                "https://api.mercadopago.com/preapproval",
                subscriptionPayload,
                {
                    headers: {
                        ...mercadoPagoHeaders(accessToken, true),
                        "X-Idempotency-Key": reservation.orderRef.id
                    },
                    timeout: 10000
                }
            );
            const checkoutUrl = String(response.data?.init_point || "").trim();
            const subscriptionId = String(response.data?.id || "").trim().toLowerCase();
            if (!checkoutUrl.startsWith("https://") || !subscriptionId) {
                throw new Error("O Mercado Pago não retornou um checkout de assinatura válido.");
            }

            await reservation.orderRef.set({
                subscriptionId,
                checkoutUrl,
                status: String(response.data?.status || "pending").toLowerCase(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            await updateMercadoPagoCheckoutSession(reservation, {
                status: "ready",
                checkoutUrl,
                subscriptionId
            });
            return { checkoutUrl };
        } catch (error: any) {
            await reservation.orderRef.set({
                status: "checkout-error",
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            await updateMercadoPagoCheckoutSession(reservation, { status: "checkout-error" });
            console.error("Não foi possível criar assinatura Mercado Pago:", {
                subscriptionRequest: mercadoPagoErrorSummary(error),
                tokenAccount: await mercadoPagoTokenAccountSummary(accessToken),
                requestShape: {
                    environment: isSandbox ? "sandbox" : "production",
                    payerKind: isSandbox ? "test-user" : "license-email",
                    frequency: subscriptionPayload.auto_recurring.frequency,
                    frequencyType: subscriptionPayload.auto_recurring.frequency_type,
                    hasEndDate: Boolean(subscriptionPayload.auto_recurring.end_date),
                    plan: plan.code,
                    amountCents: plan.amountCents,
                    currency: subscriptionPayload.auto_recurring.currency_id,
                    status: subscriptionPayload.status,
                    hasBackUrl: Boolean(subscriptionPayload.back_url),
                    hasNotificationUrl: Boolean(subscriptionPayload.notification_url)
                }
            });
            throw new functions.https.HttpsError("internal", "Não foi possível iniciar a assinatura. Tente novamente em instantes.");
        }
    });

async function applyVerifiedMercadoPagoSubscription(subscription: MercadoPagoSubscription): Promise<boolean> {
    const orderId = subscriptionOrderIdFromExternalReference(subscription.externalReference);
    if (!orderId) return false;

    const orderRef = db.collection("mercadopago_subscriptions").doc(orderId);
    let licenseEmail = "";

    await db.runTransaction(async (transaction) => {
        const orderSnapshot = await transaction.get(orderRef);
        if (!orderSnapshot.exists) throw new Error("Assinatura Mercado Pago não encontrada.");
        const order = orderSnapshot.data() || {};
        const email = validEmail(order.email);
        const expectedAmount = Number(order.amountCents);
        const expectedFrequency = Number(order.billingFrequency);
        const expectedFrequencyType = typeof order.billingFrequencyType === "string"
            ? order.billingFrequencyType.trim().toLowerCase()
            : "";
        if (!Number.isSafeInteger(expectedAmount) || expectedAmount < 100 || order.currency !== "BRL") {
            throw new Error("Assinatura Mercado Pago sem valor esperado válido.");
        }
        if (subscription.currency !== "BRL" || subscription.amountCents !== expectedAmount) {
            throw new Error("Valor ou moeda da assinatura Mercado Pago não correspondem ao pedido.");
        }
        // Pedidos antigos não possuíam frequência registrada. Nos pedidos novos,
        // validamos também a periodicidade para impedir um ciclo diferente com
        // o mesmo valor de cobrança.
        if (
            Number.isSafeInteger(expectedFrequency) && expectedFrequency > 0 &&
            (subscription.frequency !== expectedFrequency || subscription.frequencyType !== expectedFrequencyType)
        ) {
            throw new Error("Periodicidade da assinatura Mercado Pago não corresponde ao pedido.");
        }

        const sessionRef = typeof order.uid === "string" && order.uid.length > 0
            ? db.collection("mercadopago_checkout_sessions").doc(order.uid)
            : null;
        const [existingSubscriptions, legacyKiwifyOrders, sessionSnapshot] = await Promise.all([
            transaction.get(db.collection("mercadopago_subscriptions").where("email", "==", email)),
            transaction.get(db.collection("kiwify_orders").where("email", "==", email)),
            sessionRef ? transaction.get(sessionRef) : Promise.resolve(null)
        ]);
        // Uma assinatura pode continuar autorizada enquanto uma fatura é
        // recusada. A cobrança recusada precisa suspender o acesso até a
        // próxima fatura aprovada, sem afetar acessos manuais ou legados.
        const currentlyPremium = subscription.status === "authorized" &&
            !isFinalPaymentFailure(order.lastInvoicePaymentStatus);
        const priorMercadoPagoPremium = existingSubscriptions.docs.some((item) =>
            item.id !== orderId && item.data().isPremium === true
        );
        const legacyPremium = legacyKiwifyOrders.docs.some((item) => item.data().isPremium === true);
        const effectivePremium = currentlyPremium || priorMercadoPagoPremium || legacyPremium;

        transaction.set(orderRef, {
            subscriptionId: subscription.id,
            payerEmail: subscription.payerEmail,
            status: subscription.status,
            isPremium: currentlyPremium,
            verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
            sourceUpdatedAt: subscription.updatedAt,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        transaction.set(db.collection("licenses").doc(email), {
            email,
            isPremium: effectivePremium,
            subscriptionStatus: effectivePremium ? "subscription-active" : subscription.status,
            ...(typeof order.planCode === "string" ? { subscriptionPlan: order.planCode } : {}),
            lastOrderId: subscription.id,
            webhookSource: "mercadopago-subscription-api",
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        if (sessionRef && sessionSnapshot?.data()?.orderId === orderId) {
            const checkoutStatus = subscription.status === "pending"
                ? "ready"
                : currentlyPremium
                    ? "active"
                    : subscription.status === "authorized"
                        ? "payment-failed"
                        : subscription.status;
            transaction.set(sessionRef, {
                status: checkoutStatus,
                subscriptionId: subscription.id,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        }
        licenseEmail = email;
    });

    if (licenseEmail) await syncUsersForEmail(licenseEmail);
    return true;
}

async function recordMercadoPagoInvoice(invoice: MercadoPagoAuthorizedPayment) {
    const subscription = await fetchMercadoPagoSubscription(invoice.subscriptionId);
    const orderId = subscriptionOrderIdFromExternalReference(subscription.externalReference);
    if (!orderId) return false;
    await db.runTransaction(async (transaction) => {
        const orderRef = db.collection("mercadopago_subscriptions").doc(orderId);
        const orderSnapshot = await transaction.get(orderRef);
        if (!orderSnapshot.exists) throw new Error("Assinatura Mercado Pago não encontrada.");
        transaction.set(db.collection("mercadopago_invoices").doc(`${subscription.id}_${invoice.id}`), {
            subscriptionId: subscription.id,
            invoiceId: invoice.id,
            status: invoice.status,
            paymentStatus: invoice.paymentStatus,
            amountCents: invoice.amountCents,
            currency: invoice.currency,
            sourceUpdatedAt: invoice.updatedAt,
            verifiedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        transaction.set(orderRef, {
            lastInvoiceId: invoice.id,
            lastInvoiceStatus: invoice.status,
            lastInvoicePaymentStatus: invoice.paymentStatus,
            lastInvoiceUpdatedAt: invoice.updatedAt,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    });
    return applyVerifiedMercadoPagoSubscription(subscription);
}

/** Página simples exibida após o checkout; o acesso é confirmado pelo webhook. */
export const mercadoPagoCheckoutReturn = functions.https.onRequest((_req, res) => {
    res.set("Cache-Control", "no-store");
    res.status(200).type("html").send(`<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>ExifRank — Pagamento recebido</title></head>
<body style="margin:0;background:#f8fafc;color:#0f172a;font-family:system-ui,-apple-system,Segoe UI,sans-serif;display:grid;min-height:100vh;place-items:center;padding:24px;box-sizing:border-box">
<main style="max-width:440px;background:#fff;border:1px solid #d1fae5;border-radius:24px;padding:32px;text-align:center;box-shadow:0 16px 40px rgba(15,23,42,.08)">
<div style="font-size:38px">✓</div><h1 style="margin:12px 0 8px;font-size:24px">Pagamento em processamento</h1>
<p style="margin:0;color:#475569;line-height:1.55">Você já pode voltar ao ExifRank. Assim que o Mercado Pago confirmar a assinatura, seu acesso Premium será liberado automaticamente.</p>
</main></body></html>`);
});

function notificationTopic(req: functions.https.Request): string {
    const bodyTopic = req.body?.type;
    const queryTopic = req.query.type || req.query.topic;
    const value = typeof bodyTopic === "string" ? bodyTopic :
        (Array.isArray(queryTopic) ? queryTopic[0] : queryTopic);
    return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/**
 * Aceita somente notificações assinadas pelo Mercado Pago e consulta a
 * assinatura/fatura na API antes de alterar qualquer licença.
 */
export const mercadoPagoWebhook = functions
    .runWith({ secrets: [
        MERCADOPAGO_ACCESS_TOKEN,
        MERCADOPAGO_WEBHOOK_SECRET,
        MERCADOPAGO_ENVIRONMENT
    ] })
    .https.onRequest(async (req, res) => {
        if (req.method !== "POST") {
            res.status(405).send("Method Not Allowed");
            return;
        }

        try {
            const resourceId = resourceIdFromRequest(req);
            if (!validMercadoPagoWebhook(req, resourceId, mercadoPagoWebhookSecret())) {
                console.warn("Webhook Mercado Pago rejeitado: assinatura inválida ou ausente.");
                res.status(401).send("Unauthorized");
                return;
            }

            const topic = notificationTopic(req);
            if (topic === "subscription_preapproval") {
                const subscription = await fetchMercadoPagoSubscription(resourceId);
                const wasApplied = await applyVerifiedMercadoPagoSubscription(subscription);
                res.status(200).send(wasApplied ? "Mercado Pago subscription processed" : "Ignored subscription");
                return;
            }
            if (topic === "subscription_authorized_payment") {
                const invoice = await fetchMercadoPagoAuthorizedPayment(resourceId);
                const wasApplied = await recordMercadoPagoInvoice(invoice);
                res.status(200).send(wasApplied ? "Mercado Pago invoice processed" : "Ignored invoice");
                return;
            }

            // O tópico payment pode ser habilitado para auditoria no painel do
            // Mercado Pago; o acesso é sempre decidido pelo status da assinatura.
            res.status(200).send("Ignored Mercado Pago event");
        } catch (error: any) {
            console.error("Erro ao validar webhook Mercado Pago:", error?.response?.status || error?.message || error);
            res.status(502).send("Unable to validate Mercado Pago payment");
        }
    });
