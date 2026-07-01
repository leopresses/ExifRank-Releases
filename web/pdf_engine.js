/**
 * pdf_engine.js
 * Motor de montagem do PDF.
 * Conecta os componentes e constrói a definição final do documento (docDefinition) para o pdfmake.
 */

const PdfEngine = {
    /**
     * @param {Object} reportData Modelo de dados único contendo todas as informações do projeto
     * @returns {Object} docDefinition para ser processado pelo pdfmake
     */
    buildDocument: function(reportData) {
        
        // Inicializa o conteúdo com o array vazio
        const content = [];

        // 1. Capa / Hero
        content.push(PdfComponents.buildCover(reportData));

        // 2. Proposta de Valor
        content.push(PdfComponents.buildValueProposition());

        // 3. Grid de Métricas
        content.push(PdfComponents.buildMetricsGrid(reportData));

        // 4. GPS e Palavras-Chave (Fluxo contínuo)
        content.push(PdfComponents.buildKeywordsAndGps(reportData));

        // 5. Insights IA
        content.push(PdfComponents.buildAIInsights(reportData.aiInsights));

        // 6. Estratégias e Autoridade
        content.push(PdfComponents.buildStrategiesChecklist());

        // Montagem do documento final
        const docDefinition = {
            pageSize: 'A4',
            pageOrientation: 'portrait',
            pageMargins: PdfTheme.margins.page,
            defaultStyle: PdfStyles.defaultStyle,
            styles: PdfStyles.styles,
            
            // Cabeçalho Global (Barra Superior)
            header: function(currentPage, pageCount, pageSize) {
                return PdfComponents.buildHeader();
            },

            // Rodapé Global com Paginação e Regras White-label puras
            footer: function(currentPage, pageCount) {
                // --- AVALIAÇÃO PURA (Criação de objeto novo a cada página) ---
                let validBase64Logo = null;
                if (reportData.agencyLogoBase64 && typeof reportData.agencyLogoBase64 === 'string') {
                    if (reportData.agencyLogoBase64.startsWith('data:image/')) {
                        validBase64Logo = reportData.agencyLogoBase64;
                    }
                }
        
                let agencyName = reportData.agencyName || "";
                if (agencyName.toUpperCase() === "EXIFRANK") agencyName = "";
                const validName = agencyName.trim() !== "" ? agencyName : null;
        
                let rightColumnStack = [];
                if (validName && validBase64Logo) {
                    rightColumnStack = [
                        { text: `POWERED BY ${validName.toUpperCase()}`, style: 'footerText', margin: [0, 0, 0, 4] },
                        { image: validBase64Logo, width: 60, alignment: 'right' }
                    ];
                } else if (validName && !validBase64Logo) {
                    rightColumnStack = [
                        { text: 'POWERED BY', style: 'footerText', margin: [0, 0, 0, 2] },
                        { text: validName, style: 'footerAgency' }
                    ];
                } else if (!validName && validBase64Logo) {
                    rightColumnStack = [
                        { text: 'POWERED BY EXIFRANK', style: 'footerText', margin: [0, 0, 0, 4] },
                        { image: validBase64Logo, width: 60, alignment: 'right' }
                    ];
                } else {
                    rightColumnStack = [
                        { text: 'POWERED BY', style: 'footerText', margin: [0, 0, 0, 2] },
                        { text: 'ExifRank', style: 'footerAgency' }
                    ];
                }

                return {
                    stack: [
                        {
                            canvas: [
                                // Linha corrigida (0 até 515.28, pois já está dentro da margem de 40pt)
                                { type: 'line', x1: 0, y1: 0, x2: 515.28, y2: 0, lineWidth: 1, lineColor: PdfTheme.colors.border }
                            ],
                            margin: [0, 0, 0, 10]
                        },
                        {
                            columns: [
                                {
                                    width: '*',
                                    stack: [
                                        { text: 'DOCUMENTO CONFIDENCIAL', style: 'footerText', margin: [0, 0, 0, 2] },
                                        { text: 'Auditoria Tecnológica de SEO Local & EXIF', fontSize: 9, color: PdfTheme.colors.textMuted }
                                    ]
                                },
                                {
                                    width: '*',
                                    stack: [
                                        { text: `PÁGINA ${currentPage}/${pageCount}`, style: 'footerText', alignment: 'center', margin: [0, 4, 0, 0] }
                                    ]
                                },
                                {
                                    width: '*',
                                    stack: rightColumnStack,
                                    alignment: 'right'
                                }
                            ],
                            // Margens removidas para evitar overflow no pdfmake (o footer já herda as margens da página)
                            margin: [0, 0, 0, 0] 
                        }
                    ],
                    // A numeração de página precisa desta margem lateral para casar perfeitamente com a content area
                    margin: [40, 0, 40, 0]
                };
            },
            
            // O conteúdo fatiado
            content: content
        };

        return docDefinition;
    }
};

window.PdfEngine = PdfEngine;
