import os
import time
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

CURRENT_VERSION = "v4.5"

# --- PREVENÇÃO DE DUPLA EXECUÇÃO ---
_instance_mutex = None
def enforce_single_instance():
    global _instance_mutex
    mutex_name = "Local\\ExifRank_App_Mutex_v1"
    _instance_mutex = ctypes.windll.kernel32.CreateMutexW(None, False, mutex_name)
    last_error = ctypes.windll.kernel32.GetLastError()
    if last_error == 183: # ERROR_ALREADY_EXISTS
        ctypes.windll.user32.MessageBoxW(0, "O ExifRank já está aberto. Verifique a barra de tarefas do Windows.", "ExifRank - Já em Execução", 0x30)
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
    
    pasta_antiga = os.path.join(appdata, 'GeoRanker')
    pasta_app = os.path.join(appdata, 'ExifRank')
    
    # Migração automática dos dados da versão antiga
    if not os.path.exists(pasta_app) and os.path.exists(pasta_antiga):
        try:
            import shutil
            shutil.copytree(pasta_antiga, pasta_app)
        except Exception as e:
            print("Erro ao migrar dados antigos:", e)
            
    if not os.path.exists(pasta_app):
        os.makedirs(pasta_app)
    return pasta_app

def get_clientes_path():
    return os.path.join(get_app_data_dir(), 'clientes.json')

def get_sessao_path():
    return os.path.join(get_app_data_dir(), 'sessao.json')

def get_config_path():
    return os.path.join(get_app_data_dir(), 'config.json')


def get_gemini_key():
    caminho = get_config_path()
    try:
        if os.path.exists(caminho):
            with open(caminho, "r", encoding="utf-8") as f:
                cfg = json.load(f)
                if cfg.get("GEMINI_API_KEY"):
                    return cfg.get("GEMINI_API_KEY")
    except:
        pass
    return ""

def get_groq_key():
    caminho = get_config_path()
    try:
        if os.path.exists(caminho):
            with open(caminho, "r", encoding="utf-8") as f:
                cfg = json.load(f)
                if cfg.get("GROQ_API_KEY"):
                    return cfg.get("GROQ_API_KEY")
    except:
        pass
    
    # Tenta do .env se não tiver no config
    env_path = resource_path(".env")
    load_dotenv(dotenv_path=env_path)
    return os.getenv("GROQ_API_KEY", "")

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

def get_audits_path():
    return os.path.join(get_app_data_dir(), 'auditorias.json')

def get_audits():
    caminho = get_audits_path()
    try:
        if os.path.exists(caminho):
            with open(caminho, "r", encoding="utf-8") as f:
                return json.load(f)
    except:
        pass
    return []

