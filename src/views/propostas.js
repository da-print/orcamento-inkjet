import { el, limpar, toast, msgErro } from "../ui.js";
import { fmtBRL, fmtNum, fmtPct } from "../format.js";
import { temAcessoGerencial } from "../auth.js";
import { listarPropostas, mapaNomes, obterProposta, marcarDesfecho } from "../api.js";

// Lista de propostas (todas as versões). SDR vê só as próprias; visualizador/gestor
// veem todas. Expande itens/quantidades/valores; marca desfecho (aprovada/reprovada)
// e filtra por desfecho para o follow-up.
const DESF = {
  pendente: ["Pendente", "var(--muted)"],
  aprovada: ["Aprovada", "var(--good)"],
  reprovada: ["Reprovada", "var(--erro)"],
};

export async function renderPropostas(container, perfil, opts) {
  const gerencial = temAcessoGerencial(perfil?.papel);
  const podeMarcar = perfil?.papel === "sdr" || perfil?.papel === "gestor";
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
  const selFiltro = el("select", {}, [
    ["todas", "Todas"], ["pendente", "Pendentes (follow-up)"], ["aprovada", "Aprovadas"], ["reprovada", "Reprovadas"],
  ].map(([v, r]) => el("option", { value: v }, r)));

  const card = el("div", { class: "card" }, [
    el("h2", {}, "Propostas"),
    el("p", { class: "hint", style: "margin-bottom:10px;" },
      "Histórico (todas as versões). Seta para ver os itens; 'Status' para marcar o desfecho; 'Abrir' para editar/gerar PDF."),
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

  card.appendChild(el("div", { class: "grid", style: "margin-bottom:12px;" }, [
    el("div", { class: "field" }, [busca]),
    el("div", { class: "field" }, [selFiltro]),
  ]));
  const tbody = el("tbody");
  const detalheCache = {};

  const NCOLS = 8;

  async function montarDetalhe(p) {
    let prop = detalheCache[p.id];
    if (!prop) { prop = await obterProposta(p.id); detalheCache[p.id] = prop; }
    const wrap = el("div", { class: "det-proposta" });
    (prop.itens || []).forEach((item, idx) => {
      wrap.appendChild(el("div", { class: "det-item-titulo" }, (idx + 1) + ". " + item.descricao_formato + " — " + item.material_descricao));
      const tb = el("tbody");
      (item.quantidades || []).slice().sort((a, b) => a.quantidade - b.quantidade).forEach((q) => {
        const unit = q.preco / (q.quantidade || 1);
        const cels = [
          el("td", { class: "mono" }, (q.escolhida === true ? "✓ " : "") + fmtNum(q.quantidade, 0)),
          el("td", { class: "mono" }, fmtBRL(unit)),
          el("td", { class: "mono" }, fmtBRL(q.preco)),
          el("td", { class: "mono" }, fmtBRL(q.preco_com_ipi)),
        ];
        if (gerencial && q.margem != null) {
          const lucro = q.preco * (q.margem / 100);
          cels.push(el("td", { class: "mono" }, fmtPct(q.margem)));
          cels.push(el("td", { class: "mono" }, fmtBRL(lucro)));
        }
        tb.appendChild(el("tr", q.escolhida === true ? { class: "linha-sel", style: "font-weight:700;" } : {}, cels));
      });
      const cabec = ["Qtd.", "Preço unit.", "Total", "Total c/ IPI"];
      if (gerencial) cabec.push("Margem", "Lucro (R$)");
      wrap.appendChild(el("table", { class: "tbl tbl-det" }, [
        el("thead", {}, el("tr", {}, cabec.map((h) => el("th", {}, h)))),
        tb,
      ]));
    });
    if (prop.desfecho === "reprovada" && prop.desfecho_justificativa) {
      wrap.appendChild(el("p", { class: "hint", style: "margin-top:8px;" }, "Motivo da reprovação: " + prop.desfecho_justificativa));
    }
    return wrap;
  }

  function badgeDesfecho(p) {
    if (p.status !== "emitida") return el("span", { class: "hint" }, "—");
    const [txt, cor] = DESF[p.desfecho || "pendente"];
    return el("span", { class: "pill", style: "color:" + cor + ";" }, txt);
  }

  async function abrirStatus(p) {
    let prop;
    try { prop = await obterProposta(p.id); } catch (e) { toast(msgErro(e), "erro"); return; }
    const overlay = el("div", { class: "overlay" });
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });

    let desf = prop.desfecho || "pendente";
    const segWrap = el("div", { class: "segmented" });
    const corpo = el("div", { style: "margin-top:12px;" });
    const txtJust = el("textarea", { placeholder: "Motivo da reprovação" });
    const selsQtd = [];

    function pintarSeg() {
      limpar(segWrap);
      [["aprovada", "Aprovada"], ["reprovada", "Reprovada"], ["pendente", "Pendente"]].forEach(([v, r]) => {
        const b = el("button", { type: "button", class: "seg" + (v === desf ? " ativo" : "") }, r);
        b.addEventListener("click", () => { desf = v; pintarSeg(); pintarCorpo(); });
        segWrap.appendChild(b);
      });
    }
    function pintarCorpo() {
      limpar(corpo); selsQtd.length = 0;
      if (desf === "reprovada") {
        txtJust.value = prop.desfecho_justificativa || "";
        corpo.appendChild(el("label", {}, "Justificativa"));
        corpo.appendChild(txtJust);
      } else if (desf === "aprovada") {
        corpo.appendChild(el("p", { class: "hint", style: "margin-top:0;" }, "Quantidade que o cliente fechou em cada item:"));
        (prop.itens || []).forEach((item) => {
          const qs = (item.quantidades || []).slice().sort((a, b) => a.quantidade - b.quantidade);
          const sel = el("select", {}, qs.map((q) =>
            el("option", q.escolhida ? { value: String(q.quantidade), selected: "" } : { value: String(q.quantidade) },
              fmtNum(q.quantidade, 0) + " un — " + fmtBRL(q.preco))));
          selsQtd.push({ item_id: item.id, sel });
          corpo.appendChild(el("div", { class: "field", style: "margin-top:8px;" }, [
            el("label", {}, item.descricao_formato || "Item"), sel,
          ]));
        });
      } else {
        corpo.appendChild(el("p", { class: "hint", style: "margin-top:0;" }, "Volta para pendente (limpa o desfecho)."));
      }
    }

    const btnOk = el("button", { class: "btn btn-primary" }, "Salvar desfecho");
    btnOk.addEventListener("click", async () => {
      const escolhas = desf === "aprovada" ? selsQtd.map((s) => ({ item_id: s.item_id, quantidade: parseFloat(s.sel.value) })) : null;
      const just = desf === "reprovada" ? txtJust.value : null;
      try {
        await marcarDesfecho(p.id, desf, just, escolhas);
        toast("Desfecho salvo.", "ok");
        overlay.remove();
        renderPropostas(limpar(container), perfil, opts);
      } catch (e) { toast(msgErro(e), "erro"); }
    });

    const form = el("div", { class: "card modal" }, [
      el("h2", {}, "Desfecho — " + (p.numero || "")),
      el("p", { class: "hint", style: "margin-top:0;" }, p.cliente || ""),
      segWrap, corpo,
      el("div", { class: "row-btns" }, [
        el("button", { type: "button", class: "btn btn-ghost", onclick: () => overlay.remove() }, "Cancelar"),
        btnOk,
      ]),
    ]);
    pintarSeg(); pintarCorpo();
    overlay.appendChild(form);
    document.body.appendChild(overlay);
  }

  function pintar() {
    limpar(tbody);
    const termo = (busca.value || "").trim().toLowerCase();
    const fil = selFiltro.value;
    const filtradas = linhas.filter((p) => {
      if (termo && !((p.numero || "").toLowerCase().includes(termo) || (p.cliente || "").toLowerCase().includes(termo))) return false;
      if (fil !== "todas") {
        if (p.status !== "emitida") return false;
        if ((p.desfecho || "pendente") !== fil) return false;
      }
      return true;
    });
    if (!filtradas.length) {
      tbody.appendChild(el("tr", {}, [el("td", { colspan: String(NCOLS), class: "hint" }, "Nenhuma proposta encontrada.")]));
      return;
    }
    filtradas.forEach((p) => {
      const emitida = p.status === "emitida";
      const seta = el("button", { class: "btn-seta", title: "Ver itens", type: "button" }, "▶");
      const abrir = el("button", { class: "btn btn-ghost sm", type: "button" }, "Abrir");
      abrir.addEventListener("click", () => opts.nav("orcamento", { abrirId: p.id }));
      const acoes = [abrir];
      if (emitida && podeMarcar) {
        const bStatus = el("button", { class: "btn btn-ghost sm", type: "button" }, "Status");
        bStatus.addEventListener("click", () => abrirStatus(p));
        acoes.unshift(bStatus);
      }

      const linha = el("tr", {}, [
        el("td", {}, seta),
        el("td", { class: "mono" }, p.numero || "—"),
        el("td", {}, p.cliente || "—"),
        el("td", {}, nomes[p.criado_por] || "—"),
        el("td", {}, p.estado_uf || ""),
        el("td", {}, el("span", { class: "pill", style: emitida ? "background:color-mix(in srgb,var(--good) 16%,transparent);color:var(--good);" : "" }, emitida ? "Emitida" : "Rascunho")),
        el("td", {}, badgeDesfecho(p)),
        el("td", {}, el("div", { class: "row-btns", style: "margin-top:0;gap:6px;flex-wrap:wrap;" }, acoes)),
      ]);

      const slot = el("div", { class: "det-slot" });
      const trDet = el("tr", { class: "tr-det", style: "display:none;" }, [el("td", { colspan: String(NCOLS) }, slot)]);
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
  selFiltro.addEventListener("change", pintar);
  pintar();

  card.appendChild(el("div", { class: "tbl-scroll" }, [
    el("table", { class: "tbl" }, [
      el("thead", {}, el("tr", {}, ["", "Nº", "Cliente", "Usuário", "UF", "Emissão", "Desfecho", "Ações"].map((h) => el("th", {}, h)))),
      tbody,
    ]),
  ]));
  container.appendChild(card);
}
