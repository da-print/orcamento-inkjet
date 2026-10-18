import { el, limpar, toast, msgErro } from "../ui.js";
import {
  listarUsuarios, criarUsuario, redefinirSenhaUsuario,
  alterarPapelUsuario, atualizarPerfilUsuario, definirAtivoUsuario,
} from "../api.js";

const PAPEIS = [
  { v: "sdr", r: "SDR" },
  { v: "visualizador", r: "Visualizador" },
  { v: "gestor", r: "Gestor" },
];

// Gera uma senha inicial legível (sem caracteres ambíguos).
function gerarSenha() {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const num = "23456789";
  const min = "abcdefghijkmnpqrstuvwxyz";
  const pool = abc + num + min;
  let s = abc[Math.floor(Math.random() * abc.length)] + num[Math.floor(Math.random() * num.length)];
  for (let i = 0; i < 7; i++) s += pool[Math.floor(Math.random() * pool.length)];
  return s;
}

function campoSenha(id, valorInicial) {
  const input = el("input", { id, type: "text", required: "", minlength: "6", value: valorInicial || "", autocomplete: "off" });
  const btn = el("button", { type: "button", class: "btn btn-ghost sm" }, "Gerar");
  btn.addEventListener("click", () => { input.value = gerarSenha(); input.focus(); });
  return { wrap: el("div", { class: "row-btns", style: "margin-top:0;gap:6px;" }, [input, btn]), input };
}

