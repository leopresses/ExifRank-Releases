import json
import os
import shutil
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
