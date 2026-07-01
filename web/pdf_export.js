/**
 * pdf_export.js
 * Interface de exportação e comunicação com o backend (PyWebView).
 * Não possui regras de negócio ou de layout.
 */

const PdfExporter = {
    /**
     * @param {Object} reportData Objeto de dados purificado
     */
    generateAndSave: async function(reportData) {
        try {
            // 1. Constrói a definição do documento via Engine
            const docDefinition = PdfEngine.buildDocument(reportData);

            // 2. Chama a engine do pdfmake para gerar o Base64
            const pdfDocGenerator = pdfMake.createPdf(docDefinition);

            pdfDocGenerator.getBase64(async (dataBase64) => {
                const filename = `Relatorio_SEO_${reportData.clientName || 'Projeto'}.pdf`;

                // 3. Envia o Base64 para o backend salvar silenciosamente
                if (window.pywebview && window.pywebview.api && window.pywebview.api.salvar_pdf) {
                    // Adicionamos o prefixo esperado pelo python caso não tenha
                    const fullBase64 = `data:application/pdf;base64,${dataBase64}`;
                    const res = await window.pywebview.api.salvar_pdf(fullBase64, filename);
                    
                    if (res.ok) {
                        if(typeof showToast === 'function') showToast("Relatório salvo com sucesso!", "success");
                        if(typeof closeReportModal === 'function') closeReportModal();
                    } else if (!res.cancelado) {
                        throw new Error(res.erro || "Falha ao salvar o arquivo pelo sistema.");
                    }
                } else {
                    // Fallback de navegador caso PyWebView não esteja disponível
                    pdfDocGenerator.download(filename);
                    if(typeof showToast === 'function') showToast("Relatório baixado no navegador!", "success");
                    if(typeof closeReportModal === 'function') closeReportModal();
                }
            });

        } catch (e) {
            console.error("Erro fatal na geração do PDF:", e);
            alert("Erro ao gerar PDF: " + e.message);
        }
    }
};

window.PdfExporter = PdfExporter;
