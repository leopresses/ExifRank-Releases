import sys

file_path = 'web/main.source.js'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

marker = '            const dbHwid = doc.data().hardware_id;'

if marker in content:
    parts = content.split(marker)
    
    missing_code = """
            if (!dbHwid) {
                if (hwid) {
                    db.collection("users").doc(uid).update({ hardware_id: hwid }).catch(()=>{});
                }
                overlay.classList.add("hidden");
            } else if (dbHwid === hwid) {
                overlay.classList.add("hidden");
            } else {
                overlay.classList.remove("hidden");
                const lockMsg = document.getElementById("premium-lock-msg");
                const lockBtn = document.getElementById("btn-assinar-premium");
                if (lockMsg) {
                    lockMsg.innerHTML = `<span class="font-bold">⚠️ LICENÇA BLOQUEADA:</span><br>Esta conta Premium já está ativada em outro computador. O limite é de 1 máquina por licença.`;
                }
                if (lockBtn) lockBtn.classList.add("hidden");
            }
        } else {
            overlay.classList.remove("hidden");
        }
    });
}

async function assinarPremium() {
    if (!currentUser) {
        showToast("Você precisa fazer login no Google primeiro para assinar.", "error");
        return;
    }
    
    const btn = document.getElementById("btn-assinar-premium");
    if(btn) {
        btn.innerHTML = `⏳ Redirecionando...`;
    }

    try {
        const checkoutUrl = `https://pay.kiwify.com.br/nOURNRj?email=${encodeURIComponent(currentUser.email)}`;
        window.open(checkoutUrl, "_blank");
        
        setTimeout(() => {
            if(btn) btn.innerHTML = `Ir para o Pagamento`;
        }, 2000);
    } catch (e) {
        console.error(e);
        showToast("Erro ao abrir checkout.", "error");
    }
}

async function saveAgencyName() {
    const input = document.getElementById("agency-name-input");
    if (!input) return;
    const val = input.value.trim();
    window.currentAgencyName = val;
    await window.pywebview.api.salvar_nome_agencia(val);
}

async function handleAgencyLogoUpload(input) {
    if(!input.files || input.files.length === 0) return;
    const file = input.files[0];
    if(file.size > 2 * 1024 * 1024) {
        showToast("A imagem deve ter no máximo 2MB", "error");
        return;
    }
"""
    next_marker = '    const reader = new FileReader();'
    if next_marker in parts[1]:
        tail = parts[1].split(next_marker, 1)[1]
        new_content = parts[0] + marker + missing_code + next_marker + tail
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print('SUCCESS')
    else:
        print('ERROR next')
else:
    print('ERROR first')
