// PAINEL DE ADMINISTRAÇÃO
// ==========================================
async function loadAdminData() {
    if (!currentUser || currentUser.email !== 'lpresses17@gmail.com') return;
    
    const tbody = document.getElementById("admin-users-list");
    if (!tbody) return;
    
    tbody.innerHTML = `<tr><td colspan="4" class="px-4 py-8 text-center text-slate-400">Carregando usuários...</td></tr>`;
    
    try {
        const snapshot = await db.collection("users").get();
        let html = '';
        snapshot.forEach(doc => {
            const data = doc.data();
            const uid = doc.id;
            const email = data.email || 'Email Desconhecido';
            const isPremium = data.isPremium === true;
            const hwid = data.hardware_id || 'Não Registrado';
            
            const btnPremium = isPremium 
                ? `<button onclick="togglePremium('${uid}', false)" class="px-2 py-1 bg-amber-50 text-amber-600 rounded hover:bg-amber-100 text-xs font-medium">Revogar Premium</button>`
                : `<button onclick="togglePremium('${uid}', true)" class="px-2 py-1 bg-emerald-50 text-emerald-600 rounded hover:bg-emerald-100 text-xs font-medium">Dar Premium</button>`;
                
            const btnResetHWID = hwid !== 'Não Registrado'
                ? `<button onclick="resetHWID('${uid}')" class="px-2 py-1 bg-rose-50 text-rose-600 rounded hover:bg-rose-100 text-xs font-medium ml-2">Resetar PC</button>`
                : '';

            html += `
            <tr class="hover:bg-slate-50 transition-colors">
                <td class="px-4 py-3 font-medium text-slate-900">${email}<br><span class="text-[10px] text-slate-400 font-mono">${uid}</span></td>
                <td class="px-4 py-3 text-center">
                    ${isPremium ? '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800">SIM</span>' : '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-800">NÃO</span>'}
                </td>
                <td class="px-4 py-3 font-mono text-xs text-slate-500 truncate max-w-[150px]" title="${hwid}">${hwid}</td>
                <td class="px-4 py-3 text-right">
                    ${btnPremium}
                    ${btnResetHWID}
                </td>
            </tr>`;
        });
        
        if (html === '') html = `<tr><td colspan="4" class="px-4 py-8 text-center text-slate-400">Nenhum usuário encontrado no banco.</td></tr>`;
        tbody.innerHTML = html;
        
    } catch(e) {
        tbody.innerHTML = `<tr><td colspan="4" class="px-4 py-8 text-center text-rose-500">Erro ao buscar usuários: ${e.message}</td></tr>`;
    }
}

async function togglePremium(uid, status) {
    if(!confirm(`Deseja ${status ? 'DAR' : 'REVOGAR'} o acesso Premium deste usuário?`)) return;
    try {
        await db.collection("users").doc(uid).set({ isPremium: status }, { merge: true });
        showToast("Status Premium atualizado com sucesso!", "success");
        loadAdminData();
    } catch(e) {
        showToast("Erro ao atualizar Premium: " + e.message, "error");
    }
}

async function resetHWID(uid) {
    if(!confirm("Deseja apagar a Trava de Hardware deste usuário? Ele poderá fazer login em um novo PC.")) return;
    try {
        await db.collection("users").doc(uid).update({
            hardware_id: firebase.firestore.FieldValue.delete()
        });
        showToast("Hardware ID resetado com sucesso!", "success");
        loadAdminData();
    } catch(e) {
        showToast("Erro ao resetar HWID: " + e.message, "error");
    }
}

