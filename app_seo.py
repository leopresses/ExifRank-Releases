import os
import sys
import threading
import subprocess
import shutil
import glob
from tkinter import Tk, filedialog
import webview
from dotenv import load_dotenv
import groq
import tempfile
import zipfile
import unicodedata
import re
import json
import ctypes
import requests
import uuid
from datetime import datetime

CURRENT_VERSION = "v1.0.2"

# --- PREVENÇÃO DE DUPLA EXECUÇÃO ---
_instance_mutex = None
def enforce_single_instance():
    global _instance_mutex
    mutex_name = "Local\\GeoRanker_App_Mutex_v1"
    _instance_mutex = ctypes.windll.kernel32.CreateMutexW(None, False, mutex_name)
    last_error = ctypes.windll.kernel32.GetLastError()
    if last_error == 183: # ERROR_ALREADY_EXISTS
        ctypes.windll.user32.MessageBoxW(0, "O GeoRanker já está aberto. Verifique a barra de tarefas do Windows.", "GeoRanker - Já em Execução", 0x30)
        sys.exit(0)

try:
    ctypes.windll.shcore.SetProcessDpiAwareness(1)
except Exception:
    pass

def resource_path(relative_path):
    if hasattr(sys, '_MEIPASS'):
        return os.path.join(sys._MEIPASS, relative_path)
    return os.path.join(os.path.abspath("."), relative_path)

def mostrar_notificacao_windows(titulo, mensagem):
    ps_script = f"""
    [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
    $template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
    $textNodes = $template.GetElementsByTagName("text")
    $textNodes.Item(0).AppendChild($template.CreateTextNode("{titulo}")) | Out-Null
    $textNodes.Item(1).AppendChild($template.CreateTextNode("{mensagem}")) | Out-Null
    $toast = [Windows.UI.Notifications.ToastNotification]::new($template)
    $appId = '{{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}}\\WindowsPowerShell\\v1.0\\powershell.exe'
    [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId).Show($toast)
    """
    try:
        subprocess.run(["powershell", "-Command", ps_script], creationflags=subprocess.CREATE_NO_WINDOW)
    except:
        pass

def get_app_data_dir():
    appdata = os.getenv('APPDATA')
    if not appdata:
        appdata = os.path.expanduser('~')
    pasta_app = os.path.join(appdata, 'GeoRanker')
    if not os.path.exists(pasta_app):
        os.makedirs(pasta_app)
    return pasta_app

def get_clientes_path():
    return os.path.join(get_app_data_dir(), 'clientes.json')

def get_sessao_path():
    return os.path.join(get_app_data_dir(), 'sessao.json')

def get_clientes():
    caminho = get_clientes_path()
    try:
        if os.path.exists(caminho):
            with open(caminho, "r", encoding="utf-8") as f:
                return json.load(f)
    except:
        pass
    return []

