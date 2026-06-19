"""
Script para publicar a release de transição no repositório antigo (FerramentaSEOLocal).
Os clientes v1.0.12 que ainda checam esse repo vão receber a atualização para o ExifRank.

O asset é nomeado como GeoRanker_Installer.exe (que é o nome que a v1.0.12 procura),
mas o conteúdo é o novo ExifRank_Installer.exe.

Uso:
    python publicar_release_ponte.py
"""
import os
import sys
import requests
from dotenv import load_dotenv

REPO_OWNER = "leopresses"
REPO_ANTIGO = "FerramentaSEOLocal"

def main():
    load_dotenv(override=True)
    token = os.getenv("GITHUB_TOKEN")
    if not token:
        print("❌ GITHUB_TOKEN não encontrado no .env!")
        sys.exit(1)

    exe_path = r"dist\ExifRank_Installer.exe"
    if not os.path.exists(exe_path):
        print(f"❌ Instalador não encontrado: {exe_path}")
        print("Execute 'python lancar_atualizacao.py' primeiro para gerar o instalador.")
        sys.exit(1)

    exe_size = os.path.getsize(exe_path) / (1024 * 1024)
    print(f"📦 Instalador encontrado: {exe_path} ({exe_size:.1f} MB)")

    # Lê a versão atual do app_seo.py
    with open("app_seo.py", "r", encoding="utf-8") as f:
        for line in f:
            if "CURRENT_VERSION" in line and "=" in line:
                version = line.split("=")[1].strip().strip('"').strip("'")
                break
    
    tag = version if version.startswith("v") else f"v{version}"
    print(f"🏷️  Versão: {tag}")

    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github.v3+json"
    }

    # Verifica se a release já existe
    check_url = f"https://api.github.com/repos/{REPO_OWNER}/{REPO_ANTIGO}/releases/tags/{tag}"
    r_check = requests.get(check_url, headers=headers)
    if r_check.status_code == 200:
        print(f"⚠️  Release {tag} já existe no repo {REPO_ANTIGO}!")
        resp = input("Deseja deletar e recriar? (s/n): ").strip().lower()
        if resp == 's':
            release_id = r_check.json()["id"]
            requests.delete(f"https://api.github.com/repos/{REPO_OWNER}/{REPO_ANTIGO}/releases/{release_id}", headers=headers)
            print("🗑️  Release antiga deletada.")
        else:
            print("Cancelado.")
            return

    # Cria a release
    print(f"\n➜ Criando release {tag} no repo {REPO_ANTIGO}...")
    release_data = {
        "tag_name": tag,
        "name": f"ExifRank {tag} - Atualização Importante",
        "body": (
            f"## 🔄 Atualização para ExifRank {tag}\n\n"
            "Esta atualização migra o aplicativo de **GeoRanker** para **ExifRank**.\n\n"
            "### O que muda:\n"
            "- ✅ Nome atualizado para **ExifRank**\n"
            "- ✅ Novo banco de dados mais seguro\n"
            "- ✅ Login com Google corrigido\n"
            "- ✅ A versão antiga é desinstalada automaticamente\n\n"
            "A atualização é automática — basta aceitar quando o app avisar."
        ),
        "draft": False,
        "prerelease": False
    }

    r_release = requests.post(
        f"https://api.github.com/repos/{REPO_OWNER}/{REPO_ANTIGO}/releases",
        headers=headers, json=release_data
    )

    if r_release.status_code not in (200, 201):
        print(f"❌ Erro ao criar release: {r_release.text}")
        sys.exit(1)

    release_info = r_release.json()
    upload_url = release_info["upload_url"].replace("{?name,label}", "")
    print(f"✅ Release criada: {release_info['html_url']}")

    # Upload do instalador com o NOME ANTIGO (GeoRanker_Installer.exe)
    # para que os clientes v1.0.12 consigam encontrar
    print(f"\n➜ Fazendo upload como 'GeoRanker_Installer.exe' (nome que a v1.0.12 procura)...")
    
    headers_upload = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github.v3+json",
        "Content-Type": "application/octet-stream"
    }

    upload_url_completa = f"{upload_url}?name=GeoRanker_Installer.exe"

    with open(exe_path, "rb") as f:
        r_upload = requests.post(upload_url_completa, headers=headers_upload, data=f)

    if r_upload.status_code == 201:
        print("\n" + "=" * 60)
        print(f"🎉 RELEASE PONTE PUBLICADA COM SUCESSO!")
        print(f"📍 Repo: {REPO_ANTIGO}")
        print(f"🏷️  Tag: {tag}")
        print(f"📦 Asset: GeoRanker_Installer.exe (contém ExifRank)")
        print(f"🔗 Link: {release_info['html_url']}")
        print("=" * 60)
        print("\nTodos os clientes v1.0.12 que abrirem o app agora vão ver")
        print("a tela de atualização e receber o ExifRank automaticamente!")
    else:
        print(f"❌ Erro no upload: {r_upload.text}")

if __name__ == "__main__":
    main()
