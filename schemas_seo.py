from pydantic import BaseModel, Field, field_validator
from typing import List, Dict, Any, Optional

# ==============================================================================
# STAGE 1: VISION OUTPUT (Raw Data Extracted from Images)
# ==============================================================================

class ReviewData(BaseModel):
    autor: str = ""
    texto: str = ""
    respondida: bool = False
    resposta_tem_palavra_chave: bool = False

class RankingData(BaseModel):
    termo_pesquisado: str = ""
    posicao_atual: int = 0
    posicao_anterior: Optional[int] = None

class InteracoesData(BaseModel):
    chamadas: int = 0
    rotas: int = 0
    cliques_site: int = 0
    mensagens: int = 0
    visualizacoes_perfil: int = 0
    pesquisas: int = 0

class VisionOutputSchema(BaseModel):
    empresa: str = Field(default="", description="Nome da empresa analisada")
    nota: float = Field(default=0.0, description="Nota média da ficha (ex: 4.8)")
    avaliacoes: int = Field(default=0, description="Quantidade total de avaliações")
    novas_avaliacoes: List[ReviewData] = Field(default_factory=list)
    palavras_chave: List[str] = Field(default_factory=list)
    ranking: List[RankingData] = Field(default_factory=list)
    interacoes: InteracoesData = Field(default_factory=InteracoesData)
    graficos_tendencia: Dict[str, str] = Field(default_factory=dict, description="Tendências observadas visualmente (ex: alta, queda)")
    insights_visuais: List[str] = Field(default_factory=list, description="Qualquer outro dado detectado no print, sem análise profunda.")

    @field_validator('nota')
    @classmethod
    def validar_nota(cls, v):
        if v < 0.0 or v > 5.0:
            return 0.0 # Force safe fallback
        return v

    @field_validator('avaliacoes')
    @classmethod
    def validar_avaliacoes(cls, v):
        if v < 0:
            return 0
        return v

# ==============================================================================
# STAGE 2: ANALYSIS OUTPUT (Processed Data & Deltas)
# ==============================================================================

class EvolucaoRanking(BaseModel):
    termo: str
    posicao_atual: int
    posicao_anterior: Optional[int]
    status: str # "subiu", "caiu", "manteve", "novo"
    delta: int # ex: +2, -1, 0

class AnalysisOutputSchema(BaseModel):
    empresa: str
    nota: float
    avaliacoes: int
    interacoes_totais: int
    interacoes_detalhe: InteracoesData
    taxa_resposta_avaliacoes: float # percentual
    qualidade_respostas_seo: float # percentual de respostas com palavras-chave
    rankings_processados: List[EvolucaoRanking]
    palavras_chave_principais: List[str]
    tendencia_geral: str # "Crescimento", "Queda", "Estável"
    inconsistencias_detectadas: List[str]

# ==============================================================================
# STAGE 3: INSIGHTS OUTPUT (Rich Structure for Copywriter)
# ==============================================================================

class IndicadorSEO(BaseModel):
    nome: str
    estrelas: int # 1 a 5
    valor_referencia: str
    justificativa: str

class OportunidadeFinanceira(BaseModel):
    titulo: str
    situacao_atual: str
    potencial: str
    impactos_estimados: List[str]

class EventoAcionavel(BaseModel):
    tipo: str # ex: "Entrou no Top 3", "Queda de tráfego"
    prioridade: str # "Alta", "Média", "Baixa"
    impacto: str
    descricao: str
    acao_recomendada: str

class InsightsOutputSchema(BaseModel):
    empresa: str
    resumo_executivo: str
    indicadores: List[IndicadorSEO]
    ganhos_obtidos: List[str]
    mudancas_relevantes: List[str]
    riscos_identificados: List[str]
    oportunidades_financeiras: List[OportunidadeFinanceira]
    insights_estrategicos: List[EventoAcionavel]
    plano_acao_sugerido: List[str]

