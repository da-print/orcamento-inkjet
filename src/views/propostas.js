import { el, limpar, toast, msgErro } from "../ui.js";
import { fmtBRL, fmtNum, fmtPct } from "../format.js";
import { temAcessoGerencial } from "../auth.js";
import { listarPropostas, mapaNomes, obterProposta } from "../api.js";

// Lista de propostas (todas as versões). SDR vê só as próprias; visualizador/gestor
// veem todas. Cada linha expande mostrando itens/quantidades/valores; para gerencial,
// também a margem/lucro.
export async function renderPropostas(container, perfil, opts) {
  const gerencial = temAcessoGerencial(perfil?.papel);
  let linhas = [], nomes = {};
  try {
    [linhas, nomes] = await Promise.all([listarPropostas(), mapaNomes()]);
  } catch (e) {
    container.appendChild(el("div", { class: "card" }, [
      el("h2", {}, "Erro ao carregar propostas"), el("p", { class: "hint" }, msgErro(e)),
    ]));
    return;
  }

  const busca = el("input", { type: "search", placeholder: "Buscar por número ou cliente…" });
  const card = el("div", { class: "card" }, [
    el("h2", {}, "Propostas"),
    el("p", { class: "hint", style: "margin-bottom:10px;" },
      "Histórico de propostas salvas (todas as versões). Clique na seta para ver os itens; 'Abrir' para editar/gerar PDF."),
  ]);

  if (!linhas.length) {
    card.appendChild(el("p", { class: "hint" }, "Nenhuma proposta salva ainda."));
    container.appendChild(card);
    return;
  }

  linhas.sort((a, b) => {
    const an = a.seq == null, bn = b.seq == null;
    if (an !== bn) return an ? -1 : 1;
    if (an && bn) return new Date(b.criado_em) - new Date(a.criado_em);
    if (a.seq !== b.seq) return b.seq - a.seq;
    return (b.revisao || 0) - (a.revisao || 0);
  });

  card.appendChild(el("div", { class: "field", style: "margin-bottom:12px;" }, [busca]));
  const tbody = el("tbody");
  const detalheCache = {};        // id -> jsonb da proposta (lazy)

  const NCOLS = 7;

  async function montarDetalhe(p) {
    let prop = detalheCache[p.id];
    if (!prop) {
      prop = await obterProposta(p.id);
      detalheCache[p.id] = prop;
    }
    const wrap = el("div", { class: "det-proposta" });
    (prop.itens || []).forEach((item, idx) => {
      wrap.appendChild(el("div", { class: "det-item-titulo" }, (idx + 1) + ". " + item.descricao_formato + " — " + item.material_descricao));
      const tb = el("tbody");
      (item.quantidades || []).slice().sort((a, b) => a.quantidade - b.quantidade).forEach((q) => {
        const unit = q.preco / (q.quantidade || 1);
        const cels = [
          el("td", { class: "mono" }, fmtNum(q.quantidade, 0)),
          el("td", { class: "mono" }, fmtBRL(unit)),
          el("td", { class: "mono" }, fmtBRL(q.preco)),
          el("td", { class: "mono" }, fmtBRL(q.preco_com_ipi)),
        ];
        if (gerencial && q.margem != null) {
          const lucro = q.preco * (q.margem / 100);
          cels.push(el("td", { class: "mono" }, fmtPct(q.margem)));
          cels.push(el("td", { class: "mono" }, fmtBRL(lucro)));
        }
        tb.appendChild(el("tr", {}, cels));
      });
      const cabec = ["Qtd.", "Preço unit.", "Total", "Total c/ IPI"];
      if (gerencial) cabec.push("Margem", "Lucro (R$)");
      wrap.appendChild(el("table", { class: "tbl tbl-det" }, [
        el("thead", {}, el("tr", {}, cabec.map((h) => el("th", {}, h)))),
        tb,
      ]));
    });
    return wrap;
  }

  function pintar() {
    limpar(tbody);
    const termo = (busca.value || "").trim().toLowerCase();
    const filtradas = termo
      ? linhas.filter((p) => (p.numero || "").toLowerCase().includes(termo) || (p.cliente || "").toLowerCase().includes(termo))
      : linhas;
    if (!filtradas.length) {
      tbody.appendChild(el("tr", {}, [el("td", { colspan: String(NCOLS), class: "hint" }, "Nenhuma proposta encontrada.")]));
      return;
    }
    filtradas.forEach((p) => {
      const emitida = p.status === "emitida";
      const seta = el("button", { class: "btn-seta", title: "Ver itens", type: "button" }, "▶");
      const abrir = el("button", { class: "btn btn-ghost sm", type: "button" }, "Abrir");
      abrir.addEventListener("click", () => opts.nav("orcamento", { abrirId: p.id }));

      const linha = el("tr", {}, [
        el("td", {}, seta),
        el("td", { class: "mono" }, p.numero || "—"),
        el("td", {}, p.cliente || "—"),
        el("td", {}, nomes[p.criado_por] || "—"),
        el("td", {}, p.estado_uf || ""),
        el("td", {}, el("span", { class: "pill", style: emitida ? "background:color-mix(in srgb,var(--good) 16%,transparent);color:var(--good);" : "" }, emitida ? "Emitida" : "Rascunho")),
        el("td", {}, abrir),
      ]);

      // slot referenciado diretamente (sem querySelector)
      const slot = el("div", { class: "det-slot" });
      const trDet = el("tr", { class: "tr-det", style: "display:none;" }, [
        el("td", { colspan: String(NCOLS) }, slot),
      ]);
      let carregado = false;

      seta.addEventListener("click", async () => {
        const abrirAgora = trDet.style.display === "none";
        trDet.style.display = abrirAgora ? "" : "none";
        seta.textContent = abrirAgora ? "▼" : "▶";
        linha.className = abrirAgora ? "linha-sel" : "";
        if (abrirAgora && !carregado) {
          carregado = true;
          slot.appendChild(el("div", { class: "hint" }, "Carregando…"));
          try { const det = await montarDetalhe(p); limpar(slot).appendChild(det); }
          catch (e) { carregado = false; limpar(slot).appendChild(el("div", { class: "hint" }, msgErro(e))); }
        }
      });

      tbody.appendChild(linha);
      tbody.appendChild(trDet);
    });
  }
  busca.addEventListener("input", pintar);
  pintar();

  card.appendChild(el("div", { class: "tbl-scroll" }, [
    el("table", { class: "tbl" }, [
      el("thead", {}, el("tr", {}, ["", "Nº", "Cliente", "Usuário", "UF", "Status", ""].map((h) => el("th", {}, h)))),
      tbody,
    ]),
  ]));
  container.appendChild(card);
}
