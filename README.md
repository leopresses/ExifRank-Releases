# 🚀 GeoRanker - SEO Hub (AI Edition)

Uma aplicação desktop robusta e premium desenvolvida em Python para automação de SEO local. A ferramenta otimiza o peso e resolução de mídias (fotos e vídeos) e injeta metadados EXIF/Geotagging de forma automatizada. Integra a **Inteligência Artificial do Google Gemini** para gerar blocos super densos de palavras-chave e descrições estratégicas.

## ✨ Funcionalidades

- **🧠 IA Integrada:** Geração automática de metadados focados em SEO Local baseados no nicho, empresa e telefone.
- **📍 Geolocalização Precisa (ArcGIS):** Motor de busca Esri ArcGIS integrado para transformar endereços incompletos e nomes de empresas em coordenadas GPS exatas (sem necessidade de API Key do Google Maps).
- **⚙️ Otimização Multi-Threading:** Processamento rápido em segundo plano que mantém a interface sempre fluida, sem travamentos (Not Responding).
- **🎨 Design Premium:** Interface 'Glassmorphism' moderna e responsiva focada na experiência do usuário.
- **🏷️ Injeção de EXIF e Renomeação Estratégica:** Aplica título, descrição, autor, palavras-chave e coordenadas GPS nas mídias, renomeando arquivos com base no nicho da empresa e truncando o tamanho para evitar bloqueios do Windows.

## 🛠️ Tecnologias Utilizadas

- **Python 3.x**
- **CustomTkinter:** Interface gráfica Premium.
- **Google Generative AI:** Motor da inteligência artificial.
- **Geopy (ArcGIS):** Integração avançada de coordenadas.
- **ImageMagick & ExifTool:** Motores de processamento multimídia.

## 🔒 Instalação e Uso

1. Clone este repositório.
2. Instale as dependências:
   ```bash
   pip install customtkinter google-generativeai python-dotenv geopy pyinstaller
   ```
3. Crie um arquivo `.env` na mesma pasta do executável (ou script) com a sua chave:
   ```env
   GEMINI_API_KEY=sua_chave_de_api_aqui
   ```
4. Execute o arquivo:
   ```bash
   python app_seo.py
   ```

## 📦 Como Compilar (.exe)

Para gerar um executável autônomo e portátil:

```bash
pyinstaller --noconfirm --onefile --windowed --icon "icone.ico" --add-data "icone.ico;." --add-data "magick.exe;." --add-data "motor_exif.zip;." --add-data ".env;." "app_seo.py"
```

> **Aviso de Segurança:** O arquivo `.env` com a sua chave API é empacotado internamente no executável. **Nunca** envie seu arquivo `.env` para repositórios públicos (o arquivo já está protegido pelo `.gitignore`).

---
*Versão Final - Criado por Leonardo Presses.*
