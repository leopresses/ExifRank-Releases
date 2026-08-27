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
import hashlib
import base64
from datetime import datetime, timezone, timedelta

CURRENT_VERSION = "v7.1.0"
UPDATE_INSTALLER_MIN_BYTES = 512 * 1024

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

def get_offline_license_path():
    return os.path.join(get_app_data_dir(), 'offline_license.dat')


class _DataBlob(ctypes.Structure):
    _fields_ = [
        ('cbData', ctypes.c_uint),
        ('pbData', ctypes.POINTER(ctypes.c_byte))
    ]


def _dpapi_proteger(payload):
    """Protege a licença com a conta Windows atual; não é um arquivo editável em texto."""
    if os.name != 'nt':
        return None
    try:
        buffer = ctypes.create_string_buffer(payload)
        entrada = _DataBlob(len(payload), ctypes.cast(buffer, ctypes.POINTER(ctypes.c_byte)))
        saida = _DataBlob()
        protegido = ctypes.windll.crypt32.CryptProtectData(
            ctypes.byref(entrada), 'ExifRank Offline License', None, None, None, 0, ctypes.byref(saida)
        )
        if not protegido:
            return None
        try:
            dados = ctypes.string_at(saida.pbData, saida.cbData)
            return base64.b64encode(dados).decode('ascii')
        finally:
            ctypes.windll.kernel32.LocalFree(saida.pbData)
    except Exception as erro:
        print(f'Não foi possível proteger a licença offline: {erro}')
        return None


def _dpapi_desproteger(payload_base64):
    if os.name != 'nt':
        return None
    try:
        dados = base64.b64decode(payload_base64)
        buffer = ctypes.create_string_buffer(dados)
        entrada = _DataBlob(len(dados), ctypes.cast(buffer, ctypes.POINTER(ctypes.c_byte)))
        saida = _DataBlob()
        desprotegido = ctypes.windll.crypt32.CryptUnprotectData(
            ctypes.byref(entrada), None, None, None, None, 0, ctypes.byref(saida)
        )
        if not desprotegido:
            return None
        try:
            return ctypes.string_at(saida.pbData, saida.cbData)
        finally:
            ctypes.windll.kernel32.LocalFree(saida.pbData)
    except Exception as erro:
        print(f'Não foi possível ler a licença offline: {erro}')
        return None


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
    env_path = resource_path(".env")
    load_dotenv(dotenv_path=env_path)
    return os.getenv("GEMINI_API_KEY", "")

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

def chamar_gemini_api(prompt, model="gemini-3.5-flash"):
    chave_gemini = get_gemini_key()
    
    # 1. Tentar com Gemini se a chave existir
    if chave_gemini and chave_gemini.strip() and chave_gemini != "cole_sua_chave_aqui":
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={chave_gemini.strip()}"
            headers = {"Content-Type": "application/json"}
            payload = {"contents": [{"parts": [{"text": prompt}]}]}

            response = requests.post(url, headers=headers, json=payload, timeout=25)
            
            # Se gemini-3.5-flash der erro que não seja cota, tenta fallback secundário para gemini-2.5-flash
            if response.status_code not in (200, 429):
                url_fallback = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={chave_gemini.strip()}"
                response = requests.post(url_fallback, headers=headers, json=payload, timeout=25)

            if response.status_code == 200:
                data = response.json()
                candidates = data.get("candidates", [])
                if candidates:
                    parts = candidates[0].get("content", {}).get("parts", [])
                    if parts:
                        return parts[0].get("text", "").strip()
            
            # Se for 429 (Cota estourada) ou erro de API, registramos o aviso e acionamos o Groq
            print(f"[Gemini Notice] HTTP {response.status_code} recebido do Gemini. Redirecionando para Groq (Llama 3.3)...")
        except Exception as e_gemini:
            print(f"[Gemini Fallback] Erro na requisição do Gemini ({e_gemini}). Redirecionando para Groq (Llama 3.3)...")

    # 2. Fallback Automático e Seguro para Groq (Llama 3.3 70b)
    chave_groq = get_groq_key()
    if chave_groq and chave_groq.strip() and chave_groq != "cole_sua_chave_aqui":
        try:
            import groq
            client = groq.Groq(api_key=chave_groq.strip())
            resp = client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.7
            )
            print("[IA Engine] Conteúdo gerado com sucesso via Groq (Fallback ativado).")
            return resp.choices[0].message.content.strip()
        except Exception as e_groq:
            raise Exception(f"Erro no Groq após falha do Gemini: {e_groq}")
            
    raise Exception("Cota do Gemini excedida e nenhuma chave do Groq configurada.")

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
_app_encerrando = threading.Event()

def executar_js_seguro(script):
    """Envia atualizações à WebView apenas enquanto ela ainda está ativa.

    Threads de processamento, atualização e login podem terminar alguns
    milissegundos depois de o usuário fechar a janela. No WebView2 isso pode
    gerar uma exceção interna do Python.NET se uma chamada evaluate_js chegar
    após o encerramento. A atualização visual é dispensável nesse momento;
    arquivos e dados já gravados continuam íntegros.
    """
    if _app_encerrando.is_set():
        return False
    janela = window
    if janela is None:
        return False
    try:
        janela.evaluate_js(script)
        return True
    except Exception as erro:
        # A janela pode ser destruída entre a verificação acima e a chamada.
        # Não exibimos um traceback no terminal durante o fechamento normal.
        if not _app_encerrando.is_set():
            print(f'Aviso: atualização visual indisponível ({type(erro).__name__}).')
        return False

