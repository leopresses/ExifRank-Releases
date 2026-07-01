/**
 * pdf_styles.js
 * Centralização do Tema, Cores, Tipografia e Layout (Style Dictionary)
 */

const PdfTheme = {
    colors: {
        primary: '#10B981',     // Emerald 500
        primaryLight: '#D1FAE5',// Emerald 100
        primaryDark: '#047857', // Emerald 700
        secondary: '#3B82F6',   // Blue 500
        secondaryLight: '#DBEAFE', // Blue 100
        accent: '#F59E0B',      // Amber 500
        accentLight: '#FEF3C7', // Amber 100
        accentDark: '#B45309',  // Amber 700
        textMain: '#0F172A',    // Slate 900
        textMuted: '#64748B',   // Slate 500
        textLight: '#94A3B8',   // Slate 400
        border: '#E2E8F0',      // Slate 200
        bgLight: '#F8FAFC',     // Slate 50
        white: '#FFFFFF'
    },
    margins: {
        page: [40, 50, 40, 50], // [left, top, right, bottom]
        section: [0, 15, 0, 15],
        element: [0, 5, 0, 5]
    }
};

const PdfStyles = {
    defaultStyle: {
        font: 'Roboto',
        fontSize: 10,
        color: PdfTheme.colors.textMain,
        lineHeight: 1.2
    },
    styles: {
        // Cabeçalhos e Títulos
        h1: { fontSize: 24, bold: true, color: PdfTheme.colors.textMain, margin: [0, 0, 0, 4], lineHeight: 1.1 },
        h2: { fontSize: 18, bold: true, color: PdfTheme.colors.textMain, margin: [0, 15, 0, 5] },
        h3: { fontSize: 11, bold: true, color: PdfTheme.colors.primary, margin: [0, 15, 0, 5], textTransform: 'uppercase' },
        
        // Textos Base
        bodyText: { fontSize: 10, color: PdfTheme.colors.textMuted, lineHeight: 1.4 },
        smallText: { fontSize: 8, color: PdfTheme.colors.textLight },
        
        // Destaques e Emblemas
        badge: {
            fontSize: 9,
            bold: true,
            color: PdfTheme.colors.primaryDark,
            fillColor: PdfTheme.colors.primaryLight,
            margin: [0, 0, 0, 10],
        },
        
        // Elementos Modulares
        cardBox: {
            margin: [0, 0, 0, 10]
        },
        cardTitle: {
            fontSize: 8,
            bold: true,
            color: PdfTheme.colors.textMuted,
            margin: [0, 5, 0, 0]
        },
        cardValue: {
            fontSize: 22,
            bold: true,
            color: PdfTheme.colors.textMain,
            margin: [0, 0, 0, 2]
        },
        
        // Palavras-chave
        keywordTag: {
            fontSize: 8,
            bold: true,
            color: PdfTheme.colors.accentDark,
            fillColor: PdfTheme.colors.accentLight,
            margin: [2, 2, 2, 2]
        },
        
        // Insights Box
        insightBox: {
            fillColor: '#ECFDF5', // Emerald 50
            margin: [0, 0, 0, 15]
        },
        insightText: {
            fontSize: 11,
            color: '#065F46', // Emerald 800
            lineHeight: 1.4,
            bold: true
        },

        // Estratégias
        strategyItemTitle: {
            fontSize: 10,
            bold: true,
            color: PdfTheme.colors.textMain,
            margin: [0, 0, 0, 2]
        },
        strategyItemDesc: {
            fontSize: 9,
            color: PdfTheme.colors.textMuted,
            lineHeight: 1.3
        },
        
        // Rodapé e Paginação
        footerText: {
            fontSize: 8,
            color: PdfTheme.colors.textLight,
            bold: true
        },
        footerAgency: {
            fontSize: 10,
            color: PdfTheme.colors.textMain,
            bold: true
        }
    }
};

window.PdfTheme = PdfTheme;
window.PdfStyles = PdfStyles;
