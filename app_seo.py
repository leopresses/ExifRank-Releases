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
        self.title("Ferramenta SEO")
        self.geometry("1000x850") # Janela mais larga para o visual Dashboard
        self.configure(fg_color="#F8FAFC") # Fundo cinza super claro (Premium)
        
        try:
            # Puxa o ícone embutido pelo PyInstaller
            self.iconbitmap(resource_path("icone.ico"))
        except:
            pass 

        # --- SISTEMA DE GRID (DUAS COLUNAS) ---
        self.grid_columnconfigure(1, weight=1)
        self.grid_rowconfigure(0, weight=1)

        # ==========================================
        # BARRA LATERAL (SIDEBAR MENU)
        # ==========================================
        self.sidebar_frame = ctk.CTkFrame(self, width=220, corner_radius=0, fg_color="#1E3A8A")
        self.sidebar_frame.grid(row=0, column=0, sticky="nsew")
        self.sidebar_frame.grid_rowconfigure(4, weight=1)

        self.logo_label = ctk.CTkLabel(self.sidebar_frame, text="Ferramenta SEO\nSEO HUB", font=("Roboto", 28, "bold"), text_color="white", justify="left")
        self.logo_label.grid(row=0, column=0, padx=25, pady=(40, 40), sticky="w")

        self.nav1 = ctk.CTkLabel(self.sidebar_frame, text="Dashboard Principal", font=("Roboto", 14, "bold"), text_color="white")
        self.nav1.grid(row=1, column=0, padx=25, pady=10, sticky="w")

        self.footer = ctk.CTkLabel(self.sidebar_frame, text="Versão 3.2 (AI Edition)\nCriado por Leonardo Presses.", font=("Roboto", 11), text_color="#94A3B8", justify="left")
        self.footer.grid(row=5, column=0, padx=25, pady=25, sticky="sw")


        # ==========================================
        # ÁREA PRINCIPAL (MAIN CONTENT)
        # ==========================================
        self.main_view = ctk.CTkScrollableFrame(self, corner_radius=0, fg_color="transparent")
        self.main_view.grid(row=0, column=1, sticky="nsew", padx=20, pady=0)

        # Cabeçalho Principal
        self.header_frame = ctk.CTkFrame(self.main_view, fg_color="transparent")
        self.header_frame.pack(fill="x", pady=(30, 20), padx=20)
        
        self.badge = ctk.CTkLabel(self.header_frame, text="  IA INTEGRADA  ", font=("Roboto", 10, "bold"), text_color="#6D28D9", fg_color="#EDE9FE", corner_radius=10)
        self.badge.pack(anchor="w", pady=(0, 5))
        
        self.titulo_pagina = ctk.CTkLabel(self.header_frame, text="Otimização Inteligente", font=("Roboto", 24, "bold"), text_color="#0F172A")
        self.titulo_pagina.pack(anchor="w")


        # --- CARD 1: IDENTIFICAÇÃO E METADADOS ---
        self.card1 = ctk.CTkFrame(self.main_view, fg_color="#FFFFFF", corner_radius=12, border_width=1, border_color="#E2E8F0")
        self.card1.pack(fill="x", pady=10, padx=20)
        
        ctk.CTkLabel(self.card1, text="IDENTIFICAÇÃO DA EMPRESA", font=("Roboto", 10, "bold"), text_color="#94A3B8").pack(anchor="w", padx=20, pady=(20, 5))
        
        # Frame para manter Empresa e Telefone lado a lado
        self.frame_identidade = ctk.CTkFrame(self.card1, fg_color="transparent")
        self.frame_identidade.pack(fill="x", padx=20, pady=(0, 15))

        self.empresa = ctk.CTkEntry(self.frame_identidade, placeholder_text="Nome da Empresa (Autor)", height=40, fg_color="#F1F5F9", border_color="#E2E8F0", text_color="#0F172A", corner_radius=8)
        self.empresa.pack(side="left", fill="x", expand=True, padx=(0, 10))

        self.telefone = ctk.CTkEntry(self.frame_identidade, placeholder_text="Telefone / WhatsApp", height=40, fg_color="#F1F5F9", border_color="#E2E8F0", text_color="#0F172A", corner_radius=8)
        self.telefone.pack(side="right", fill="x", expand=True)

        # Título / Nicho
        ctk.CTkLabel(self.card1, text="METADADOS ESTRATÉGICOS", font=("Roboto", 10, "bold"), text_color="#94A3B8").pack(anchor="w", padx=20, pady=(5, 5))
        self.titulo = ctk.CTkTextbox(self.card1, height=80, fg_color="#F1F5F9", border_color="#E2E8F0", border_width=1, text_color="#0F172A", corner_radius=8)
        self.placeholder_titulo = "Digite seu NICHO aqui para a IA trabalhar, ou cole o Título (Palavras-chave)..."
        self.titulo.insert("0.0", self.placeholder_titulo)
        self.titulo.bind("<FocusIn>", self.limpar_titulo)
        self.titulo.bind("<FocusOut>", self.restaurar_titulo)
        self.titulo.pack(fill="x", padx=20, pady=(0, 15))

        # Botão de IA
        self.btn_ia = ctk.CTkButton(self.card1, text="✨ Gerar Textos e Metadados com IA", command=self.gerar_com_ia, fg_color="#8B5CF6", hover_color="#7C3AED", font=("Roboto", 12, "bold"), height=35)
        self.btn_ia.pack(anchor="e", padx=20, pady=(0, 15))

        # Descrição
        self.desc = ctk.CTkTextbox(self.card1, height=100, fg_color="#F1F5F9", border_color="#E2E8F0", border_width=1, text_color="#0F172A", corner_radius=8)
        self.placeholder_desc = "Cole aqui a Descrição (SEO)..."
        self.desc.insert("0.0", self.placeholder_desc)
        self.desc.bind("<FocusIn>", self.limpar_desc)
        self.desc.bind("<FocusOut>", self.restaurar_desc)
        self.desc.pack(fill="x", padx=20, pady=(0, 20))


        # --- CARD 2: GEOLOCALIZAÇÃO ---
        self.card2 = ctk.CTkFrame(self.main_view, fg_color="#FFFFFF", corner_radius=12, border_width=1, border_color="#E2E8F0")
        self.card2.pack(fill="x", pady=10, padx=20)

        ctk.CTkLabel(self.card2, text="GEOLOCALIZAÇÃO PRECISA", font=("Roboto", 10, "bold"), text_color="#94A3B8").pack(anchor="w", padx=20, pady=(20, 5))
        
        self.frame_busca = ctk.CTkFrame(self.card2, fg_color="transparent")
        self.frame_busca.pack(fill="x", padx=20, pady=(0, 15))
        
        self.endereco = ctk.CTkEntry(self.frame_busca, placeholder_text="Digite a Morada (Ex: Rua X, Cidade, Estado)...", height=40, fg_color="#F1F5F9", border_color="#E2E8F0", text_color="#0F172A", corner_radius=8)
        self.endereco.pack(side="left", fill="x", expand=True, padx=(0, 10))
        
        self.btn_buscar_gps = ctk.CTkButton(self.frame_busca, text="Autodetectar", width=120, height=40, command=self.buscar_gps, fg_color="#10B981", hover_color="#059669", corner_radius=8, font=("Roboto", 12, "bold"))
        self.btn_buscar_gps.pack(side="right")

        self.frame_coords = ctk.CTkFrame(self.card2, fg_color="transparent")
        self.frame_coords.pack(fill="x", padx=20, pady=(0, 20))
        self.lat = ctk.CTkEntry(self.frame_coords, placeholder_text="Latitude", height=40, fg_color="#F1F5F9", border_color="#E2E8F0", text_color="#0F172A", corner_radius=8)
        self.lat.pack(side="left", fill="x", expand=True, padx=(0, 10))
        self.lon = ctk.CTkEntry(self.frame_coords, placeholder_text="Longitude", height=40, fg_color="#F1F5F9", border_color="#E2E8F0", text_color="#0F172A", corner_radius=8)
        self.lon.pack(side="right", fill="x", expand=True)


        # --- CARD 3: AÇÕES E PROCESSAMENTO ---
        self.card3 = ctk.CTkFrame(self.main_view, fg_color="transparent")
        self.card3.pack(fill="x", pady=(10, 30), padx=20)

        self.comprimir_var = ctk.BooleanVar(value=True) 
        self.check_comprimir = ctk.CTkCheckBox(self.card3, text="Otimizar peso e resolução para Web (Carregamento rápido)", variable=self.comprimir_var, text_color="#0F172A", fg_color="#2563EB", border_color="#94A3B8")
        self.check_comprimir.pack(anchor="w", pady=(0, 15))

        self.btn_conv = ctk.CTkButton(self.card3, text="1. CONVERTER E OTIMIZAR MÍDIAS", command=self.rodar_conversao, fg_color="#2563EB", hover_color="#1D4ED8", corner_radius=30, height=50, font=("Roboto", 14, "bold"))
        self.btn_conv.pack(fill="x", pady=(0, 10))

        self.btn_seo = ctk.CTkButton(self.card3, text="2. APLICAR SEO GLOBAL", command=self.rodar_seo, fg_color="#2563EB", hover_color="#1D4ED8", corner_radius=30, height=50, font=("Roboto", 14, "bold"))
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
                "Certifique-se de que o arquivo .env contendo sua chave foi compilado corretamente junto com o programa."
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

        threading.Thread(target=thread_ia).start()

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
        
        self.btn_buscar_gps.configure(text="Buscando...")
        self.update()
        
        try:
            geolocator = Nominatim(user_agent="ferramenta_seo_final_app")
            location = geolocator.geocode(endereco_texto)
            
            if location:
                self.lat.delete(0, "end")
                self.lon.delete(0, "end")
                self.lat.insert(0, str(location.latitude))
                self.lon.insert(0, str(location.longitude))
                messagebox.showinfo("Motor GPS", f"GPS Encontrado!\n{location.address}")
            else:
                messagebox.showerror("Erro", "Endereço não encontrado. Tente ser mais específico.")
        except Exception as e:
            messagebox.showerror("Erro de Conexão", f"Falha ao conectar no servidor de GPS: {e}")
        finally:
            self.btn_buscar_gps.configure(text="Autodetectar")

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
        base_dir = os.getcwd() 
        magick_exe = resource_path("magick.exe") 
        
        if not os.path.exists(magick_exe):
            magick_exe = "magick" 
        
        for root, dirs, files in os.walk(base_dir):
            has_images = any(f.lower().endswith(('.heic', '.png', '.jpeg')) for f in files)
            if has_images:
                os.chdir(root) 
                
                cmd_magick = f'"{magick_exe}" mogrify -format jpg -background white -alpha remove'
                if self.comprimir_var.get():
                    cmd_magick += ' -quality 80 -resize "1920x1920>"'
                cmd_magick += ' *.heic *.png *.jpeg'
                
                subprocess.run(cmd_magick, shell=True)
                subprocess.run("del /q *.heic *.png *.jpeg", shell=True)
        
        os.chdir(base_dir)
        messagebox.showinfo("Ferramenta SEO", "Conversão Concluída!\nVarredura feita e imagens otimizadas com sucesso.")

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

        # Usando a estratégia segura do arquivo ZIP
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
                print(f"Erro Exiftool: {resultado.stderr}")
                messagebox.showerror("Erro no Exiftool", f"O Exiftool falhou ao processar:\n{resultado.stderr}")
                return

            texto_base = f"{empresa_val} {titulo_val}".strip()
            if not texto_base:
                texto_base = "imagem-otimizada"
            
            texto_limpo = re.sub(r'[^a-zA-Z0-9\s-]', '', texto_base)
            texto_limpo = re.sub(r'\s+', '-', texto_limpo).lower()
            
            contador = 1
            for root, dirs, files in os.walk(base_dir):
                files.sort() 
                for f in files:
                    ext = os.path.splitext(f)[1].lower()
                    if ext in ['.jpg', '.jpeg', '.mp4', '.mov']:
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
            
            messagebox.showinfo("Ferramenta SEO", "SEO e Renomeação Estratégica aplicados com sucesso!")
            
        except Exception as e:
            messagebox.showerror("Erro Fatal", f"Ocorreu um erro inesperado: {e}")
        finally:
            try:
                shutil.rmtree(pasta_temp)
            except:
                pass

if __name__ == "__main__":
    app = App()
    app.mainloop()