class Api:
    def __init__(self):
        self._cancel_flag = False
        self._current_subprocess = None
        self._pause_event = threading.Event()
        self._pause_event.set()
        self._is_processing = False
        self._license_validation_mode = 'online'
        self._update_lock = threading.Lock()
        self._update_in_progress = False

    def frontend_log(self, level, message):
        print(f"[{level.upper()}] [FRONTEND]: {message}")
        return True

    def get_app_version(self):
        return CURRENT_VERSION

    def obter_hardware_id(self):
        try:
            output = subprocess.check_output(
                ["wmic", "csproduct", "get", "uuid"],
                creationflags=subprocess.CREATE_NO_WINDOW
            ).decode('utf-8', errors='ignore')
            linhas = [linha.strip() for linha in output.splitlines() if linha.strip()]
            hwid = linhas[-1] if len(linhas) > 1 else ""
            if hwid and hwid != "FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF":
                return hwid
        except:
            pass
        try:
            hwid = subprocess.check_output(
                [
                    "powershell", "-NoProfile", "-NonInteractive", "-Command",
                    "(Get-CimInstance -ClassName Win32_ComputerSystemProduct).UUID"
                ],
                creationflags=subprocess.CREATE_NO_WINDOW
            ).decode('utf-8', errors='ignore').strip()
            if hwid and hwid != "FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF":
                return hwid
        except:
            pass
        import uuid
        return str(uuid.getnode())

    def obter_chave_groq(self):
        return get_groq_key()

    def obter_chave_gemini(self):
        return get_gemini_key()

    def salvar_chave_gemini(self, chave):
        caminho = get_config_path()
        cfg = {}
        try:
            if os.path.exists(caminho):
                with open(caminho, "r", encoding="utf-8") as f:
                    cfg = json.load(f)
        except:
            pass
        cfg["GEMINI_API_KEY"] = chave
        try:
            with open(caminho, "w", encoding="utf-8") as f:
                json.dump(cfg, f)
            return True
        except Exception as e:
            print("Erro ao salvar chave Gemini:", e)
            return False

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
        # json.dumps mantém quebras de linha, aspas e caminhos do Windows
        # seguros ao atravessar a ponte Python -> JavaScript.
        executar_js_seguro(
            f'atualizarProgresso({float(porcentagem)}, {json.dumps(str(texto))}, {json.dumps(str(status))})'
        )

    def alertaUI(self, msg):
        executar_js_seguro(f'alertaUI({json.dumps(str(msg))})')

    def updateApiLed(self, status, color):
        executar_js_seguro(f'updateApiLed("{status}", "{color}")')

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
        endereco = str(endereco_texto or '').strip()
        if len(endereco) < 6:
            return {"erro": "Informe um endereço mais completo para localizar as coordenadas."}
        try:
            from geopy.geocoders import ArcGIS
            geolocator = ArcGIS(timeout=8)
            location = geolocator.geocode(endereco)
            if location:
                return {"lat": location.latitude, "lon": location.longitude}
            else:
                return {"erro": "Endereço não encontrado."}
        except Exception:
            return {"erro": "Não foi possível consultar as coordenadas agora. Verifique sua internet e tente novamente."}

    def check_for_updates(self):
        try:
            url = "https://api.github.com/repos/leopresses/ExifRank-Releases/releases/latest"
            response = requests.get(url, timeout=5)
            if response.status_code == 200:
                data = response.json()
                latest_version = data.get("tag_name", "")
                
                def v_tuple(v):
                    parts = re.findall(r'\d+', str(v))[:3]
                    return tuple((int(x) for x in (parts + ['0', '0', '0'])[:3]))
                
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
        with self._update_lock:
            if self._update_in_progress:
                return "Em preparação"
            self._update_in_progress = True
        threading.Thread(target=self._thread_download_update, args=(download_url,), daemon=True).start()
        return "OK"

    @staticmethod
    def _quote_batch_path(path):
        """Coloca um caminho em aspas para uso seguro pelo arquivo .cmd."""
        return '"' + os.path.abspath(path).replace('"', '""') + '"'

    def _criar_lancador_de_atualizacao(self, installer_path):
        """Inicia o instalador somente quando este processo já tiver encerrado."""
        update_dir = os.path.dirname(installer_path)
        launcher_path = os.path.join(update_dir, f"ExifRank_finish_update_{uuid.uuid4().hex}.cmd")
        installer = self._quote_batch_path(installer_path)

        script = f'''@echo off
setlocal EnableExtensions
set "EXIFRANK_PID={os.getpid()}"
:wait_for_exifrank
tasklist /FI "PID eq %EXIFRANK_PID%" /NH | findstr /R /C:"[ ]%EXIFRANK_PID%[ ]" >nul
if not errorlevel 1 (
    timeout /t 1 /nobreak >nul
    goto wait_for_exifrank
)
start "ExifRank Update" /wait {installer} /VERYSILENT /SUPPRESSMSGBOXES /NORESTART /SP- /CLOSEAPPLICATIONS /FORCECLOSEAPPLICATIONS
set "INSTALL_EXIT_CODE=%ERRORLEVEL%"
del /q {installer} >nul 2>&1
del /q "%~f0" >nul 2>&1
exit /b %INSTALL_EXIT_CODE%
'''
        with open(launcher_path, 'w', encoding='ascii', newline='\r\n') as launcher_file:
            launcher_file.write(script)
        return launcher_path

    def _encerrar_para_instalar_atualizacao(self):
        """Libera integralmente os arquivos do PyInstaller antes da instalação."""
        _app_encerrando.set()

        def finalizar_processo():
            # A janela pode fechar antes, mas o processo precisa terminar para
            # liberar executável, DLLs e demais arquivos da instalação.
            time.sleep(0.35)
            os._exit(0)

        threading.Thread(target=finalizar_processo, daemon=False).start()
        try:
            if window:
                window.destroy()
        except Exception as erro:
            print(f"Aviso ao fechar para atualização: {erro}")

    def _thread_download_update(self, download_url):
        try:
            if not getattr(sys, 'frozen', False):
                self.alertaUI("A atualização só funciona no arquivo compilado (.exe).")
                with self._update_lock:
                    self._update_in_progress = False
                executar_js_seguro('updateDownloadProgress(100, "error")')
                return

            if not isinstance(download_url, str) or not download_url.startswith("https://"):
                raise ValueError("O endereço da atualização é inválido.")

            update_dir = os.path.join(tempfile.gettempdir(), "ExifRankUpdate")
            os.makedirs(update_dir, exist_ok=True)
            update_installer = os.path.join(update_dir, f"ExifRank_update_{uuid.uuid4().hex}.exe")
            response = requests.get(
                download_url,
                stream=True,
                timeout=(10, 120),
                headers={"User-Agent": f"ExifRank/{CURRENT_VERSION}"}
            )
            response.raise_for_status()
            total_size = int(response.headers.get('content-length', 0))
            downloaded = 0
            
            with open(update_installer, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)
                        downloaded += len(chunk)
                        if total_size > 0:
                            percent = int((downloaded / total_size) * 100)
                            executar_js_seguro(f'updateDownloadProgress({percent}, "downloading")')

            if downloaded < UPDATE_INSTALLER_MIN_BYTES:
                raise ValueError("O arquivo baixado é menor que o instalador esperado.")
            with open(update_installer, 'rb') as installer_file:
                if installer_file.read(2) != b'MZ':
                    raise ValueError("O arquivo baixado não é um instalador Windows válido.")

            launcher_path = self._criar_lancador_de_atualizacao(update_installer)
            executar_js_seguro('updateDownloadProgress(100, "installing")')
            subprocess.Popen(
                ["cmd.exe", "/d", "/c", launcher_path],
                cwd=os.path.dirname(launcher_path),
                creationflags=subprocess.CREATE_NO_WINDOW
            )
            self._encerrar_para_instalar_atualizacao()

        except Exception as e:
            print("Erro no update:", e)
            with self._update_lock:
                self._update_in_progress = False
            executar_js_seguro('updateDownloadProgress(100, "error")')

    def gerar_com_ia(self, nicho, empresa, telefone, endereco_val):
        try:
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
            
            texto = chamar_gemini_api(prompt, model="gemini-3.5-flash")

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
        # Libera a thread caso ela esteja aguardando a confirmação de pausa.
        self._pause_event.set()
        if self._current_subprocess:
            try:
                self._current_subprocess.terminate()
            except:
                pass
        return "OK"

    def api_pausar_processamento(self):
        if not self._is_processing:
            return {"ok": False, "erro": "Nenhum processamento está em andamento."}
        self._pause_event.clear()
        return {"ok": True}

    def api_retomar_processamento(self):
        self._pause_event.set()
        return {"ok": True}

    def _aguardar_retomada_ou_cancelamento(self):
        """Pausa entre operações seguras; nunca interrompe um arquivo no meio."""
        while not self._pause_event.wait(timeout=0.1):
            if self._cancel_flag:
                return False
        return not self._cancel_flag

    def executar_seo_lote(self, data):
        if self._is_processing:
            return {"ok": False, "erro": "Já existe uma otimização em andamento. Aguarde a conclusão ou cancele o processamento atual."}
        self._cancel_flag = False
        self._current_subprocess = None
        self._pause_event.set()
        self._is_processing = True
        threading.Thread(target=self._thread_executar_seo, args=(data,), daemon=True).start()
        return "OK"

    OFFLINE_LICENSE_DAYS = 7

    @staticmethod
    def _uid_do_token(token):
        try:
            partes = str(token or '').split('.')
            if len(partes) < 2:
                return ''
            payload = partes[1] + '=' * (-len(partes[1]) % 4)
            dados = json.loads(base64.urlsafe_b64decode(payload.encode('ascii')).decode('utf-8'))
            return str(dados.get('user_id') or dados.get('sub') or '').strip()
        except (ValueError, UnicodeDecodeError, json.JSONDecodeError):
            return ''

    def _uid_licenca(self, data):
        uid_informado = str(data.get('firebaseUid') or '').strip()
        uid_token = self._uid_do_token(data.get('firebaseIdToken'))
        # Durante uma validação online, divergência entre sessão e token invalida o cache.
        if uid_informado and uid_token and uid_informado != uid_token:
            return ''
        return uid_token or uid_informado

    @staticmethod
    def _hash_hardware(hardware_id):
        return hashlib.sha256(str(hardware_id).strip().encode('utf-8')).hexdigest()

    def _salvar_licenca_offline(self, uid, hardware_id):
        if not uid or not hardware_id:
            return False
        agora = datetime.now(timezone.utc)
        licenca = {
            'version': 1,
            'uid': uid,
            'hardwareHash': self._hash_hardware(hardware_id),
            'grantedAt': agora.isoformat(),
            'expiresAt': (agora + timedelta(days=self.OFFLINE_LICENSE_DAYS)).isoformat()
        }
        protegido = _dpapi_proteger(json.dumps(licenca, separators=(',', ':')).encode('utf-8'))
        if not protegido:
            return False
        caminho = get_offline_license_path()
        temporario = f'{caminho}.{uuid.uuid4().hex}.tmp'
        try:
            with open(temporario, 'w', encoding='ascii') as arquivo:
                arquivo.write(protegido)
            os.replace(temporario, caminho)
            return True
        except OSError as erro:
            print(f'Não foi possível salvar a licença offline: {erro}')
            try:
                if os.path.exists(temporario):
                    os.remove(temporario)
            except OSError:
                pass
            return False

    def _carregar_licenca_offline(self):
        try:
            with open(get_offline_license_path(), 'r', encoding='ascii') as arquivo:
                protegido = arquivo.read().strip()
            dados = _dpapi_desproteger(protegido)
            if not dados:
                return None
            licenca = json.loads(dados.decode('utf-8'))
            return licenca if isinstance(licenca, dict) else None
        except (OSError, ValueError, UnicodeDecodeError, json.JSONDecodeError):
            return None

    def _limpar_licenca_offline(self, uid='', hardware_id=''):
        licenca = self._carregar_licenca_offline()
        if licenca and uid and hardware_id:
            if licenca.get('uid') != uid or licenca.get('hardwareHash') != self._hash_hardware(hardware_id):
                return
        try:
            os.remove(get_offline_license_path())
        except OSError:
            pass

    def _obter_licenca_offline_valida(self, uid, hardware_id):
        if not uid or not hardware_id:
            return None
        licenca = self._carregar_licenca_offline()
        if not licenca:
            return None
        try:
            expira_em = datetime.fromisoformat(str(licenca.get('expiresAt') or ''))
            if expira_em.tzinfo is None:
                expira_em = expira_em.replace(tzinfo=timezone.utc)
        except ValueError:
            self._limpar_licenca_offline(uid, hardware_id)
            return None
        if (
            licenca.get('version') != 1
            or licenca.get('uid') != uid
            or licenca.get('hardwareHash') != self._hash_hardware(hardware_id)
            or expira_em <= datetime.now(timezone.utc)
        ):
            self._limpar_licenca_offline(uid, hardware_id)
            return None
        return {'expiresAt': expira_em, 'daysRemaining': max(0, (expira_em - datetime.now(timezone.utc)).days)}

    def obter_status_licenca_offline(self, uid, hardware_id):
        licenca = self._obter_licenca_offline_valida(str(uid or '').strip(), str(hardware_id or '').strip())
        if not licenca:
            return {'isPremium': False, 'offline': False}
        return {
            'isPremium': True,
            'offline': True,
            'expiresAt': licenca['expiresAt'].isoformat(),
            'daysRemaining': licenca['daysRemaining']
        }

    def _obter_limite_processamento(self, data):
        token = str(data.get('firebaseIdToken') or '').strip()
        hardware_id = str(data.get('hardwareId') or '').strip()
        uid = self._uid_licenca(data)
        self._license_validation_mode = 'online'

        if not hardware_id:
            return None, 'Não foi possível identificar este computador. Reinicie o aplicativo e tente novamente.'

        if token:
            try:
                response = requests.post(
                    'https://us-central1-exifrankapp.cloudfunctions.net/verifyPremiumDevice',
                    headers={'Authorization': f'Bearer {token}'},
                    json={'data': {'hardwareId': hardware_id}},
                    timeout=12
                )
                if response.status_code == 200:
                    payload = response.json()
                    result = payload.get('result', payload.get('data', {}))
                    if not isinstance(result, dict):
                        return None, 'A resposta de validação da licença é inválida.'
                    if result.get('isPremium') is True and result.get('deviceAllowed') is True:
                        if uid:
                            self._salvar_licenca_offline(uid, hardware_id)
                        return None, None  # Premium online e sem limite.

                    # Uma resposta online é definitiva: não mantemos cache após revogação ou troca de PC.
                    if uid:
                        self._limpar_licenca_offline(uid, hardware_id)
                    self._license_validation_mode = 'online-free'
                    return 20, None

                if response.status_code in (400, 401, 403):
                    return None, 'Sua sessão expirou ou não tem permissão para usar este computador. Entre novamente.'
                print(f'Validação online indisponível: HTTP {response.status_code}')
            except (requests.RequestException, ValueError) as erro:
                print(f'Validação online indisponível: {erro}')

        licenca_offline = self._obter_licenca_offline_valida(uid, hardware_id)
        if licenca_offline:
            self._license_validation_mode = 'offline-premium'
            return None, None

        # Sem conexão e sem uma concessão Premium válida: o motor continua local,
        # porém respeita o limite do plano gratuito.
        self._license_validation_mode = 'offline-free'
        return 20, None

    OUTPUT_FOLDER_NAME = "ExifRank - Otimizadas"
    OUTPUT_MANIFEST_NAME = ".exifrank-manifest.json"
    IMAGE_CONVERSION_EXTENSIONS = {'.heic', '.cr2', '.webp', '.tiff', '.tif', '.bmp', '.gif'}
    DIRECT_IMAGE_EXTENSIONS = {'.png', '.jpg', '.jpeg'}
    VIDEO_EXTENSIONS = {'.mp4', '.mov', '.m4v', '.avi', '.mkv', '.webm'}

    @staticmethod
    def _nome_seguro(nome, padrao):
        resultado = re.sub(r'[<>:"/\\|?*]', '', str(nome or '')).strip().rstrip('.')
        return resultado or padrao

    @staticmethod
    def _slug_seo(texto):
        texto = unicodedata.normalize('NFKD', str(texto or '')).encode('ASCII', 'ignore').decode('utf-8')
        texto = re.sub(r'[^a-zA-Z0-9\s-]', '', texto)
        texto = re.sub(r'\s+', '-', texto).strip('-').lower()
        return (texto[:60].strip('-') or 'midia-otimizada')

    def _classificar_midia(self, nome_arquivo):
        ext = os.path.splitext(nome_arquivo)[1].lower()
        if ext in self.IMAGE_CONVERSION_EXTENSIONS:
            return 'converter_para_jpg'
        if ext in self.DIRECT_IMAGE_EXTENSIONS:
            return 'otimizar_imagem'
        if ext in self.VIDEO_EXTENSIONS:
            return 'converter_video_mp4'
        return None

    def _normalizar_localizacoes(self, data):
        """Retorna localizações válidas antes de tocar em qualquer arquivo."""
        localizacoes = data.get('localizacoes') or []
        if not localizacoes:
            localizacoes = [{
                'nome': data.get('endereco') or data.get('empresa') or 'Localização principal',
                'lat': data.get('lat'),
                'lon': data.get('lon')
            }]

        resultado = []
        nomes_usados = set()
        for indice, localizacao in enumerate(localizacoes, start=1):
            nome = str((localizacao or {}).get('nome') or '').strip() or f'Localização {indice}'
            try:
                latitude = float(str((localizacao or {}).get('lat', '')).strip().replace(',', '.'))
                longitude = float(str((localizacao or {}).get('lon', '')).strip().replace(',', '.'))
            except (TypeError, ValueError):
                return None, f'Informe coordenadas válidas para "{nome}" antes de iniciar a otimização.'

            if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
                return None, f'As coordenadas de "{nome}" estão fora do intervalo permitido.'

            nome_pasta_base = self._nome_seguro(nome, f'Localizacao-{indice}')
            nome_pasta = nome_pasta_base
            sufixo = 2
            while nome_pasta.casefold() in nomes_usados:
                nome_pasta = f'{nome_pasta_base} {sufixo}'
                sufixo += 1
            nomes_usados.add(nome_pasta.casefold())
            resultado.append({
                'nome': nome,
                'lat': latitude,
                'lon': longitude,
                'pasta': nome_pasta
            })

        if not resultado:
            return None, 'Adicione ao menos uma localização com endereço e coordenadas antes de iniciar.'
        return resultado, None

    def _iterar_midias_origem(self, base_dir):
        """Lista somente a origem. Resultados antigos do ExifRank nunca entram novamente no motor."""
        tarefas = []
        output_root = os.path.join(base_dir, self.OUTPUT_FOLDER_NAME)
        for root, dirs, files in os.walk(base_dir):
            dirs[:] = sorted([
                diretorio for diretorio in dirs
                if os.path.abspath(os.path.join(root, diretorio)) != os.path.abspath(output_root)
                and diretorio != '.motor_exif_temp'
                and not diretorio.startswith('.exifrank-stage-')
            ], key=str.casefold)
            for arquivo in sorted(files, key=str.casefold):
                tipo = self._classificar_midia(arquivo)
                if not tipo:
                    continue
                caminho = os.path.join(root, arquivo)
                rel = os.path.relpath(caminho, base_dir)
                partes = rel.split(os.sep)
                bloco = 'Geral' if len(partes) == 1 else partes[0]
                subpasta = '' if bloco == 'Geral' else os.path.dirname(os.path.join(*partes[1:]))
                tarefas.append({
                    'tipo': tipo,
                    'origem': caminho,
                    'rel_origem': rel,
                    'ext': os.path.splitext(arquivo)[1].lower(),
                    'bloco': bloco,
                    'subpasta': subpasta,
                    'arquivo': arquivo
                })
        return sorted(tarefas, key=lambda tarefa: tarefa['rel_origem'].casefold())

    def _normalizar_mapeamento_pastas(self, data, localizacoes):
        """Valida o mapeamento manual de pasta principal para localização.

        Esse mapeamento só é usado quando o usuário opta por definir um
        endereço para cada pasta. No fluxo padrão, as mídias são distribuídas
        entre todas as localizações cadastradas.
        """
        if str(data.get('modoDistribuicao') or '').strip().lower() != 'por-pasta':
            return {}

        bruto = data.get('mapeamentoPastas') or {}
        if not isinstance(bruto, dict):
            return {}

        resultado = {}
        for bloco, indice in bruto.items():
            if not isinstance(bloco, str):
                continue
            try:
                indice = int(indice)
            except (TypeError, ValueError):
                continue
            if 0 <= indice < len(localizacoes):
                resultado[bloco] = indice
        return resultado

    @staticmethod
    def _usar_distribuicao_automatica(data, localizacoes):
        modo = str(data.get('modoDistribuicao') or 'automatico').strip().lower()
        return len(localizacoes) > 1 and modo in {'automatico', 'dividir-localizacoes'}

    def _montar_plano_organizacao(self, base_dir, tarefas, localizacoes, empresa, titulo, descricao, mapeamento_pastas=None, distribuir_automaticamente=False):
        """Gera cópias organizadas sem mover ou alterar os originais.

        Com várias localizações, o fluxo padrão divide as mídias de forma
        determinística entre as respectivas pastas de saída. O mapeamento
        manual por pasta continua disponível para matriz, filial e outros
        cenários em que o usuário queira controlar cada origem.
        """
        output_root = os.path.join(base_dir, self.OUTPUT_FOLDER_NAME)
        mapeamento_pastas = mapeamento_pastas or {}
        por_bloco = {}
        for tarefa in tarefas:
            por_bloco.setdefault(tarefa['bloco'], []).append(tarefa)

        plano = []
        blocos = sorted(por_bloco.keys(), key=str.casefold)
        for bloco in blocos:
            tarefas_bloco = sorted(por_bloco[bloco], key=lambda tarefa: tarefa['rel_origem'].casefold())
            if distribuir_automaticamente and len(localizacoes) > 1:
                distribuicao = [
                    (tarefa, localizacoes[indice % len(localizacoes)])
                    for indice, tarefa in enumerate(tarefas_bloco)
                ]
            else:
                indice_localizacao = mapeamento_pastas.get(bloco, 0)
                if not isinstance(indice_localizacao, int) or not (0 <= indice_localizacao < len(localizacoes)):
                    indice_localizacao = 0
                localizacao = localizacoes[indice_localizacao]
                distribuicao = [(tarefa, localizacao) for tarefa in tarefas_bloco]

            agrupados = {}
            for tarefa, localizacao in distribuicao:
                chave = (bloco, localizacao['pasta'])
                agrupados.setdefault(chave, []).append((tarefa, localizacao))

            for (bloco_atual, _), itens in agrupados.items():
                for ordem, (tarefa, localizacao) in enumerate(itens, start=1):
                    pasta_destino = os.path.join(output_root, localizacao['pasta']) if bloco_atual == 'Geral' else os.path.join(output_root, bloco_atual, localizacao['pasta'])
                    pasta_grupo = pasta_destino
                    if tarefa['subpasta']:
                        pasta_destino = os.path.join(pasta_destino, tarefa['subpasta'])
                    extensao_final = '.jpg' if tarefa['tipo'] == 'converter_para_jpg' else ('.mp4' if tarefa['tipo'] == 'converter_video_mp4' else tarefa['ext'])
                    texto_base = f"{empresa} {bloco_atual if bloco_atual != 'Geral' else ''} {localizacao['nome']} {str(titulo or '')[:40]}".strip()
                    nome_final = f"{self._slug_seo(texto_base)}-{ordem:03d}{extensao_final}"
                    fingerprint = hashlib.sha256(json.dumps({
                        'empresa': empresa,
                        'titulo': titulo,
                        'descricao': descricao,
                        'bloco': bloco_atual,
                        'localizacao': localizacao['nome'],
                        'lat': localizacao['lat'],
                        'lon': localizacao['lon']
                    }, ensure_ascii=False, sort_keys=True).encode('utf-8')).hexdigest()
                    plano.append({
                        **tarefa,
                        'localizacao': localizacao,
                        'pasta_destino': pasta_destino,
                        'pasta_grupo': pasta_grupo,
                        'nome_final': nome_final,
                        'fingerprint': fingerprint
                    })
        return plano, output_root

    def _carregar_manifest_saida(self, output_root):
        caminho = os.path.join(output_root, self.OUTPUT_MANIFEST_NAME)
        self._ocultar_manifest_saida(caminho)
        try:
            with open(caminho, 'r', encoding='utf-8') as arquivo:
                dados = json.load(arquivo)
                if isinstance(dados, dict) and isinstance(dados.get('files'), dict):
                    return dados
        except (OSError, ValueError, json.JSONDecodeError):
            pass
        return {'version': 1, 'files': {}}

    @staticmethod
    def _ocultar_manifest_saida(caminho):
        """Oculta o arquivo de controle no Explorer, sem removê-lo do projeto."""
        if os.name != 'nt' or not os.path.isfile(caminho):
            return
        try:
            atributos = ctypes.windll.kernel32.GetFileAttributesW(caminho)
            if atributos != -1:
                ctypes.windll.kernel32.SetFileAttributesW(caminho, atributos | 0x02)
        except Exception:
            # A ausência do atributo não afeta a segurança nem o funcionamento.
            pass

    def _salvar_manifest_saida(self, output_root, manifest):
        caminho = os.path.join(output_root, self.OUTPUT_MANIFEST_NAME)
        temporario = f'{caminho}.{uuid.uuid4().hex}.tmp'
        with open(temporario, 'w', encoding='utf-8') as arquivo:
            json.dump(manifest, arquivo, ensure_ascii=False, indent=2)
        os.replace(temporario, caminho)
        self._ocultar_manifest_saida(caminho)

    def _assinatura_origem(self, caminho):
        stat = os.stat(caminho)
        return {'size': stat.st_size, 'mtime_ns': stat.st_mtime_ns}

    def _eh_pasta_saida_exifrank(self, pasta):
        return os.path.isfile(os.path.join(pasta, self.OUTPUT_MANIFEST_NAME))

    def obter_previa_organizacao(self, data):
        base_dir = data.get('pasta')
        if not isinstance(base_dir, str) or not os.path.isdir(base_dir):
            return {'ok': False, 'erro': 'Selecione uma pasta válida antes de visualizar a organização.'}
        if self._eh_pasta_saida_exifrank(base_dir):
            return {'ok': False, 'erro': 'Essa é a pasta de resultados do ExifRank. Selecione a pasta original do projeto.'}
        localizacoes, erro = self._normalizar_localizacoes(data)
        if erro:
            return {'ok': False, 'erro': erro}
        tarefas = self._iterar_midias_origem(base_dir)
        por_bloco = {}
        for tarefa in tarefas:
            por_bloco[tarefa['bloco']] = por_bloco.get(tarefa['bloco'], 0) + 1
        mapeamento_pastas = self._normalizar_mapeamento_pastas(data, localizacoes)
        distribuir_automaticamente = self._usar_distribuicao_automatica(data, localizacoes)
        plano, output_root = self._montar_plano_organizacao(
            base_dir, tarefas, localizacoes,
            str(data.get('empresa') or '').strip(), str(data.get('titulo') or '').strip(),
            str(data.get('desc') or '').strip(), mapeamento_pastas, distribuir_automaticamente
        )
        resumo = {}
        for item in plano:
            chave = (item['bloco'], item['localizacao']['nome'])
            resumo[chave] = resumo.get(chave, 0) + 1
        return {
            'ok': True,
            'total': len(plano),
            'pastaSaida': output_root,
            'blocos': [
                {
                    'id': bloco,
                    'nome': 'Arquivos na pasta principal' if bloco == 'Geral' else bloco,
                    'quantidade': quantidade
                }
                for bloco, quantidade in sorted(
                    por_bloco.items(),
                    key=lambda item: item[0].casefold()
                )
            ],
            'distribuicao': [
                {'bloco': bloco, 'localizacao': localizacao, 'quantidade': quantidade}
                for (bloco, localizacao), quantidade in sorted(resumo.items(), key=lambda item: (item[0][0].casefold(), item[0][1].casefold()))
            ]
        }

    def _thread_executar_seo_legacy(self, data):
        base_dir = data.get("pasta")
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

        pasta_temp = None
        usou_temp_local = False
        falhas = []
        def resumo_erro(stderr):
            linhas = [linha.strip() for linha in (stderr or "").splitlines() if linha.strip()]
            return linhas[-1][:300] if linhas else "sem detalhes fornecidos pela ferramenta"
        if not isinstance(base_dir, str) or not os.path.isdir(base_dir):
            self.atualizarProgresso(0, "Selecione uma pasta válida.", "error")
            self.alertaUI("A pasta selecionada não existe ou não está acessível.")
            self._is_processing = False
            self._pause_event.set()
            return

        limite_gratuito, erro_licenca = self._obter_limite_processamento(data)
        if erro_licenca:
            self.atualizarProgresso(0, erro_licenca, "error")
            self.alertaUI(erro_licenca)
            self._is_processing = False
            self._pause_event.set()
            return

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
            if limite_gratuito is not None and total > limite_gratuito:
                mensagem = f"O plano Gratuito permite processar até {limite_gratuito} mídias por vez. Esta pasta possui {total}."
                self.atualizarProgresso(0, mensagem, "error")
                self.alertaUI(mensagem)
                return

            for idx, (tipo, root_dir, arquivo) in enumerate(tarefas, start=1):
                if not self._aguardar_retomada_ou_cancelamento():
                    self.atualizarProgresso(0, f"Processamento cancelado. {idx-1} de {total} arquivos foram processados.", "cancelled")
                    return

                progresso = (idx / total) * 50
                self.atualizarProgresso(progresso, f"Processando [{idx}/{total}]: {arquivo}...")

                caminho = os.path.join(root_dir, arquivo)
                base_name, _ = os.path.splitext(arquivo)

                if tipo == 'converter_para_jpg':
                    destino_jpg = os.path.join(root_dir, f"{base_name}.jpg")
                    if arquivo.lower().endswith('.gif'):
                        cmd = [magick_exe, "convert", f"{arquivo}[0]", "-quality", "80", "-resize", "1920x1920>", f"{base_name}.jpg"]
                    else:
                        cmd = [magick_exe, "mogrify", "-format", "jpg", "-quality", "80", "-resize", "1920x1920>", arquivo]
                    
                    self._current_subprocess = subprocess.Popen(cmd, cwd=root_dir, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, creationflags=subprocess.CREATE_NO_WINDOW)
                    _, err = self._current_subprocess.communicate()
                    
                    if not self._aguardar_retomada_ou_cancelamento():
                        self.atualizarProgresso(0, f"Processamento cancelado. {idx-1} de {total} arquivos foram processados.", "cancelled")
                        return

                    if self._current_subprocess.returncode == 0 and os.path.isfile(destino_jpg) and os.path.getsize(destino_jpg) > 0:
                        try:
                            os.remove(caminho)
                        except OSError as e:
                            falhas.append(f"Não foi possível remover o original {arquivo}: {e}")
                    else:
                        falhas.append(f"Conversão falhou para {arquivo}; o original foi preservado. {resumo_erro(err)}")

                elif tipo == 'otimizar_in_place':
                    cmd = [magick_exe, "mogrify", "-quality", "80", "-resize", "1920x1920>", arquivo]
                    self._current_subprocess = subprocess.Popen(cmd, cwd=root_dir, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, creationflags=subprocess.CREATE_NO_WINDOW)
                    _, err = self._current_subprocess.communicate()
                    
                    if not self._aguardar_retomada_ou_cancelamento():
                        self.atualizarProgresso(0, f"Processamento cancelado. {idx-1} de {total} arquivos foram processados.", "cancelled")
                        return
                    if self._current_subprocess.returncode != 0:
                        falhas.append(f"Otimização falhou para {arquivo}; o arquivo foi preservado. {resumo_erro(err)}")

                elif tipo == 'video':
                    video_temp = os.path.join(root_dir, f"temp_ffmpeg_{arquivo}")
                    cmd = [ffmpeg_exe, "-i", arquivo, "-vcodec", "libx264", "-crf", "28", "-preset", "ultrafast", "-vf", "scale=min(1280\\,iw):-2", "-y", video_temp]
                    self._current_subprocess = subprocess.Popen(cmd, cwd=root_dir, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, creationflags=subprocess.CREATE_NO_WINDOW)
                    _, err = self._current_subprocess.communicate()
                    
                    if not self._aguardar_retomada_ou_cancelamento():
                        try: os.remove(video_temp)
                        except: pass
                        self.atualizarProgresso(0, f"Processamento cancelado. {idx-1} de {total} arquivos foram processados.", "cancelled")
                        return

                    if self._current_subprocess.returncode == 0 and os.path.isfile(video_temp) and os.path.getsize(video_temp) > 0:
                        try:
                            os.replace(video_temp, caminho)
                        except OSError as e:
                            falhas.append(f"Não foi possível substituir o vídeo {arquivo}: {e}")
                    else:
                        try:
                            if os.path.exists(video_temp): os.remove(video_temp)
                        except OSError:
                            pass
                        falhas.append(f"Conversão de vídeo falhou para {arquivo}; o original foi preservado. {resumo_erro(err)}")

            if not self._aguardar_retomada_ou_cancelamento():
                self.atualizarProgresso(0, "Processamento cancelado.", "cancelled")
                return

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
                    if not self._aguardar_retomada_ou_cancelamento():
                        return False
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
                return True

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
                        
                    if not mover_arquivos(chunks[i], nova_pasta_bloco):
                        self.atualizarProgresso(0, "Processamento cancelado.", "cancelled")
                        return
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
                        
                    if not mover_arquivos(arquivos, nova_pasta_bloco):
                        self.atualizarProgresso(0, "Processamento cancelado.", "cancelled")
                        return

            self.atualizarProgresso(65, "Preparando motor EXIF...")
            pasta_temp = tempfile.mkdtemp()
            pasta_exif = pasta_temp
            caminho_zip = resource_path("motor_exif.zip")
            
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
                if not self._aguardar_retomada_ou_cancelamento():
                    self.atualizarProgresso(0, "Processamento cancelado.", "cancelled")
                    return
                # Gerar a palavra-chave final: Bloco + Descrição/Título principal
                bloco_kw = f"{bloco} " if bloco != "Geral" else ""
                combined_title = f"{bloco_kw}{titulo_val}".strip()
                combined_desc = f"{bloco_kw}{desc_val}".strip()

                try:
                    latitude = float(str(loc.get('lat', '')).replace(',', '.'))
                    longitude = float(str(loc.get('lon', '')).replace(',', '.'))
                except (TypeError, ValueError):
                    falhas.append(f"Coordenadas inválidas para {loc.get('nome', 'localização')}; as tags GPS não foram gravadas.")
                    continue

                lat_ref = "N" if latitude >= 0 else "S"
                lon_ref = "E" if longitude >= 0 else "W"

                cmd = [
                    exiftool_exe, "-overwrite_original", "-m", "-charset", "filename=utf8", "-L", 
                    "-ext", "jpg", "-ext", "jpeg", "-ext", "png", "-r",
                    f"-Artist={empresa_val}", f"-Title={combined_title}", f"-Subject={combined_desc}",
                    f"-Description={combined_desc}", f"-XPKeywords={combined_desc}", f"-Caption-Abstract={combined_desc}",
                    f"-GPSLatitude={abs(latitude)}", f"-GPSLatitudeRef={lat_ref}",
                    f"-GPSLongitude={abs(longitude)}", f"-GPSLongitudeRef={lon_ref}", "."
                ]
                
                self._current_subprocess = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, creationflags=subprocess.CREATE_NO_WINDOW, cwd=nova_pasta_bloco)
                out, err = self._current_subprocess.communicate()
                if not self._aguardar_retomada_ou_cancelamento():
                    self.atualizarProgresso(0, "Processamento cancelado.", "cancelled")
                    return
                if self._current_subprocess.returncode != 0:
                    falhas.append(f"Falha ao gravar EXIF nas imagens de {loc.get('nome', 'localização')}: {resumo_erro(err)}")

                video_cmd = [
                    exiftool_exe, "-overwrite_original", "-m", "-charset", "filename=utf8", "-L",
                    "-ext", "mp4", "-ext", "mov", "-ext", "m4v", "-r",
                    f"-QuickTime:Title={combined_title}", f"-QuickTime:Description={combined_desc}",
                    f"-QuickTime:Artist={empresa_val}", f"-Keys:GPSCoordinates={latitude}, {longitude}", "."
                ]
                self._current_subprocess = subprocess.Popen(video_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, creationflags=subprocess.CREATE_NO_WINDOW, cwd=nova_pasta_bloco)
                _, video_err = self._current_subprocess.communicate()
                if not self._aguardar_retomada_ou_cancelamento():
                    self.atualizarProgresso(0, "Processamento cancelado.", "cancelled")
                    return
                if self._current_subprocess.returncode != 0:
                    falhas.append(f"Falha ao gravar metadados nos vídeos de {loc.get('nome', 'localização')}: {resumo_erro(video_err)}")

            self.atualizarProgresso(85, "Aplicando renomeação estratégica SEO...")
            total_rn = sum(len(files) for p, l, b in novas_pastas for r, d, files in os.walk(p))
            contador_geral = 1

            for nova_pasta_bloco, loc, bloco in novas_pastas:
                if not self._aguardar_retomada_ou_cancelamento():
                    self.atualizarProgresso(0, "Processamento cancelado.", "cancelled")
                    return
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
                    if not self._aguardar_retomada_ou_cancelamento():
                        self.atualizarProgresso(0, "Processamento cancelado.", "cancelled")
                        return
                        
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

            if falhas:
                resumo_falhas = "\n".join(falhas[:5])
                self.atualizarProgresso(100, f"Concluído com {len(falhas)} aviso(s).", "completed")
                self.alertaUI(f"Processamento concluído com avisos. Os originais com falha foram preservados.\n{resumo_falhas}")
            else:
                self.atualizarProgresso(100, "100% Concluído!", "completed")
                self.alertaUI("TUDO PRONTO!\nImagens convertidas, compactadas, EXIF injetado e arquivos renomeados com sucesso!")
            executar_js_seguro(f'if(typeof registerOptimizationSuccess === "function") registerOptimizationSuccess({max(0, total - len(falhas))});')
            
            if notificar_val:
                mostrar_notificacao_windows("ExifRank", "Otimização e conversão de mídia finalizadas com sucesso!")

        except Exception as e:
            self.atualizarProgresso(0, f"Erro: {e}", "error")
            self.alertaUI(f"Falha Crítica: {e}")
        finally:
            self._is_processing = False
            self._current_subprocess = None
            self._pause_event.set()
            if pasta_temp:
                try: shutil.rmtree(pasta_temp)
                except: pass
            if usou_temp_local:
                try: shutil.rmtree(os.path.join(base_dir, ".motor_exif_temp"))
                except: pass

    def _thread_executar_seo(self, data):
        """Processa cópias em uma pasta de saída, sem modificar as mídias de origem."""
        base_dir = data.get('pasta')
        empresa = str(data.get('empresa') or '').strip()
        titulo = str(data.get('titulo') or '').strip()
        descricao = str(data.get('desc') or '').strip()
        notificar = bool(data.get('notificar', True))
        falhas = []
        temporarios = set()
        pasta_temp = None

        def resumir_erro(stderr):
            linhas = [linha.strip() for linha in str(stderr or '').splitlines() if linha.strip()]
            return linhas[-1][:220] if linhas else 'sem detalhes fornecidos pela ferramenta'

        def remover_temporario(caminho):
            if not caminho:
                return
            temporarios.discard(caminho)
            try:
                if os.path.exists(caminho):
                    os.remove(caminho)
            except OSError:
                pass

        def executar_comando(comando, cwd):
            try:
                self._current_subprocess = subprocess.Popen(
                    comando,
                    cwd=cwd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                    creationflags=subprocess.CREATE_NO_WINDOW
                )
                _, stderr = self._current_subprocess.communicate()
                codigo = self._current_subprocess.returncode
                return codigo == 0, resumir_erro(stderr)
            except OSError as erro:
                return False, str(erro)[:220]
            finally:
                self._current_subprocess = None

        try:
            if not isinstance(base_dir, str) or not os.path.isdir(base_dir):
                self.atualizarProgresso(0, 'Selecione uma pasta válida.', 'error')
                self.alertaUI('A pasta selecionada não existe ou não está acessível.')
                return
            if self._eh_pasta_saida_exifrank(base_dir):
                mensagem = 'Essa é a pasta de resultados do ExifRank. Selecione a pasta original do projeto.'
                self.atualizarProgresso(0, mensagem, 'error')
                self.alertaUI(mensagem)
                return

            localizacoes, erro_localizacao = self._normalizar_localizacoes(data)
            if erro_localizacao:
                self.atualizarProgresso(0, erro_localizacao, 'error')
                self.alertaUI(erro_localizacao)
                return

            limite_gratuito, erro_licenca = self._obter_limite_processamento(data)
            if erro_licenca:
                self.atualizarProgresso(0, erro_licenca, 'error')
                self.alertaUI(erro_licenca)
                return

            if self._license_validation_mode == 'offline-premium':
                self.atualizarProgresso(2, 'Modo offline seguro ativo: licença Premium temporariamente válida neste computador.')
            elif self._license_validation_mode == 'offline-free':
                self.atualizarProgresso(2, 'Modo offline ativo: processamento local disponível dentro do limite Gratuito.')

            self.atualizarProgresso(5, 'Escaneando mídias de origem...')
            tarefas = self._iterar_midias_origem(base_dir)
            total = len(tarefas)
            if total == 0:
                mensagem = 'Nenhuma mídia nova elegível foi encontrada. A pasta de resultados do ExifRank é ignorada automaticamente.'
                self.atualizarProgresso(0, mensagem, 'completed')
                self.alertaUI(mensagem)
                return
            if limite_gratuito is not None and total > limite_gratuito:
                mensagem = f'O plano Gratuito permite processar até {limite_gratuito} mídias por vez. Esta pasta possui {total}.'
                self.atualizarProgresso(0, mensagem, 'error')
                self.alertaUI(mensagem)
                return

            mapeamento_pastas = self._normalizar_mapeamento_pastas(data, localizacoes)
            distribuir_automaticamente = self._usar_distribuicao_automatica(data, localizacoes)
            plano, output_root = self._montar_plano_organizacao(
                base_dir, tarefas, localizacoes, empresa, titulo, descricao,
                mapeamento_pastas, distribuir_automaticamente
            )
            os.makedirs(output_root, exist_ok=True)
            manifest = self._carregar_manifest_saida(output_root)
            manifest.setdefault('version', 1)
            manifest.setdefault('files', {})

            pendentes = []
            ignoradas = 0
            for item in plano:
                try:
                    assinatura = self._assinatura_origem(item['origem'])
                except OSError:
                    falhas.append(f"Não foi possível acessar {item['rel_origem']} na pasta de origem.")
                    continue

                registro_anterior = manifest['files'].get(item['rel_origem'])
                if registro_anterior:
                    caminho_anterior = os.path.join(output_root, registro_anterior.get('output', ''))
                    if (
                        registro_anterior.get('source') == assinatura
                        and registro_anterior.get('fingerprint') == item['fingerprint']
                        and os.path.isfile(caminho_anterior)
                    ):
                        ignoradas += 1
                        continue

                os.makedirs(item['pasta_destino'], exist_ok=True)
                caminho_final = os.path.join(item['pasta_destino'], item['nome_final'])
                rel_final = os.path.relpath(caminho_final, output_root)
                pode_substituir = bool(
                    registro_anterior
                    and registro_anterior.get('output') == rel_final
                )
                if os.path.exists(caminho_final) and not pode_substituir:
                    nome, ext = os.path.splitext(item['nome_final'])
                    contador = 2
                    while os.path.exists(caminho_final):
                        caminho_final = os.path.join(item['pasta_destino'], f'{nome}-{contador}{ext}')
                        contador += 1
                    rel_final = os.path.relpath(caminho_final, output_root)

                item['assinatura'] = assinatura
                item['caminho_final'] = caminho_final
                item['rel_final'] = rel_final
                item['saida_anterior'] = registro_anterior.get('output') if registro_anterior else None
                pendentes.append(item)

            if not pendentes:
                mensagem = 'Nenhuma mídia nova precisa ser processada. Os resultados anteriores foram preservados na pasta "ExifRank - Otimizadas".'
                self.atualizarProgresso(100, mensagem, 'completed')
                self.alertaUI(mensagem)
                return

            magick_exe = resource_path('magick.exe')
            if not os.path.exists(magick_exe):
                magick_exe = 'magick'
            ffmpeg_exe = resource_path('ffmpeg.exe')
            if not os.path.exists(ffmpeg_exe):
                ffmpeg_exe = 'ffmpeg'

            processadas = []
            for indice, item in enumerate(pendentes, start=1):
                if not self._aguardar_retomada_ou_cancelamento():
                    self.atualizarProgresso(0, 'Processamento cancelado. Os arquivos de origem e os resultados já concluídos foram preservados.', 'cancelled')
                    return

                progresso = 10 + (indice / max(1, len(pendentes))) * 45
                self.atualizarProgresso(progresso, f"Preparando [{indice}/{len(pendentes)}]: {item['arquivo']}...")
                extensao_origem = item['ext']
                nome_temporario = f".exifrank-stage-{uuid.uuid4().hex}{extensao_origem}"
                caminho_temporario = os.path.join(item['pasta_destino'], nome_temporario)
                temporarios.add(caminho_temporario)

                try:
                    shutil.copy2(item['origem'], caminho_temporario)
                except OSError as erro:
                    print(f"Erro ao copiar {item['rel_origem']}: {erro}")
                    falhas.append(f"Não foi possível criar uma cópia segura de {item['rel_origem']}. O original foi preservado.")
                    remover_temporario(caminho_temporario)
                    continue

                caminho_processado = caminho_temporario
                if item['tipo'] == 'converter_para_jpg':
                    base_temporaria = os.path.splitext(nome_temporario)[0]
                    resultado_jpg = os.path.join(item['pasta_destino'], f'{base_temporaria}.jpg')
                    temporarios.add(resultado_jpg)
                    if extensao_origem == '.gif':
                        comando = [
                            magick_exe, 'convert', f'{nome_temporario}[0]', '-quality', '82',
                            '-resize', '1920x1920>', os.path.basename(resultado_jpg)
                        ]
                    else:
                        comando = [
                            magick_exe, 'mogrify', '-format', 'jpg', '-quality', '82',
                            '-resize', '1920x1920>', nome_temporario
                        ]
                    ok, detalhe = executar_comando(comando, item['pasta_destino'])
                    if not ok or not os.path.isfile(resultado_jpg) or os.path.getsize(resultado_jpg) == 0:
                        print(f"Erro ao converter {item['rel_origem']}: {detalhe}")
                        falhas.append(f"Não foi possível converter {item['rel_origem']}; o original foi preservado.")
                        remover_temporario(resultado_jpg)
                        remover_temporario(caminho_temporario)
                        continue
                    remover_temporario(caminho_temporario)
                    caminho_processado = resultado_jpg

                elif item['tipo'] == 'otimizar_imagem':
                    comando = [magick_exe, 'mogrify', '-quality', '82', '-resize', '1920x1920>', nome_temporario]
                    ok, detalhe = executar_comando(comando, item['pasta_destino'])
                    if not ok:
                        print(f"Erro ao otimizar {item['rel_origem']}: {detalhe}")
                        falhas.append(f"Não foi possível otimizar {item['rel_origem']}; o original foi preservado.")
                        remover_temporario(caminho_temporario)
                        continue

                elif item['tipo'] == 'converter_video_mp4':
                    resultado_video = os.path.join(item['pasta_destino'], f'.exifrank-video-{uuid.uuid4().hex}.mp4')
                    temporarios.add(resultado_video)
                    comando = [
                        ffmpeg_exe, '-i', nome_temporario, '-map_metadata', '-1',
                        '-c:v', 'libx264', '-crf', '23', '-preset', 'medium',
                        '-c:a', 'aac', '-movflags', '+faststart', '-vf', 'scale=min(1920\\,iw):-2',
                        '-y', os.path.basename(resultado_video)
                    ]
                    ok, detalhe = executar_comando(comando, item['pasta_destino'])
                    if not ok or not os.path.isfile(resultado_video) or os.path.getsize(resultado_video) == 0:
                        print(f"Erro ao converter vídeo {item['rel_origem']}: {detalhe}")
                        falhas.append(f"Não foi possível converter {item['rel_origem']} para MP4; o original foi preservado.")
                        remover_temporario(resultado_video)
                        remover_temporario(caminho_temporario)
                        continue
                    remover_temporario(caminho_temporario)
                    caminho_processado = resultado_video

                if not self._aguardar_retomada_ou_cancelamento():
                    self.atualizarProgresso(0, 'Processamento cancelado. Os arquivos de origem e os resultados já concluídos foram preservados.', 'cancelled')
                    return

                item['caminho_processado'] = caminho_processado
                processadas.append(item)

            if not processadas:
                mensagem = 'Nenhuma mídia pôde ser preparada. Os arquivos de origem não foram alterados.'
                self.atualizarProgresso(0, mensagem, 'error')
                self.alertaUI(mensagem)
                return

            self.atualizarProgresso(60, 'Gravando metadados e malha geográfica nas cópias...')
            pasta_temp = tempfile.mkdtemp(prefix='exifrank-')
            caminho_zip = resource_path('motor_exif.zip')
            try:
                with zipfile.ZipFile(caminho_zip, 'r') as zip_ref:
                    zip_ref.extractall(pasta_temp)
            except (OSError, zipfile.BadZipFile) as erro:
                mensagem = 'O motor de metadados não está disponível. Nenhum arquivo original foi alterado.'
                print(f'Erro ao preparar motor EXIF: {erro}')
                self.atualizarProgresso(0, mensagem, 'error')
                self.alertaUI(mensagem)
                return

            exiftool_exe = os.path.join(pasta_temp, 'exiftool.exe')
            if not os.path.isfile(exiftool_exe):
                mensagem = 'O motor de metadados está incompleto. Nenhum arquivo original foi alterado.'
                self.atualizarProgresso(0, mensagem, 'error')
                self.alertaUI(mensagem)
                return

            grupos = {}
            for item in processadas:
                chave = (item['pasta_grupo'], item['bloco'], item['localizacao']['nome'])
                grupos.setdefault(chave, []).append(item)

            for indice, ((pasta_grupo, bloco, _), itens) in enumerate(grupos.items(), start=1):
                if not self._aguardar_retomada_ou_cancelamento():
                    self.atualizarProgresso(0, 'Processamento cancelado. Os arquivos de origem e os resultados já concluídos foram preservados.', 'cancelled')
                    return

                localizacao = itens[0]['localizacao']
                titulo_bloco = f"{bloco} {titulo}".strip() if bloco != 'Geral' else titulo
                descricao_bloco = f"{bloco} {descricao}".strip() if bloco != 'Geral' else descricao
                tipos = {
                    'imagem': [item for item in itens if item['tipo'] != 'converter_video_mp4'],
                    'video': [item for item in itens if item['tipo'] == 'converter_video_mp4']
                }

                for tipo, arquivos_grupo in tipos.items():
                    if not arquivos_grupo:
                        continue
                    lista_arquivos = os.path.join(pasta_temp, f'arquivos-{uuid.uuid4().hex}.txt')
                    with open(lista_arquivos, 'w', encoding='utf-8') as arquivo_lista:
                        arquivo_lista.write('\n'.join(item['caminho_processado'] for item in arquivos_grupo))

                    if tipo == 'imagem':
                        comando = [
                            exiftool_exe, '-overwrite_original', '-m', '-charset', 'filename=utf8', '-L',
                            f'-Artist={empresa}', f'-Title={titulo_bloco}', f'-Subject={descricao_bloco}',
                            f'-Description={descricao_bloco}', f'-XPKeywords={descricao_bloco}', f'-Caption-Abstract={descricao_bloco}',
                            f'-GPSLatitude={abs(localizacao["lat"])}', f'-GPSLatitudeRef={"N" if localizacao["lat"] >= 0 else "S"}',
                            f'-GPSLongitude={abs(localizacao["lon"])}', f'-GPSLongitudeRef={"E" if localizacao["lon"] >= 0 else "W"}',
                            '-@', lista_arquivos
                        ]
                    else:
                        comando = [
                            exiftool_exe, '-overwrite_original', '-m', '-charset', 'filename=utf8', '-L',
                            f'-QuickTime:Title={titulo_bloco}', f'-QuickTime:Description={descricao_bloco}',
                            f'-QuickTime:Artist={empresa}', f'-Keys:GPSCoordinates={localizacao["lat"]}, {localizacao["lon"]}',
                            '-@', lista_arquivos
                        ]

                    ok, detalhe = executar_comando(comando, pasta_grupo)
                    try:
                        os.remove(lista_arquivos)
                    except OSError:
                        pass
                    if not ok:
                        for item in arquivos_grupo:
                            item['metadados_com_falha'] = True
                        print(f"Erro ao gravar metadados de {localizacao['nome']}: {detalhe}")
                        falhas.append(f"Não foi possível gravar os metadados de {localizacao['nome']}; as cópias temporárias foram descartadas.")

            self.atualizarProgresso(82, 'Finalizando arquivos otimizados...')
            concluidas = 0
            for indice, item in enumerate(processadas, start=1):
                if not self._aguardar_retomada_ou_cancelamento():
                    self.atualizarProgresso(0, 'Processamento cancelado. Os arquivos de origem e os resultados já concluídos foram preservados.', 'cancelled')
                    return
                if item.get('metadados_com_falha'):
                    continue
                try:
                    os.replace(item['caminho_processado'], item['caminho_final'])
                    temporarios.discard(item['caminho_processado'])
                    # Quando os dados foram revisados, substituímos o resultado anterior
                    # somente após a nova cópia ficar pronta. A origem nunca é removida.
                    if item.get('saida_anterior') and item['saida_anterior'] != item['rel_final']:
                        caminho_anterior = os.path.abspath(os.path.join(output_root, item['saida_anterior']))
                        raiz_saida = os.path.abspath(output_root)
                        try:
                            dentro_da_saida = os.path.commonpath([caminho_anterior, raiz_saida]) == raiz_saida
                        except ValueError:
                            dentro_da_saida = False
                        if dentro_da_saida and os.path.isfile(caminho_anterior):
                            try:
                                os.remove(caminho_anterior)
                            except OSError as erro:
                                print(f'Não foi possível remover resultado substituído {caminho_anterior}: {erro}')
                    manifest['files'][item['rel_origem']] = {
                        'source': item['assinatura'],
                        'fingerprint': item['fingerprint'],
                        'output': item['rel_final'],
                        'updatedAt': datetime.now().isoformat(timespec='seconds')
                    }
                    # Cada resultado concluído entra imediatamente no manifesto.
                    # Assim, um cancelamento não faz uma mídia pronta ser duplicada na próxima execução.
                    self._salvar_manifest_saida(output_root, manifest)
                    concluidas += 1
                except OSError as erro:
                    print(f"Erro ao finalizar {item['rel_origem']}: {erro}")
                    falhas.append(f"Não foi possível finalizar {item['rel_origem']}. O original foi preservado.")
                progresso = 82 + (indice / max(1, len(processadas))) * 18
                self.atualizarProgresso(progresso, f'Finalizando {indice} de {len(processadas)} arquivos...')

            if concluidas == 0:
                mensagem = 'A otimização não pôde ser finalizada. Os arquivos de origem foram preservados.'
                self.atualizarProgresso(0, mensagem, 'error')
                self.alertaUI(mensagem)
                return

            resumo_saida = f'{concluidas} mídia(s) salva(s) em "{self.OUTPUT_FOLDER_NAME}".'
            if ignoradas:
                resumo_saida += f' {ignoradas} mídia(s) já estavam atualizadas e foram preservadas.'
            if falhas:
                detalhes = '\n'.join(falhas[:4])
                self.atualizarProgresso(100, f'Concluído com {len(falhas)} aviso(s).', 'completed')
                self.alertaUI(f'{resumo_saida}\n\nAlguns itens precisam de atenção:\n{detalhes}')
            else:
                self.atualizarProgresso(100, '100% concluído!', 'completed')
                self.alertaUI(f'Tudo pronto! {resumo_saida} Os arquivos originais foram preservados.')

            executar_js_seguro(f'if(typeof registerOptimizationSuccess === "function") registerOptimizationSuccess({int(concluidas)});')
            if notificar:
                mostrar_notificacao_windows('ExifRank', 'Otimização concluída. Os arquivos originais foram preservados.')

        except Exception as erro:
            print(f'Erro no processamento de mídia: {erro}')
            mensagem = 'Não foi possível concluir a otimização. Os arquivos originais foram preservados.'
            self.atualizarProgresso(0, mensagem, 'error')
            self.alertaUI(mensagem)
        finally:
            self._current_subprocess = None
            self._is_processing = False
            self._pause_event.set()
            for caminho_temporario in list(temporarios):
                remover_temporario(caminho_temporario)
            if pasta_temp:
                try:
                    shutil.rmtree(pasta_temp)
                except OSError:
                    pass

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
        if self._eh_pasta_saida_exifrank(pasta):
            return {"erro": "Essa é a pasta de resultados do ExifRank. Selecione a pasta original do projeto."}
        
        extensoes = {
            'jpg': 0, 'jpeg': 0, 'png': 0, 'gif': 0, 'webp': 0, 'bmp': 0, 'tiff': 0, 'tif': 0,
            'heic': 0, 'cr2': 0,
            'mp4': 0, 'mov': 0, 'm4v': 0, 'avi': 0, 'mkv': 0, 'webm': 0
        }
        
        total = 0
        bytes_imagens = 0
        bytes_videos = 0
        bytes_outros = 0
        extensoes_imagem = {'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff', 'tif', 'heic', 'cr2'}
        extensoes_video = {'mp4', 'mov', 'm4v', 'avi', 'mkv', 'webm'}
        for root, dirs, files in os.walk(pasta):
            # A pasta de saída nunca pode contaminar as contagens da pasta de origem.
            dirs[:] = [
                diretorio for diretorio in dirs
                if diretorio != self.OUTPUT_FOLDER_NAME
                and diretorio != '.motor_exif_temp'
                and not diretorio.startswith('.exifrank-stage-')
            ]
            for f in files:
                ext = os.path.splitext(f)[1].lower().lstrip('.')
                if ext in extensoes:
                    extensoes[ext] += 1
                    total += 1
                    try:
                        tamanho_arquivo = os.path.getsize(os.path.join(root, f))
                    except OSError:
                        tamanho_arquivo = 0

                    if ext in extensoes_imagem:
                        bytes_imagens += tamanho_arquivo
                    elif ext in extensoes_video:
                        bytes_videos += tamanho_arquivo
                    else:
                        bytes_outros += tamanho_arquivo

        # A estimativa considera o tipo e o tamanho das mídias: vídeos e formatos
        # que precisam de conversão pesam mais que JPEGs já prontos para EXIF.
        total_bytes = bytes_imagens + bytes_videos + bytes_outros
        if total:
            estimativa = (
                (extensoes['jpg'] + extensoes['jpeg']) * 0.35
                + extensoes['png'] * 0.60
                + (extensoes['gif'] + extensoes['webp'] + extensoes['bmp'] + extensoes['tiff'] + extensoes['tif'] + extensoes['heic'] + extensoes['cr2']) * 1.20
                + (extensoes['mp4'] + extensoes['mov'] + extensoes['m4v'] + extensoes['avi'] + extensoes['mkv'] + extensoes['webm']) * 4.00
                + (bytes_imagens + bytes_outros) / (1024 * 1024) * 0.04
                + bytes_videos / (1024 * 1024) * 0.10
            )
            estimated_seconds = max(5, int(estimativa + 0.999))
        else:
            estimated_seconds = 0

        return {
            "total": total,
            "jpg": extensoes['jpg'] + extensoes['jpeg'],
            "png": extensoes['png'],
            "images": sum(extensoes[ext] for ext in extensoes_imagem),
            "video": extensoes['mp4'] + extensoes['mov'] + extensoes['m4v'] + extensoes['avi'] + extensoes['mkv'] + extensoes['webm'],
            "outros": extensoes['gif'] + extensoes['webp'] + extensoes['bmp'] + extensoes['tiff'] + extensoes['tif'] + extensoes['heic'] + extensoes['cr2'],
            "total_bytes": total_bytes,
            "estimated_seconds": estimated_seconds
        }

    def api_gerar_insights_pdf(self, payload):
        try:
            empresa = payload.get("empresa", "")
            numFotos = payload.get("numFotos", 0)
            gps_ok = payload.get("gps_ok", False)
            keyCount = payload.get("keyCount", 0)
            
            str_gps = "Sim" if gps_ok else "Não"
            prompt = f"""Atue como um Especialista em SEO Local Sênior.
Escreva um insight analítico sobre a organização dos ativos visuais de um Perfil da Empresa no Google. O texto será inserido em um relatório PDF para o cliente.

Dados do Projeto:
Empresa: {empresa}
Mídias na pasta: {numFotos}
Tags Injetadas (Quantidade): {keyCount}
Coordenadas GPS: {str_gps}

Formato da Resposta: Apenas 1 parágrafo corporativo, claro e encorajador, com no máximo 5-6 linhas.
Explique que metadados consistentes, coordenadas e termos relevantes ajudam a organizar o acervo visual e contextualizar as imagens dentro da estratégia de presença local. Não afirme que as mídias foram processadas ou otimizadas, nem prometa posicionamento, aprovação, tráfego ou resultados no Google. Não use saudações; entregue apenas o parágrafo direto."""

            insight = chamar_gemini_api(prompt, model="gemini-3.5-flash")
            return {"ok": True, "insight": insight}
        except Exception as e:
            return {"ok": False, "erro": str(e)}



