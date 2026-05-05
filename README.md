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

 ## 📦 Como Compilar (Gerar o .EXE)

Para transformar o script em um executável único para Windows:
```bash
pyinstaller --noconsole --onefile --clean --collect-all customtkinter --icon=icone.ico app_seo.py
