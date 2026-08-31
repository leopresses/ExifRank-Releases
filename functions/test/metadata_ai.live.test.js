const test = require("node:test");
const assert = require("node:assert/strict");
const axios = require("axios");
const {
    buildMetadataAiPrompt,
    parseMetadataAiResponse,
    validateMetadataAiInput
} = require("../lib/metadata_ai");

test("integra com o Gemini sem expor a chave", {
    skip: !process.env.GEMINI_API_KEY
}, async () => {
    const input = validateMetadataAiInput({
        nicho: "clínica veterinária",
        empresa: "Empresa de teste",
        telefone: "(35) 99999-0000",
        endereco: "Três Corações - MG"
    });
    const response = await axios.post(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
        {
            contents: [{ parts: [{ text: buildMetadataAiPrompt(input) }] }],
            generationConfig: {
                temperature: 0.1,
                responseMimeType: "application/json"
            }
        },
        {
            headers: {
                "Content-Type": "application/json",
                "x-goog-api-key": process.env.GEMINI_API_KEY
            },
            timeout: 35000
        }
    );
    const parts = response.data?.candidates?.[0]?.content?.parts || [];
    const result = parseMetadataAiResponse(
        parts.map(part => typeof part?.text === "string" ? part.text : "").join("")
    );
    assert.ok(result.palavras.split(",").length >= 10);
    assert.ok(result.descricao.length >= 80);
});