import threading
import http.server
import socketserver

_web_dir = None
_server_ready = threading.Event()
_server_error = None

class CustomHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=_web_dir, **kwargs)
        
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()
    
    def do_POST(self):
        if self.path != '/set_auth_token':
            self.send_response(404)
            self.end_headers()
            return

        # Somente a página de autenticação servida pelo próprio ExifRank pode
        # transferir a sessão. Não expomos este endpoint para qualquer site.
        if self.headers.get('Origin') != 'http://127.0.0.1:45321':
            self.send_response(403)
            self.end_headers()
            return

        if not self.headers.get('Content-Type', '').lower().startswith('application/json'):
            self.send_response(415)
            self.end_headers()
            return

        try:
            content_length = int(self.headers.get('Content-Length', '0'))
        except ValueError:
            content_length = 0
        if content_length <= 0:
            self.send_response(400)
            self.end_headers()
            return
        if content_length > 262144:
            self.send_response(413)
            self.end_headers()
            return

        try:
            body = self.rfile.read(content_length).decode('utf-8')
            payload = json.loads(body)
        except (UnicodeDecodeError, json.JSONDecodeError):
            self.send_response(400)
            self.end_headers()
            return

        # O navegador externo só transfere um custom token já validado pela
        # Cloud Function, vinculado ao estado da tentativa, ou um código de
        # erro para liberar a interface. Não aceitamos objetos arbitrários nem
        # sessões Firebase serializadas.
        state = payload.get('state') if isinstance(payload, dict) else None
        custom_token = payload.get('customToken') if isinstance(payload, dict) else None
        error_code = payload.get('errorCode') if isinstance(payload, dict) else None
        state_ok = isinstance(state, str) and re.fullmatch(r'[0-9a-f]{64}', state) is not None
        token_ok = isinstance(custom_token, str) and 20 <= len(custom_token) <= 4096
        error_ok = isinstance(error_code, str) and 1 <= len(error_code) <= 160
        if not state_ok or (not token_ok and not error_ok):
            self.send_response(400)
            self.end_headers()
            return

        # json.dumps cria um literal JavaScript seguro, sem concatenar
        # conteúdo recebido à expressão executada na WebView.
        if not executar_js_seguro(f"completeExternalLogin({json.dumps(body)})"):
            self.send_response(503)
            self.end_headers()
            return
        self.send_response(200)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.end_headers()
        self.wfile.write(b'{"ok":true}')
    
    def do_OPTIONS(self):
        # A autenticação é same-origin; requisições CORS não são aceitas.
        self.send_response(404)
        self.end_headers()
    
    def log_message(self, format, *args):
        pass  # Silencia logs do servidor no console

