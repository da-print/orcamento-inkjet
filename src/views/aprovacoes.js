import { el, limpar, toast, msgErro } from "../ui.js";
import { fmtBRL, fmtNum, fmtPct } from "../format.js";
import { ehGestor } from "../auth.js";
import { listarSolicitacoes, resolverSolicitacao } from "../api.js";

// Margem resultante de uma linha dado o preço unitário efetivo (alvo ou desconto).
function margemLinha(l, alvoVal, descVal) {
  const autoUnit = Number(l.preco_unit_auto) || 0;
  let effUnit = autoUnit;
  if (alvoVal !== "" && !isNaN(parseFloat(alvoVal))) effUnit = parseFloat(alvoVal);
  else if (descVal !== "" && !isNaN(parseFloat(descVal))) effUnit = autoUnit * (1 - parseFloat(descVal) / 100);
  const pTotal = effUnit * (Number(l.quantidade) || 1);
  if (pTotal <= 0) return null;
  const K = Number(l.custo_total) / (1 - Number(l.pis_cofins) / 100);
  return 100 * (1 - K / pTotal) - (Number(l.irrf) + Number(l.icms) + Number(l.comissao) + Number(l.frete));
}

export async function renderAprovacoes(container, perfil, opts) {
  const gestor = ehGestor(perfil?.papel);
  let linhas = [];
  try { linhas = await listarSolicitacoes(); }
  catch (e) {
    container.appendChild(el("div", { class: "card" }, [
      el("h2", {}, "Erro ao carregar aprovações"), el("p", { class: "hint" }, msgErro(e)),
    ]));
    return;
  }

  const card = el("div", { class: "card" }, [
    el("h2", {}, "Aprovações de desconto"),
    el("p", { class: "hint", style: "margin-bottom:10px;" },
      gestor
        ? "Pedidos da equipe. Ajuste os valores por linha, veja a margem resultante, aprove/recuse e confirme — a revisão descontada é gerada automaticamente."
        : "Seus pedidos de desconto e o resultado."),
  ]);

  if (!linhas.length) {
    card.appendChild(el("p", { class: "hint" }, "Nenhuma solicitação."));
    container.appendChild(card);
    return;
  }

  const lista = el("div", { class: "det-wrap" });
  linhas.forEach((s) => {
    const pend = s.status === "pendente";
    const cor = s.status === "aprovada" ? "var(--good)" : s.status === "recusada" ? "var(--erro)" : s.status === "parcial" ? "var(--accent)" : "var(--muted)";
    const bloco = el("div", { class: "card", style: "padding:14px;" }, [
      el("div", { class: "row-btns", style: "justify-content:space-between;align-items:center;" }, [
        el("div", {}, [
          el("span", { class: "mono", style: "font-weight:700;" }, s.numero || "(rascunho)"),
          el("span", { class: "hint", style: "margin-left:8px;" }, (s.cliente || "—") + " · por " + (s.solicitante_nome || "—")),
        ]),
        el("span", { class: "pill", style: "color:" + cor + ";" }, s.status + (s.revisao_numero ? " → " + s.revisao_numero : "")),
      ]),
      s.justificativa ? el("p", { class: "hint", style: "margin:8px 0 0;" }, "Obs.: " + s.justificativa) : null,
    ]);

    const tbody = el("tbody");
    const refs = []; // { id, inAlvo, inDesc, chk, cellMargem, l }
    (s.linhas || []).forEach((l) => {
      const cellMargem = el("td", { class: "mono" }, "");
      function syncMargem(alvoVal, descVal) {
        const m = margemLinha(l, alvoVal, descVal);
        cellMargem.textContent = (m == null) ? "—" : fmtPct(m);
        cellMargem.style.color = (m != null && m < 0) ? "var(--erro)" : "";
      }
      if (pend && gestor) {
        const inAlvo = el("input", { type: "number", step: "0.0001", min: "0", value: l.alvo_final ?? "", style: "max-width:100px;" });
        const inDesc = el("input", { type: "number", step: "0.01", min: "0", value: l.desconto_final ?? "", style: "max-width:80px;" });
        const chk = el("input", { type: "checkbox" }); chk.checked = l.aprovado !== false;
        inAlvo.addEventListener("input", () => syncMargem(inAlvo.value, inDesc.value));
        inDesc.addEventListener("input", () => syncMargem(inAlvo.value, inDesc.value));
        syncMargem(inAlvo.value, inDesc.value);
        refs.push({ id: l.id, inAlvo, inDesc, chk });
        tbody.appendChild(el("tr", {}, [
          el("td", {}, l.descricao),
          el("td", { class: "mono" }, fmtNum(l.quantidade, 0)),
          el("td", { class: "mono" }, fmtBRL(l.preco_unit_auto)),
          el("td", {}, inAlvo),
          el("td", {}, inDesc),
          cellMargem,
          el("td", {}, chk),
        ]));
      } else {
        if (gestor) syncMargem(l.alvo_final ?? "", l.desconto_final ?? "");
        const cells = [
          el("td", {}, l.descricao),
          el("td", { class: "mono" }, fmtNum(l.quantidade, 0)),
          el("td", { class: "mono" }, fmtBRL(l.preco_unit_auto)),
          el("td", { class: "mono" }, l.alvo_final != null ? fmtBRL(l.alvo_final) : "—"),
          el("td", { class: "mono" }, l.desconto_final != null ? fmtPct(l.desconto_final) : "—"),
        ];
        if (gestor) cells.push(cellMargem);               // margem só para gestor
        cells.push(el("td", {}, l.aprovado === false ? "✗" : "✓"));
        tbody.appendChild(el("tr", {}, cells));
      }
    });

    const cabec = gestor
      ? ["Descrição", "Qtde.", "Preço unit.", "Alvo (un.)", "Desc. %", "Margem c/ ajuste", pend ? "Aprovar" : "OK"]
      : ["Descrição", "Qtde.", "Preço unit.", "Alvo (un.)", "Desc. %", "OK"];
    bloco.appendChild(el("div", { class: "tbl-scroll", style: "margin-top:10px;" }, [
      el("table", { class: "tbl" }, [
        el("thead", {}, el("tr", {}, cabec.map((h) => el("th", {}, h)))),
        tbody,
      ]),
    ]));

    if (gestor && pend) {
      const btnConfirmar = el("button", { class: "btn btn-primary sm" }, "Confirmar avaliação");
      const btnAbrir = el("button", { class: "btn btn-ghost sm" }, "Abrir proposta");
      btnAbrir.addEventListener("click", () => opts.nav("orcamento", { abrirId: s.proposta_id }));
      btnConfirmar.addEventListener("click", async () => {
        const payload = refs.map((r) => ({
          id: r.id, alvo_final: r.inAlvo.value, desconto_final: r.inDesc.value, aprovado: r.chk.checked,
        }));
        try {
          const res = await resolverSolicitacao(s.id, payload);
          toast(res.numero ? ("Avaliação " + res.status + " — revisão " + res.numero + ".") : ("Solicitação " + res.status + "."), "ok");
          if (opts.aoResolver) opts.aoResolver();
          renderAprovacoes(limpar(container), perfil, opts);
        } catch (e) { toast(msgErro(e), "erro"); }
      });
      bloco.appendChild(el("div", { class: "row-btns", style: "margin-top:10px;flex-wrap:wrap;" }, [btnAbrir, btnConfirmar]));
      bloco.appendChild(el("p", { class: "hint", style: "margin-top:6px;" },
        "Desmarque 'Aprovar' para recusar a linha. Se o alvo e o desconto estiverem preenchidos, o alvo prevalece."));
    }
    lista.appendChild(bloco);
  });

  card.appendChild(lista);
  container.appendChild(card);
}
