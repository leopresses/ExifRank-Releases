let auditImagesBase64 = [];

function handleAuditFiles(files) {
    const previewContainer = document.getElementById("audit-image-preview");
    
    // Limite de 4 imagens
    const filesToProcess = Array.from(files).slice(0, 4 - auditImagesBase64.length);
    
    if (files.length > 4 || auditImagesBase64.length >= 4) {
        showToast("Limite de 4 imagens por auditoria.", "warning");
    }

    filesToProcess.forEach(file => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const b64 = e.target.result;
            auditImagesBase64.push(b64);
            
            // Adicionar thumbnail na tela
            previewContainer.classList.remove("hidden");
            const div = document.createElement("div");
            div.className = "relative w-16 h-16 rounded-lg overflow-hidden border border-slate-200 shadow-sm";
            div.innerHTML = `
                <img src="${b64}" class="w-full h-full object-cover">
                <button onclick="removeAuditImage(${auditImagesBase64.length - 1}, event)" class="absolute top-0.5 right-0.5 bg-red-500 text-white rounded-full p-0.5 hover:bg-red-600 transition-colors">
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
            `;
            previewContainer.appendChild(div);
        };
        reader.readAsDataURL(file);
    });
}

function removeAuditImage(index, event) {
    event.stopPropagation();
    auditImagesBase64.splice(index, 1);
    
    // Re-render preview
    const previewContainer = document.getElementById("audit-image-preview");
    previewContainer.innerHTML = '';
    
    if(auditImagesBase64.length === 0) {
        previewContainer.classList.add("hidden");
        return;
    }
    
    auditImagesBase64.forEach((b64, i) => {
        const div = document.createElement("div");
        div.className = "relative w-16 h-16 rounded-lg overflow-hidden border border-slate-200 shadow-sm";
        div.innerHTML = `
            <img src="${b64}" class="w-full h-full object-cover">
            <button onclick="removeAuditImage(${i}, event)" class="absolute top-0.5 right-0.5 bg-red-500 text-white rounded-full p-0.5 hover:bg-red-600 transition-colors">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
        `;
        previewContainer.appendChild(div);
    });
}

// Drag and drop setup
setTimeout(() => {
    const dropzone = document.getElementById("audit-dropzone");
    if(dropzone) {
        dropzone.addEventListener("dragover", (e) => {
            e.preventDefault();
            dropzone.classList.add("bg-emerald-50", "border-emerald-300");
        });
        dropzone.addEventListener("dragleave", (e) => {
            e.preventDefault();
            dropzone.classList.remove("bg-emerald-50", "border-emerald-300");
        });
        dropzone.addEventListener("drop", (e) => {
            e.preventDefault();
            dropzone.classList.remove("bg-emerald-50", "border-emerald-300");
            if(e.dataTransfer.files) {
                handleAuditFiles(e.dataTransfer.files);
            }
        });
    }

    // Suporte para Ctrl+V (Paste) globalmente, mas só processa se a view-audit estiver visível
    document.addEventListener("paste", (e) => {
        const viewAudit = document.getElementById("view-audit");
        if (viewAudit && !viewAudit.classList.contains("hidden")) {
            const items = (e.clipboardData || e.originalEvent.clipboardData).items;
            const files = [];
            for (let index in items) {
                const item = items[index];
                if (item.kind === 'file' && item.type.startsWith('image/')) {
                    const blob = item.getAsFile();
                    files.push(blob);
                }
            }
            if (files.length > 0) {
                e.preventDefault();
                handleAuditFiles(files);
            }
        }
    });

}, 1000);

