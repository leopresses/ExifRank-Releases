import os
import sys
import requests
from dotenv import load_dotenv

REPO_OWNER = "leopresses"
REPO_NAME = "FerramentaSEOLocal"

def carregar_token():
    load_dotenv(override=True)
    token = os.getenv("GITHUB_TOKEN")
    if not token or token.strip() == "":
        print("Erro: GITHUB_TOKEN nao encontrado no .env")
        sys.exit(1)
    return token.strip()

def criar_release_e_upload(token, tag, exe_path):
    print(f"➜ Criando release {tag} no GitHub...")
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github.v3+json"
    }
    
    url_release = f"https://api.github.com/repos/{REPO_OWNER}/{REPO_NAME}/releases"
    data = {
        "tag_name": tag,
        "target_commitish": "main",
        "name": f"Atualização {tag}",
        "body": f"Lançamento automático da versão {tag}.",
        "draft": False,
        "prerelease": False
    }
    
    r = requests.post(url_release, headers=headers, json=data)
    if r.status_code != 201:
        print("❌ ERRO ao criar release na API do GitHub:", r.text)
        sys.exit(1)
        
    release_info = r.json()
    upload_url = release_info["upload_url"].split("{")[0]
    
    print("➜ Fazendo upload do ExifRank.exe para a nuvem do GitHub (Isso pode demorar)...")
    headers_upload = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github.v3+json",
        "Content-Type": "application/octet-stream"
    }
    
    upload_url_completa = f"{upload_url}?name=ExifRank.exe"
    
    with open(exe_path, "rb") as f:
        r_upload = requests.post(upload_url_completa, headers=headers_upload, data=f)
        
    if r_upload.status_code == 201:
        print("\n" + "="*50)
        print(f"🎉 SUCESSO ABSOLUTO! A versão {tag} já está no ar!")
        print(f"Link publico da Release: {release_info['html_url']}")
        print("="*50)
    else:
        print("❌ ERRO ao fazer upload do executável:", r_upload.text)

if __name__ == "__main__":
    token = carregar_token()
    exe_caminho = r"dist\ExifRank.exe"
    criar_release_e_upload(token, "v1.0.1", exe_caminho)
