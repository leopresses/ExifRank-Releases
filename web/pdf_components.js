/**
 * pdf_components.js
 * Fábrica de componentes independentes e desacoplados para o PDF.
 * Cada função recebe dados puros e devolve uma estrutura JSON para o pdfmake.
 */

const PdfIcons = {
    getSvg: function(icon, color) {
        const icons = {
            lightbulb: `<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1.5.5 2.8 1.5 3.5.75.75 1.23 1.5 1.41 2.5"/></svg>`,
            camera: `<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`,
            mapPin: `<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`,
            key: `<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>`,
            trendingUp: `<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>`,
            checkCircle: `<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`
        };
        return icons[icon] || '';
    }
};

const PdfComponents = {
    
    buildHeader: function(agencyName) {
        // Retorna o cabeçalho que se repete em todas as páginas ou só a barra inicial
        return {
            canvas: [
                {
                    type: 'rect',
                    x: 0,
                    y: 0,
                    w: 595.28, // Largura do A4
                    h: 10,
                    color: PdfTheme.colors.primary // Barra colorida superior
                }
            ],
            absolutePosition: { x: 0, y: 0 }
        };
    },

    buildCover: function(data) {
        const leftStack = [];
        if (data.clientLogoBase64) {
            leftStack.push({ image: data.clientLogoBase64, fit: [120, 60], margin: [0, 0, 0, 15] });
        }
        leftStack.push({ text: 'OTIMIZAÇÃO 100% CONCLUÍDA', style: 'badge', background: PdfTheme.colors.primaryLight, margin: [0, 0, 0, 10] });
        leftStack.push({ text: 'Relatório de\nSEO Local (EXIF)', style: 'h1' });
        leftStack.push({ text: `Cliente: ${data.clientName}`, fontSize: 12, bold: true, color: PdfTheme.colors.textMuted, margin: [0, 5, 0, 0] });

        const rightStack = [];
        if (data.agencyLogoBase64) {
            rightStack.push({ image: data.agencyLogoBase64, fit: [140, 70], alignment: 'right', margin: [0, 0, 0, 12] });
        }
        rightStack.push({ text: data.agencyName, fontSize: 15, bold: true, alignment: 'right', color: PdfTheme.colors.textMain });
        rightStack.push({ text: data.date, style: 'smallText', alignment: 'right', margin: [0, 2, 0, 0] });

        return [
            {
                columns: [
                    {
                        width: '*',
                        stack: leftStack
                    },
                    {
                        width: 170, // Espaço fixo reservado para o lado da agência
                        stack: rightStack
                    }
                ],
                margin: [0, 20, 0, 30] // Espaçamento após o hero
            }
        ];
    },

    buildValueProposition: function() {
        return {
            table: {
                widths: ['*'],
                body: [
                    [
                        {
                            stack: [
                                {
                                    columns: [
                                        { svg: PdfIcons.getSvg('lightbulb', PdfTheme.colors.primaryLight), width: 14, margin: [0, 13, 0, 0] },
                                        { text: 'POR QUE ISSO IMPORTA? (O VALOR GERADO)', style: 'h3', color: PdfTheme.colors.primaryLight, margin: [5, 15, 0, 5] }
                                    ]
                                },
                                { text: 'A inteligência artificial do Google favorece negócios que provam sua existência no mundo real. Ao injetar coordenadas geográficas (GPS) invisíveis e o seu nicho de atuação diretamente no código fonte (EXIF) de cada foto sua, nós transformamos simples imagens em radares de busca local. Isso aumenta drasticamente a relevância do seu Perfil da Empresa no Google Maps, atraindo clientes que buscam pelo seu serviço na sua região.', color: PdfTheme.colors.white, fontSize: 10, lineHeight: 1.3 }
                            ],
                            fillColor: PdfTheme.colors.textMain,
                            padding: [20, 20, 20, 20],
                            border: [false, false, false, false]
                        }
                    ]
                ]
            },
            margin: [0, 0, 0, 30],
            unbreakable: true
        };
    },

    buildMetricsGrid: function(data) {
        return [
            { text: 'DESEMPENHO TÉCNICO (RESUMO)', style: 'h3' },
            {
                columns: [
                    {
                        width: '*',
                        stack: [
                            { svg: PdfIcons.getSvg('camera', PdfTheme.colors.textMain), width: 18, margin: [0, 0, 0, 5] },
                            { text: data.numPhotos.toString(), style: 'cardValue' },
                            { text: 'MÍDIAS PROCESSADAS', style: 'cardTitle' }
                        ],
                        margin: [0,0,10,0],
                        padding: [15, 15, 15, 15],
                        fillColor: PdfTheme.colors.white,
                        border: [true, true, true, true],
                        borderColor: [PdfTheme.colors.border, PdfTheme.colors.border, PdfTheme.colors.border, PdfTheme.colors.border]
                    },
                    {
                        width: '*',
                        stack: [
                            { svg: PdfIcons.getSvg('mapPin', PdfTheme.colors.textMain), width: 18, margin: [0, 0, 0, 5] },
                            { text: data.hasGps ? 'Sim' : 'Não', style: 'cardValue' },
                            { text: 'GEOTAGS INSERIDAS', style: 'cardTitle' }
                        ],
                        margin: [0,0,10,0],
                        padding: [15, 15, 15, 15],
                        fillColor: PdfTheme.colors.white,
                        border: [true, true, true, true]
                    },
                    {
                        width: '*',
                        stack: [
                            { svg: PdfIcons.getSvg('key', PdfTheme.colors.textMain), width: 18, margin: [0, 0, 0, 5] },
                            { text: data.keywordCount.toString(), style: 'cardValue' },
                            { text: 'KEYWORDS OTIMIZADAS', style: 'cardTitle' }
                        ],
                        padding: [15, 15, 15, 15],
                        fillColor: PdfTheme.colors.white,
                        border: [true, true, true, true]
                    }
                ],
                columnGap: 10,
                margin: [0, 0, 0, 30],
                unbreakable: true
            }
        ];
    },

    buildKeywordsAndGps: function(data) {
        
        // Formatar as keywords em pequenos retângulos (tags). 
        // pdfmake permite definir inline text fields com background color e margins,
        // gerando o efeito de tag que wrappa automaticamente de linha ou de página.
        const tags = data.keywords.map(kw => {
            return {
                text: ` ${kw.toUpperCase()} `,
                fontSize: 8,
                bold: true,
                color: PdfTheme.colors.accentDark,
                background: PdfTheme.colors.accentLight,
                margin: [0, 2, 5, 2] // Adiciona um pequeno respiro no grid
            };
        });

        const keywordBlock = tags.length > 0 ? { text: tags, lineHeight: 1.8 } : { text: 'Nenhuma palavra-chave injetada.', color: PdfTheme.colors.textLight, fontSize: 9 };

        return {
            columns: [
                {
                    width: '40%',
                    stack: [
                        { text: 'COORDENADAS DE GPS', style: 'h3' },
                        {
                            table: {
                                widths: ['auto', '*'],
                                body: [
                                    [{ text: 'Latitude:', color: PdfTheme.colors.textLight, fontSize: 10, margin: [5, 5, 5, 5], border: [false, false, false, true], borderColor: ['', '', '', PdfTheme.colors.border] }, { text: data.lat || '-', bold: true, color: PdfTheme.colors.secondary, margin: [5, 5, 5, 5], alignment: 'right', border: [false, false, false, true], borderColor: ['', '', '', PdfTheme.colors.border] }],
                                    [{ text: 'Longitude:', color: PdfTheme.colors.textLight, fontSize: 10, margin: [5, 5, 5, 5], border: [false, false, false, false] }, { text: data.lon || '-', bold: true, color: PdfTheme.colors.secondary, margin: [5, 5, 5, 5], alignment: 'right', border: [false, false, false, false] }]
                                ]
                            },
                            layout: {
                                hLineWidth: function (i, node) { return (i === 0 || i === node.table.body.length) ? 0 : 1; },
                                vLineWidth: function (i) { return 0; },
                                hLineColor: function (i) { return PdfTheme.colors.border; },
                                paddingLeft: function(i) { return 10; },
                                paddingRight: function(i, node) { return 10; },
                                paddingTop: function(i, node) { return 10; },
                                paddingBottom: function(i, node) { return 10; }
                            },
                            fillColor: PdfTheme.colors.bgLight,
                            margin: [0, 0, 15, 0],
                        }
                    ]
                },
                {
                    width: '60%',
                    stack: [
                        { text: 'PALAVRAS-CHAVE INJETADAS', style: 'h3' },
                        {
                            stack: [
                                keywordBlock
                            ],
                            padding: [15, 15, 15, 15],
                            border: [true, true, true, true],
                            borderColor: [PdfTheme.colors.border, PdfTheme.colors.border, PdfTheme.colors.border, PdfTheme.colors.border]
                        }
                    ]
                }
            ],
            margin: [0, 0, 0, 30]
        };
    },

    buildAIInsights: function(insightText) {
        return {
            unbreakable: true, // NUNCA dividir ao meio
            stack: [
                { text: 'PROJEÇÃO DE IMPACTO (IA)', style: 'h3' },
                {
                    table: {
                        widths: ['*'],
                        body: [
                            [
                                {
                                    stack: [
                                        { svg: PdfIcons.getSvg('trendingUp', PdfTheme.colors.primaryDark), width: 32, alignment: 'right', opacity: 0.1, absolutePosition: {x: 500, y: 15} },
                                        { text: insightText || 'Analisando projeções...', style: 'insightText' }
                                    ],
                                    fillColor: PdfTheme.colors.primaryLight,
                                    padding: [20, 20, 20, 20],
                                    border: [false, false, false, false]
                                }
                            ]
                        ]
                    },
                    margin: [0, 0, 0, 30]
                }
            ]
        };
    },

    buildStrategiesChecklist: function() {
        return {
            unbreakable: true,
            stack: [
                { text: 'FATORES DE AUTORIDADE LOCAL', style: 'h3' },
                {
                    columns: [
                        {
                            width: '*',
                            stack: [
                                {
                                    columns: [
                                        { width: 20, svg: PdfIcons.getSvg('checkCircle', PdfTheme.colors.primary), margin: [0, 2, 0, 0] },
                                        { stack: [ { text: 'Gestão de Avaliações', style: 'strategyItemTitle' }, { text: 'Respostas estratégicas reforçam o perfil.', style: 'smallText' } ] }
                                    ],
                                    margin: [0, 0, 0, 15],
                                    padding: [10, 10, 10, 10],
                                    fillColor: PdfTheme.colors.bgLight
                                },
                                {
                                    columns: [
                                        { width: 20, svg: PdfIcons.getSvg('checkCircle', PdfTheme.colors.primary), margin: [0, 2, 0, 0] },
                                        { stack: [ { text: 'Menções Regionais', style: 'strategyItemTitle' }, { text: 'Sinal de autoridade externa da marca.', style: 'smallText' } ] }
                                    ],
                                    padding: [10, 10, 10, 10],
                                    fillColor: PdfTheme.colors.bgLight
                                }
                            ],
                            margin: [0, 0, 10, 0]
                        },
                        {
                            width: '*',
                            stack: [
                                {
                                    columns: [
                                        { width: 20, svg: PdfIcons.getSvg('checkCircle', PdfTheme.colors.primary), margin: [0, 2, 0, 0] },
                                        { stack: [ { text: 'Consistência (NAP)', style: 'strategyItemTitle' }, { text: 'Dados sempre alinhados blindam o ranking.', style: 'smallText' } ] }
                                    ],
                                    margin: [0, 0, 0, 15],
                                    padding: [10, 10, 10, 10],
                                    fillColor: PdfTheme.colors.bgLight
                                },
                                {
                                    columns: [
                                        { width: 20, svg: PdfIcons.getSvg('checkCircle', PdfTheme.colors.primary), margin: [0, 2, 0, 0] },
                                        { stack: [ { text: 'Postagens Frequentes', style: 'strategyItemTitle' }, { text: 'Atualizações ativam engajamento do cliente.', style: 'smallText' } ] }
                                    ],
                                    padding: [10, 10, 10, 10],
                                    fillColor: PdfTheme.colors.bgLight
                                }
                            ]
                        }
                    ],
                    margin: [0, 0, 0, 30]
                }
            ]
        };
    }
};

window.PdfComponents = PdfComponents;
