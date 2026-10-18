import { el, limpar } from "../ui.js";
import { sair, temAcessoGerencial, ehGestor } from "../auth.js";
import { abrirTrocarSenha } from "./trocarSenha.js";
import { renderOrcamento } from "./orcamento.js";
import { renderEditor } from "./editor.js";
import { renderPropostas } from "./propostas.js";
import { renderAprovacoes } from "./aprovacoes.js";
import { renderUsuarios } from "./usuarios.js";
import { renderPainel } from "./painel.js";
import { contarPendentes } from "../api.js";
import { LOGO_PNG_BASE64 } from "../logo.js";

const LOGO_SRC = "data:image/png;base64," + LOGO_PNG_BASE64;

// Shell do app autenticado: cabeçalho com usuário/papel, navegação gated por
// papel e área de conteúdo. As telas em si entram nas próximas etapas (0.3.2+).
export function renderShell(container, perfil, aoSair) {
  const papel = perfil?.papel || "sdr";
  const rotulosPapel = { sdr: "SDR", visualizador: "Visualizador", gestor: "Gestor" };

  // Abas visíveis por papel (fonte única: o papel do perfil).
  const abas = [
    { id: "orcamento", label: "Orçamento" },
    { id: "propostas", label: "Propostas" },
    { id: "aprovacoes", label: "Aprovações" },
  ];
  if (temAcessoGerencial(papel)) abas.push({ id: "painel", label: "Painel" });
  if (ehGestor(papel)) {
    abas.push({ id: "editor", label: "Parâmetros (Editor)" });
    abas.push({ id: "usuarios", label: "Usuários" });
  }

  const conteudo = el("div", { class: "conteudo", id: "conteudo" });
  let abaAtual = "orcamento";
  let payloadAba = null;
  let pendentes = 0;

  // Navegação entre abas com payload (ex: abrir uma proposta no orçamento).
  function irPara(aba, payload) {
    abaAtual = aba; payloadAba = payload || null;
    pintarAbas(nav); pintarConteudo();
  }

  function pintarAbas(navEl) {
    limpar(navEl);
    abas.forEach((a) => {
      const label = (a.id === "aprovacoes" && pendentes > 0) ? a.label + " (" + pendentes + ")" : a.label;
      navEl.appendChild(el("button", {
        class: "tab" + (a.id === abaAtual ? " tab-ativa" : "") + (a.id === "aprovacoes" && pendentes > 0 ? " tab-alerta" : ""),
        onclick: () => irPara(a.id),
      }, label));
    });
  }

  async function atualizarBadge() {
    try { pendentes = await contarPendentes(); } catch { pendentes = 0; }
    pintarAbas(nav);
  }

  function erroCard(e) {
    limpar(conteudo).appendChild(el("div", { class: "card" }, [
      el("h2", {}, "Erro"), el("p", { class: "hint" }, e && e.message ? e.message : String(e)),
    ]));
  }

  function pintarConteudo() {
    limpar(conteudo);
    const payload = payloadAba; payloadAba = null;
    conteudo.appendChild(el("div", { class: "hint" }, "Carregando…"));
    if (abaAtual === "orcamento") {
      renderOrcamento(limpar(conteudo), perfil, { nav: irPara, abrir: payload && payload.abrirId }).catch(erroCard);
    } else if (abaAtual === "propostas") {
      renderPropostas(limpar(conteudo), perfil, { nav: irPara }).catch(erroCard);
    } else if (abaAtual === "aprovacoes") {
      renderAprovacoes(limpar(conteudo), perfil, { nav: irPara, aoResolver: atualizarBadge }).catch(erroCard);
    } else if (abaAtual === "editor") {
      renderEditor(limpar(conteudo), perfil).catch(erroCard);
    } else if (abaAtual === "usuarios") {
      renderUsuarios(limpar(conteudo), perfil).catch(erroCard);
    } else if (abaAtual === "painel") {
      renderPainel(limpar(conteudo), perfil).catch(erroCard);
    }
  }

  const nav = el("nav", { class: "tabs" });
  pintarAbas(nav);

  const header = el("header", { class: "topbar" }, [
    el("div", { class: "topbar-brand" }, [
      el("img", { class: "topbar-logo", src: LOGO_SRC, alt: "D&A Print Solutions" }),
      el("span", { class: "topbar-title" }, "Orçamento Inkjet"),
    ]),
    nav,
    el("div", { class: "topbar-user" }, [
      el("div", { class: "user-info" }, [
        el("span", { class: "user-nome" }, perfil?.nome || "—"),
        el("span", { class: "user-papel pill" }, rotulosPapel[papel] || papel),
      ]),
      el("button", { class: "btn btn-ghost sm", onclick: abrirTrocarSenha }, "Trocar senha"),
      el("button", { class: "btn btn-ghost sm", onclick: async () => { await sair(); aoSair(); } }, "Sair"),
    ]),
  ]);

  container.appendChild(el("div", { class: "app-shell" }, [header, el("main", { class: "main" }, [conteudo])]));
  pintarConteudo();
  if (ehGestor(papel)) atualizarBadge();  // contador de pendentes no badge
}
