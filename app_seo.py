import customtkinter as ctk
import subprocess
import os
import re
import sys
import zipfile
import tempfile
import shutil
import threading
import google.generativeai as genai
from dotenv import load_dotenv
from tkinter import messagebox
from geopy.geocoders import Nominatim

def resource_path(relative_path):
    """ Retorna o caminho absoluto para o recurso, para o executável ou dev """
    try:
        base_path = sys._MEIPASS
    except Exception:
        base_path = os.path.abspath(".")
    return os.path.join(base_path, relative_path)

# Força o modo Claro e um tema base
ctk.set_appearance_mode("light") 
ctk.set_default_color_theme("blue")

class App(ctk.CTk):
    def __init__(self):
        super().__init__()
        self.title("GeoRanker")
        self.geometry("1000x720") # Altura reduzida para não esconder na barra de tarefas
        self.configure(fg_color="#F1F5F9") # Fundo principal cinza claro para contrastar com os cards brancos
        
        try:
            # Puxa o ícone embutido pelo PyInstaller
            self.iconbitmap(resource_path("icone.ico"))
        except:
            pass 

        # --- SISTEMA DE GRID (DUAS COLUNAS) ---
        self.grid_columnconfigure(1, weight=1)
        self.grid_rowconfigure(0, weight=1)

        # ==========================================
        # BARRA LATERAL (SIDEBAR MENU) - PREMIUM LIGHT
        # ==========================================
        self.sidebar_frame = ctk.CTkFrame(self, width=250, corner_radius=0, fg_color="#FFFFFF", border_width=1, border_color="#E2E8F0")
        self.sidebar_frame.grid(row=0, column=0, sticky="nsew")
        self.sidebar_frame.grid_rowconfigure(4, weight=1)

        self.logo_label = ctk.CTkLabel(self.sidebar_frame, text="GeoRanker\nStudio", font=("Segoe UI", 26, "bold"), text_color="#0F172A", justify="left")
        self.logo_label.grid(row=0, column=0, padx=25, pady=(40, 30), sticky="w")

        # Botão ativo simulando estilo premium moderno
        self.nav_frame = ctk.CTkFrame(self.sidebar_frame, fg_color="#EFF6FF", corner_radius=8)
        self.nav_frame.grid(row=1, column=0, padx=15, pady=5, sticky="ew")
        self.nav1 = ctk.CTkLabel(self.nav_frame, text="  Tela Inicial", font=("Segoe UI", 13, "bold"), text_color="#1D4ED8", anchor="w")
        self.nav1.pack(fill="x", padx=15, pady=12)

        self.footer = ctk.CTkLabel(self.sidebar_frame, text="Versão Final\nCriado por Leonardo Presses.", font=("Segoe UI", 11), text_color="#64748B", justify="left")
        self.footer.grid(row=5, column=0, padx=25, pady=25, sticky="sw")


        # ==========================================
        # ÁREA PRINCIPAL (MAIN CONTENT)
        # ==========================================
        self.main_view = ctk.CTkScrollableFrame(self, corner_radius=0, fg_color="transparent")
        self.main_view.grid(row=0, column=1, sticky="nsew", padx=20, pady=0)

        # Cabeçalho Principal
        self.header_frame = ctk.CTkFrame(self.main_view, fg_color="transparent")
        self.header_frame.pack(fill="x", pady=(30, 20), padx=10)
        
        self.badge = ctk.CTkLabel(self.header_frame, text="  IA GENERATIVA  ", font=("Segoe UI", 10, "bold"), text_color="#4F46E5", fg_color="#E0E7FF", corner_radius=10)
        self.badge.pack(anchor="w", pady=(0, 5))
        
        self.titulo_pagina = ctk.CTkLabel(self.header_frame, text="Otimização Inteligente", font=("Segoe UI", 26, "bold"), text_color="#0F172A")
        self.titulo_pagina.pack(anchor="w")


        # --- CARD 1: IDENTIFICAÇÃO E METADADOS ---
        self.card1 = ctk.CTkFrame(self.main_view, fg_color="#FFFFFF", corner_radius=16, border_width=1, border_color="#E2E8F0")
        self.card1.pack(fill="x", pady=10, padx=10)
        
        ctk.CTkLabel(self.card1, text="IDENTIFICAÇÃO DA EMPRESA", font=("Segoe UI", 11, "bold"), text_color="#64748B").pack(anchor="w", padx=25, pady=(25, 10))
        
        self.frame_identidade = ctk.CTkFrame(self.card1, fg_color="transparent")
        self.frame_identidade.pack(fill="x", padx=20, pady=(0, 15))

        self.empresa = ctk.CTkEntry(self.frame_identidade, placeholder_text="Nome da Empresa (Autor)", height=45, fg_color="#F8FAFC", border_color="#E2E8F0", text_color="#0F172A", font=("Segoe UI", 13), corner_radius=8)
        self.empresa.pack(side="left", fill="x", expand=True, padx=(5, 10))

        self.telefone = ctk.CTkEntry(self.frame_identidade, placeholder_text="Telefone / WhatsApp", height=45, fg_color="#F8FAFC", border_color="#E2E8F0", text_color="#0F172A", font=("Segoe UI", 13), corner_radius=8)
        self.telefone.pack(side="right", fill="x", expand=True, padx=(0, 5))

        ctk.CTkLabel(self.card1, text="METADADOS ESTRATÉGICOS (IA)", font=("Segoe UI", 11, "bold"), text_color="#64748B").pack(anchor="w", padx=25, pady=(5, 10))
        
        self.titulo = ctk.CTkTextbox(self.card1, height=80, fg_color="#F8FAFC", border_color="#E2E8F0", border_width=1, text_color="#0F172A", font=("Segoe UI", 13), corner_radius=8)
        self.placeholder_titulo = "Digite seu NICHO aqui para a IA trabalhar, ou cole o Título (Palavras-chave)..."
        self.titulo.insert("0.0", self.placeholder_titulo)
        self.titulo.bind("<FocusIn>", self.limpar_titulo)
        self.titulo.bind("<FocusOut>", self.restaurar_titulo)
        self.titulo.pack(fill="x", padx=25, pady=(0, 15))

        self.btn_ia = ctk.CTkButton(self.card1, text="✨ Gerar Textos e Metadados com IA", command=self.gerar_com_ia, fg_color="#6366F1", hover_color="#4F46E5", font=("Segoe UI", 13, "bold"), height=40, corner_radius=8)
        self.btn_ia.pack(anchor="e", padx=25, pady=(0, 15))

        self.desc = ctk.CTkTextbox(self.card1, height=100, fg_color="#F8FAFC", border_color="#E2E8F0", border_width=1, text_color="#0F172A", font=("Segoe UI", 13), corner_radius=8)
        self.placeholder_desc = "Cole aqui a Descrição (SEO)..."
        self.desc.insert("0.0", self.placeholder_desc)
        self.desc.bind("<FocusIn>", self.limpar_desc)
        self.desc.bind("<FocusOut>", self.restaurar_desc)
        self.desc.pack(fill="x", padx=25, pady=(0, 25))


        # --- CARD 2: GEOLOCALIZAÇÃO ---
        self.card2 = ctk.CTkFrame(self.main_view, fg_color="#FFFFFF", corner_radius=16, border_width=1, border_color="#E2E8F0")
        self.card2.pack(fill="x", pady=10, padx=10)

        ctk.CTkLabel(self.card2, text="GEOLOCALIZAÇÃO PRECISA", font=("Segoe UI", 11, "bold"), text_color="#64748B").pack(anchor="w", padx=25, pady=(25, 10))
        
        self.frame_busca = ctk.CTkFrame(self.card2, fg_color="transparent")
        self.frame_busca.pack(fill="x", padx=20, pady=(0, 15))
        
        self.endereco = ctk.CTkEntry(self.frame_busca, placeholder_text="Digite o Endereço (Ex: Rua X, Cidade, Estado)...", height=45, fg_color="#F8FAFC", border_color="#E2E8F0", text_color="#0F172A", font=("Segoe UI", 13), corner_radius=8)
        self.endereco.pack(side="left", fill="x", expand=True, padx=(5, 10))
        
        self.btn_buscar_gps = ctk.CTkButton(self.frame_busca, text="Autodetectar", width=130, height=45, command=self.buscar_gps, fg_color="#10B981", hover_color="#059669", corner_radius=8, font=("Segoe UI", 13, "bold"))
        self.btn_buscar_gps.pack(side="right", padx=(0, 5))

        self.frame_coords = ctk.CTkFrame(self.card2, fg_color="transparent")
        self.frame_coords.pack(fill="x", padx=20, pady=(0, 25))
        self.lat = ctk.CTkEntry(self.frame_coords, placeholder_text="Latitude", height=45, fg_color="#F8FAFC", border_color="#E2E8F0", text_color="#0F172A", font=("Segoe UI", 13), corner_radius=8)
        self.lat.pack(side="left", fill="x", expand=True, padx=(5, 10))
        self.lon = ctk.CTkEntry(self.frame_coords, placeholder_text="Longitude", height=45, fg_color="#F8FAFC", border_color="#E2E8F0", text_color="#0F172A", font=("Segoe UI", 13), corner_radius=8)
        self.lon.pack(side="right", fill="x", expand=True, padx=(0, 5))


        # --- CARD 3: AÇÕES E PROCESSAMENTO ---
        self.card3 = ctk.CTkFrame(self.main_view, fg_color="transparent")
        self.card3.pack(fill="x", pady=(15, 30), padx=10)

        self.comprimir_var = ctk.BooleanVar(value=True) 
        self.check_comprimir = ctk.CTkCheckBox(self.card3, text="Otimizar peso e resolução para Web (Carregamento rápido)", variable=self.comprimir_var, text_color="#475569", font=("Segoe UI", 13), fg_color="#3B82F6", border_color="#CBD5E1")
        self.check_comprimir.pack(anchor="w", pady=(0, 20), padx=5)

        self.btn_conv = ctk.CTkButton(self.card3, text="1. CONVERTER E OTIMIZAR MÍDIAS", command=self.rodar_conversao, fg_color="#0F172A", hover_color="#1E293B", corner_radius=12, height=55, font=("Segoe UI", 14, "bold"))
        self.btn_conv.pack(fill="x", pady=(0, 12))

        self.btn_seo = ctk.CTkButton(self.card3, text="2. APLICAR SEO GLOBAL E RENOMEAR", command=self.rodar_seo, fg_color="#3B82F6", hover_color="#2563EB", corner_radius=12, height=55, font=("Segoe UI", 14, "bold"))
        self.btn_seo.pack(fill="x")


    # ==========================================
    # FUNÇÕES LÓGICAS DA INTERFACE E IA
    # ==========================================
    
    def gerar_com_ia(self):
        # 1. Carrega as variáveis do arquivo .env EMBUTIDO usando o resource_path
        env_path = resource_path(".env")
        load_dotenv(dotenv_path=env_path)
        
        chave_api = os.getenv("GEMINI_API_KEY")

        # Verifica se conseguiu ler a chave do arquivo embutido
        if not chave_api or chave_api.strip() == "" or chave_api == "cole_sua_chave_aqui":
            messagebox.showwarning(
                "Erro na API Key", 
                "A chave da API não foi encontrada ou está inválida dentro do executável.\n"
                "Certifique-se de que o arquivo .env contendo sua chave real foi compilado corretamente junto com o programa."
            )
            return

        nicho = self.titulo.get("1.0", "end-1c").strip()
        if not nicho or nicho == self.placeholder_titulo:
            messagebox.showwarning("Aviso", "Por favor, digite o seu nicho ou assunto principal no campo 'Título' para a IA saber sobre o que escrever.")
            return

        empresa = self.empresa.get().strip()
        telefone = self.telefone.get().strip()

        # Muda o botão para mostrar que está carregando
        self.btn_ia.configure(text="⏳ Gerando (Aguarde)...", state="disabled")
        self.update()

        # Roda a chamada da API em Threading para não congelar o programa
        def thread_ia():
            try:
                genai.configure(api_key=chave_api.strip())
                model = genai.GenerativeModel("gemini-2.5-flash")

                prompt = f"""
                Você é um especialista em SEO. Aqui estão os dados do meu projeto:
                Empresa/Autor: {empresa if empresa else 'Não informado'}
                Telefone de Contato: {telefone if telefone else 'Não informado'}
                Nicho de Mercado / Base: {nicho}

                INSTRUÇÕES ESTritas:
                Agora vamos para a parte dos metadados, preciso que gere pra mim os blocos mais densos possiveis de metadados, para serem inseridos nas fotos no Geotag que criamos, palavras chaves Exif. Preciso que você utilize todos os principais termos de buscas e palavras chave possiveis para esse nicho, para te ajudar utilize o site answerthepublic.com para colher os termos de buscas atuais. me entregue o seu melhor, preciso de um conteudo top. Eu preciso apenas de 1 bloco geral que englobe todos os serviços, irei utilizar esses bloco em todas as fotos, me gere apenas esse bloco, mais muito denso, com todos os conteudos possiveis dentro dele. tenha certeza que cada bloco tenha no minimo 12 linhas ou mais e deixe a descrição exif com no máximo 6 linhas, não se esqueça de separar por virgula, sem enter.
                Incorpore o nome da Empresa e o Telefone de Contato dentro dessa descrição de no máximo 6 linhas, de forma natural e altamente persuasiva para clientes.

                REGRAS DE FORMATAÇÃO DA RESPOSTA:
                Eu preciso extrair isso via sistema, então retorne a sua resposta EXATAMENTE no seguinte formato, sem textos adicionais antes ou depois:

                PALAVRAS-CHAVE:
                [coloque aqui o bloco denso de palavras-chave separadas por virgula]

                DESCRIÇÃO:
                [coloque aqui a descrição exif formatada]
                """

                resposta = model.generate_content(prompt)
                texto = resposta.text

                if "DESCRIÇÃO:" in texto:
                    partes = texto.split("DESCRIÇÃO:")
                    kw_parte = partes[0].replace("PALAVRAS-CHAVE:", "").strip()
                    desc_parte = partes[1].strip()
                else:
                    kw_parte = texto
                    desc_parte = f"Contato: {empresa} - {telefone}" 

                # Manda os dados de volta para a tela (executado na thread principal)
                self.after(0, self.atualizar_campos_ia, kw_parte, desc_parte)

            except Exception as e:
                self.after(0, self.erro_ia, str(e))

        threading.Thread(target=thread_ia, daemon=True).start()

    def atualizar_campos_ia(self, palavras, descricao):
        self.titulo.delete("1.0", "end")
        self.titulo.insert("0.0", palavras)
        self.desc.delete("1.0", "end")
        self.desc.insert("0.0", descricao)
        self.btn_ia.configure(text="✨ Gerar Textos e Metadados com IA", state="normal")
        messagebox.showinfo("Gemini Concluído", "Conteúdo SEO ultra-denso gerado e aplicado com sucesso aos campos!")

    def erro_ia(self, erro):
        self.btn_ia.configure(text="✨ Gerar Textos e Metadados com IA", state="normal")
        messagebox.showerror("Erro na IA", f"Não foi possível gerar com o Gemini. Verifique sua conexão ou se a API Key no .env é válida.\nDetalhes: {erro}")

    def buscar_gps(self):
        endereco_texto = self.endereco.get()
        if not endereco_texto:
            messagebox.showwarning("Atenção", "Por favor, digite um endereço para buscar.")
            return
        
        self.btn_buscar_gps.configure(state="disabled", text="⏳ Buscando...")
        self.update()
        
        def thread_gps():
            try:
                # Mudamos do Nominatim (OpenStreetMap) para o ArcGIS (Esri)
                # O ArcGIS é muito mais inteligente para entender endereços incompletos
                # ou nomes de locais, de forma muito parecida com o Google Maps, e não exige API Key!
                from geopy.geocoders import ArcGIS
                geolocator = ArcGIS()
                location = geolocator.geocode(endereco_texto)
                
                if location:
                    def atualizar_ui():
                        self.lat.delete(0, "end")
                        self.lon.delete(0, "end")
                        self.lat.insert(0, str(location.latitude))
                        self.lon.insert(0, str(location.longitude))
                        messagebox.showinfo("Motor GPS", f"GPS Encontrado!\n{location.address}")
                    self.after(0, atualizar_ui)
                else:
                    self.after(0, lambda: messagebox.showerror("Erro", "Endereço não encontrado. Tente ser mais específico."))
            except Exception as e:
                self.after(0, lambda: messagebox.showerror("Erro de Conexão", f"Falha ao conectar no servidor de GPS: {e}"))
            finally:
                self.after(0, lambda: self.btn_buscar_gps.configure(state="normal", text="Autodetectar"))

        threading.Thread(target=thread_gps, daemon=True).start()

    def limpar_titulo(self, event):
        if self.titulo.get("1.0", "end-1c") == self.placeholder_titulo:
            self.titulo.delete("1.0", "end")

    def restaurar_titulo(self, event):
        if self.titulo.get("1.0", "end-1c").strip() == "":
            self.titulo.insert("0.0", self.placeholder_titulo)

    def limpar_desc(self, event):
        if self.desc.get("1.0", "end-1c") == self.placeholder_desc:
            self.desc.delete("1.0", "end")

    def restaurar_desc(self, event):
        if self.desc.get("1.0", "end-1c").strip() == "":
            self.desc.insert("0.0", self.placeholder_desc)

    # ==========================================
    # FUNÇÕES BASE DO SISTEMA (CONVERSÃO E EXIF)
    # ==========================================
    def rodar_conversao(self):
        self.btn_conv.configure(state="disabled", text="⏳ Convertendo... (Aguarde)")
        self.update()

        def thread_conv():
            base_dir = os.getcwd() 
            magick_exe = resource_path("magick.exe") 
            
            if not os.path.exists(magick_exe):
                magick_exe = "magick" 
            
            try:
                for root, dirs, files in os.walk(base_dir):
                    arquivos_para_deletar = []
                    
                    for ext in ['.heic', '.png', '.jpeg']:
                        files_to_convert = [f for f in files if f.lower().endswith(ext)]
                        if files_to_convert:
                            cmd_magick = f'"{magick_exe}" mogrify -format jpg -background white -alpha remove'
                            if self.comprimir_var.get():
                                cmd_magick += ' -quality 80 -resize "1920x1920>"'
                            
                            # Executa apenas para a extensão existente, e no diretório root diretamente (evita os.chdir)
                            subprocess.run(f'{cmd_magick} "*{ext}"', shell=True, cwd=root, creationflags=subprocess.CREATE_NO_WINDOW)
                            
                            for f in files_to_convert:
                                arquivos_para_deletar.append(os.path.join(root, f))
                    
                    # Deleção segura usando os.remove em vez de del do Windows
                    for arq in arquivos_para_deletar:
                        try:
                            os.remove(arq)
                        except:
                            pass
                            
                self.after(0, lambda: messagebox.showinfo("GeoRanker", "Conversão Concluída!\nVarredura feita e imagens otimizadas com sucesso."))
            except Exception as e:
                self.after(0, lambda: messagebox.showerror("Erro na Conversão", f"Falha no processamento: {e}"))
            finally:
                self.after(0, lambda: self.btn_conv.configure(state="normal", text="1. CONVERTER E OTIMIZAR MÍDIAS"))

        threading.Thread(target=thread_conv, daemon=True).start()

    def rodar_seo(self):
        empresa_val = self.empresa.get()
        titulo_val = self.titulo.get("1.0", "end-1c").strip()
        desc_val = self.desc.get("1.0", "end-1c").strip()
        lat_val = self.lat.get().strip()
        lon_val = self.lon.get().strip()

        if titulo_val == self.placeholder_titulo:
            titulo_val = ""
        if desc_val == self.placeholder_desc:
            desc_val = ""

        self.btn_seo.configure(state="disabled", text="⏳ Aplicando SEO... (Aguarde)")
        self.update()

        def thread_seo():
            pasta_temp = tempfile.mkdtemp()
            try:
                caminho_zip = resource_path("motor_exif.zip")
                with zipfile.ZipFile(caminho_zip, 'r') as zip_ref:
                    zip_ref.extractall(pasta_temp)
                
                exiftool_exe = os.path.join(pasta_temp, "exiftool.exe")
                base_dir = os.getcwd()

                cmd = [
                    exiftool_exe, 
                    "-overwrite_original", 
                    "-L", 
                    "-ext", "jpg", "-ext", "jpeg", 
                    "-r",
                    f"-Artist={empresa_val}",
                    f"-Title={titulo_val}",
                    f"-Subject={desc_val}",
                    f"-Description={desc_val}",
                    f"-XPKeywords={desc_val}",
                    f"-Caption-Abstract={desc_val}",
                    f"-GPSLatitude={lat_val}", f"-GPSLatitudeRef={lat_val}",
                    f"-GPSLongitude={lon_val}", f"-GPSLongitudeRef={lon_val}",
                    base_dir 
                ]
                
                resultado = subprocess.run(
                    cmd, 
                    capture_output=True, 
                    text=True, 
                    creationflags=subprocess.CREATE_NO_WINDOW,
                    cwd=pasta_temp
                )

                if resultado.returncode != 0:
                    self.after(0, lambda: messagebox.showerror("Erro no Exiftool", f"O Exiftool falhou ao processar:\n{resultado.stderr}"))
                    return

                # Renomeação Segura
                titulo_curto = titulo_val[:40]
                texto_base = f"{empresa_val} {titulo_curto}".strip()
                
                if not texto_base:
                    texto_base = "midia-otimizada"
                
                texto_limpo = re.sub(r'[^a-zA-Z0-9\s-]', '', texto_base)
                texto_limpo = re.sub(r'\s+', '-', texto_limpo).lower()
                
                if len(texto_limpo) > 60:
                    texto_limpo = texto_limpo[:60].strip('-')
                
                contador = 1
                for root, dirs, files in os.walk(base_dir):
                    files.sort() 
                    for f in files:
                        ext = os.path.splitext(f)[1].lower()
                        if ext in ['.jpg', '.jpeg', '.mp4', '.mov', '.avi', '.mkv', '.webm']:
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
                                except:
                                    pass
                            else:
                                contador += 1
                
                self.after(0, lambda: messagebox.showinfo("GeoRanker", "SEO e renomeação estratégica aplicados com sucesso!"))
                
            except Exception as e:
                self.after(0, lambda: messagebox.showerror("Erro Fatal", f"Ocorreu um erro inesperado: {e}"))
            finally:
                try:
                    shutil.rmtree(pasta_temp)
                except:
                    pass
                self.after(0, lambda: self.btn_seo.configure(state="normal", text="2. APLICAR SEO GLOBAL E RENOMEAR"))
                
        threading.Thread(target=thread_seo, daemon=True).start()

if __name__ == "__main__":
    app = App()
    app.mainloop()