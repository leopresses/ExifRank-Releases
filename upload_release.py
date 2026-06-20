import lancar_atualizacao
token = lancar_atualizacao.carregar_token()
lancar_atualizacao.criar_release_e_upload(token, 'v1.1.6', r'dist\ExifRank_Installer.exe')
