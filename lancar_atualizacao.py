import os
import sys
import json
import requests
import re
import subprocess
from dotenv import load_dotenv

# Configurações do Repositório
REPO_OWNER = "leopresses"
REPO_NAME = "ExifRank-Releases"

def carregar_token():
    load_dotenv(override=True)
    token = os.getenv("GITHUB_TOKEN")
    if not token or token.strip() == "":
        print("❌ ERRO: GITHUB_TOKEN não encontrado no arquivo .env!")
        print("Para o robô conseguir postar lá no GitHub por você, faça o seguinte:")
        print("1. Acesse: https://github.com/settings/tokens")
        print("2. Clique em 'Generate new token (classic)'")
        print("3. Em 'Note', escreva algo como 'AutoUpdater ExifRank'")
        print("4. Em 'Expiration', escolha 'No expiration' (se não quiser ficar renovando)")
        print("5. Nos quadradinhos (Scopes), marque apenas a caixa 'repo' (Full control of private repositories)")
        print("6. Clique em Generate, copie o código ghp_xxxxxxxxxxxxxxxxxxxx")
        print("7. Cole no seu arquivo .env, na última linha, no formato: GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx")
        sys.exit(1)
    return token.strip()

def atualizar_versao_codigo(nova_versao):
    print(f"➜ Atualizando app_seo.py para a versão {nova_versao}...")
    caminho = "app_seo.py"
    with open(caminho, "r", encoding="utf-8") as f:
        codigo = f.read()
    
    # Substitui CURRENT_VERSION = "vX.X.X" por CURRENT_VERSION = "nova_versao"
    novo_codigo = re.sub(r'CURRENT_VERSION\s*=\s*"[^"]+"', f'CURRENT_VERSION = "{nova_versao}"', codigo)
    
    with open(caminho, "w", encoding="utf-8") as f:
        f.write(novo_codigo)
    print("✅ Código fonte atualizado!")

def rodar_comando(cmd, mensagem):
    print(f"➜ {mensagem}...")
    processo = subprocess.run(cmd, shell=True)
    if processo.returncode != 0:
        print(f"❌ ERRO ao executar o comando: {cmd}")
        sys.exit(1)
    print(f"✅ Sucesso: {cmd}\n")

def criar_release_e_upload(token, tag, exe_path):
    print(f"➜ Criando release {tag} no GitHub...")
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github.v3+json"
    }
    
    body_text = """bugs corrigidos e persistência em localizações"""
    
    # 1. Criar Release
    url_release = f"https://api.github.com/repos/{REPO_OWNER}/{REPO_NAME}/releases"
    data = {
        "tag_name": tag,
        "target_commitish": "main",
        "name": f"Atualização {tag}",
        "body": body_text,
        "draft": False,
        "prerelease": False
    }
    
    r = requests.post(url_release, headers=headers, json=data)
    if r.status_code != 201:
        print("❌ ERRO ao criar release na API do GitHub:", r.text)
        sys.exit(1)
        
    release_info = r.json()
    upload_url = release_info["upload_url"].split("{")[0]
    
    # 2. Upload do Arquivo
    print("➜ Fazendo upload do Instalador para a nuvem do GitHub (Isso pode demorar alguns minutos)...")
    headers_upload = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github.v3+json",
        "Content-Type": "application/octet-stream"
    }
    
    upload_url_completa = f"{upload_url}?name=ExifRank_Installer.exe"
    
    with open(exe_path, "rb") as f:
        r_upload = requests.post(upload_url_completa, headers=headers_upload, data=f)
        
    if r_upload.status_code == 201:
        print("\n" + "="*50)
        print(f"🎉 SUCESSO ABSOLUTO! A versão {tag} já está no ar!")
        print(f"Todos os clientes receberão a tela de atualização ao abrir o app.")
        print(f"Link público da Release: {release_info['html_url']}")
        print("="*50)
    else:
        print("❌ ERRO ao fazer upload do executável:", r_upload.text)

if __name__ == "__main__":
    os.system("cls" if os.name == "nt" else "clear")
    print("="*50)
    print("🚀 AUTOMATIZADOR DE ATUALIZAÇÕES - GEO RANKER")
    print("="*50)
    
    token = carregar_token()
    
    if len(sys.argv) > 1:
        nova_versao = sys.argv[1].strip()
    else:
        print("\nExemplo: se a atual for v1.0.0, a próxima pode ser v1.0.1")
        nova_versao = input("Digite a NOVA versão (Ex: v1.0.1): ").strip()
        
    if not nova_versao:
        print("Operação cancelada.")
        sys.exit(0)
        
    if not nova_versao.lower().startswith("v"):
        nova_versao = "v" + nova_versao
    elif nova_versao.startswith("V"):
        nova_versao = "v" + nova_versao[1:]
        
    print(f"\nIniciando lançamento da {nova_versao}...\n")
    
    # 1. Atualiza o código fonte
    atualizar_versao_codigo(nova_versao)
    
    # 1.5. Ofusca o Javascript para blindar a trava de hardware
    rodar_comando('cmd /c "npx -y javascript-obfuscator web/main.source.js --output web/main.js --compact true"', "Ofuscando Javascript (Anti-Pirataria)")
    
    # 2. Compila com PyInstaller
    rodar_comando("build_secure.bat", "Compilando o aplicativo blindado (PyInstaller + PyArmor)")
    
    # 2.5. Gera o Instalador com Inno Setup
    # Atualiza a versão no exifrank.iss
    print("➜ Atualizando versão no exifrank.iss...")
    try:
        with open("exifrank.iss", "r", encoding="utf-8") as f:
            iss_code = f.read()
        iss_code = re.sub(r'AppVersion=v?\d+\.\d+\.\d+', f'AppVersion={nova_versao.replace("v", "")}', iss_code)
        with open("exifrank.iss", "w", encoding="utf-8") as f:
            f.write(iss_code)
    except Exception as e:
        print("Aviso: Falha ao atualizar exifrank.iss", e)

    # Inno Setup iscc.exe path is usually in Program Files (x86)\Inno Setup 6\iscc.exe
    iscc_path = r'"C:\Program Files (x86)\Inno Setup 6\iscc.exe"'
    if not os.path.exists(r'C:\Program Files (x86)\Inno Setup 6\iscc.exe'):
        if os.path.exists(r'C:\Program Files\Inno Setup 6\iscc.exe'):
            iscc_path = r'"C:\Program Files\Inno Setup 6\iscc.exe"'
        else:
            local_app_data = os.getenv('LOCALAPPDATA')
            if os.path.exists(f'{local_app_data}\\Programs\\Inno Setup 6\\iscc.exe'):
                iscc_path = f'"{local_app_data}\\Programs\\Inno Setup 6\\iscc.exe"'
        
    rodar_comando(f'{iscc_path} exifrank.iss', "Gerando o Instalador (Inno Setup)")
    
    # 3. Salva no Git
    rodar_comando("git add .", "Salvando a nova versão no Git")
    rodar_comando(f'git commit --allow-empty -m "build: Lançamento da versão {nova_versao}"', "Criando commit")
    rodar_comando("git push origin main", "Subindo código para o repositório")
    
    # 4. Upload pro GitHub
    exe_caminho = r"dist\ExifRank_Installer.exe"
    if not os.path.exists(exe_caminho):
        print(f"❌ ERRO: O instalador {exe_caminho} não foi gerado pelo Inno Setup!")
        sys.exit(1)
        
    criar_release_e_upload(token, nova_versao, exe_caminho)
    
    print("\nAutomação finalizada.")
