"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeRadarSEO = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios_1 = require("axios");
const groq_sdk_1 = require("groq-sdk");
admin.initializeApp();
const db = admin.firestore();
const MAX_DAILY_REQUESTS = 15;
/**
 * Radar SEO Local Function
 */
exports.analyzeRadarSEO = functions.https.onCall(async (data, context) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    // 1. Verificação de Autenticação (Suporta Callable nativo e Fallback)
    let uid = (_a = context.auth) === null || _a === void 0 ? void 0 : _a.uid;
    if (!uid) {
        // Tentativa de autenticação manual (Fallback rápido p/ App Desktop emulador local)
        if (data.uid) {
            uid = data.uid;
        }
    }
    if (!uid) {
        throw new functions.https.HttpsError("unauthenticated", "Você precisa estar logado (ou sua sessão expirou) para usar o Radar SEO Local.");
    }
    const { keyword, local } = data;
    if (!keyword || !local) {
        throw new functions.https.HttpsError("invalid-argument", "Parâmetros 'keyword' e 'local' são obrigatórios.");
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
                if ((limitData === null || limitData === void 0 ? void 0 : limitData.date) === today) {
                    currentUsage = limitData.count || 0;
                }
            }
        }
        catch (e) {
            console.warn("Pulando validação de Rate Limit (ambiente sem credenciais GCE).");
        }
    }
    if (currentUsage >= MAX_DAILY_REQUESTS) {
        throw new functions.https.HttpsError("resource-exhausted", "Limite diário de pesquisas atingido. Tente novamente amanhã.");
    }
    // 3. Verificar Cache Global (Ignorar falhas no emulador)
    const cacheKey = `${keyword.trim().toLowerCase()}_${local.trim().toLowerCase()}`.replace(/\s+/g, '_');
    let cacheData = null;
    if (!process.env.FUNCTIONS_EMULATOR) {
        try {
            const cacheRef = db.collection("radar_cache").doc(cacheKey);
            const cacheDoc = await cacheRef.get();
            if (cacheDoc.exists) {
                cacheData = cacheDoc.data();
            }
        }
        catch (e) {
            console.warn("Pulando verificação de Cache (ambiente sem credenciais GCE).");
        }
    }
    if (cacheData) {
        const diffTime = Math.abs(new Date().getTime() - new Date(cacheData.timestamp).getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        // Se o cache tem menos de 7 dias, retorna ele
        if (diffDays <= 7 && (cacheData === null || cacheData === void 0 ? void 0 : cacheData.result)) {
            if (!process.env.FUNCTIONS_EMULATOR) {
                try {
                    await db.collection("users_limits").doc(uid).set({ date: today, count: currentUsage + 1 }, { merge: true });
                }
                catch (e) { }
            }
            return cacheData.result;
        }
    }
    // --- CACHE MISS: Iniciar Processamento Estrutural ---
    const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY || ((_b = functions.config().places) === null || _b === void 0 ? void 0 : _b.api_key);
    const GROQ_API_KEY = process.env.GROQ_API_KEY || ((_c = functions.config().groq) === null || _c === void 0 ? void 0 : _c.api_key);
    if (!GOOGLE_API_KEY || !GROQ_API_KEY) {
        throw new functions.https.HttpsError("internal", "Serviço temporariamente indisponível. (Chaves de API ausentes)");
    }
    try {
        // 4. Coletar do Google Places (Top 3)
        // Usamos a Text Search API (New)
        const searchQuery = `${keyword} em ${local}`;
        const placesResponse = await axios_1.default.post('https://places.googleapis.com/v1/places:searchText', {
            textQuery: searchQuery,
            languageCode: "pt-BR",
            maxResultCount: 3
        }, {
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': GOOGLE_API_KEY,
                'X-Goog-FieldMask': 'places.displayName,places.rating,places.userRatingCount,places.primaryType,places.types,places.formattedAddress,places.websiteUri,places.regularOpeningHours,places.reviews'
            }
        });
        const places = placesResponse.data.places || [];
        if (places.length === 0) {
            return {
                status: "empty",
                message: "Nenhum concorrente relevante encontrado para esta busca."
            };
        }
        // 5. Normalizar Dados e Calcular Score Determinístico
        const concorrentesNormalizados = places.map((place) => {
            var _a;
            const rating = place.rating || 0;
            const reviewsCount = place.userRatingCount || 0;
            // Score Determinístico
            // Reputação (30%): (rating/5) * 30
            const scoreReputation = (rating / 5.0) * 30;
            // Autoridade (30%): Logarítmico (max 30 pts em ~500 reviews)
            // Log base 10: log10(500) ≈ 2.69 -> (log10(reviews+1) / 2.7) * 30
            let scoreAuthority = (Math.log10(reviewsCount + 1) / 2.7) * 30;
            if (scoreAuthority > 30)
                scoreAuthority = 30;
            // Completude (40%)
            let scoreCompleteness = 0;
            if (place.websiteUri)
                scoreCompleteness += 15;
            if (place.regularOpeningHours)
                scoreCompleteness += 10;
            if (place.types && place.types.length > 1)
                scoreCompleteness += 15; // Possui categorias secundárias
            const totalScore = Math.min(Math.round(scoreReputation + scoreAuthority + scoreCompleteness), 100);
            // Filtrar apenas o texto das reviews (máximo 5) para enviar pra IA
            const textosReviews = (place.reviews || []).slice(0, 5).map((r) => { var _a; return (_a = r.text) === null || _a === void 0 ? void 0 : _a.text; }).filter(Boolean);
            return {
                nome: ((_a = place.displayName) === null || _a === void 0 ? void 0 : _a.text) || "Desconhecido",
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
        const groq = new groq_sdk_1.Groq({ apiKey: GROQ_API_KEY });
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
        const iaResponseText = ((_e = (_d = chatCompletion.choices[0]) === null || _d === void 0 ? void 0 : _d.message) === null || _e === void 0 ? void 0 : _e.content) || "{}";
        let iaData;
        try {
            // Tentar extrair apenas o JSON se a IA responder com sujeira
            const jsonMatch = iaResponseText.match(/\{[\s\S]*\}/);
            iaData = JSON.parse(jsonMatch ? jsonMatch[0] : iaResponseText);
        }
        catch (e) {
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
            }
            catch (e) {
                console.warn("Pulando gravação no Firestore.");
            }
        }
        return finalResult;
    }
    catch (error) {
        console.error("Erro na Análise Radar SEO", ((_f = error === null || error === void 0 ? void 0 : error.response) === null || _f === void 0 ? void 0 : _f.data) || error);
        const details = ((_j = (_h = (_g = error === null || error === void 0 ? void 0 : error.response) === null || _g === void 0 ? void 0 : _g.data) === null || _h === void 0 ? void 0 : _h.error) === null || _j === void 0 ? void 0 : _j.message) || error.message;
        throw new functions.https.HttpsError("internal", `Falha ao executar a análise: ${details}`);
    }
});
//# sourceMappingURL=index.js.map