def salvar_cliente_db(cliente_data):
    clientes = get_clientes()
    
    if "id" not in cliente_data or not cliente_data["id"]:
        cliente_data["id"] = str(uuid.uuid4())
        
    cliente_data["data_atualizacao"] = datetime.now().strftime("%d/%m/%Y %H:%M")
    
    atualizado = False
    for i, c in enumerate(clientes):
        if c.get("id") == cliente_data["id"]:
            clientes[i] = cliente_data
            atualizado = True
            break
            
    if not atualizado:
        clientes.insert(0, cliente_data)
        
    caminho = get_clientes_path()
    try:
        with open(caminho, "w", encoding="utf-8") as f:
            json.dump(clientes, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print("Erro ao salvar cliente", e)
    
    return cliente_data

def deletar_cliente_db(cliente_id):
    clientes = get_clientes()
    clientes = [c for c in clientes if c.get("id") != cliente_id]
    caminho = get_clientes_path()
    try:
        with open(caminho, "w", encoding="utf-8") as f:
            json.dump(clientes, f, ensure_ascii=False, indent=2)
    except Exception as e:
        pass

# GLOBAL WINDOW REFERENCE
window = None

class Api:
    def atualizarProgresso(self, porcentagem, texto):
        if window:
            texto_esc = texto.replace('\\n', '\\\\n').replace('"', '\\"').replace("'", "\\'")
            window.evaluate_js(f'atualizarProgresso({porcentagem}, "{texto_esc}")')

    def alertaUI(self, msg):
        if window:
            msg_esc = msg.replace('\n', '\\n').replace('"', '\\"').replace("'", "\\'")
            window.evaluate_js(f'alertaUI("{msg_esc}")')
            
    def updateApiLed(self, status, color):
        if window:
            window.evaluate_js(f'updateApiLed("{status}", "{color}")')

    def salvar_sessao(self, user_data):
        try:
            caminho = get_sessao_path()
            with open(caminho, "w", encoding="utf-8") as f:
                json.dump(user_data, f, ensure_ascii=False, indent=2)
            return {"ok": True}
        except Exception as e:
            return {"erro": str(e)}

    def salvar_pdf(self, base64_data, default_name):
        try:
            import base64
            # Remover o prefixo data:application/pdf;base64,
            if "," in base64_data:
                base64_data = base64_data.split(",")[1]
            
            pdf_bytes = base64.b64decode(base64_data)
            
            filepath = filedialog.asksaveasfilename(
                title="Salvar Relatório PDF",
                initialfile=default_name,
                defaultextension=".pdf",
                filetypes=[("Arquivos PDF", "*.pdf")]
            )
            
            if filepath:
                with open(filepath, "wb") as f:
                    f.write(pdf_bytes)
                return {"ok": True, "path": filepath}
            return {"ok": False, "cancelado": True}
        except Exception as e:
            return {"ok": False, "erro": str(e)}

    def carregar_sessao(self):
        try:
            caminho = get_sessao_path()
            if os.path.exists(caminho):
                with open(caminho, "r", encoding="utf-8") as f:
                    return json.load(f)
        except:
            pass
        return None

    def limpar_sessao(self):
        try:
            caminho = get_sessao_path()
            if os.path.exists(caminho):
                os.remove(caminho)
        except:
            pass
        return {"ok": True}

    def selecionar_pasta(self):
        root = Tk()
        root.attributes("-topmost", True)
        root.withdraw()
        pasta = filedialog.askdirectory(title="Selecione a pasta de imagens")
        root.destroy()
        return pasta

    def buscar_gps(self, endereco_texto):
        try:
            from geopy.geocoders import ArcGIS
            geolocator = ArcGIS()
            location = geolocator.geocode(endereco_texto)
            if location:
                return {"lat": location.latitude, "lon": location.longitude}
            else:
                return {"erro": "Endereço não encontrado."}
        except Exception as e:
            return {"erro": str(e)}

    def check_for_updates(self):
        try:
            url = "https://api.github.com/repos/leopresses/FerramentaSEOLocal/releases/latest"
            response = requests.get(url, timeout=5)
            if response.status_code == 200:
                data = response.json()
                latest_version = data.get("tag_name", "")
                
                def v_tuple(v):
                    return tuple(int(x) for x in v.lower().replace('v', '').split('.') if x.isdigit())
                
                if latest_version and v_tuple(latest_version) > v_tuple(CURRENT_VERSION):
                    download_url = ""
                    for asset in data.get("assets", []):
                        if asset.get("name") == "GeoRanker.exe":
                            download_url = asset.get("browser_download_url")
                            break
                    
                    if download_url:
                        return {"update_available": True, "version": latest_version, "download_url": download_url}
        except Exception as e:
            print("Erro ao checar atualizações:", e)
        return {"update_available": False}

    def aplicar_atualizacao(self, download_url):
        threading.Thread(target=self._thread_download_update, args=(download_url,), daemon=True).start()
        return "OK"

    def _thread_download_update(self, download_url):
        try:
            exe_path = sys.executable
            if not getattr(sys, 'frozen', False):
                self.alertaUI("A atualização só funciona no arquivo compilado (.exe).")
                if window: window.evaluate_js('updateDownloadProgress(100, "error")')
                return

            update_exe = os.path.join(os.path.dirname(exe_path), "GeoRanker_update.exe")
            
            response = requests.get(download_url, stream=True)
            total_size = int(response.headers.get('content-length', 0))
            downloaded = 0
            
            with open(update_exe, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)
                        downloaded += len(chunk)
                        if total_size > 0:
                            percent = int((downloaded / total_size) * 100)
                            if window:
                                window.evaluate_js(f'updateDownloadProgress({percent}, "downloading")')
            
            bat_path = os.path.join(os.path.dirname(exe_path), "update_georanker.bat")
            exe_name = os.path.basename(exe_path)
            
            bat_content = f"""@echo off
title Atualizando GeoRanker...
echo Aguardando fechamento do aplicativo...
timeout /t 3 /nobreak > NUL
echo Substituindo arquivos...
del /F /Q "{exe_name}"
move /Y "GeoRanker_update.exe" "{exe_name}"
echo Reiniciando...
start "" "{exe_name}"
del "%~f0"
"""
            with open(bat_path, "w", encoding="utf-8") as f:
                f.write(bat_content)
                
            if window:
                window.evaluate_js('updateDownloadProgress(100, "done")')
                
            subprocess.Popen([bat_path], creationflags=subprocess.CREATE_NO_WINDOW, cwd=os.path.dirname(exe_path))
            sys.exit(0)

        except Exception as e:
            print("Erro no update:", e)
            if window:
                window.evaluate_js('updateDownloadProgress(100, "error")')

    def gerar_com_ia(self, nicho, empresa, telefone, endereco_val):
        env_path = resource_path(".env")
        load_dotenv(dotenv_path=env_path)
        chave_api = os.getenv("GROQ_API_KEY")

        if not chave_api or chave_api.strip() == "" or chave_api == "cole_sua_chave_aqui":
            return {"erro": "A chave da API Groq não foi encontrada ou está inválida no .env."}

        try:
            client = groq.Groq(api_key=chave_api.strip())
            prompt = f"""Atue como um Engenheiro de SEO Local sênior, especialista em otimização de metadados para o Google Business Profile. Sua missão é criar conteúdos que tragam autoridade e relevância local.

Configurações da Empresa:
Nome da Empresa: {empresa}
Telefone: {telefone}
Nicho/Especialidade: {nicho}
Localização: {endereco_val}

Diretriz de Tom de Voz e Ética (Dinâmico):
Adapte o tom de voz conforme o nicho:

Se Advocacia: Utilize um tom sóbrio, informativo e técnico. OBRIGATÓRIO: Obedeça rigorosamente o Código de Ética e Disciplina da OAB, evitando mercantilização, autopromoção, promessas de resultados ou uso de termos como 'o melhor' ou 'o mais barato'. Foco estritamente informativo e educativo.

Se Oficina Mecânica: Utilize um tom técnico, prático, direto e que transmita segurança.

Se Clínica Veterinária: Utilize um tom acolhedor, empático e focado no bem-estar animal.

Se Outros Nichos: Utilize um tom que conecte com a dor/necessidade do cliente final daquele setor.

Diretrizes de Execução:

Foco Semântico: Integre as palavras-chave naturalmente. Priorize a leitura fluida.

SEO Local: Insira as palavras-chave de maior peso logo no início do texto.

CTA Estruturado: Finalize a descrição com uma chamada para ação clara e ética (conforme permitido pelo conselho de classe de cada nicho).

Retorne EXATAMENTE no formato abaixo:

PALAVRAS-CHAVE:
[Lista de 20 a 25 palavras-chave separadas por vírgula, focadas em intenção de busca local]

DESCRIÇÃO:
[Texto semântico corrido de 10 a 15 linhas, escrito de forma persuasiva conforme o tom definido acima, contendo localização e telefone]"""
            
            resposta = client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.7
            )
            texto = resposta.choices[0].message.content

            if "DESCRIÇÃO:" in texto:
                partes = texto.split("DESCRIÇÃO:")
                kw_parte = partes[0].replace("PALAVRAS-CHAVE:", "").strip()
                desc_parte = partes[1].strip()
            else:
                kw_parte = texto
                desc_parte = f"Contato: {empresa} - {telefone}" 

            return {"palavras": kw_parte, "descricao": desc_parte}
        except Exception as e:
            return {"erro": str(e)}

    def executar_seo_lote(self, data):
        threading.Thread(target=self._thread_executar_seo, args=(data,), daemon=True).start()
        return "OK"

    def _thread_executar_seo(self, data):
        base_dir = data.get("pasta")
        pasta = data.get("pasta")
        empresa_val = data.get("empresa", "")
        telefone_val = data.get("telefone", "")
        lat_val = data.get("lat", "")
        lon_val = data.get("lon", "")
        titulo_val = data.get("titulo", "")
        desc_val = data.get("desc", "")
        notificar_val = data.get("notificar", True)
        magick_exe = resource_path("magick.exe") 
        if not os.path.exists(magick_exe):
            magick_exe = "magick" 
        
        ffmpeg_exe = resource_path("ffmpeg.exe")
        if not os.path.exists(ffmpeg_exe):
            ffmpeg_exe = "ffmpeg"

        self.atualizarProgresso(5, "Escaneando arquivos e preparando o motor...")

        try:
            tarefas = []
            for root, dirs, files in os.walk(base_dir):
                for f in files:
                    ext = f.lower()
                    if ext.endswith('.heic') or ext.endswith('.cr2') or ext.endswith('.webp') or ext.endswith('.tiff') or ext.endswith('.tif') or ext.endswith('.bmp') or ext.endswith('.gif'):
                        tarefas.append(('converter_para_jpg', root, f))
                    elif ext.endswith('.png') or ext.endswith('.jpg') or ext.endswith('.jpeg'):
                        tarefas.append(('otimizar_in_place', root, f))
                    elif ext.endswith('.mp4') or ext.endswith('.mov') or ext.endswith('.avi') or ext.endswith('.mkv') or ext.endswith('.webm'):
                        if not f.startswith("temp_ffmpeg_"):
                            tarefas.append(('video', root, f))

            total = len(tarefas)
            if total == 0:
                self.alertaUI("Nenhuma mídia elegível encontrada na pasta.")
                self.atualizarProgresso(0, "Pronto.")
                return

            for idx, (tipo, root_dir, arquivo) in enumerate(tarefas, start=1):
                progresso = (idx / total) * 50
                self.atualizarProgresso(progresso, f"Processando [{idx}/{total}]: {arquivo}...")

                caminho = os.path.join(root_dir, arquivo)
                base_name, _ = os.path.splitext(arquivo)
                
                if tipo == 'converter_para_jpg':
                    if arquivo.lower().endswith('.gif'):
                        cmd = f'"{magick_exe}" convert "{arquivo}[0]" -quality 80 -resize "1920x1920>" "{base_name}.jpg"'
                    else:
                        cmd = f'"{magick_exe}" mogrify -format jpg -quality 80 -resize "1920x1920>" "{arquivo}"'
                    
                    subprocess.run(cmd, shell=True, cwd=root_dir, creationflags=subprocess.CREATE_NO_WINDOW)
                    try: os.remove(caminho)
                    except: pass

                elif tipo == 'otimizar_in_place':
                    cmd = f'"{magick_exe}" mogrify -quality 80 -resize "1920x1920>" "{arquivo}"'
                    subprocess.run(cmd, shell=True, cwd=root_dir, creationflags=subprocess.CREATE_NO_WINDOW)

                elif tipo == 'video':
                    video_temp = os.path.join(root_dir, f"temp_ffmpeg_{arquivo}")
                    cmd = f'"{ffmpeg_exe}" -i "{arquivo}" -vcodec libx264 -crf 28 -preset ultrafast -vf "scale=\'min(1280,iw)\':-2" -y "{video_temp}"'
                    subprocess.run(cmd, shell=True, cwd=root_dir, creationflags=subprocess.CREATE_NO_WINDOW)
                    if os.path.exists(video_temp):
                        try:
                            os.remove(caminho)
                            os.rename(video_temp, caminho)
                        except: pass

            self.atualizarProgresso(55, "Iniciando aplicação de metadados...")
            pasta_temp = tempfile.mkdtemp()
            pasta_exif = pasta_temp
            caminho_zip = resource_path("motor_exif.zip")
            usou_temp_local = False
            
            try:
                with zipfile.ZipFile(caminho_zip, 'r') as zip_ref:
                    zip_ref.extractall(pasta_exif)
            except:
                pasta_exif = os.path.join(base_dir, ".motor_exif_temp")
                os.makedirs(pasta_exif, exist_ok=True)
                usou_temp_local = True
                with zipfile.ZipFile(caminho_zip, 'r') as zip_ref:
                    zip_ref.extractall(pasta_exif)
            
            exiftool_exe = os.path.join(pasta_exif, "exiftool.exe")
            
            self.atualizarProgresso(70, "Injetando tags EXIF silenciosamente...")
            
            cmd = [
                exiftool_exe, "-overwrite_original", "-m", "-charset", "filename=utf8", "-L", 
                "-ext", "jpg", "-ext", "jpeg", "-ext", "png", "-r",
                f"-Artist={empresa_val}", f"-Title={titulo_val}", f"-Subject={desc_val}",
                f"-Description={desc_val}", f"-XPKeywords={desc_val}", f"-Caption-Abstract={desc_val}",
                f"-GPSLatitude={lat_val}", f"-GPSLatitudeRef={lat_val}",
                f"-GPSLongitude={lon_val}", f"-GPSLongitudeRef={lon_val}", "."
            ]
            
            resultado = subprocess.run(cmd, capture_output=True, text=True, creationflags=subprocess.CREATE_NO_WINDOW, cwd=base_dir)
            
            if resultado.returncode != 0 and not usou_temp_local:
                pasta_exif_local = os.path.join(base_dir, ".motor_exif_temp")
                os.makedirs(pasta_exif_local, exist_ok=True)
                with zipfile.ZipFile(caminho_zip, 'r') as zip_ref:
                    zip_ref.extractall(pasta_exif_local)
                cmd[0] = os.path.join(pasta_exif_local, "exiftool.exe")
                resultado = subprocess.run(cmd, capture_output=True, text=True, creationflags=subprocess.CREATE_NO_WINDOW, cwd=base_dir)
                usou_temp_local = True

            self.atualizarProgresso(85, "Aplicando renomeação estratégica SEO...")
            titulo_curto = titulo_val[:40] if titulo_val else ""
            texto_base = f"{empresa_val} {titulo_curto}".strip()
            if not texto_base: texto_base = "midia-otimizada"
            
            texto_limpo = unicodedata.normalize('NFKD', texto_base).encode('ASCII', 'ignore').decode('utf-8')
            texto_limpo = re.sub(r'[^a-zA-Z0-9\s-]', '', texto_limpo)
            texto_limpo = re.sub(r'\s+', '-', texto_limpo).lower()
            if len(texto_limpo) > 60: texto_limpo = texto_limpo[:60].strip('-')

            arquivos_para_renomear = []
            for root, dirs, files in os.walk(base_dir):
                files.sort()
                for f in files:
                    ext = os.path.splitext(f)[1].lower()
                    if ext in ['.jpg', '.jpeg', '.png', '.mp4', '.mov', '.avi', '.mkv', '.webm']:
                        arquivos_para_renomear.append((root, f, ext))

            total_rn = len(arquivos_para_renomear)
            contador = 1
            for idx, (root, f, ext) in enumerate(arquivos_para_renomear, start=1):
                p = 85 + (idx/total_rn)*15
                self.atualizarProgresso(p, f"Renomeando {f}...")
                novo_nome = f"{texto_limpo}-{contador:03d}{ext}"
                caminho_antigo = os.path.join(root, f)
                caminho_novo = os.path.join(root, novo_nome)
                if caminho_antigo != caminho_novo:
                    while os.path.exists(caminho_novo):
                        contador += 1
                        novo_nome = f"{texto_limpo}-{contador:03d}{ext}"
                        caminho_novo = os.path.join(root, novo_nome)
                    try:
                        os.rename(caminho_antigo, caminho_novo)
                        contador += 1
                    except: pass
                else:
                    contador += 1

            try:
                # O salvamento agora é feito preferencialmente pela UI (manualmente) 
                # para pegar todos os dados (nicho, telefone, etc), 
                # mas mantemos um auto-save básico se a empresa não existir
                pass
            except: pass

            self.atualizarProgresso(100, "100% Concluído!")
            self.alertaUI("TUDO PRONTO!\\nImagens convertidas, compactadas, EXIF injetado e arquivos renomeados com sucesso!")
            
            if notificar_val:
                mostrar_notificacao_windows("GeoRanker", "Otimização e conversão de mídia finalizadas com sucesso!")

        except Exception as e:
            self.atualizarProgresso(0, f"Erro: {e}")
            self.alertaUI(f"Falha Crítica: {e}")
        finally:
            try: shutil.rmtree(pasta_temp)
            except: pass
            if usou_temp_local:
                try: shutil.rmtree(os.path.join(base_dir, ".motor_exif_temp"))
                except: pass

    def init_app(self):
        env_path = resource_path(".env")
        load_dotenv(dotenv_path=env_path)
        chave = os.getenv("GROQ_API_KEY")
        if not chave or chave.strip() == "" or chave == "cole_sua_chave_aqui":
            self.updateApiLed("API Ausente", "red")

    def get_clientes_json(self):
        return get_clientes()
        
    def salvar_cliente_api(self, cliente_data):
        return salvar_cliente_db(cliente_data)
        
    def deletar_cliente_api(self, id):
        deletar_cliente_db(id)
        return True

    def obter_resumo_pasta(self, pasta):
        if not pasta or not os.path.exists(pasta):
            return {"erro": "Pasta não existe"}
        
        extensoes = {
            'jpg': 0, 'jpeg': 0, 'png': 0, 'gif': 0, 'webp': 0, 'bmp': 0, 'tiff': 0, 'tif': 0,
            'mp4': 0, 'mov': 0, 'avi': 0, 'mkv': 0, 'webm': 0
        }
        
        total = 0
        for root, dirs, files in os.walk(pasta):
            for f in files:
                ext = f.split('.')[-1].lower()
                if ext in extensoes:
                    extensoes[ext] += 1
                    total += 1
                    
        return {
            "total": total,
            "jpg": extensoes['jpg'] + extensoes['jpeg'],
            "png": extensoes['png'],
            "video": extensoes['mp4'] + extensoes['mov'] + extensoes['avi'] + extensoes['mkv'] + extensoes['webm'],
            "outros": extensoes['gif'] + extensoes['webp'] + extensoes['bmp'] + extensoes['tiff'] + extensoes['tif']
        }

    def api_gerar_insights_pdf(self, payload):
        try:
            import groq
            env_path = resource_path(".env")
            load_dotenv(dotenv_path=env_path)
            chave_api = os.getenv("GROQ_API_KEY")
            if not chave_api or chave_api.strip() == "" or chave_api == "cole_sua_chave_aqui":
                return {"ok": False, "erro": "A chave da API Groq não foi encontrada ou está inválida no .env."}
            client = groq.Groq(api_key=chave_api.strip())
            
            empresa = payload.get("empresa", "")
            numFotos = payload.get("numFotos", 0)
            gps_ok = payload.get("gps_ok", False)
            keyCount = payload.get("keyCount", 0)
            
            str_gps = "Sim" if gps_ok else "Não"
            prompt = f"Atue como um analista de SEO Local Sênior. Gere um insight executivo, positivo e encorajador de apenas 1 parágrafo curto (máximo 4 linhas) para um relatório de cliente.\nDados da Otimização:\nEmpresa: {empresa}\nFotos processadas: {numFotos}\nGeotag (GPS) inserida: {str_gps}\nQuantidade de Palavras-chave injetadas nas fotos: {keyCount}\nNão use saudações. Apenas retorne o parágrafo."

            chat_completion = client.chat.completions.create(
                messages=[{"role": "user", "content": prompt}],
                model="llama-3.1-8b-instant",
                temperature=0.5,
                max_tokens=200
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
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=_web_dir, **kwargs)
    
    def do_POST(self):
        if self.path == '/set_auth_token':
            content_length = int(self.headers['Content-Length'])
            body = self.rfile.read(content_length).decode('utf-8')
            if window:
                # Escapa aspas simples no JSON para injetar com segurança no JS
                safe_body = body.replace("\\", "\\\\").replace("'", "\\'")
                window.evaluate_js(f"completeExternalLogin('{safe_body}')")
            self.send_response(200)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type')
            self.end_headers()
            self.wfile.write(b"OK")
        else:
            self.send_response(404)
            self.end_headers()
    
    def do_OPTIONS(self):
        # CORS preflight
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
    
    def log_message(self, format, *args):
        pass  # Silencia logs do servidor no console

def start_local_server():
    global _web_dir
    _web_dir = resource_path('web')
    # Permitir reuso da porta
    http.server.ThreadingHTTPServer.allow_reuse_address = True
    try:
        httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 45321), CustomHandler)
        httpd.serve_forever()
    except Exception as e:
        print("Server error:", e)

if __name__ == '__main__':
    # Bypass WebView2 Tracking Prevention for Firebase Auth
    os.environ['WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS'] = '--disable-features=msTrackingPrevention,TrackingPrevention'
    
    enforce_single_instance()
    
    myappid = 'GeoRanker.App.Desktop.1'
    ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(myappid)
    
    api = Api()
    
    # Inicia o servidor local em thread separada
    server_thread = threading.Thread(target=start_local_server, daemon=True)
    server_thread.start()
    
    window = webview.create_window(
        'GeoRanker',
        url='http://localhost:45321/index.html',
        js_api=api,
        width=1280,
        height=800,
        min_size=(1100, 700)
    )
    
    webview.start(debug=False)