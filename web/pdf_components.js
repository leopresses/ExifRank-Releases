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
        leftStack.push({ text: 'RELATÓRIO TÉCNICO', style: 'badge', background: PdfTheme.colors.primaryLight, margin: [0, 0, 0, 10] });
        leftStack.push({ text: 'Relatório técnico de\nSEO Local e EXIF', style: 'h1' });
        if (data.clientLogoBase64) {
            leftStack.push({
                columns: [
                    { width: 60, image: data.clientLogoBase64, fit: [54, 38], margin: [0, 0, 10, 0] },
                    {
                        width: '*',
                        stack: [
                            { text: 'CLIENTE', fontSize: 7, bold: true, color: PdfTheme.colors.textLight, characterSpacing: 0.5, margin: [0, 1, 0, 3] },
                            { text: data.clientName, fontSize: 12, bold: true, color: PdfTheme.colors.textMuted }
                        ]
                    }
                ],
                margin: [0, 10, 0, 0]
            });
        } else {
            leftStack.push({ text: `Cliente: ${data.clientName}`, fontSize: 12, bold: true, color: PdfTheme.colors.textMuted, margin: [0, 10, 0, 0] });
        }

        const rightStack = [];
        if (data.agencyLogoBase64) {
            rightStack.push({ image: data.agencyLogoBase64, fit: [92, 48], alignment: 'right', margin: [0, 0, 0, 9] });
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
                        width: 140, // Assinatura visual da agência
                        stack: rightStack
                    }
                ],
                margin: [0, 20, 0, 30] // Espaçamento após o hero
            }
        ];
    },

    buildValueProposition: function() {
        // Verde-petróleo mantém o contraste de um bloco executivo sem o peso
        // visual de um preto puro e aproxima o relatório da identidade ExifRank.
        const executiveCardColor = '#123B34';
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
                                        { text: 'O QUE FOI ORGANIZADO', style: 'h3', color: PdfTheme.colors.primaryLight, margin: [5, 15, 0, 5] }
                                    ]
                                },
                                { text: 'Este relatório registra a padronização técnica aplicada às mídias do projeto: informações de autoria, termos relevantes e, quando configuradas, referências da malha geográfica. Esses dados ajudam a manter o acervo visual organizado e alinhado com a estratégia de presença local do negócio.', color: PdfTheme.colors.white, fontSize: 10, lineHeight: 1.3 }
                            ],
                            fillColor: executiveCardColor,
                            padding: [20, 20, 20, 20],
                            border: [false, false, false, false]
                        }
                    ]
                ]
            },
            layout: {
                hLineWidth: function(i) { return i === 0 ? 3 : 0; },
                vLineWidth: function() { return 0; },
                hLineColor: function() { return PdfTheme.colors.primary; }
            },
            margin: [0, 0, 0, 30],
            unbreakable: true
        };
    },

    buildMetricsGrid: function(data) {
        const geographicPoints = Number(data.gpsLocationCount) || (data.hasGps ? 1 : 0);
        return [
            { text: 'RESUMO TÉCNICO DO PROJETO', style: 'h3' },
            {
                columns: [
                    {
                        width: '*',
                        stack: [
                            {
                                columns: [
                                    { width: 22, svg: PdfIcons.getSvg('camera', PdfTheme.colors.textMain), margin: [0, 5, 7, 0] },
                                    { width: 'auto', text: data.numPhotos.toString(), style: 'cardValue' }
                                ],
                                margin: [0, 0, 0, 8]
                            },
                            { text: 'MÍDIAS NA PASTA', style: 'cardTitle' }
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
                            {
                                columns: [
                                    { width: 22, svg: PdfIcons.getSvg('mapPin', PdfTheme.colors.textMain), margin: [0, 5, 7, 0] },
                                    { width: 'auto', text: geographicPoints.toString(), style: 'cardValue' }
                                ],
                                margin: [0, 0, 0, 8]
                            },
                            { text: 'PONTOS NA MALHA GEOGRÁFICA', style: 'cardTitle' }
                        ],
                        margin: [0,0,10,0],
                        padding: [15, 15, 15, 15],
                        fillColor: PdfTheme.colors.white,
                        border: [true, true, true, true]
                    },
                    {
                        width: '*',
                        stack: [
                            {
                                columns: [
                                    { width: 22, svg: PdfIcons.getSvg('key', PdfTheme.colors.textMain), margin: [0, 5, 7, 0] },
                                    { width: 'auto', text: data.keywordCount.toString(), style: 'cardValue' }
                                ],
                                margin: [0, 0, 0, 8]
                            },
                            { text: 'PALAVRAS-CHAVE DEFINIDAS', style: 'cardTitle' }
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
        const allKeywords = Array.isArray(data.keywords) ? data.keywords : [];
        const visibleKeywords = allKeywords.slice(0, 8);
        const hiddenKeywordsCount = Math.max(0, allKeywords.length - visibleKeywords.length);
        const gpsLocations = (Array.isArray(data.gpsLocations) ? data.gpsLocations : [])
            .filter(location => location && location.lat && location.lon);
        if (!gpsLocations.length && data.hasGps && data.lat && data.lon && data.lat !== 'Não informada' && data.lon !== 'Não informada') {
            gpsLocations.push({ name: 'Localização principal', lat: data.lat, lon: data.lon });
        }
        const gpsConfigured = gpsLocations.length > 0;

        // Exibimos os termos prioritários para preservar a leitura do relatório.
        // A métrica continua registrando a quantidade total definida no projeto.
        const tags = visibleKeywords.map(kw => {
            return {
                text: ` ${kw.toUpperCase()} `,
                fontSize: 8,
                bold: true,
                color: PdfTheme.colors.accentDark,
                background: PdfTheme.colors.accentLight,
                margin: [0, 2, 5, 2] // Adiciona um pequeno respiro no grid
            };
        });

        const keywordBlock = tags.length > 0
            ? {
                stack: [
                    { text: tags, lineHeight: 1.8 },
                    ...(hiddenKeywordsCount > 0 ? [{ text: `+ ${hiddenKeywordsCount} palavra${hiddenKeywordsCount === 1 ? '' : 's'}-chave definida${hiddenKeywordsCount === 1 ? '' : 's'} no projeto`, color: PdfTheme.colors.textMuted, fontSize: 8, italics: true, margin: [0, 8, 0, 0] }] : [])
                ]
            }
            : { text: 'Nenhuma palavra-chave definida neste projeto.', color: PdfTheme.colors.textLight, fontSize: 9 };

        const geographySummary = gpsConfigured
            ? {
                stack: [
                    { text: `${gpsLocations.length} ponto${gpsLocations.length === 1 ? '' : 's'} cadastrado${gpsLocations.length === 1 ? '' : 's'}`, fontSize: 16, bold: true, color: PdfTheme.colors.textMain, margin: [0, 0, 0, 7] },
                    { text: 'As referências completas aparecem organizadas na próxima seção.', color: PdfTheme.colors.textMuted, fontSize: 9, lineHeight: 1.25 }
                ],
                fillColor: PdfTheme.colors.bgLight,
                padding: [15, 15, 15, 15]
            }
            : {
                stack: [
                    { text: 'Sem pontos cadastrados', fontSize: 12, bold: true, color: PdfTheme.colors.textMain, margin: [0, 0, 0, 5] },
                    { text: 'Este projeto ainda não possui referências geográficas registradas.', color: PdfTheme.colors.textMuted, fontSize: 9, lineHeight: 1.25 }
                ],
                fillColor: PdfTheme.colors.bgLight,
                padding: [15, 15, 15, 15]
            };

        const summary = {
            columns: [
                {
                    width: '40%',
                    stack: [
                        { text: 'MALHA GEOGRÁFICA', style: 'h3' },
                        geographySummary
                    ]
                },
                {
                    width: '60%',
                    stack: [
                        { text: 'PALAVRAS-CHAVE PRIORITÁRIAS', style: 'h3' },
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

        if (!gpsConfigured) return summary;

        const geographyRows = gpsLocations.map((location, index) => {
            const fillColor = index % 2 === 0 ? PdfTheme.colors.bgLight : PdfTheme.colors.white;
            return [
                { text: location.name || `Localização ${index + 1}`, color: PdfTheme.colors.textMain, fontSize: 9, margin: [7, 7, 7, 7], fillColor },
                { text: String(location.lat), bold: true, color: PdfTheme.colors.secondary, fontSize: 9, margin: [7, 7, 7, 7], alignment: 'right', fillColor },
                { text: String(location.lon), bold: true, color: PdfTheme.colors.secondary, fontSize: 9, margin: [7, 7, 7, 7], alignment: 'right', fillColor }
            ];
        });

        const geographyDetails = {
            stack: [
                { text: 'MALHA GEOGRÁFICA', style: 'h3' },
                { text: `${gpsLocations.length} ponto${gpsLocations.length === 1 ? '' : 's'} geográfico${gpsLocations.length === 1 ? '' : 's'} registrado${gpsLocations.length === 1 ? '' : 's'} no projeto.`, color: PdfTheme.colors.textMuted, fontSize: 9, margin: [0, 0, 0, 4] },
                { text: 'A malha geográfica ajuda a contextualizar as mídias nas regiões atendidas e a manter as informações locais consistentes. No Google, relevância, distância e destaque também influenciam a visibilidade; essas referências não garantem posição isoladamente.', color: PdfTheme.colors.textMuted, fontSize: 8, lineHeight: 1.25, margin: [0, 0, 0, 12] },
                {
                    table: {
                        headerRows: 1,
                        dontBreakRows: true,
                        widths: ['50%', '25%', '25%'],
                        body: [
                            [
                                { text: 'LOCALIZAÇÃO', color: PdfTheme.colors.textMuted, fontSize: 8, bold: true, margin: [7, 7, 7, 7], fillColor: PdfTheme.colors.primaryLight },
                                { text: 'LATITUDE', color: PdfTheme.colors.textMuted, fontSize: 8, bold: true, margin: [7, 7, 7, 7], fillColor: PdfTheme.colors.primaryLight, alignment: 'right' },
                                { text: 'LONGITUDE', color: PdfTheme.colors.textMuted, fontSize: 8, bold: true, margin: [7, 7, 7, 7], fillColor: PdfTheme.colors.primaryLight, alignment: 'right' }
                            ],
                            ...geographyRows
                        ]
                    },
                    layout: {
                        hLineWidth: function (i, node) { return (i === 0 || i === node.table.body.length) ? 0 : 1; },
                        vLineWidth: function () { return 0; },
                        hLineColor: function () { return PdfTheme.colors.border; },
                        paddingLeft: function() { return 0; },
                        paddingRight: function() { return 0; },
                        paddingTop: function() { return 0; },
                        paddingBottom: function() { return 0; }
                    }
                }
            ],
            margin: [0, 0, 0, 24]
        };

        if (gpsLocations.length > 2) geographyDetails.pageBreak = 'before';
        return [summary, geographyDetails];
    },

    buildAIInsights: function(insightText) {
        return {
            unbreakable: true, // NUNCA dividir ao meio
            stack: [
                { text: 'ANÁLISE DO PROJETO', style: 'h3' },
                {
                    table: {
                        widths: ['*'],
                        body: [
                            [
                                {
                                    stack: [
                                        { svg: PdfIcons.getSvg('trendingUp', PdfTheme.colors.primaryDark), width: 32, alignment: 'right', opacity: 0.1, absolutePosition: {x: 500, y: 15} },
                                        { text: insightText || 'Análise indisponível no momento.', style: 'insightText' }
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
                { text: 'BOAS PRÁTICAS COMPLEMENTARES', style: 'h3' },
                {
                    columns: [
                        {
                            width: '*',
                            stack: [
                                {
                                    columns: [
                                        { width: 20, svg: PdfIcons.getSvg('checkCircle', PdfTheme.colors.primary), margin: [0, 2, 0, 0] },
                                        { stack: [ { text: 'Gestão de Avaliações', style: 'strategyItemTitle' }, { text: 'Respostas consistentes ajudam a manter o perfil atualizado.', style: 'smallText' } ] }
                                    ],
                                    margin: [0, 0, 0, 15],
                                    padding: [10, 10, 10, 10],
                                    fillColor: PdfTheme.colors.bgLight
                                },
                                {
                                    columns: [
                                        { width: 20, svg: PdfIcons.getSvg('checkCircle', PdfTheme.colors.primary), margin: [0, 2, 0, 0] },
                                        { stack: [ { text: 'Menções Regionais', style: 'strategyItemTitle' }, { text: 'Citações coerentes fortalecem a presença da marca na região.', style: 'smallText' } ] }
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
                                        { stack: [ { text: 'Consistência (NAP)', style: 'strategyItemTitle' }, { text: 'Dados alinhados facilitam a identificação do negócio.', style: 'smallText' } ] }
                                    ],
                                    margin: [0, 0, 0, 15],
                                    padding: [10, 10, 10, 10],
                                    fillColor: PdfTheme.colors.bgLight
                                },
                                {
                                    columns: [
                                        { width: 20, svg: PdfIcons.getSvg('checkCircle', PdfTheme.colors.primary), margin: [0, 2, 0, 0] },
                                        { stack: [ { text: 'Postagens Frequentes', style: 'strategyItemTitle' }, { text: 'Atualizações frequentes mantêm o perfil ativo para o público.', style: 'smallText' } ] }
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
    },

    buildNextSteps: function() {
        const steps = [
            ['1', 'Publicar com consistência', 'Use as mídias organizadas no Perfil da Empresa no Google e nos canais relevantes.'],
            ['2', 'Revisar os dados do perfil', 'Mantenha endereço, telefone, categoria e horários sempre atualizados.'],
            ['3', 'Acompanhar a presença local', 'Observe avaliações, interações e desempenho para ajustar a estratégia.']
        ];

        return {
            unbreakable: true,
            stack: [
                { text: 'PRÓXIMOS PASSOS', style: 'h3' },
                {
                    columns: steps.map(([number, title, description]) => ({
                        width: '*',
                        stack: [
                            { text: number, color: PdfTheme.colors.white, bold: true, fontSize: 9, alignment: 'center', fillColor: PdfTheme.colors.primary, margin: [0, 0, 0, 8] },
                            { text: title, style: 'strategyItemTitle', margin: [0, 0, 0, 5] },
                            { text: description, style: 'smallText', lineHeight: 1.2 }
                        ],
                        fillColor: PdfTheme.colors.bgLight,
                        padding: [12, 12, 12, 12],
                        margin: [0, 0, 8, 0]
                    })),
                    columnGap: 8
                },
                { text: 'Este documento registra a organização técnica do projeto. Resultados em plataformas de busca dependem de fatores externos e não são garantidos.', color: PdfTheme.colors.textLight, fontSize: 8, italics: true, margin: [0, 18, 0, 0], lineHeight: 1.2 }
            ],
            margin: [0, 0, 0, 20]
        };
    }
};

window.PdfComponents = PdfComponents;
