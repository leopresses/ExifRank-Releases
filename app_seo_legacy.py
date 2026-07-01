class LegacyApiFunctions:
    def groq_audit_vision(self, nicho, localizacao, images_b64):
        chave_api = get_groq_key()
        if not chave_api or chave_api.strip() == "" or chave_api == "cole_sua_chave_aqui":
            return {"erro": "A chave da API Groq não foi encontrada ou está inválida."}

        try:
            import groq
            client = groq.Groq(api_key=chave_api.strip())
            
            prompt_text = f"""# PROMPT DE AUDITORIA PREMIUM DE SEO LOCAL

Atue como um Auditor de SEO Local Sênior, Especialista em Google Business Profile (Google Meu Negócio), Estratégia de Posicionamento Local, Conversão Comercial e Inteligência Competitiva.

Sua missão é analisar cuidadosamente os prints fornecidos e gerar um RELATÓRIO EXECUTIVO PREMIUM DE SEO LOCAL.

O relatório deve transmitir autoridade, gerar percepção de valor, identificar oportunidades de crescimento e demonstrar claramente como a empresa pode melhorar sua presença no Google.

O resultado deve parecer uma consultoria estratégica realizada por uma agência especializada em SEO Local.

---

## DADOS DA EMPRESA

**NICHO:** {nicho}

**LOCALIZAÇÃO:** {localizacao}

---

# REGRAS CRÍTICAS

### Análise baseada em evidências

Analise apenas informações visíveis nos prints.

Nunca invente informações.

Nunca faça afirmações sem evidência.

Quando não houver evidência suficiente utilize:

> "Não foi possível confirmar através das imagens analisadas."

Sempre diferencie:

✅ Evidência visual identificada

⚠️ Inferência baseada em boas práticas de SEO Local

Jamais apresente inferências como fatos.

---

# REGRA DE APRESENTAÇÃO

O relatório NÃO deve parecer uma análise técnica.

O relatório deve parecer uma consultoria premium.

Evite:

* Respostas genéricas
* Frases superficiais
* Checklists frios
* Linguagem robótica

Sempre explique:

* O problema
* O impacto no negócio
* A oportunidade gerada pela correção
* O benefício esperado

O tom deve ser:

* Profissional
* Consultivo
* Estratégico
* Comercial
* Persuasivo

Cada recomendação deve demonstrar potencial de crescimento.

---

# 📊 RESUMO EXECUTIVO

Inicie obrigatoriamente com um resumo executivo.

Explique:

* Situação geral da ficha
* Principais pontos fortes
* Principais pontos de atenção
* Potencial de crescimento
* Oportunidades identificadas

O texto deve ser envolvente e transmitir valor.

O cliente deve sentir que recebeu uma análise estratégica personalizada.

---

# 🏆 SCORE GERAL DA FICHA

Gerar pontuações estimadas de 0 a 100.

### SEO Local Score Geral

### Visibilidade Local

### Conversão

### Autoridade

### Engajamento

### Completude da Ficha

Formato:

SEO Local Score: XX/100

Para cada nota:

* Mostrar a pontuação
* Explicar o motivo
* Explicar o impacto da nota

Não apenas apresentar números.

---

# 🏅 COMO SUA FICHA SE COMPARA AO MERCADO

Considerando:

**Nicho:** {nicho}

**Localização:** {localizacao}

Realizar uma comparação estratégica baseada em padrões normalmente observados no segmento.

Exemplo:

### Acima da média

✅ Autoridade

✅ Avaliações

✅ Completude

### Abaixo da média

⚠️ Frequência de conteúdo

⚠️ Produtos

⚠️ Exploração de palavras-chave

Explicar cada ponto.

---

# 🎯 RAIO-X DA CONVERSÃO

Analise a experiência de um potencial cliente ao encontrar a ficha.

Responder:

### O que gera confiança?

### O que gera dúvida?

### O que pode reduzir conversões?

### O que pode aumentar chamadas, rotas e visitas?

Explicar de forma estratégica.

---

# 🚨 MATRIZ DE PRIORIDADES

Organize todas as recomendações em ordem de prioridade.

Apresente primeiro:

🔴 Alta Prioridade

Depois:

🟡 Média Prioridade

Por último:

🟢 Baixa Prioridade

O objetivo é que o cliente saiba exatamente por onde começar.

---

# REGRAS DE CLASSIFICAÇÃO

## 🔴 Alta Prioridade

Utilizar quando:

* Afeta diretamente posicionamento
* Afeta conversão
* Afeta confiança
* Pode gerar perda de oportunidades

Exemplos:

* Categoria incorreta
* Descrição fraca
* Serviços ausentes
* Informações incompletas

---

## 🟡 Média Prioridade

Utilizar quando:

* Melhora desempenho
* Gera crescimento incremental
* Aumenta competitividade

Exemplos:

* Poucas fotos
* Poucas postagens
* Produtos incompletos

---

## 🟢 Baixa Prioridade

Utilizar quando:

* Refinamentos
* Ajustes complementares
* Melhorias secundárias

---

# REGRAS DE IMPACTO

### 📈 Alto Impacto

Mudanças que podem influenciar significativamente:

* Visibilidade
* Conversão
* Autoridade

### 📊 Médio Impacto

Mudanças relevantes, mas não críticas.

### 📉 Baixo Impacto

Mudanças complementares.

---

# REGRAS DE ESFORÇO

### ⚡ Baixo Esforço

Pode ser implementado rapidamente.

### 🔧 Médio Esforço

Exige ajustes moderados.

### 🏗️ Alto Esforço

Exige planejamento e execução contínua.

---

# FORMATO OBRIGATÓRIO PARA CADA RECOMENDAÇÃO

## [Título da Oportunidade]

**Urgência:** 🔴 Alta | 🟡 Média | 🟢 Baixa

**Impacto:** 📈 Alto | 📊 Médio | 📉 Baixo

**Esforço:** ⚡ Baixo | 🔧 Médio | 🏗️ Alto

### Evidência Visual

Descrever exatamente o que foi observado.

### Impacto no Negócio

Explicar como isso afeta:

* Descoberta da empresa
* Conversão
* Confiança
* Autoridade

### Oportunidade

Explicar o potencial gerado pela correção.

### Recomendação

Explicar exatamente o que deve ser feito.

---

# 💰 OPORTUNIDADES PERDIDAS

Identifique oportunidades que podem estar reduzindo o potencial da ficha.

Não apenas listar.

Para cada item explicar:

* O que está faltando
* Qual impacto isso causa
* Qual oportunidade está sendo perdida

Exemplo:

### Produtos Ausentes

Impacto:

Produtos funcionam como novas portas de entrada para pesquisas locais.

Sem eles, a empresa pode deixar de aparecer para potenciais clientes que pesquisam diretamente pelos itens comercializados.

---

# 🚀 OPORTUNIDADES DE CRESCIMENTO IMEDIATO

Listar ações com:

* Maior impacto
* Menor esforço
* Resultado mais rápido

Explicar:

* Por que a ação é importante
* Qual resultado pode gerar
* Por que deve ser priorizada

---

# 🧠 OTIMIZAÇÃO SEMÂNTICA (LSI)

Gerar:

### Palavras-chave principais

### Palavras-chave locais

### Variações semânticas

### Termos complementares

Explicar como utilizar em:

* Descrição
* Serviços
* Produtos
* Avaliações
* Postagens

---

# 🏷️ CATEGORIAS RECOMENDADAS

Informar:

### Categoria Principal

### 3 Categorias Secundárias

Justificar cada recomendação.

Explicar o potencial de impacto no posicionamento local.

---

# 📸 ESTRATÉGIA DE CONTEÚDO

Gerar recomendações para:

### Fotos

### Vídeos

### Postagens

### Atualizações

Explicar:

* Objetivo do conteúdo
* Impacto esperado
* Benefício para SEO Local
* Benefício para conversão

---

# ⭐ ESTRATÉGIA DE AVALIAÇÕES

Analisar o cenário atual.

Sugerir:

* Formas éticas de obter avaliações
* Como aumentar engajamento
* Como fortalecer autoridade local

---

# 📈 POTENCIAL DE CRESCIMENTO

Gerar projeções estimadas.

Exemplo:

📈 +15% Visibilidade Local

📈 +20% Conversão

📈 +10% Autoridade Local

Informar que são projeções estimadas baseadas em boas práticas de SEO Local.

---

# 🔥 AÇÃO PRIORITÁRIA

Escolher apenas UMA ação.

Aquela com:

* Maior impacto
* Menor esforço
* Melhor retorno imediato

Explicar:

* Por que foi escolhida
* Resultado esperado
* Benefício para o negócio

---

# 📅 PLANO DE AÇÃO - 30 DIAS

Dividir em:

## Semana 1

## Semana 2

## Semana 3

## Semana 4

Cada semana deve conter:

* Ações práticas
* Ordem lógica
* Objetivos claros

O plano deve ser executável.

---

# REGRA ÉTICA OAB

Se o nicho estiver relacionado a:

* Advocacia
* Advogado
* Escritório de Advocacia
* Direito

É proibido utilizar:

* Escassez artificial
* Urgência artificial
* Promessas de resultado

Respeitar integralmente o Provimento 205 da OAB.

As recomendações devem focar exclusivamente em:

* Autoridade técnica
* Conteúdo educativo
* Posicionamento institucional

---

# FORMATAÇÃO FINAL

Utilizar Markdown profissional.

Utilizar:

* Emojis estratégicos
* Títulos
* Subtítulos
* Listas
* Destaques

Evitar blocos gigantes de texto.

O relatório deve parecer um documento premium de consultoria estratégica de SEO Local.

O cliente deve terminar a leitura com a sensação de que recebeu uma análise especializada, personalizada e de alto valor."""

            messages = [
                {"role": "system", "content": prompt_text}
            ]
            
            user_content = [{"type": "text", "text": f"Aqui estão os prints do perfil de {nicho} em {localizacao}. Analise-os e gere o relatório."}]
            
            # Limitar a 4 imagens e injetar no payload
            for img in images_b64[:4]:
                user_content.append({
                    "type": "image_url",
                    "image_url": {"url": img}
                })

            messages.append({"role": "user", "content": user_content})

            resposta = client.chat.completions.create(
                model="meta-llama/llama-4-scout-17b-16e-instruct",
                messages=messages,
                temperature=0.6,
                max_tokens=2048,
                top_p=0.9
            )
            
            return {"resultado": resposta.choices[0].message.content}
        except Exception as e:
            return {"erro": str(e)}


    def api_gerar_insights_pdf(self, payload):
        try:
            import groq
            chave_api = get_groq_key()
            if not chave_api or chave_api.strip() == "" or chave_api == "cole_sua_chave_aqui":
                return {"ok": False, "erro": "A chave da API Groq não foi encontrada ou está inválida no .env."}
            client = groq.Groq(api_key=chave_api.strip())
            
            empresa = payload.get("empresa", "")
            numFotos = payload.get("numFotos", 0)
            gps_ok = payload.get("gps_ok", False)
            keyCount = payload.get("keyCount", 0)
            
            str_gps = "Sim" if gps_ok else "Não"
            prompt = f"""Atue como um Especialista em SEO Local Sênior. 
Escreva um Insight Analítico e de Previsão de Resultado focado no impacto de injetar coordenadas GPS e Palavras-chave nas fotos do Google Meu Negócio. 
Este texto será inserido no relatório PDF enviado ao cliente para comprovar o valor do seu serviço. 

Dados do Projeto:
Empresa: {empresa}
Fotos Otimizadas: {numFotos}
Tags Injetadas (Quantidade): {keyCount}
Coordenadas GPS: {str_gps}

Formato da Resposta: Apenas 1 parágrafo persuasivo, corporativo e encorajador. Máximo 5-6 linhas. 
Explique brevemente que o algoritmo do Google usará esses dados ocultos para provar a localização da empresa, aumentando a autoridade e as chances de aparecer no topo das buscas locais quando clientes próximos pesquisarem pelos serviços. Não use saudações, entregue apenas o parágrafo direto."""

            chat_completion = client.chat.completions.create(
                messages=[{"role": "user", "content": prompt}],
                model="llama-3.1-8b-instant",
                temperature=0.7,
                max_tokens=400
            )
            insight = chat_completion.choices[0].message.content.strip()
            return {"ok": True, "insight": insight}
        except Exception as e:
            return {"ok": False, "erro": str(e)}



import threading
import http.server
import socketserver

_web_dir = None

class CustomHandler(http.server.SimpleHTTPRequestHandler):

