# 🚀 GeoRanker - SEO Hub (AI Edition)

Uma aplicação desktop robusta e premium desenvolvida em Python para automação de SEO local. A ferramenta otimiza o peso e resolução de mídias (fotos e vídeos) e injeta metadados EXIF/Geotagging de forma automatizada. Integra **Inteligência Artificial** para gerar blocos super densos de palavras-chave e descrições estratégicas.

## ✨ Funcionalidades

- **🧠 IA Integrada:** Geração automática de metadados focados em SEO Local baseados no nicho, empresa e telefone utilizando a API hiperrápida do Groq.
- **📍 Geolocalização Precisa:** Motor de busca Esri ArcGIS integrado para transformar endereços incompletos em coordenadas GPS exatas.
- **⚙️ Otimização Assíncrona:** Servidor HTTP local e processamento em segundo plano que mantêm a interface Webview perfeitamente responsiva.
- **🎨 Design UI/UX Premium:** Interface moderna com layout limpo e interativo feito puramente em HTML, JS Vanilla e Tailwind CSS (Glassmorphism).
- **🏷️ Injeção Profunda de EXIF:** Aplica título, descrição, autor, palavras-chave e coordenadas GPS diretamente no binário das mídias, preparando-as para alto ranqueamento local.
- **☁️ Multi-Clientes & Firebase:** Gerencie perfis e histórico de empresas diferentes logando rapidamente via conta Google (Auth & Firestore).

## 🛠️ Tecnologias Utilizadas

- **Motor Principal:** Python 3.x
- **Desktop Window:** PyWebView (Encapsulando Chromium/Edge)
- **Frontend:** HTML5, Vanilla JavaScript, Tailwind CSS
- **IA e Nuvem:** Groq API (LLMs Open Source), Firebase Auth & Firestore
- **Geocoding:** Geopy (Esri ArcGIS)
- **Processamento de Imagens/Dados:** ImageMagick & ExifTool

## 🔒 Instalação e Uso

1. Clone este repositório.
2. Instale as dependências necessárias via requirements:
   ```bash
   pip install -r requisitos.txt
   ```
3. Crie um arquivo `.env` na raiz do projeto com a sua chave Groq:
   ```env
   GROQ_API_KEY=sua_chave_de_api_aqui
   ```
4. Inicie o sistema a partir do código-fonte:
   ```bash
   python app_seo.py
   ```

## 📦 Como Compilar para Executável (.exe)

O projeto já contém um arquivo `.spec` configurado para embutir corretamente o servidor web (pasta `web/`), binários de compressão e variáveis de ambiente em um único `.exe`. 

Rode o seguinte comando:

```bash
pyinstaller --clean --noconfirm FerramentaSEO.spec
```

> **Aviso:** Nunca envie o seu arquivo `.env` original de produção para repositórios públicos. Ele está coberto pelo `.gitignore`.

---
*Criado por Leonardo Presses.*
