import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import axios from "axios";
import { Groq } from "groq-sdk";

admin.initializeApp();

const db = admin.firestore();
const MAX_DAILY_REQUESTS = 15;

/**
 * Radar SEO Local Function
 */
export const analyzeRadarSEO = functions.https.onCall(async (data, context) => {
    // 1. Verificação de Autenticação (Suporta Callable nativo e Fallback)
    let uid = context.auth?.uid;
    
    if (!uid) {
        // Tentativa de autenticação manual (Fallback rápido p/ App Desktop emulador local)
        if (data.uid) {
            uid = data.uid;
        }
    }

    if (!uid) {
        throw new functions.https.HttpsError(
            "unauthenticated",
            "Você precisa estar logado (ou sua sessão expirou) para usar o Radar SEO Local."
        );
    }

    const { keyword, local } = data;

    if (!keyword || !local) {
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
    const cacheKey = `${keyword.trim().toLowerCase()}_${local.trim().toLowerCase()}`.replace(/\s+/g, '_');
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
// KIWIFY WEBHOOK ENDPOINT
// ============================================================================

/**
 * Webhook Kiwify para liberar acesso Premium automaticamente (Anti-Pirataria Real)
 * Configuração: Insira a URL da função gerada no painel da Kiwify com ?token=ampqsqsnxns
 */
export const kiwifyWebhook = functions.https.onRequest(async (req, res) => {
    // Token gerado pelo usuário na Kiwify para segurança
    const KIWIFY_TOKEN = "ampqsqsnxns";
    
    // Verificação de Autenticidade da requisição
    const tokenParams = req.query.token || req.body?.webhook_token;
    if (tokenParams !== KIWIFY_TOKEN) {
        console.warn("Tentativa de acesso não autorizado ao Webhook");
        res.status(401).send("Unauthorized: Invalid Token");
        return;
    }

    try {
        const body = req.body;
        
        // Status da transação (ex: 'paid', 'refunded', 'chargedback', 'waiting_payment')
        const orderStatus = body.order_status;
        
        // A API da Kiwify envia os dados do cliente no objeto "Customer"
        const customer = body.Customer || body.customer;
        const customerEmail = customer?.email?.toLowerCase()?.trim();

        if (!customerEmail) {
            console.error("Email do cliente não encontrado no Payload da Kiwify");
            res.status(400).send("No customer email provided");
            return;
        }

        console.log(`Recebido status '${orderStatus}' para o email: ${customerEmail}`);

        const usersRef = db.collection("users");
        // Buscamos o usuário no Banco de Dados pelo email que a Kiwify nos enviou
        const snapshot = await usersRef.where("email", "==", customerEmail).get();

        if (snapshot.empty) {
            // Cenário: O usuário comprou na Kiwify antes de abrir e logar no App pela 1a vez.
            // Solução: Já deixamos a licença gravada no banco atrelada ao email dele.
            // Quando ele baixar o app e logar com esse Google Email, o app puxará a licença!
            const newUserRef = usersRef.doc();
            await newUserRef.set({
                email: customerEmail,
                isPremium: orderStatus === "paid",
                subscriptionStatus: orderStatus,
                webhookSource: "kiwify",
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
            console.log(`Licença pré-registrada para novo usuário: ${customerEmail}`);
        } else {
            // Cenário: Usuário já estava logado no App e comprou a partir de lá.
            // Atualizamos a licença para destravar instantaneamente o software.
            const batch = db.batch();
            snapshot.docs.forEach((doc) => {
                let isPremium = doc.data().isPremium; // Mantém estado atual
                
                if (orderStatus === "paid") {
                    isPremium = true;
                } else if (["refunded", "chargedback", "canceled"].includes(orderStatus)) {
                    isPremium = false; // Trava o app caso haja devolução/chargeback
                }
                
                batch.update(doc.ref, {
                    isPremium: isPremium,
                    subscriptionStatus: orderStatus,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
            });
            await batch.commit();
            console.log(`Licença atualizada para usuário existente: ${customerEmail}`);
        }

        res.status(200).send("Webhook Kiwify Processado com Sucesso");
    } catch (error) {
        console.error("Erro no Webhook Kiwify:", error);
        res.status(500).send("Internal Server Error");
    }
});