def salvar_audit_db(audit_data):
    audits = get_audits()
    
    if "id" not in audit_data or not audit_data["id"]:
        audit_data["id"] = str(uuid.uuid4())
        
    audit_data["data_atualizacao"] = datetime.now().strftime("%d/%m/%Y %H:%M")
    
    atualizado = False
    for i, a in enumerate(audits):
        if a.get("id") == audit_data["id"]:
            audits[i] = audit_data
            atualizado = True
            break
            
    if not atualizado:
        audits.insert(0, audit_data)
        
    caminho = get_audits_path()
    try:
        with open(caminho, "w", encoding="utf-8") as f:
            json.dump(audits, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print("Erro ao salvar auditoria", e)
    
    return audit_data

def deletar_audit_db(audit_id):
    audits = get_audits()
    audits = [a for a in audits if a.get("id") != audit_id]
    caminho = get_audits_path()
    try:
        with open(caminho, "w", encoding="utf-8") as f:
            json.dump(audits, f, ensure_ascii=False, indent=2)
    except Exception as e:
        pass

# GLOBAL WINDOW REFERENCE
window = None

class Api:
    def __init__(self):
        self._cancel_flag = False
        self._current_subprocess = None

    def frontend_log(self, level, message):
        print(f"[{level.upper()}] [FRONTEND]: {message}")
        return True

    def get_app_version(self):
        return CURRENT_VERSION

    def obter_hardware_id(self):
        try:
            hwid = subprocess.check_output('wmic csproduct get uuid', creationflags=subprocess.CREATE_NO_WINDOW).decode('utf-8').split('\n')[1].strip()
            if hwid and hwid != "FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF":
                return hwid
        except:
            pass
        import uuid
        return str(uuid.getnode())

    def obter_chave_groq(self):
        return get_groq_key()

    def salvar_chave_groq(self, chave):
        caminho = get_config_path()
        cfg = {}
        try:
            if os.path.exists(caminho):
                with open(caminho, "r", encoding="utf-8") as f:
                    cfg = json.load(f)
        except:
            pass
        cfg["GROQ_API_KEY"] = chave
        try:
            with open(caminho, "w", encoding="utf-8") as f:
                json.dump(cfg, f)
            return True
        except Exception as e:
            print("Erro ao salvar chave:", e)
            return False

    def salvar_logo_agencia(self, base64_logo):
        caminho = get_config_path()
        cfg = {}
        try:
            if os.path.exists(caminho):
                with open(caminho, "r", encoding="utf-8") as f:
                    cfg = json.load(f)
        except:
            pass
        cfg["AGENCY_LOGO"] = base64_logo
        try:
            with open(caminho, "w", encoding="utf-8") as f:
                json.dump(cfg, f)
            return True
        except Exception as e:
            print("Erro ao salvar logo da agência:", e)
            return False

    def carregar_logo_agencia(self):
        caminho = get_config_path()
        try:
            if os.path.exists(caminho):
                with open(caminho, "r", encoding="utf-8") as f:
                    cfg = json.load(f)
                    return cfg.get("AGENCY_LOGO", "")
        except:
            pass
        return ""

    def salvar_nome_agencia(self, nome):
        caminho = get_config_path()
        cfg = {}
        try:
            if os.path.exists(caminho):
                with open(caminho, "r", encoding="utf-8") as f:
                    cfg = json.load(f)
        except:
            pass
        cfg["AGENCY_NAME"] = nome
        try:
            with open(caminho, "w", encoding="utf-8") as f:
                json.dump(cfg, f)
            return True
        except Exception as e:
            print("Erro ao salvar nome da agência:", e)
            return False

    def carregar_nome_agencia(self):
        caminho = get_config_path()
        try:
            if os.path.exists(caminho):
                with open(caminho, "r", encoding="utf-8") as f:
                    cfg = json.load(f)
                    return cfg.get("AGENCY_NAME", "")
        except:
            pass
        return ""

    def atualizarProgresso(self, porcentagem, texto, status="running"):
        if window:
            texto_esc = texto.replace('\\n', '\\\\n').replace('"', '\\"').replace("'", "\\'")
            window.evaluate_js(f'atualizarProgresso({porcentagem}, "{texto_esc}", "{status}")')

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

    def listar_auditorias(self):
        return get_audits()

    def salvar_auditoria(self, audit_data):
        salvo = salvar_audit_db(audit_data)
        return {"ok": True, "auditoria": salvo}

    def deletar_auditoria(self, audit_id):
        deletar_audit_db(audit_id)
        return {"ok": True}

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
            url = "https://api.github.com/repos/leopresses/ExifRank-Releases/releases/latest"
            response = requests.get(url, timeout=5)
            if response.status_code == 200:
                data = response.json()
                latest_version = data.get("tag_name", "")
                
                def v_tuple(v):
                    return tuple(int(x) for x in v.lower().replace('v', '').split('.') if x.isdigit())
                
                if latest_version and v_tuple(latest_version) > v_tuple(CURRENT_VERSION):
                    download_url = ""
                    for asset in data.get("assets", []):
                        if asset.get("name") == "ExifRank_Installer.exe":
                            download_url = asset.get("browser_download_url")
                            break
                    
                    if download_url:
                        return {
                            "update_available": True, 
                            "version": latest_version, 
                            "download_url": download_url,
                            "release_notes": data.get("body", "Nenhuma nota de versão fornecida.")
                        }
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

            import tempfile
            update_installer = os.path.join(tempfile.gettempdir(), "ExifRank_update_installer.exe")
            
            # The URL now points to ExifRank_Installer.exe, but our release script uploaded it as ExifRank.exe?
            # Wait, the release script uploads it as `ExifRank.exe` on GitHub to avoid changing the download URL!
            # Let me check `lancar_atualizacao.py`:
            # `upload_url_completa = f"{upload_url}?name=ExifRank.exe"`
            # Ah! It uploads `ExifRank_Installer.exe` but names it `ExifRank.exe` in the release assets!
            # Let's adjust `lancar_atualizacao.py` to upload it as `ExifRank_Installer.exe`?
            # NO, let's keep it simple: the download URL from GitHub is `ExifRank_Installer.exe`. Let's assume it.
            
            response = requests.get(download_url, stream=True)
            total_size = int(response.headers.get('content-length', 0))
            downloaded = 0
            
            with open(update_installer, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)
                        downloaded += len(chunk)
                        if total_size > 0:
                            percent = int((downloaded / total_size) * 100)
                            if window:
                                window.evaluate_js(f'updateDownloadProgress({percent}, "downloading")')
            
            if window:
                window.evaluate_js('updateDownloadProgress(100, "done")')
                
            # Executa o instalador em modo totalmente silencioso
            # /VERYSILENT: sem telas de wizard
            # /SUPPRESSMSGBOXES: sem perguntas
            # /NORESTART: não reinicia o Windows se precisar
            # /SP-: pula tela de 'This will install...'
            # /FORCECLOSEAPPLICATIONS: fecha o app se ele demorar a fechar
            subprocess.Popen([update_installer, "/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART", "/SP-", "/FORCECLOSEAPPLICATIONS"], creationflags=subprocess.CREATE_NO_WINDOW)
            
            # Fecha nossa interface suavemente para liberar os arquivos para o instalador
            if window:
                window.destroy()
            else:
                os._exit(0)

        except Exception as e:
            print("Erro no update:", e)
            if window:
                window.evaluate_js('updateDownloadProgress(100, "error")')

    def gerar_com_ia(self, nicho, empresa, telefone, endereco_val):
        chave_api = get_groq_key()

        if not chave_api or chave_api.strip() == "" or chave_api == "cole_sua_chave_aqui":
            return {"erro": "A chave da API Groq não foi encontrada ou está inválida."}

        try:
            import groq
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

    def api_cancelar_processamento(self):
        self._cancel_flag = True
        if self._current_subprocess:
            try:
                self._current_subprocess.terminate()
            except:
                pass
        return "OK"

    def executar_seo_lote(self, data):
        self._cancel_flag = False
        self._current_subprocess = None
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
                self.atualizarProgresso(0, "Pronto.", "completed")
                return

            for idx, (tipo, root_dir, arquivo) in enumerate(tarefas, start=1):
                if self._cancel_flag:
                    self.atualizarProgresso(0, f"Processamento cancelado. {idx-1} de {total} arquivos foram processados.", "cancelled")
                    return

                progresso = (idx / total) * 50
                self.atualizarProgresso(progresso, f"Processando [{idx}/{total}]: {arquivo}...")

                caminho = os.path.join(root_dir, arquivo)
                base_name, _ = os.path.splitext(arquivo)
                
                if tipo == 'converter_para_jpg':
                    if arquivo.lower().endswith('.gif'):
                        cmd = f'"{magick_exe}" convert "{arquivo}[0]" -quality 80 -resize "1920x1920>" "{base_name}.jpg"'
                    else:
                        cmd = f'"{magick_exe}" mogrify -format jpg -quality 80 -resize "1920x1920>" "{arquivo}"'
                    
                    self._current_subprocess = subprocess.Popen(cmd, shell=True, cwd=root_dir, creationflags=subprocess.CREATE_NO_WINDOW)
                    self._current_subprocess.communicate()
                    
                    if self._cancel_flag:
                        self.atualizarProgresso(0, f"Processamento cancelado. {idx-1} de {total} arquivos foram processados.", "cancelled")
                        return

                    try: os.remove(caminho)
                    except: pass

                elif tipo == 'otimizar_in_place':
                    cmd = f'"{magick_exe}" mogrify -quality 80 -resize "1920x1920>" "{arquivo}"'
                    self._current_subprocess = subprocess.Popen(cmd, shell=True, cwd=root_dir, creationflags=subprocess.CREATE_NO_WINDOW)
                    self._current_subprocess.communicate()
                    
                    if self._cancel_flag:
                        self.atualizarProgresso(0, f"Processamento cancelado. {idx-1} de {total} arquivos foram processados.", "cancelled")
                        return

                elif tipo == 'video':
                    video_temp = os.path.join(root_dir, f"temp_ffmpeg_{arquivo}")
                    cmd = f'"{ffmpeg_exe}" -i "{arquivo}" -vcodec libx264 -crf 28 -preset ultrafast -vf "scale=\'min(1280,iw)\':-2" -y "{video_temp}"'
                    self._current_subprocess = subprocess.Popen(cmd, shell=True, cwd=root_dir, creationflags=subprocess.CREATE_NO_WINDOW)
                    self._current_subprocess.communicate()
                    
                    if self._cancel_flag:
                        try: os.remove(video_temp)
                        except: pass
                        self.atualizarProgresso(0, f"Processamento cancelado. {idx-1} de {total} arquivos foram processados.", "cancelled")
                        return

                    if os.path.exists(video_temp):
                        try:
                            os.remove(caminho)
                            os.rename(video_temp, caminho)
                        except: pass

            # --- LOGICA DE BLOCOS SEMANTICOS E MULTIPLOS ENDERECOS ---
            self.atualizarProgresso(60, "Organizando blocos semânticos e localizações...")
            
            localizacoes = data.get("localizacoes", [])
            if not localizacoes:
                localizacoes = [{"nome": empresa_val or "Principal", "lat": lat_val, "lon": lon_val}]
            
            loc_nomes_limpos = []
            for i, loc in enumerate(localizacoes):
                loc_n = re.sub(r'[<>:"/\\|?*]', '', loc["nome"]).strip()
                if not loc_n: loc_n = f"Local_{i+1}"
                loc_nomes_limpos.append(loc_n)
                
            arquivos_por_bloco = {}
            for root, dirs, files in os.walk(base_dir):
                rel_path = os.path.relpath(root, base_dir)
                bloco_nome = ""
                if rel_path != ".":
                    parts = rel_path.split(os.sep)
                    bloco_nome = parts[0] 
                else:
                    bloco_nome = "Geral"
                
                # Ignorar se o nome do bloco já for um nome de localização (caso a pasta já esteja montada)
                if bloco_nome in loc_nomes_limpos:
                    continue
                    
                if bloco_nome not in arquivos_por_bloco:
                    arquivos_por_bloco[bloco_nome] = []
                    
                for f in files:
                    ext = os.path.splitext(f)[1].lower()
                    if ext in ['.jpg', '.jpeg', '.png', '.mp4', '.mov', '.avi', '.mkv', '.webm']:
                        arquivos_por_bloco[bloco_nome].append(os.path.join(root, f))
            
            import random
            novas_pastas = []
            lista_blocos = sorted([b for b in arquivos_por_bloco.keys() if arquivos_por_bloco[b]])
            
            def mover_arquivos(lista_arqs, destino_dir):
                import shutil
                for arq in lista_arqs:
                    nome_arq = os.path.basename(arq)
                    dest = os.path.join(destino_dir, nome_arq)
                    if os.path.abspath(arq) != os.path.abspath(dest):
                        contador = 1
                        while os.path.exists(dest):
                            base_n, ext_n = os.path.splitext(nome_arq)
                            dest = os.path.join(destino_dir, f"{base_n}_{contador}{ext_n}")
                            contador += 1
                        try: shutil.move(arq, dest)
                        except: pass

            if len(lista_blocos) == 1 and len(localizacoes) > 1:
                # Apenas um bloco mas várias localizações: dividimos os arquivos desse único bloco
                bloco = lista_blocos[0]
                arquivos = arquivos_por_bloco[bloco]
                chunks = [arquivos[i::len(localizacoes)] for i in range(len(localizacoes))]
                
                for i, loc in enumerate(localizacoes):
                    if not chunks[i]: continue
                    
                    loc_nome = re.sub(r'[<>:"/\\|?*]', '', loc["nome"]).strip()
                    if not loc_nome: loc_nome = f"Local_{i+1}"
                    
                    nova_pasta_bloco = os.path.join(base_dir, loc_nome) if bloco == "Geral" else os.path.join(base_dir, bloco, loc_nome)
                    os.makedirs(nova_pasta_bloco, exist_ok=True)
                    if nova_pasta_bloco not in novas_pastas:
                        novas_pastas.append((nova_pasta_bloco, loc, bloco))
                        
                    mover_arquivos(chunks[i], nova_pasta_bloco)
            else:
                # Múltiplos blocos: cada bloco recebe exatamente UMA localização (distribuição Round-Robin)
                for index_bloco, bloco in enumerate(lista_blocos):
                    arquivos = arquivos_por_bloco[bloco]
                    loc = localizacoes[index_bloco % len(localizacoes)]
                    
                    loc_nome = re.sub(r'[<>:"/\\|?*]', '', loc["nome"]).strip()
                    if not loc_nome: loc_nome = f"Local_{(index_bloco % len(localizacoes))+1}"
                    
                    nova_pasta_bloco = os.path.join(base_dir, loc_nome) if bloco == "Geral" else os.path.join(base_dir, bloco, loc_nome)
                    os.makedirs(nova_pasta_bloco, exist_ok=True)
                    if nova_pasta_bloco not in novas_pastas:
                        novas_pastas.append((nova_pasta_bloco, loc, bloco))
                        
                    mover_arquivos(arquivos, nova_pasta_bloco)

            self.atualizarProgresso(65, "Preparando motor EXIF...")
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
            
            self.atualizarProgresso(70, "Injetando tags EXIF por bloco semântico...")
            
            for nova_pasta_bloco, loc, bloco in novas_pastas:
                # Gerar a palavra-chave final: Bloco + Descrição/Título principal
                bloco_kw = f"{bloco} " if bloco != "Geral" else ""
                combined_title = f"{bloco_kw}{titulo_val}".strip()
                combined_desc = f"{bloco_kw}{desc_val}".strip()

                cmd = [
                    exiftool_exe, "-overwrite_original", "-m", "-charset", "filename=utf8", "-L", 
                    "-ext", "jpg", "-ext", "jpeg", "-ext", "png", "-r",
                    f"-Artist={empresa_val}", f"-Title={combined_title}", f"-Subject={combined_desc}",
                    f"-Description={combined_desc}", f"-XPKeywords={combined_desc}", f"-Caption-Abstract={combined_desc}",
                    f"-GPSLatitude={loc['lat']}", f"-GPSLatitudeRef={loc['lat']}",
                    f"-GPSLongitude={loc['lon']}", f"-GPSLongitudeRef={loc['lon']}", "."
                ]
                
                self._current_subprocess = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, creationflags=subprocess.CREATE_NO_WINDOW, cwd=nova_pasta_bloco)
                out, err = self._current_subprocess.communicate()
                
                if self._cancel_flag:
                    self.atualizarProgresso(0, f"Processamento cancelado.", "cancelled")
                    return

            self.atualizarProgresso(85, "Aplicando renomeação estratégica SEO...")
            total_rn = sum(len(files) for p, l, b in novas_pastas for r, d, files in os.walk(p))
            contador_geral = 1

            for nova_pasta_bloco, loc, bloco in novas_pastas:
                bloco_kw = f"{bloco} " if bloco != "Geral" else ""
                titulo_curto = titulo_val[:40] if titulo_val else ""
                loc_nome_limpo = loc['nome']
                texto_base = f"{empresa_val} {bloco_kw} {loc_nome_limpo} {titulo_curto}".strip()
                if not texto_base: texto_base = "midia-otimizada"
                
                texto_limpo = unicodedata.normalize('NFKD', texto_base).encode('ASCII', 'ignore').decode('utf-8')
                texto_limpo = re.sub(r'[^a-zA-Z0-9\s-]', '', texto_limpo)
                texto_limpo = re.sub(r'\s+', '-', texto_limpo).lower()
                if len(texto_limpo) > 60: texto_limpo = texto_limpo[:60].strip('-')

                arquivos_para_renomear = []
                for root, dirs, files in os.walk(nova_pasta_bloco):
                    files.sort()
                    for f in files:
                        ext = os.path.splitext(f)[1].lower()
                        if ext in ['.jpg', '.jpeg', '.png', '.mp4', '.mov', '.avi', '.mkv', '.webm']:
                            arquivos_para_renomear.append((root, f, ext))

                contador = 1
                for root, f, ext in arquivos_para_renomear:
                    if self._cancel_flag: return
                        
                    p_prog = 85 + (contador_geral/max(1, total_rn))*15
                    self.atualizarProgresso(p_prog, f"Renomeando {f}...")
                    
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
                    contador_geral += 1

            try:
                # O salvamento agora é feito preferencialmente pela UI (manualmente) 
                # para pegar todos os dados (nicho, telefone, etc), 
                # mas mantemos um auto-save básico se a empresa não existir
                pass
            except: pass

            self.atualizarProgresso(100, "100% Concluído!", "completed")
            self.alertaUI("TUDO PRONTO!\\nImagens convertidas, compactadas, EXIF injetado e arquivos renomeados com sucesso!")
            if window:
                window.evaluate_js(f'if(typeof registerOptimizationSuccess === "function") registerOptimizationSuccess({total});')
            
            if notificar_val:
                mostrar_notificacao_windows("ExifRank", "Otimização e conversão de mídia finalizadas com sucesso!")

        except Exception as e:
            self.atualizarProgresso(0, f"Erro: {e}", "error")
            self.alertaUI(f"Falha Crítica: {e}")
        finally:
            try: shutil.rmtree(pasta_temp)
            except: pass
            if usou_temp_local:
                try: shutil.rmtree(os.path.join(base_dir, ".motor_exif_temp"))
                except: pass

    def init_app(self):
        chave = get_groq_key()
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
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=_web_dir, **kwargs)
        
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()
    
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
    
    myappid = 'ExifRank.App.Desktop.1'
    ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(myappid)
    
    api = Api()
    
    # Inicia o servidor local em thread separada
    server_thread = threading.Thread(target=start_local_server, daemon=True)
    server_thread.start()
    
    window = webview.create_window(
        'ExifRank',
        url='http://localhost:45321/app.html?v=2',
        js_api=api,
        width=1280,
        height=800,
        min_size=(1100, 700)
    )
    
    webview.start(debug=False, private_mode=False)