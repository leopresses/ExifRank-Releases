import json
import os
import shutil
import stat
import subprocess
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest import mock


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def _instalar_stubs_importacao():
    webview = types.ModuleType('webview')
    sys.modules.setdefault('webview', webview)

    dotenv = types.ModuleType('dotenv')
    dotenv.load_dotenv = lambda *args, **kwargs: None
    sys.modules.setdefault('dotenv', dotenv)

    groq = types.ModuleType('groq')
    groq.Groq = object
    sys.modules.setdefault('groq', groq)

    requests = types.ModuleType('requests')
    requests.RequestException = RuntimeError
    requests.post = lambda *args, **kwargs: None
    sys.modules.setdefault('requests', requests)


_instalar_stubs_importacao()
import app_seo  # noqa: E402


class MediaProcessingFallbackTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory(prefix='exifrank-test-')
        self.project_dir = Path(self.temp_dir.name) / 'Cliente São João'
        self.project_dir.mkdir(parents=True)
        self.appdata_dir = Path(self.temp_dir.name) / 'AppData' / 'ExifRank'
        self.appdata_dir.mkdir(parents=True)
        self.source = self.project_dir / 'foto de teste.jpg'
        subprocess.run(
            [
                str(ROOT / 'magick.exe'), '-size', '32x32', 'xc:white',
                str(self.source)
            ],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_jpeg_recebe_metadados_quando_compactador_esta_indisponivel(self):
        api = app_seo.Api()
        mensagens = []
        progressos = []
        api._obter_limite_processamento = lambda data: (None, None)
        api.alertaUI = lambda mensagem, tipo='': mensagens.append((mensagem, tipo))
        api.atualizarProgresso = lambda porcentagem, texto, status='running': progressos.append(
            (porcentagem, texto, status)
        )

        popen_real = app_seo.subprocess.Popen

        def popen_com_magick_bloqueado(comando, *args, **kwargs):
            ferramenta = os.path.basename(str(comando[0])).lower() if comando else ''
            if ferramenta in {'magick', 'magick.exe'}:
                raise OSError('ImageMagick bloqueado para teste')
            return popen_real(comando, *args, **kwargs)

        dados = {
            'pasta': str(self.project_dir),
            'empresa': 'Empresa Teste',
            'titulo': 'Fotografia local',
            'desc': 'Descrição de teste',
            'notificar': False,
            'localizacoes': [{
                'nome': 'Endereço principal',
                'lat': -21.603708356861,
                'lon': -45.438420804486
            }]
        }

        with mock.patch.object(app_seo, 'get_app_data_dir', return_value=str(self.appdata_dir)), \
                mock.patch.object(app_seo.subprocess, 'Popen', side_effect=popen_com_magick_bloqueado):
            api._thread_executar_seo(dados)

        output_root = self.project_dir / api.OUTPUT_FOLDER_NAME
        resultados = list(output_root.rglob('*.jpg'))
        self.assertEqual(len(resultados), 1)
        self.assertTrue(any(status == 'completed' for _, _, status in progressos))
        self.assertTrue(any('metadados normalmente' in mensagem for mensagem, _ in mensagens))
        self.assertFalse(any(output_root.rglob('.exifrank-stage-*')))
        self.assertIn('image_optimization_fallback', (self.appdata_dir / 'logs' / 'processing.log').read_text(encoding='utf-8'))

        exiftool = ROOT / 'exiftool.exe'
        leitura = subprocess.run(
            [str(exiftool), '-j', '-GPSLatitude', '-GPSLongitude', str(resultados[0])],
            cwd=ROOT,
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding='utf-8',
            errors='replace'
        )
        metadados = json.loads(leitura.stdout)[0]
        self.assertIn('GPSLatitude', metadados)
        self.assertIn('GPSLongitude', metadados)

    def test_copia_temporaria_nao_herda_atributo_somente_leitura(self):
        api = app_seo.Api()
        progressos = []
        api._obter_limite_processamento = lambda data: (None, None)
        api.alertaUI = lambda *_args, **_kwargs: None
        api.atualizarProgresso = lambda porcentagem, texto, status='running': progressos.append(
            (porcentagem, texto, status)
        )
        os.chmod(self.source, stat.S_IREAD)

        dados = {
            'pasta': str(self.project_dir),
            'empresa': 'Empresa Teste',
            'titulo': 'Fotografia local',
            'desc': 'Descrição de teste',
            'notificar': False,
            'localizacoes': [{
                'nome': 'Endereço principal',
                'lat': -21.603708356861,
                'lon': -45.438420804486
            }]
        }

        try:
            with mock.patch.object(app_seo, 'get_app_data_dir', return_value=str(self.appdata_dir)):
                api._thread_executar_seo(dados)
        finally:
            os.chmod(self.source, stat.S_IWRITE | stat.S_IREAD)

        resultados = list((self.project_dir / api.OUTPUT_FOLDER_NAME).rglob('*.jpg'))
        self.assertEqual(len(resultados), 1)
        self.assertTrue(any(status == 'completed' for _, _, status in progressos))

    def test_exiftool_processa_quando_appdata_tem_acentos(self):
        """Reproduz perfis do Windows como C:\\Users\\Usuário."""
        api = app_seo.Api()
        mensagens = []
        progressos = []
        appdata_com_acento = Path(self.temp_dir.name) / 'Usuário' / 'AppData' / 'Roaming' / 'ExifRank'
        appdata_com_acento.mkdir(parents=True)
        api._obter_limite_processamento = lambda data: (None, None)
        api.alertaUI = lambda mensagem, tipo='': mensagens.append((mensagem, tipo))
        api.atualizarProgresso = lambda porcentagem, texto, status='running': progressos.append(
            (porcentagem, texto, status)
        )

        dados = {
            'pasta': str(self.project_dir),
            'empresa': 'Empresa Teste',
            'titulo': 'Fotografia local',
            'desc': 'Descrição de teste',
            'notificar': False,
            'localizacoes': [{
                'nome': 'Endereço principal',
                'lat': -21.603708356861,
                'lon': -45.438420804486
            }]
        }

        with mock.patch.object(app_seo, 'get_app_data_dir', return_value=str(appdata_com_acento)):
            api._thread_executar_seo(dados)

        resultados = list((self.project_dir / api.OUTPUT_FOLDER_NAME).rglob('*.jpg'))
        self.assertEqual(len(resultados), 1)
        self.assertTrue(any(status == 'completed' for _, _, status in progressos))
        self.assertFalse(any('metadados nas cópias' in mensagem for mensagem, _ in mensagens))

    def test_conta_premium_em_outro_pc_nao_e_rebaixada_para_gratuita(self):
        api = app_seo.Api()

        class Resposta:
            status_code = 200

            @staticmethod
            def json():
                return {'result': {'isPremium': True, 'deviceAllowed': False}}

        with mock.patch.object(app_seo.requests, 'post', return_value=Resposta()):
            limite, erro = api._obter_limite_processamento({
                'firebaseIdToken': 'cabecalho.eyJzdWIiOiAidWlkLXRlc3RlIn0.assinatura',
                'firebaseUid': 'uid-teste',
                'hardwareId': 'hardware-novo'
            })

        self.assertIsNone(limite)
        self.assertIn('Premium', erro)
        self.assertIn('Liberar novo PC', erro)
        self.assertEqual(api._license_validation_mode, 'online-premium-device-blocked')

    def test_gps_usa_nominatim_quando_arcgis_nao_encontra_o_endereco(self):
        """A importação não pode depender de um único provedor de mapas."""
        api = app_seo.Api()
        chamadas = []

        class ArcGISFalso:
            def __init__(self, **_kwargs):
                pass

            def geocode(self, _consulta, **_kwargs):
                return None

        class NominatimFalso:
            def __init__(self, **_kwargs):
                pass

            def geocode(self, consulta, **kwargs):
                chamadas.append((consulta, kwargs))
                return types.SimpleNamespace(latitude=-21.424674, longitude=-45.949351)

        geopy = types.ModuleType('geopy')
        geocoders = types.ModuleType('geopy.geocoders')
        geocoders.ArcGIS = ArcGISFalso
        geocoders.Nominatim = NominatimFalso
        geopy.geocoders = geocoders

        with mock.patch.dict(sys.modules, {'geopy': geopy, 'geopy.geocoders': geocoders}), \
                mock.patch.object(app_seo, 'get_app_data_dir', return_value=str(self.appdata_dir)):
            resultado = api.buscar_gps('Praça Fausto Monteiro, 347 - Centro - Alfenas - MG - 37130-031')

        self.assertEqual(resultado['provedor'], 'nominatim')
        self.assertAlmostEqual(resultado['lat'], -21.424674)
        self.assertEqual(chamadas[0][1]['country_codes'], 'br')

    def test_gps_distingue_endereco_nao_encontrado_de_provedor_indisponivel(self):
        api = app_seo.Api()

        class SemResultado:
            def __init__(self, **_kwargs):
                pass

            def geocode(self, _consulta, **_kwargs):
                return None

        geopy = types.ModuleType('geopy')
        geocoders = types.ModuleType('geopy.geocoders')
        geocoders.ArcGIS = SemResultado
        geocoders.Nominatim = SemResultado
        geopy.geocoders = geocoders

        with mock.patch.dict(sys.modules, {'geopy': geopy, 'geopy.geocoders': geocoders}):
            resultado = api.buscar_gps('Rua sem resultado, 100 - Cidade - MG')

        self.assertEqual(resultado['tipoErro'], 'nao-encontrado')

    def test_gps_informa_indisponibilidade_quando_os_dois_provedores_falham(self):
        api = app_seo.Api()

        class ProvedorIndisponivel:
            def __init__(self, **_kwargs):
                pass

            def geocode(self, _consulta, **_kwargs):
                raise RuntimeError('rede indisponível')

        geopy = types.ModuleType('geopy')
        geocoders = types.ModuleType('geopy.geocoders')
        geocoders.ArcGIS = ProvedorIndisponivel
        geocoders.Nominatim = ProvedorIndisponivel
        geopy.geocoders = geocoders

        with mock.patch.dict(sys.modules, {'geopy': geopy, 'geopy.geocoders': geocoders}), \
                mock.patch.object(app_seo, 'get_app_data_dir', return_value=str(self.appdata_dir)):
            resultado = api.buscar_gps('Rua de teste, 100 - Cidade - MG')

        self.assertEqual(resultado['tipoErro'], 'servico-indisponivel')
        log = (self.appdata_dir / 'logs' / 'processing.log').read_text(encoding='utf-8')
        self.assertIn('geocoding_all_providers_failed', log)

    def test_componentes_longos_sao_encurtados_sem_perder_a_organizacao(self):
        api = app_seo.Api()
        pasta_longa = self.project_dir / ('Pasta de origem muito extensa ' * 4).strip()
        pasta_longa.mkdir()
        fonte = pasta_longa / 'imagem longa.jpg'
        shutil.copyfile(self.source, fonte)
        tarefas = api._iterar_midias_origem(str(self.project_dir))
        localizacoes, erro = api._normalizar_localizacoes({
            'localizacoes': [{
                'nome': 'Avenida com um endereço extremamente comprido ' * 6,
                'lat': -21.6,
                'lon': -45.4
            }]
        })
        self.assertIsNone(erro)

        plano, _ = api._montar_plano_organizacao(
            str(self.project_dir), tarefas, localizacoes,
            'Empresa com nome muito comprido ' * 5,
            'Título muito comprido ' * 5,
            'Descrição', {}, False
        )

        self.assertTrue(plano)
        for item in plano:
            componentes = Path(item['pasta_destino']).relative_to(
                self.project_dir / api.OUTPUT_FOLDER_NAME
            ).parts
            self.assertTrue(all(len(componente) <= api.MAX_OUTPUT_COMPONENT_LENGTH for componente in componentes))
            self.assertLessEqual(len(Path(item['nome_final']).stem), api.MAX_OUTPUT_FILENAME_STEM + 4)

    def test_resumo_da_pasta_continua_quando_um_tamanho_nao_pode_ser_lido(self):
        api = app_seo.Api()
        getsize_real = app_seo.os.path.getsize

        def getsize_com_item_bloqueado(caminho):
            if os.path.normcase(os.path.abspath(caminho)) == os.path.normcase(os.path.abspath(self.source)):
                raise PermissionError('arquivo temporariamente bloqueado')
            return getsize_real(caminho)

        with mock.patch.object(app_seo.os.path, 'getsize', side_effect=getsize_com_item_bloqueado):
            resumo = api.obter_resumo_pasta(str(self.project_dir))

        self.assertNotIn('erro', resumo)
        self.assertEqual(resumo['total'], 1)
        self.assertGreaterEqual(resumo['itens_inacessiveis'], 1)

    def test_groq_opcional_nao_marca_servico_local_como_indisponivel(self):
        api = app_seo.Api()
        api.updateApiLed = mock.Mock()
        with mock.patch.object(app_seo, 'get_groq_key', return_value=''):
            resultado = api.init_app()

        self.assertTrue(resultado['ok'])
        self.assertFalse(resultado['groqFallbackConfigured'])
        api.updateApiLed.assert_not_called()

    def test_pasta_de_saida_normaliza_lista_colada_e_caracteres_invisiveis(self):
        api = app_seo.Api()
        localizacoes, erro = api._normalizar_localizacoes({
            'localizacoes': [{
                'nome': '37 Rua Euclídes Miragaia, 145 - Centro\n\u200b',
                'lat': '-23.5505',
                'lon': '-46.6333'
            }]
        })

        self.assertIsNone(erro)
        self.assertEqual(localizacoes[0]['nome'], '37 Rua Euclídes Miragaia, 145 - Centro\n\u200b')
        self.assertFalse(localizacoes[0]['pasta'].startswith('37 '))
        self.assertNotIn('\n', localizacoes[0]['pasta'])
        self.assertNotIn('\u200b', localizacoes[0]['pasta'])
        self.assertLessEqual(len(localizacoes[0]['pasta']), api.MAX_OUTPUT_COMPONENT_LENGTH)

    def test_nome_seguro_nunca_retorna_dispositivo_reservado_do_windows(self):
        self.assertNotEqual(app_seo.Api._nome_seguro('CON', 'Localizacao'), 'CON')
        self.assertNotEqual(app_seo.Api._nome_seguro('LPT1.txt', 'Localizacao'), 'LPT1.txt')

    def test_remove_arvore_de_saida_quando_ela_fica_vazia(self):
        output_root = self.project_dir / app_seo.Api.OUTPUT_FOLDER_NAME
        (output_root / 'Local' / 'Subpasta').mkdir(parents=True)
        app_seo.Api._remover_diretorios_saida_vazios(str(output_root))
        self.assertFalse(output_root.exists())

    def test_exibe_diagnostico_correto_quando_todas_as_rotas_exif_sao_bloqueadas(self):
        api = app_seo.Api()
        mensagens = []
        progressos = []
        api._obter_limite_processamento = lambda data: (None, None)
        api.alertaUI = lambda mensagem, tipo='': mensagens.append((mensagem, tipo))
        api.atualizarProgresso = lambda porcentagem, texto, status='running': progressos.append(
            (porcentagem, texto, status)
        )

        popen_real = app_seo.subprocess.Popen

        def popen_com_exiftool_bloqueado(comando, *args, **kwargs):
            ferramenta = os.path.basename(str(comando[0])).lower() if comando else ''
            if ferramenta == 'exiftool.exe':
                raise OSError('ExifTool bloqueado para reproduzir a falha')
            return popen_real(comando, *args, **kwargs)

        dados = {
            'pasta': str(self.project_dir),
            'empresa': 'Empresa Teste',
            'titulo': 'Fotografia local',
            'desc': 'Descrição de teste',
            'notificar': False,
            'localizacoes': [{
                'nome': 'Endereço principal',
                'lat': -21.603708356861,
                'lon': -45.438420804486
            }]
        }

        with mock.patch.object(app_seo, 'get_app_data_dir', return_value=str(self.appdata_dir)), \
                mock.patch.object(app_seo.subprocess, 'Popen', side_effect=popen_com_exiftool_bloqueado):
            api._thread_executar_seo(dados)

        self.assertTrue(any('Windows bloqueou o componente' in mensagem for mensagem, _ in mensagens))
        self.assertTrue(any(tipo == 'error' for _, tipo in mensagens))
        self.assertTrue(any(status == 'error' for _, _, status in progressos))

    def test_faz_fallback_para_motor_em_cache_quando_instalado_e_bloqueado(self):
        api = app_seo.Api()
        mensagens = []
        progressos = []
        api._obter_limite_processamento = lambda data: (None, None)
        api.alertaUI = lambda mensagem, tipo='': mensagens.append((mensagem, tipo))
        api.atualizarProgresso = lambda porcentagem, texto, status='running': progressos.append(
            (porcentagem, texto, status)
        )

        popen_real = app_seo.subprocess.Popen
        motor_instalado = os.path.normcase(os.path.abspath(ROOT / 'exiftool.exe'))

        def popen_com_motor_instalado_bloqueado(comando, *args, **kwargs):
            ferramenta = os.path.normcase(os.path.abspath(str(comando[0]))) if comando else ''
            if ferramenta == motor_instalado:
                raise OSError('Executável instalado bloqueado para teste')
            return popen_real(comando, *args, **kwargs)

        dados = {
            'pasta': str(self.project_dir),
            'empresa': 'Empresa Teste',
            'titulo': 'Fotografia local',
            'desc': 'Descrição de teste',
            'notificar': False,
            'localizacoes': [{
                'nome': 'Endereço principal',
                'lat': -21.603708356861,
                'lon': -45.438420804486
            }]
        }

        with mock.patch.object(app_seo, 'get_app_data_dir', return_value=str(self.appdata_dir)), \
                mock.patch.object(app_seo.subprocess, 'Popen', side_effect=popen_com_motor_instalado_bloqueado):
            api._thread_executar_seo(dados)

        resultados = list((self.project_dir / api.OUTPUT_FOLDER_NAME).rglob('*.jpg'))
        self.assertEqual(len(resultados), 1)
        self.assertTrue(any(status == 'completed' for _, _, status in progressos))
        log = (self.appdata_dir / 'logs' / 'processing.log').read_text(encoding='utf-8')
        self.assertIn('metadata_engine_fallback_activated', log)

    def test_um_lote_exif_com_falha_e_recuperado_midia_por_midia(self):
        """Uma mídia problemática não pode descartar todas as cópias do lote."""
        segunda_foto = self.project_dir / 'foto dois.jpg'
        shutil.copyfile(self.source, segunda_foto)
        api = app_seo.Api()
        mensagens = []
        api._obter_limite_processamento = lambda data: (None, None)
        api.alertaUI = lambda mensagem, tipo='': mensagens.append((mensagem, tipo))
        api.atualizarProgresso = lambda *_args, **_kwargs: None

        popen_real = app_seo.subprocess.Popen

        class FalhaDoLote:
            returncode = 1

            @staticmethod
            def communicate():
                return '', 'falha simulada do lote EXIF'

        def popen_com_lote_exif_falho(comando, *args, **kwargs):
            argumentos_jpg = [
                argumento for argumento in comando
                if str(argumento).lower().endswith('.jpg')
            ]
            if '-overwrite_original' in comando and len(argumentos_jpg) > 1:
                return FalhaDoLote()
            return popen_real(comando, *args, **kwargs)

        dados = {
            'pasta': str(self.project_dir),
            'empresa': 'Empresa Teste',
            'titulo': 'Fotografia local',
            'desc': 'Descrição de teste',
            'notificar': False,
            'localizacoes': [{
                'nome': 'Endereço principal',
                'lat': -21.603708356861,
                'lon': -45.438420804486
            }]
        }

        with mock.patch.object(app_seo, 'get_app_data_dir', return_value=str(self.appdata_dir)), \
                mock.patch.object(app_seo.subprocess, 'Popen', side_effect=popen_com_lote_exif_falho):
            api._thread_executar_seo(dados)

        resultados = list((self.project_dir / api.OUTPUT_FOLDER_NAME).rglob('*.jpg'))
        self.assertEqual(len(resultados), 2)
        self.assertTrue(any('Tudo pronto!' in mensagem for mensagem, _ in mensagens))
        log = (self.appdata_dir / 'logs' / 'processing.log').read_text(encoding='utf-8')
        self.assertIn('metadata_batch_failed', log)

    def test_finalizacao_usa_copia_segura_quando_windows_recusa_movimentacao(self):
        api = app_seo.Api()
        origem = self.project_dir / '.exifrank-stage-bloqueado.jpg'
        destino = self.project_dir / 'resultado.jpg'
        shutil.copy2(self.source, origem)

        with mock.patch.object(app_seo.os, 'replace', side_effect=PermissionError('arquivo em uso')):
            caminho, erro, estrategia = api._finalizar_arquivo_processado(str(origem), str(destino))

        self.assertIsNone(erro)
        self.assertEqual(estrategia, 'copiado')
        self.assertEqual(Path(caminho), destino)
        self.assertTrue(destino.is_file())

    def test_lancador_de_update_espera_app_fechar_antes_do_instalador(self):
        api = app_seo.Api()
        pasta_update = Path(self.temp_dir.name) / 'Atualização ExifRank'
        pasta_update.mkdir()
        instalador = pasta_update / 'ExifRank_Installer.exe'
        instalador.write_bytes(b'MZ' + b'0' * 1024)

        lancador = Path(api._criar_lancador_de_atualizacao(str(instalador)))
        conteudo = lancador.read_text(encoding='utf-8')

        self.assertLess(conteudo.index(':wait_for_exifrank'), conteudo.index('start "ExifRank Update"'))
        self.assertIn('/CLOSEAPPLICATIONS /FORCECLOSEAPPLICATIONS', conteudo)

    def test_download_manual_aceita_somente_endereco_oficial(self):
        api = app_seo.Api()
        with mock.patch.object(app_seo.webbrowser, 'open_new_tab', return_value=True) as abrir:
            valido = api.abrir_download_atualizacao(
                'https://github.com/leopresses/ExifRank-Releases/releases/download/v7.2.0/ExifRank_Installer.exe'
            )
            invalido = api.abrir_download_atualizacao('https://exemplo.com/arquivo.exe')

        self.assertTrue(valido['ok'])
        self.assertFalse(invalido['ok'])
        abrir.assert_called_once()


if __name__ == '__main__':
    unittest.main()