def start_local_server():
    global _web_dir, _server_error
    _web_dir = resource_path('web')
    # Permitir reuso da porta
    http.server.ThreadingHTTPServer.allow_reuse_address = True
    try:
        httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 45321), CustomHandler)
        _server_ready.set()
        httpd.serve_forever()
    except Exception as e:
        _server_error = e
        _server_ready.set()
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
    _server_ready.wait(timeout=5)
    if _server_error or not _server_ready.is_set():
        detalhe = str(_server_error) if _server_error else "tempo de inicialização excedido"
        ctypes.windll.user32.MessageBoxW(
            0,
            f"Não foi possível iniciar o servidor local na porta 45321.\n\n{detalhe}\n\nFeche outro ExifRank ou o processo que estiver usando essa porta e tente novamente.",
            "ExifRank - Inicialização falhou",
            0x10
        )
        sys.exit(1)
    
    window = webview.create_window(
        'ExifRank',
        url='http://localhost:45321/app.html?v=2',
        js_api=api,
        width=1280,
        height=800,
        min_size=(1100, 700)
    )

    def ao_fechar_janela(*_):
        """Interrompe atualizações de UI e libera um processamento em andamento."""
        _app_encerrando.set()
        try:
            api.api_cancelar_processamento()
        except Exception:
            pass

    try:
        window.events.closing += ao_fechar_janela
    except Exception:
        # Compatibilidade com versões antigas do pywebview. As chamadas de
        # JavaScript ainda estão protegidas por executar_js_seguro.
        pass
    
    webview.start(debug=False, private_mode=False)
