const test = require("node:test");
const assert = require("node:assert/strict");
const {
    buildMetadataAiPrompt,
    parseMetadataAiResponse,
    validateMetadataAiInput
} = require("../lib/metadata_ai");

test("valida e normaliza os campos aceitos", () => {
    const input = validateMetadataAiInput({
        nicho: "  Clínica   veterinária  ",
        empresa: "Clínica Exemplo",
        telefone: "(35) 99999-0000",
        endereco: "Três Corações - MG"
    });
    assert.equal(input.nicho, "Clínica veterinária");
    assert.match(buildMetadataAiPrompt(input), /Clínica veterinária/);
});

test("recusa nicho vazio e campos fora do limite", () => {
    assert.throws(() => validateMetadataAiInput({ nicho: "" }), /obrigatório/);
    assert.throws(
        () => validateMetadataAiInput({ nicho: "x".repeat(2501) }),
        /tamanho permitido/
    );
});

test("aceita uma lista de palavras-chave já gerada para criar nova versão", () => {
    const palavras = Array.from(
        { length: 25 },
        (_, index) => `palavra-chave local número ${index + 1}`
    ).join(", ");
    const input = validateMetadataAiInput({ nicho: palavras });
    assert.equal(input.nicho, palavras);
    assert.ok(input.nicho.length > 200);
});

test("converte resposta JSON da IA para o formato usado pela tela", () => {
    const result = parseMetadataAiResponse(JSON.stringify({
        palavras: ["veterinário em Três Corações", "clínica veterinária"],
        descricao: "Atendimento veterinário responsável em Três Corações."
    }));
    assert.equal(
        result.palavras,
        "veterinário em Três Corações, clínica veterinária"
    );
    assert.match(result.descricao, /Atendimento veterinário/);
});

test("aceita bloco JSON e rejeita resposta incompleta", () => {
    const result = parseMetadataAiResponse(
        '```json\n{"palavras":"seo local, empresa local","descricao":"Descrição válida"}\n```'
    );
    assert.equal(result.palavras, "seo local, empresa local");
    assert.throws(
        () => parseMetadataAiResponse('{"palavras":[],"descricao":""}'),
        /vazios/
    );
});