export async function renderUsuarios(container, perfil) {
  const meuId = perfil?.user_id;

  // ---------- Novo usuário ----------
  const nome = el("input", { id: "u-nome", placeholder: "Nome completo" });
  const email = el("input", { id: "u-email", type: "email", inputmode: "email", placeholder: "pessoa@daprint.com.br" });
  const papel = el("select", { id: "u-papel" }, PAPEIS.map((p) => el("option", { value: p.v }, p.r)));
  const contato = el("input", { id: "u-contato", placeholder: "Nome e telefone que aparecem na proposta (opcional)" });
  const senha = campoSenha("u-senha", gerarSenha());
  const btnCriar = el("button", { type: "submit", class: "btn btn-primary", style: "margin-top:0;" }, "Criar usuário");

  const aviso = el("div", { style: "display:none;" });

  const formNovo = el("form", { class: "card" }, [
    el("h2", {}, "Novo usuário"),
    el("div", { class: "grid" }, [
      el("div", { class: "field" }, [el("label", { for: "u-nome" }, "Nome"), nome]),
      el("div", { class: "field" }, [el("label", { for: "u-email" }, "E-mail (login)"), email]),
      el("div", { class: "field" }, [el("label", { for: "u-papel" }, "Papel"), papel]),
      el("div", { class: "field" }, [el("label", { for: "u-senha" }, "Senha inicial"), senha.wrap]),
      el("div", { class: "field span2" }, [el("label", { for: "u-contato" }, "Contato comercial (opcional)"), contato]),
    ]),
    el("div", { class: "row-btns" }, [btnCriar]),
    el("p", { class: "hint" }, "Você define a senha inicial e repassa ao usuário. No primeiro acesso ele pode trocá-la em “Trocar senha”."),
    aviso,
  ]);

  formNovo.addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
      email: email.value.trim(), nome: nome.value.trim(),
      senha: senha.input.value, papel: papel.value, contato: contato.value.trim(),
    };
    if (!payload.nome || !payload.email || payload.senha.length < 6) {
      toast("Preencha nome, e-mail e uma senha de ao menos 6 caracteres.", "erro"); return;
    }
    btnCriar.disabled = true; btnCriar.textContent = "Criando…";
    try {
      await criarUsuario(payload);
      aviso.style.display = "block";
      aviso.className = "erro-box";
      aviso.style.cssText = "display:block;margin-top:12px;background:color-mix(in srgb,var(--good) 12%,transparent);color:var(--good);border:1px solid color-mix(in srgb,var(--good) 30%,transparent);border-radius:8px;padding:10px 12px;font-size:14px;";
      aviso.textContent = "Usuário criado. Login: " + payload.email + " · Senha inicial: " + payload.senha + " — anote e repasse agora (não será exibida de novo).";
      nome.value = ""; email.value = ""; contato.value = ""; senha.input.value = gerarSenha(); papel.value = "sdr";
      await recarregarLista();
    } catch (err) {
      toast(msgErro(err), "erro");
    } finally {
      btnCriar.disabled = false; btnCriar.textContent = "Criar usuário";
    }
  });

  // ---------- Lista ----------
  const cardLista = el("div", { class: "card", style: "margin-top:14px;" }, [el("h2", {}, "Usuários")]);
  const slot = el("div", {});
  cardLista.appendChild(slot);

  async function recarregarLista() {
    limpar(slot).appendChild(el("p", { class: "hint" }, "Carregando…"));
    let linhas;
    try { linhas = await listarUsuarios(); }
    catch (e) { limpar(slot).appendChild(el("p", { class: "hint" }, msgErro(e))); return; }

    const tbody = el("tbody");
    linhas.forEach((u) => {
      const ehEu = u.user_id === meuId;

      const sel = el("select", {}, PAPEIS.map((p) =>
        el("option", p.v === u.papel ? { value: p.v, selected: "" } : { value: p.v }, p.r)));
      if (ehEu) sel.disabled = true;
      sel.addEventListener("change", async () => {
        try { await alterarPapelUsuario(u.user_id, sel.value); toast("Papel atualizado.", "ok"); }
        catch (e) { toast(msgErro(e), "erro"); sel.value = u.papel; }
      });

      const status = el("span", { class: "pill", style: "color:" + (u.ativo ? "var(--good)" : "var(--muted)") + ";" }, u.ativo ? "Ativo" : "Inativo");

      const btnSenha = el("button", { class: "btn btn-ghost sm" }, "Senha");
      btnSenha.addEventListener("click", () => modalSenha(u));
      const btnEditar = el("button", { class: "btn btn-ghost sm" }, "Editar");
      btnEditar.addEventListener("click", () => modalEditar(u));
      const btnAtivo = el("button", { class: "btn btn-ghost sm" }, u.ativo ? "Desativar" : "Ativar");
      if (ehEu) btnAtivo.disabled = true;
      btnAtivo.addEventListener("click", async () => {
        try { await definirAtivoUsuario(u.user_id, !u.ativo); toast(u.ativo ? "Acesso desativado." : "Acesso reativado.", "ok"); await recarregarLista(); }
        catch (e) { toast(msgErro(e), "erro"); }
      });

      tbody.appendChild(el("tr", {}, [
        el("td", {}, u.nome + (ehEu ? " (você)" : "")),
        el("td", { class: "mono" }, u.email),
        el("td", {}, sel),
        el("td", { class: "hint", style: "margin:0;" }, u.contato_comercial || "—"),
        el("td", {}, status),
        el("td", {}, el("div", { class: "row-btns", style: "margin-top:0;gap:6px;flex-wrap:wrap;" }, [btnSenha, btnEditar, btnAtivo])),
      ]));
    });

    limpar(slot).appendChild(el("div", { class: "tbl-scroll" }, [
      el("table", { class: "tbl" }, [
        el("thead", {}, el("tr", {}, ["Nome", "E-mail", "Papel", "Contato", "Status", "Ações"].map((h) => el("th", {}, h)))),
        tbody,
      ]),
    ]));
  }

  // ---------- Modais ----------
  function abrirModal(conteudo) {
    const overlay = el("div", { class: "overlay" });
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
    overlay.appendChild(conteudo);
    document.body.appendChild(overlay);
    return overlay;
  }

  function modalSenha(u) {
    const sc = campoSenha("rs-senha", gerarSenha());
    const form = el("form", { class: "card modal" }, [
      el("h2", {}, "Trocar senha"),
      el("p", { class: "hint", style: "margin-top:0;" }, u.nome + " · " + u.email),
      el("label", {}, "Nova senha"),
      sc.wrap,
      el("div", { class: "row-btns" }, [
        el("button", { type: "button", class: "btn btn-ghost", id: "canc" }, "Cancelar"),
        el("button", { type: "submit", class: "btn btn-primary" }, "Salvar"),
      ]),
      el("p", { class: "hint" }, "Anote e repasse a nova senha ao usuário."),
    ]);
    const overlay = abrirModal(form);
    form.querySelector("#canc").addEventListener("click", () => overlay.remove());
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (sc.input.value.length < 6) { toast("Mínimo de 6 caracteres.", "erro"); return; }
      try { await redefinirSenhaUsuario(u.user_id, sc.input.value); toast("Senha redefinida para: " + sc.input.value, "ok"); overlay.remove(); }
      catch (err) { toast(msgErro(err), "erro"); }
    });
  }

  function modalEditar(u) {
    const inNome = el("input", { value: u.nome });
    const inContato = el("input", { value: u.contato_comercial || "", placeholder: "Opcional" });
    const form = el("form", { class: "card modal" }, [
      el("h2", {}, "Editar usuário"),
      el("p", { class: "hint", style: "margin-top:0;" }, u.email),
      el("label", {}, "Nome"), inNome,
      el("label", {}, "Contato comercial"), inContato,
      el("div", { class: "row-btns" }, [
        el("button", { type: "button", class: "btn btn-ghost", id: "canc" }, "Cancelar"),
        el("button", { type: "submit", class: "btn btn-primary" }, "Salvar"),
      ]),
    ]);
    const overlay = abrirModal(form);
    form.querySelector("#canc").addEventListener("click", () => overlay.remove());
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!inNome.value.trim()) { toast("Informe o nome.", "erro"); return; }
      try { await atualizarPerfilUsuario(u.user_id, inNome.value.trim(), inContato.value.trim()); toast("Dados atualizados.", "ok"); overlay.remove(); await recarregarLista(); }
      catch (err) { toast(msgErro(err), "erro"); }
    });
  }

  container.appendChild(el("div", { class: "orcamento" }, [formNovo, cardLista]));
  await recarregarLista();
}
