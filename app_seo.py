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
from tkinter import messagebox, filedialog
from geopy.geocoders import Nominatim
import unicodedata

def resource_path(relative_path):
    """ Retorna o caminho absoluto para o recurso, para o executável ou dev """
    try:
        base_path = sys._MEIPASS
    except Exception:
        base_path = os.path.abspath(".")
    return os.path.join(base_path, relative_path)

# Força o modo de cores do sistema inicialmente (Light/Dark dinâmico)
ctk.set_appearance_mode("system") 
ctk.set_default_color_theme("blue")

class App(ctk.CTk):
    def __init__(self):
        super().__init__()
        self.title("GeoRanker")
        self.geometry("1000x750") # Altura ligeiramente maior para o switch de tema
        self.configure(fg_color=("#F1F5F9", "#0F172A")) # Slate 100 no modo claro, Slate 900 no escuro
        self.diretorio_selecionado = ""
        
        try:
            # Puxa o ícone embutido pelo PyInstaller
            self.iconbitmap(resource_path("icone.ico"))
        except:
            pass 

        # --- SISTEMA DE GRID (DUAS COLUNAS) ---
        self.grid_columnconfigure(1, weight=1)
        self.grid_rowconfigure(0, weight=1)

        # ==========================================
        # BARRA LATERAL (SIDEBAR MENU) - PREMIUM LIGHT/DARK
        # ==========================================
        self.sidebar_frame = ctk.CTkFrame(self, width=250, corner_radius=0, fg_color=("#FFFFFF", "#1E293B"), border_width=1, border_color=("#E2E8F0", "#334155"))
        self.sidebar_frame.grid(row=0, column=0, sticky="nsew")
        self.sidebar_frame.grid_rowconfigure(4, weight=1)

        self.logo_label = ctk.CTkLabel(self.sidebar_frame, text="GeoRanker", font=("Segoe UI", 26, "bold"), text_color=("#0F172A", "#F8FAFC"), justify="left")
        self.logo_label.grid(row=0, column=0, padx=25, pady=(40, 30), sticky="w")

        # Botão ativo simulando estilo premium moderno
        self.nav_frame = ctk.CTkFrame(self.sidebar_frame, fg_color=("#EFF6FF", "#1E2E3D"), corner_radius=8)
        self.nav_frame.grid(row=1, column=0, padx=15, pady=5, sticky="ew")
        self.nav1 = ctk.CTkLabel(self.nav_frame, text="  Tela Inicial", font=("Segoe UI", 13, "bold"), text_color=("#1D4ED8", "#60A5FA"), anchor="w")
        self.nav1.pack(fill="x", padx=15, pady=12)

        # Switch de tema (Modo Escuro) no rodapé da barra lateral
        self.switch_tema = ctk.CTkSwitch(self.sidebar_frame, text="Modo Escuro", command=self.alterar_tema, font=("Segoe UI", 12, "bold"), text_color=("#475569", "#94A3B8"))
        self.switch_tema.grid(row=4, column=0, padx=25, pady=(20, 10), sticky="sw")
        
        # Sincroniza o switch com o modo atual
        if ctk.get_appearance_mode() == "Dark":
            self.switch_tema.select()

        self.footer = ctk.CTkLabel(self.sidebar_frame, text="Versão Final\nCriado por Leonardo Presses.", font=("Segoe UI", 11), text_color=("#64748B", "#94A3B8"), justify="left")
        self.footer.grid(row=5, column=0, padx=25, pady=25, sticky="sw")


        # ==========================================
        # ÁREA PRINCIPAL (MAIN CONTENT)
        # ==========================================
        self.main_view = ctk.CTkScrollableFrame(self, corner_radius=0, fg_color="transparent")
        self.main_view.grid(row=0, column=1, sticky="nsew", padx=20, pady=0)

        # Cabeçalho Principal
        self.header_frame = ctk.CTkFrame(self.main_view, fg_color="transparent")
        self.header_frame.pack(fill="x", pady=(30, 20), padx=10)
        
        self.badge = ctk.CTkLabel(self.header_frame, text="  IA GENERATIVA  ", font=("Segoe UI", 10, "bold"), text_color=("#4F46E5", "#A5B4FC"), fg_color=("#E0E7FF", "#312E81"), corner_radius=10)
        self.badge.pack(anchor="w", pady=(0, 5))
        
        self.titulo_pagina = ctk.CTkLabel(self.header_frame, text="Otimização Inteligente", font=("Segoe UI", 26, "bold"), text_color=("#0F172A", "#F8FAFC"))
        self.titulo_pagina.pack(anchor="w")

        # --- CARD 0: PASTA DE TRABALHO ---
        self.card0 = ctk.CTkFrame(self.main_view, fg_color=("#FFFFFF", "#1E293B"), corner_radius=16, border_width=1, border_color=("#E2E8F0", "#334155"))
        self.card0.pack(fill="x", pady=10, padx=10)
        
        ctk.CTkLabel(self.card0, text="📁 PASTA DE TRABALHO SELECIONADA", font=("Segoe UI", 11, "bold"), text_color=("#64748B", "#94A3B8")).pack(anchor="w", padx=25, pady=(25, 10))
        
        self.frame_pasta = ctk.CTkFrame(self.card0, fg_color="transparent")
        self.frame_pasta.pack(fill="x", padx=20, pady=(0, 25))
        
        self.entry_pasta = ctk.CTkEntry(self.frame_pasta, placeholder_text="Diretório Atual (onde o app está executando)...", height=45, fg_color=("#F8FAFC", "#0F172A"), border_color=("#E2E8F0", "#334155"), text_color=("#0F172A", "#F8FAFC"), font=("Segoe UI", 13), corner_radius=8)
        self.entry_pasta.insert(0, "Diretório Atual (onde o app está executando)")
        self.entry_pasta.configure(state="disabled")
        self.entry_pasta.pack(side="left", fill="x", expand=True, padx=(5, 10))
        
        self.btn_selecionar_pasta = ctk.CTkButton(self.frame_pasta, text="Selecionar Pasta", width=150, height=45, command=self.selecionar_pasta, fg_color=("#3B82F6", "#2563EB"), hover_color=("#2563EB", "#1D4ED8"), text_color="#FFFFFF", corner_radius=8, font=("Segoe UI", 13, "bold"))
        self.btn_selecionar_pasta.pack(side="right", padx=(0, 5))

        # --- CARD 1: IDENTIFICAÇÃO E METADADOS ---
        self.card1 = ctk.CTkFrame(self.main_view, fg_color=("#FFFFFF", "#1E293B"), corner_radius=16, border_width=1, border_color=("#E2E8F0", "#334155"))
        self.card1.pack(fill="x", pady=10, padx=10)
        
        ctk.CTkLabel(self.card1, text="🏢 IDENTIFICAÇÃO DA EMPRESA", font=("Segoe UI", 11, "bold"), text_color=("#64748B", "#94A3B8")).pack(anchor="w", padx=25, pady=(25, 10))
        
        self.frame_identidade = ctk.CTkFrame(self.card1, fg_color="transparent")
        self.frame_identidade.pack(fill="x", padx=20, pady=(0, 15))

        self.empresa = ctk.CTkEntry(self.frame_identidade, placeholder_text="Nome da Empresa (Autor)", height=45, fg_color=("#F8FAFC", "#0F172A"), border_color=("#E2E8F0", "#334155"), text_color=("#0F172A", "#F8FAFC"), font=("Segoe UI", 13), corner_radius=8)
        self.empresa.pack(side="left", fill="x", expand=True, padx=(5, 10))

        self.telefone = ctk.CTkEntry(self.frame_identidade, placeholder_text="Telefone / WhatsApp", height=45, fg_color=("#F8FAFC", "#0F172A"), border_color=("#E2E8F0", "#334155"), text_color=("#0F172A", "#F8FAFC"), font=("Segoe UI", 13), corner_radius=8)
        self.telefone.pack(side="right", fill="x", expand=True, padx=(0, 5))

        ctk.CTkLabel(self.card1, text="🧠 METADADOS ESTRATÉGICOS (IA)", font=("Segoe UI", 11, "bold"), text_color=("#64748B", "#94A3B8")).pack(anchor="w", padx=25, pady=(5, 10))
        
        self.titulo = ctk.CTkTextbox(self.card1, height=80, fg_color=("#F8FAFC", "#0F172A"), border_color=("#E2E8F0", "#334155"), border_width=1, text_color=("#0F172A", "#F8FAFC"), font=("Segoe UI", 13), corner_radius=8)
        self.placeholder_titulo = "Digite seu NICHO aqui para a IA trabalhar, ou cole o Título (Palavras-chave)..."
        self.titulo.insert("0.0", self.placeholder_titulo)
        self.titulo.bind("<FocusIn>", self.limpar_titulo)
        self.titulo.bind("<FocusOut>", self.restaurar_titulo)
        self.titulo.pack(fill="x", padx=25, pady=(0, 15))

        self.btn_ia = ctk.CTkButton(self.card1, text="✨ Gerar Textos e Metadados com IA", command=self.gerar_com_ia, fg_color=("#6366F1", "#4F46E5"), hover_color=("#4F46E5", "#4338CA"), text_color="#FFFFFF", font=("Segoe UI", 13, "bold"), height=40, corner_radius=8)
        self.btn_ia.pack(anchor="e", padx=25, pady=(0, 15))

        self.desc = ctk.CTkTextbox(self.card1, height=100, fg_color=("#F8FAFC", "#0F172A"), border_color=("#E2E8F0", "#334155"), border_width=1, text_color=("#0F172A", "#F8FAFC"), font=("Segoe UI", 13), corner_radius=8)
        self.placeholder_desc = "Cole aqui a Descrição (SEO)..."
        self.desc.insert("0.0", self.placeholder_desc)
        self.desc.bind("<FocusIn>", self.limpar_desc)
        self.desc.bind("<FocusOut>", self.restaurar_desc)
        self.desc.pack(fill="x", padx=25, pady=(0, 25))


        # --- CARD 2: GEOLOCALIZAÇÃO ---
        self.card2 = ctk.CTkFrame(self.main_view, fg_color=("#FFFFFF", "#1E293B"), corner_radius=16, border_width=1, border_color=("#E2E8F0", "#334155"))
        self.card2.pack(fill="x", pady=10, padx=10)

        ctk.CTkLabel(self.card2, text="📍 GEOLOCALIZAÇÃO PRECISA", font=("Segoe UI", 11, "bold"), text_color=("#64748B", "#94A3B8")).pack(anchor="w", padx=25, pady=(25, 10))
        
        self.frame_busca = ctk.CTkFrame(self.card2, fg_color="transparent")
        self.frame_busca.pack(fill="x", padx=20, pady=(0, 15))
        
        self.endereco = ctk.CTkEntry(self.frame_busca, placeholder_text="Digite o Endereço (Ex: Rua X, Cidade, Estado)...", height=45, fg_color=("#F8FAFC", "#0F172A"), border_color=("#E2E8F0", "#334155"), text_color=("#0F172A", "#F8FAFC"), font=("Segoe UI", 13), corner_radius=8)
        self.endereco.pack(side="left", fill="x", expand=True, padx=(5, 10))
        
        self.btn_buscar_gps = ctk.CTkButton(self.frame_busca, text="Autodetectar", width=130, height=45, command=self.buscar_gps, fg_color=("#10B981", "#059669"), hover_color=("#059669", "#047857"), text_color="#FFFFFF", corner_radius=8, font=("Segoe UI", 13, "bold"))
        self.btn_buscar_gps.pack(side="right", padx=(0, 5))

        self.frame_coords = ctk.CTkFrame(self.card2, fg_color="transparent")
        self.frame_coords.pack(fill="x", padx=20, pady=(0, 25))
        self.lat = ctk.CTkEntry(self.frame_coords, placeholder_text="Latitude", height=45, fg_color=("#F8FAFC", "#0F172A"), border_color=("#E2E8F0", "#334155"), text_color=("#0F172A", "#F8FAFC"), font=("Segoe UI", 13), corner_radius=8)
        self.lat.pack(side="left", fill="x", expand=True, padx=(5, 10))
        self.lon = ctk.CTkEntry(self.frame_coords, placeholder_text="Longitude", height=45, fg_color=("#F8FAFC", "#0F172A"), border_color=("#E2E8F0", "#334155"), text_color=("#0F172A", "#F8FAFC"), font=("Segoe UI", 13), corner_radius=8)
        self.lon.pack(side="right", fill="x", expand=True, padx=(0, 5))


        # --- CARD 3: AÇÕES E PROCESSAMENTO ---
        self.card3 = ctk.CTkFrame(self.main_view, fg_color="transparent")
        self.card3.pack(fill="x", pady=(15, 30), padx=10)

        self.comprimir_var = ctk.BooleanVar(value=True) 
        self.check_comprimir = ctk.CTkCheckBox(self.card3, text="Otimizar mídias para Web (Carregamento ultra-rápido)", variable=self.comprimir_var, text_color=("#475569", "#94A3B8"), font=("Segoe UI", 13), fg_color=("#3B82F6", "#2563EB"), border_color=("#CBD5E1", "#475569"))
        self.check_comprimir.pack(anchor="w", pady=(0, 20), padx=5)

        self.btn_conv = ctk.CTkButton(self.card3, text="1. CONVERTER E OTIMIZAR MÍDIAS", command=self.rodar_conversao, fg_color=("#0F172A", "#F8FAFC"), hover_color=("#1E293B", "#E2E8F0"), text_color=("#FFFFFF", "#0F172A"), corner_radius=12, height=55, font=("Segoe UI", 14, "bold"))
        self.btn_conv.pack(fill="x", pady=(0, 12))

        self.btn_seo = ctk.CTkButton(self.card3, text="2. APLICAR SEO GLOBAL E RENOMEAR", command=self.rodar_seo, fg_color=("#3B82F6", "#2563EB"), hover_color=("#2563EB", "#1D4ED8"), text_color="#FFFFFF", corner_radius=12, height=55, font=("Segoe UI", 14, "bold"))
        self.btn_seo.pack(fill="x")

        # Barra de Progresso, Status e LED Indicador
        self.progress_frame = ctk.CTkFrame(self.card3, fg_color="transparent")
        self.progress_frame.pack(fill="x", pady=(20, 0))
        
        self.status_container = ctk.CTkFrame(self.progress_frame, fg_color="transparent")
        self.status_container.pack(anchor="w", pady=(0, 5))
        
        # LED indicador de status (caractere ● unicode)
        self.status_led = ctk.CTkLabel(self.status_container, text="●", font=("Segoe UI", 18), text_color=("#94A3B8", "#475569"))
        self.status_led.pack(side="left", padx=(0, 6))
        
        self.status_lbl = ctk.CTkLabel(self.status_container, text="⚡ Status: Aguardando início...", font=("Segoe UI", 12, "bold"), text_color=("#64748B", "#94A3B8"))
        self.status_lbl.pack(side="left")
        
        self.progress_bar = ctk.CTkProgressBar(self.progress_frame, orientation="horizontal", height=12, fg_color=("#E2E8F0", "#334155"), progress_color=("#10B981", "#059669"))
        self.progress_bar.pack(fill="x")
        self.progress_bar.set(0)

    def alterar_tema(self):
        if self.switch_tema.get() == 1:
            ctk.set_appearance_mode("dark")
        else:
            ctk.set_appearance_mode("light")

    def atualizar_status(self, mensagem, cor_led="#94A3B8"):
        def sync_ui():
            self.status_lbl.configure(text=mensagem)
            self.status_led.configure(text_color=cor_led)
        self.after(0, sync_ui)

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

    def selecionar_pasta(self):
        pasta = filedialog.askdirectory()
        if pasta:
            self.diretorio_selecionado = pasta
            self.entry_pasta.configure(state="normal")
            self.entry_pasta.delete(0, "end")
            self.entry_pasta.insert(0, pasta)
            self.entry_pasta.configure(state="disabled")

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
        self.atualizar_status("⚡ Status: Escaneando arquivos...", "#3B82F6")
        self.progress_bar.set(0)
        self.update()

        def thread_conv():
            base_dir = self.diretorio_selecionado if self.diretorio_selecionado else os.getcwd()
            magick_exe = resource_path("magick.exe") 
            
            if not os.path.exists(magick_exe):
                magick_exe = "magick" 
            
            ffmpeg_exe = resource_path("ffmpeg.exe")
            if not os.path.exists(ffmpeg_exe):
                ffmpeg_exe = "ffmpeg"

            try:
                # Mapeia todas as tarefas para calcular o progresso
                tarefas = []
                for root, dirs, files in os.walk(base_dir):
                    # Lote de HEIC (converte para JPG, deleta originais)
                    heic_files = [f for f in files if f.lower().endswith('.heic')]
                    if heic_files:
                        tarefas.append(('imagem_heic', root, heic_files))
                    
                    # Lote de PNG (otimiza in-place mantendo transparência)
                    png_files = [f for f in files if f.lower().endswith('.png')]
                    if png_files:
                        tarefas.append(('imagem_png', root, png_files))

                    # Lote de JPEG/JPG (otimiza in-place)
                    jpg_files = [f for f in files if f.lower().endswith('.jpg') or f.lower().endswith('.jpeg')]
                    if jpg_files:
                        tarefas.append(('imagem_jpg', root, jpg_files))
                    
                    # Para vídeos, cada arquivo é processado individualmente
                    for ext in ['.mp4', '.mov', '.avi', '.mkv', '.webm']:
                        videos = [f for f in files if f.lower().endswith(ext) and not f.startswith("temp_ffmpeg_")]
                        for video in videos:
                            tarefas.append(('video', root, video))

                total_tarefas = len(tarefas)
                if total_tarefas == 0:
                    self.atualizar_status("⚡ Status: Nenhuma mídia encontrada.", "#94A3B8")
                    self.after(0, lambda: messagebox.showinfo("GeoRanker", "Nenhuma mídia elegível (.heic, .png, .jpeg, .mp4, .mov, etc.) foi encontrada na pasta selecionada."))
                    return

                for idx, (tipo, root_dir, info_extra) in enumerate(tarefas, start=1):
                    progresso = idx / total_tarefas
                    
                    if tipo == 'imagem_heic':
                        heic_files = info_extra
                        self.atualizar_status(f"⚡ Status: [{idx}/{total_tarefas}] Convertendo HEIC para JPG...", "#F59E0B")
                        self.after(0, lambda p=progresso: self.progress_bar.set(p))
                        
                        cmd_magick = f'"{magick_exe}" mogrify -format jpg -background white -alpha remove'
                        if self.comprimir_var.get():
                            cmd_magick += ' -quality 80 -resize "1920x1920>"'
                        
                        subprocess.run(f'{cmd_magick} "*.heic"', shell=True, cwd=root_dir, creationflags=subprocess.CREATE_NO_WINDOW)
                        
                        for f in heic_files:
                            try:
                                os.remove(os.path.join(root_dir, f))
                            except:
                                pass

                    elif tipo == 'imagem_png':
                        png_files = info_extra
                        self.atualizar_status(f"⚡ Status: [{idx}/{total_tarefas}] Otimizando PNGs (preservando transparência)...", "#F59E0B")
                        self.after(0, lambda p=progresso: self.progress_bar.set(p))
                        
                        cmd_magick = f'"{magick_exe}" mogrify'
                        if self.comprimir_var.get():
                            cmd_magick += ' -resize "1920x1920>"'
                        
                        subprocess.run(f'{cmd_magick} "*.png"', shell=True, cwd=root_dir, creationflags=subprocess.CREATE_NO_WINDOW)

                    elif tipo == 'imagem_jpg':
                        jpg_files = info_extra
                        self.atualizar_status(f"⚡ Status: [{idx}/{total_tarefas}] Otimizando JPGs...", "#F59E0B")
                        self.after(0, lambda p=progresso: self.progress_bar.set(p))
                        
                        cmd_magick = f'"{magick_exe}" mogrify'
                        if self.comprimir_var.get():
                            cmd_magick += ' -quality 80 -resize "1920x1920>"'
                        
                        # Roda mogrify em lote no diretório para .jpg e .jpeg
                        for f_ext in ['*.jpg', '*.jpeg']:
                            subprocess.run(f'{cmd_magick} "{f_ext}"', shell=True, cwd=root_dir, creationflags=subprocess.CREATE_NO_WINDOW)
                                
                    elif tipo == 'video':
                        video = info_extra
                        self.atualizar_status(f"⚡ Status: [{idx}/{total_tarefas}] Comprimindo vídeo {video}...", "#F59E0B")
                        self.after(0, lambda p=progresso: self.progress_bar.set(p))
                        
                        video_path = os.path.join(root_dir, video)
                        video_temp = os.path.join(root_dir, f"temp_ffmpeg_{video}")
                        
                        cmd_ffmpeg = f'"{ffmpeg_exe}" -i "{video}" -vcodec libx264 -crf 28 -preset ultrafast -vf "scale=\'min(1280,iw)\':-2" -y "{video_temp}"'
                        subprocess.run(cmd_ffmpeg, shell=True, cwd=root_dir, creationflags=subprocess.CREATE_NO_WINDOW)
                        
                        if os.path.exists(video_temp):
                            try:
                                os.remove(video_path)
                                os.rename(video_temp, video_path)
                            except:
                                pass

                self.atualizar_status("⚡ Status: Otimização concluída com sucesso!", "#10B981")
                self.after(0, lambda: self.progress_bar.set(1.0))
                self.after(0, lambda: messagebox.showinfo("GeoRanker", "Conversão Concluída!\nVarredura feita e mídias otimizadas com sucesso."))
            except Exception as e:
                self.atualizar_status("⚡ Status: Erro na conversão", "#EF4444")
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

        # Validação robusta de Latitude e Longitude
        if lat_val:
            try:
                lat_f = float(lat_val.replace(',', '.'))
                if not (-90 <= lat_f <= 90):
                    messagebox.showerror("Erro de Validação", "A Latitude deve ser um número entre -90 e 90.")
                    return
            except ValueError:
                messagebox.showerror("Erro de Validação", "A Latitude inserida é inválida.")
                return

        if lon_val:
            try:
                lon_f = float(lon_val.replace(',', '.'))
                if not (-180 <= lon_f <= 180):
                    messagebox.showerror("Erro de Validação", "A Longitude deve ser um número entre -180 e 180.")
                    return
            except ValueError:
                messagebox.showerror("Erro de Validação", "A Longitude inserida é inválida.")
                return

        self.btn_seo.configure(state="disabled", text="⏳ Aplicando SEO... (Aguarde)")
        self.atualizar_status("⚡ Status: Iniciando aplicação de metadados...", "#3B82F6")
        self.progress_bar.set(0)
        self.update()

        def thread_seo():
            pasta_temp = tempfile.mkdtemp()
            base_dir = self.diretorio_selecionado if self.diretorio_selecionado else os.getcwd()
            try:
                self.atualizar_status("⚡ Status: Extraindo motor de metadados...", "#3B82F6")
                self.after(0, lambda: self.progress_bar.set(0.1))
                
                caminho_zip = resource_path("motor_exif.zip")
                with zipfile.ZipFile(caminho_zip, 'r') as zip_ref:
                    zip_ref.extractall(pasta_temp)
                
                exiftool_exe = os.path.join(pasta_temp, "exiftool.exe")

                self.atualizar_status("⚡ Status: Injetando metadados via Exiftool...", "#3B82F6")
                self.after(0, lambda: self.progress_bar.set(0.2))

                cmd = [
                    exiftool_exe, 
                    "-overwrite_original", 
                    "-L", 
                    "-ext", "jpg", "-ext", "jpeg", "-ext", "png", 
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
                    self.atualizar_status("⚡ Status: Erro no Exiftool", "#EF4444")
                    self.after(0, lambda: messagebox.showerror("Erro no Exiftool", f"O Exiftool falhou ao processar:\n{resultado.stderr}"))
                    return

                self.atualizar_status("⚡ Status: Escaneando arquivos para renomear...", "#3B82F6")
                self.after(0, lambda: self.progress_bar.set(0.5))

                # Renomeação Segura
                titulo_curto = titulo_val[:40]
                texto_base = f"{empresa_val} {titulo_curto}".strip()
                
                if not texto_base:
                    texto_base = "midia-otimizada"
                
                # Normaliza os caracteres (tira os acentos mas mantém as letras, ex: ê -> e, ç -> c)
                texto_limpo = unicodedata.normalize('NFKD', texto_base).encode('ASCII', 'ignore').decode('utf-8')
                
                # Agora limpa os caracteres especiais que não são letras ou números
                texto_limpo = re.sub(r'[^a-zA-Z0-9\s-]', '', texto_limpo)
                texto_limpo = re.sub(r'\s+', '-', texto_limpo).lower()
                
                if len(texto_limpo) > 60:
                    texto_limpo = texto_limpo[:60].strip('-')
                
                # Mapeia mídias para renomear
                arquivos_para_renomear = []
                for root, dirs, files in os.walk(base_dir):
                    # Sort para manter ordem consistente
                    files.sort()
                    for f in files:
                        ext = os.path.splitext(f)[1].lower()
                        if ext in ['.jpg', '.jpeg', '.png', '.mp4', '.mov', '.avi', '.mkv', '.webm']:
                            arquivos_para_renomear.append((root, f, ext))

                total_renomear = len(arquivos_para_renomear)
                if total_renomear == 0:
                    self.atualizar_status("⚡ Status: Processo concluído (0 mídias).", "#94A3B8")
                    self.after(0, lambda: self.progress_bar.set(1.0))
                    self.after(0, lambda: messagebox.showinfo("GeoRanker", "SEO aplicado com sucesso!\nNenhum arquivo elegível encontrado para renomear."))
                    return

                contador = 1
                for idx, (root, f, ext) in enumerate(arquivos_para_renomear, start=1):
                    progresso = 0.5 + (idx / total_renomear) * 0.5
                    self.atualizar_status(f"⚡ Status: Renomeando [{idx}/{total_renomear}] {f}...", "#3B82F6")
                    self.after(0, lambda p=progresso: self.progress_bar.set(p))

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
                
                self.atualizar_status("⚡ Status: SEO e renomeação concluídos!", "#10B981")
                self.after(0, lambda: self.progress_bar.set(1.0))
                self.after(0, lambda: messagebox.showinfo("GeoRanker", "SEO e renomeação estratégica aplicados com sucesso!"))
                
            except Exception as e:
                self.atualizar_status("⚡ Status: Erro fatal", "#EF4444")
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