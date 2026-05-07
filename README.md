# 🚀 Ferramenta SEO (SEO HUB) - AI Edition

Uma aplicação desktop robusta desenvolvida em Python para automação de SEO em imagens. A ferramenta otimiza o peso e resolução de mídias para a web e injeta metadados EXIF/Geotagging de forma automatizada. Na sua versão mais recente, integra a **Inteligência Artificial do Google Gemini** para gerar blocos super densos de palavras-chave e descrições estratégicas.

## ✨ Funcionalidades

- **🧠 IA Integrada (Gemini 12.5 Flash):** Geração automática de metadados densos baseados no nicho, empresa e telefone.
- **📍 Geolocalização Precisa:** Motor de busca integrado (Geopy/Nominatim) para transformar endereços físicos em coordenadas GPS exatas.
- **⚙️ Conversão e Otimização:** Converte `.heic` e `.png` para `.jpg`, otimizando o peso das imagens para carregamento ultra-rápido na web (via ImageMagick).
- **🏷️ Injeção de EXIF e Renomeação Estratégica:** Aplica título, descrição, autor, palavras-chave e coordenadas GPS diretamente no código da imagem (via ExifTool), renomeando os arquivos automaticamente para SEO.
- **📦 Compilação Segura (OneFile):** Processamento de dependências via arquivos `.zip` para evitar bloqueios de ambiente no Windows, gerando um único `.exe` final.

## 🛠️ Tecnologias e Bibliotecas Utilizadas

- **Python 3.x**
- **CustomTkinter:** Interface gráfica moderna (Dark/Light mode).
- **Google Generative AI:** Motor da inteligência artificial.
- **Python-dotenv:** Gerenciamento seguro de variáveis de ambiente.
- **Geopy:** Integração de coordenadas.
- **ImageMagick & ExifTool:** Motores externos embutidos no sistema para processamento das imagens.

## 🔒 Configuração e Uso (Modo Desenvolvedor)

1. Clone este repositório.
2. Crie e ative um ambiente virtual (`.venv`).
3. Instale as dependências:
   ```bash
   pip install customtkinter google-generativeai python-dotenv geopy
Configuração da IA: Crie um arquivo .env na raiz do projeto e adicione a sua chave de API do Gemini:

Snippet de código
GEMINI_API_KEY=sua_chave_de_api_aqui
(Caso não crie, o próprio aplicativo gerará um arquivo modelo ao ser executado na primeira vez).

Execute o arquivo principal:

Bash
python app_seo.py

📦 Como Compilar (.exe)
Para gerar um executável autônomo (OneFile) que rode em qualquer computador Windows sem precisar do Python instalado:

Certifique-se de ter o pyinstaller instalado (pip install pyinstaller).

Confirme se os arquivos vitais estão na pasta raiz: magick.exe, motor_exif.zip e icone.ico.

Execute o comando de build:

Bash
pyinstaller --clean --noconsole --onefile --icon=icone.ico --add-data "magick.exe;." --add-data "motor_exif.zip;." --add-data ".env;." app_seo.py
O executável final estará disponível na pasta dist/.

⚠️ Avisos
Esta ferramenta realiza alterações permanentes em arquivos de imagem.

Alguns antivírus podem acusar falsos positivos no .exe gerado pelo PyInstaller devido à extração silenciosa do motor_exif.zip em pastas temporárias do sistema. Adicione à lista de exceções se necessário.

Criado por Leonardo Presses.
