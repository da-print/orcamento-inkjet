import { limpar, toast, msgErro } from "./ui.js";
import { getSession, getPerfil, aoMudarSessao, sair } from "./auth.js";
import { renderLogin } from "./views/login.js";
import { renderShell } from "./views/shell.js";

const app = document.getElementById("app");

// rotear() é assíncrono e pode ser disparado por vários eventos ao mesmo tempo
// (retorno do login + evento de mudança de sessão). Um id de execução garante que
// apenas a chamada mais recente renderiza, e o limpar(app) acontece só na hora do
// append — evitando a duplicação do shell quando duas execuções concorrem.
let runId = 0;
let currentUid = null;   // usuário atualmente renderizado (para evitar re-render desnecessário)

async function rotear() {
  const run = ++runId;
  const session = await getSession();
  if (run !== runId) return;
  currentUid = session?.user?.id || null;
  if (!session) {
    limpar(app);
    renderLogin(app, rotear);
    return;
  }
  // Com sessão: busca o perfil e abre o shell conforme o papel.
  let perfil;
  try {
    perfil = await getPerfil();
  } catch (err) {
    if (run !== runId) return;
    limpar(app);
    toast(msgErro(err), "erro");
    renderLogin(app, rotear);
    return;
  }
  if (run !== runId) return;
  limpar(app);
  if (!perfil) {
    // Usuário autenticado mas sem linha em perfis: gestor ainda não liberou o papel.
    app.appendChild(telaSemPerfil());
    return;
  }
  renderShell(app, perfil, rotear);
}

function telaSemPerfil() {
  const div = document.createElement("div");
  div.className = "login-wrap";
  div.innerHTML =
    '<div class="card login-card"><h1>Acesso pendente</h1>' +
    '<p class="hint">Seu login foi criado, mas o gestor ainda não liberou seu perfil de acesso. ' +
    "Peça ao gestor para concluir a liberação.</p>" +
    '<button class="btn btn-ghost" id="sair-pendente">Sair</button></div>';
  div.querySelector("#sair-pendente").addEventListener("click", async () => {
    await sair();
    rotear();
  });
  return div;
}

// Reage à sessão, mas SÓ re-renderiza em login/logout real (quando o usuário muda).
// Refresh de token e re-foco de aba disparam eventos com o mesmo usuário; nesses
// casos não re-renderizamos, para não apagar a tela/formulário que a pessoa preencheu.
aoMudarSessao((_event, session) => {
  const uid = session?.user?.id || null;
  if (uid !== currentUid) rotear();
});

rotear();

// Registra o service worker (app instalável / abertura rápida). Fora do localhost,
// para não atrapalhar o ambiente de desenvolvimento.
if ("serviceWorker" in navigator && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