async function gerarAuditoriaVision() {
    const nicho = document.getElementById("audit-nicho").value.trim();
    const local = document.getElementById("audit-local").value.trim();
    
    if(!nicho || !local) {
        showToast("Preencha o nicho e a localização.", "error");
        return;
    }
    
    if(auditImagesBase64.length === 0) {
        showToast("Anexe ao menos 1 print do perfil do cliente.", "error");
        return;
    }

    const btn = document.getElementById("btn-gerar-audit");
    const originalHtml = btn.innerHTML;
    btn.innerHTML = "⏳ Analisando...";
    btn.disabled = true;

    try {
        const res = await window.pywebview.api.groq_audit_vision(nicho, local, auditImagesBase64);
        if(res.erro) {
            showToast("Erro na Auditoria: " + res.erro, "error");
        } else {
            // Sucesso! Mostrar resultado
            document.getElementById("audit-result-container").classList.remove("hidden");
            document.getElementById("btn-export-audit").classList.remove("hidden");
            
            let htmlText = res.resultado
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*(.*?)\*/g, '<em>$1</em>')
                .replace(/### (.*?)\n/g, '<h3>$1</h3>')
                .replace(/## (.*?)\n/g, '<h2>$1</h2>')
                .replace(/# (.*?)\n/g, '<h1>$1</h1>')
                .replace(/\n- (.*?)/g, '<br>• $1')
                .replace(/\n/g, '<br>');
                
            document.getElementById("audit-result-text").innerHTML = htmlText;
            document.getElementById("btn-nova-audit").classList.remove("hidden");
            showToast("Auditoria gerada com sucesso!", "success");
            
            // Salvar no Histórico Automaticamente
            const auditData = {
                nicho: nicho,
                localizacao: local,
                resultado_html: htmlText
            };
            window.pywebview.api.salvar_auditoria(auditData).then(res => {
                if(res.ok && currentUser) {
                    setCloudSyncStatus('syncing');
                    db.collection("users").doc(currentUser.uid).collection("auditorias").doc(res.auditoria.id).set(res.auditoria)
                        .then(() => setCloudSyncStatus('ok'))
                        .catch(e => setCloudSyncStatus('error', e.message));
                }
            }).catch(e => console.log("Erro ao salvar histórico", e));
        }
    } catch (e) {
        showToast("Falha ao comunicar com IA: " + e.message, "error");
    } finally {
        btn.innerHTML = originalHtml;
        btn.disabled = false;
    }
}

function novaAuditoria() {
    // Reseta campos
    document.getElementById("audit-nicho").value = "";
    document.getElementById("audit-local").value = "";
    
    // Reseta imagens
    auditImagesBase64 = [];
    const previewContainer = document.getElementById("audit-image-preview");
    if(previewContainer) {
        previewContainer.innerHTML = "";
        previewContainer.classList.add("hidden");
    }
    
    // Reseta botões e resultados
    document.getElementById("audit-result-container").classList.add("hidden");
    document.getElementById("audit-result-text").innerHTML = "";
    document.getElementById("btn-export-audit").classList.add("hidden");
    document.getElementById("btn-nova-audit").classList.add("hidden");
    
    // Rolar para o topo
    const viewAudit = document.getElementById("view-audit");
    if(viewAudit) viewAudit.scrollTop = 0;
}

function exportAuditPDF() {
    const conteudo = document.getElementById("audit-result-text").innerHTML;
    const nicho = document.getElementById("audit-nicho").value || "Nicho";
    const local = document.getElementById("audit-local").value || "Local";
    
    // Configura o botão como carregando
    const btn = document.getElementById("btn-export-audit");
    const originalHtml = btn.innerHTML;
    btn.innerHTML = "⏳ Gerando PDF...";
    btn.disabled = true;

    // Busca logo da agência caso exista
    const agencyLogo = window.currentAgencyLogoBase64 || null;
    const agencyNameText = window.currentAgencyName || "Agência Parceira";
    
    const headerContent = agencyLogo 
        ? `<div style="text-align: center; margin-bottom: 40px;">
                <div style="display: inline-block; text-align: center;">
                    <img src="${agencyLogo}" style="max-height: 60px; vertical-align: middle; margin-right: 15px;" />
                    <span style="font-size: 22px; font-weight: bold; color: #333; vertical-align: middle;">${agencyNameText}</span>
                </div>
           </div>
           <div style="text-align: center; margin-bottom: 50px;">
                <h1 style="color: #059669; border-bottom: 2px solid #059669; padding-bottom: 10px; margin: 0 0 10px 0; font-size: 28px;">Diagnóstico Estratégico GMB</h1>
                <p style="margin: 0; color: #666; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">${nicho} | ${local}</p>
           </div>`
        : `<div style="text-align: center; margin-bottom: 50px;">
                <h1 style="color: #059669; border-bottom: 2px solid #059669; padding-bottom: 10px; margin: 0 0 10px 0; font-size: 28px;">Diagnóstico Estratégico GMB</h1>
                <p style="margin: 0; color: #666; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">${nicho} | ${local}</p>
           </div>`;

    // Cria um container temporário para formatar a exportação
    const element = document.createElement('div');
    element.innerHTML = `
        <div style="font-family: Arial, sans-serif; padding: 40px; color: #333; line-height: 1.6;">
            ${headerContent}
            ${conteudo}
        </div>
    `;

    // Aplica estilos CSS inline para as tags que vieram do Markdown para manter a cor no Canvas
    const h1s = element.querySelectorAll('h1');
    h1s.forEach(h => { h.style.color = '#059669'; h.style.marginTop = '30px'; h.style.fontSize = '24px'; });
    const h2s = element.querySelectorAll('h2');
    h2s.forEach(h => { h.style.color = '#047857'; h.style.marginTop = '25px'; h.style.fontSize = '20px'; });
    const h3s = element.querySelectorAll('h3');
    h3s.forEach(h => { h.style.color = '#065f46'; h.style.marginTop = '20px'; h.style.fontSize = '18px'; });
    const strongs = element.querySelectorAll('strong');
    strongs.forEach(s => { s.style.color = '#111'; });
    
    // Evitar quebra de página grosseira
    const blocks = element.querySelectorAll('p, h1, h2, h3, h4, li, div');
    blocks.forEach(b => { 
        b.style.pageBreakInside = 'avoid'; 
        b.style.breakInside = 'avoid'; 
    });

    const opt = {
        margin:       15,
        filename:     `Auditoria_${nicho}_${local}.pdf`.replace(/ /g, "_"),
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true, letterRendering: true },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak:    { mode: ['avoid-all', 'css', 'legacy'] }
    };

    // Gera o PDF como base64 (string) e envia para o backend do Python abrir a janela Salvar Como do Windows
    html2pdf().set(opt).from(element).outputPdf('datauristring').then(function(pdfBase64) {
        window.pywebview.api.salvar_pdf(pdfBase64, opt.filename).then(res => {
            btn.innerHTML = originalHtml;
            btn.disabled = false;
            
            if(res.ok) {
                showToast("PDF salvo com sucesso!", "success");
            } else if (!res.cancelado) {
                showToast("Erro ao salvar PDF: " + res.erro, "error");
            }
        });
    }).catch(err => {
        btn.innerHTML = originalHtml;
        btn.disabled = false;
        showToast("Erro ao gerar PDF internamente.", "error");
    });
}

