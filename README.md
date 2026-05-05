# Ferramenta SEO Final 🚀

Uma aplicação desktop desenvolvida em Python para automatizar a otimização de imagens para SEO Local (especialmente Google Meu Negócio). A ferramenta realiza conversão em massa, limpeza de arquivos de mídia desnecessários e injeção profunda de metadados EXIF e coordenadas GPS.

## 🌟 Funcionalidades

- **Conversão Inteligente e Recursiva:** Varre a pasta principal e todas as subpastas, convertendo imagens `.HEIC`, `.PNG` e `.JPEG` para o formato padrão `.JPG` com fundo branco.
- **Limpeza Automática:** Remove automaticamente vídeos (`.MOV`, `.MP4`) e deleta as imagens originais após a conversão, economizando espaço no disco.
- **Injeção de Metadados Densos (SEO):** Aplica as palavras-chave e descrições estratégicas em múltiplas tags EXIF simultaneamente (Title, Subject, Description, XPKeywords, Caption-Abstract) garantindo leitura perfeita pelo Windows e algoritmos de busca.
- **Geotagging:** Permite a inserção de coordenadas de Latitude e Longitude diretamente nas imagens.
- **Interface Moderna (SaaS):** Desenvolvida com `customtkinter`, possui um visual limpo (Light Mode), botões arredondados e caixas de texto com placeholder dinâmico para facilitar o processo de "copiar e colar" grandes blocos de texto.

## 🛠️ Tecnologias Utilizadas

- **Python 3.x**
- **CustomTkinter** (Interface Gráfica)
- **ImageMagick** (Motor de conversão de imagens)
- **ExifTool** (Motor de manipulação de metadados)

## ⚙️ Pré-requisitos e Estrutura de Pastas

Para rodar o código-fonte ou o executável, você precisa que os motores auxiliares estejam na **mesma pasta** do script/programa. A estrutura deve ser exatamente esta:

```text
📁 Sua_Pasta_Principal/
 ├── 📄 app_seo.py
 ├── 🖼️ icone.ico
 ├── ⚙️ exiftool.exe
 └── ⚙️ magick.exe
 └── pasta exiftool_files

 (Nota: O exiftool.exe e o magick.exe devem ser baixados em seus respectivos sites oficiais e colocados na pasta. Eles não estão inclusos neste repositório por questões de direitos autorais).

 ## 📥 Onde baixar as ferramentas obrigatórias

Como mencionado, o projeto precisa do `exiftool.exe` e do `magick.exe` rodando na mesma pasta do seu aplicativo. Veja como baixar e preparar cada um:

### 1. ExifTool (Motor de Metadados)
Ferramenta criada por Phil Harvey, considerada o padrão ouro mundial para edição de metadados.

*   **Link Oficial:** [https://exiftool.org/](https://exiftool.org/)
*   **Como preparar:**
    1. Acesse o site e baixe a versão **"Windows Executable"** (é um arquivo `.zip`).
    2. Extraia o arquivo `.zip` no seu computador.
    3. Lá dentro, você verá um arquivo chamado `exiftool(-k).exe`.
    4. **MUITO IMPORTANTE:** Renomeie esse arquivo para apenas **`exiftool.exe`** (remova o "(-k)").
    5. Mova o `exiftool.exe` renomeado e a pasta exiftool_files para dentro da pasta do seu projeto.

### 2. ImageMagick (Motor de Conversão de Imagens)
Um dos conversores de imagem em linha de comando mais poderosos do mercado.

*   **Link Oficial:** [https://imagemagick.org/script/download.php](https://imagemagick.org/script/download.php)
*   **Como preparar:**
    1. Acesse a página de downloads e desça até a seção **"Windows Binary Release"**.
    2. Baixe a versão **Portable** (geralmente nomeada como algo parecido com `ImageMagick-...-portable-x64.zip`). A versão portable é ideal porque não exige instalação.
    3. Extraia o `.zip` no seu computador.
    4. Entre na pasta extraída, procure pelo arquivo chamado **`magick.exe`**.
    5. Copie apenas esse arquivo (`magick.exe`) e cole dentro da pasta do seu projeto.

Pronto! Com esses dois motores na mesma pasta que o seu aplicativo, a **Ferramenta SEO Final** está pronta para rodar com força total.

 ## 📦 Como Compilar (Gerar o .EXE)

Para transformar o script em um executável único para Windows:
```bash
pyinstaller --noconsole --onefile --clean --collect-all customtkinter --icon=icone.ico app_seo.py
