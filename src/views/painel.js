import { el, limpar, msgErro } from "../ui.js";
import { fmtPct, fmtNum, fmtBRL } from "../format.js";
import { painelGestor } from "../api.js";

const PERIODOS = [
  { r: "Últimos 30 dias", d: 30 },
  { r: "Últimos 90 dias", d: 90 },
  { r: "Últimos 12 meses", d: 365 },
  { r: "Tudo", d: null },
];

const ROTA_NOME = {
  turo: "Turo",
  troqueladora: "Troqueladora (faca nova)",
  "troqueladora-existente": "Troqueladora (faca existente)",
};

export async function renderPainel(container, perfil) {
  const sel = el("select", {}, PERIODOS.map((p, i) =>
    el("option", i === 1 ? { value: String(i), selected: "" } : { value: String(i) }, p.r)));
  const corpo = el("div", {});
  const card = el("div", { class: "card" }, [
    el("div", { class: "row-btns", style: "justify-content:space-between;align-items:center;margin-top:0;gap:12px;flex-wrap:wrap;" }, [
      el("h2", { style: "margin:0;" }, "Painel gerencial"),
      el("div", { style: "min-width:180px;" }, [sel]),
    ]),
    el("p", { class: "hint", style: "margin-top:6px;" }, "Sobre as propostas emitidas no período."),
    corpo,
  ]);
  container.appendChild(card);

  function stat(label, valor, sub) {
    return el("div", { class: "card", style: "padding:14px;text-align:center;" }, [
      el("div", { class: "result-label" }, label),
      el("div", { class: "mono", style: "font-size:24px;font-weight:800;margin:4px 0;" }, valor),
      sub ? el("div", { class: "hint", style: "margin:0;" }, sub) : null,
    ]);
  }

  function pintar(d) {
    limpar(corpo);
    const r = d.resumo || {};
    if (!r.n_linhas) {
      corpo.appendChild(el("p", { class: "hint", style: "margin-top:14px;" }, "Sem propostas emitidas no período."));
      return;
    }

    corpo.appendChild(el("div", { class: "grid g3", style: "margin-top:14px;" }, [
      stat("Propostas emitidas", String(r.n_propostas ?? "—"), (r.n_linhas || 0) + " linha(s) de preço"),
      stat("Margem média (ponderada)", r.margem_ponderada != null ? fmtPct(r.margem_ponderada) : "—",
        r.margem_media != null ? "simples " + fmtPct(r.margem_media) : ""),
      stat("Desconto médio", r.desconto_medio != null ? fmtPct(r.desconto_medio) : "—",
        (r.n_com_desconto || 0) + " linha(s) com desconto"),
      stat("Abaixo da margem mínima", r.pct_abaixo_minima != null ? fmtPct(r.pct_abaixo_minima) : "—",
        "mínima: " + fmtPct(r.margem_minima || 0)),
    ]));

    corpo.appendChild(el("div", { class: "grid g3", style: "margin-top:12px;" }, [
      stat("Taxa de conversão", r.taxa_conversao != null ? fmtPct(r.taxa_conversao) : "—", "aprovadas ÷ emitidas"),
      stat("Desfechos", (r.n_aprovadas || 0) + " / " + (r.n_reprovadas || 0) + " / " + (r.n_pendentes || 0), "aprovadas / reprovadas / pendentes"),
      stat("Receita aprovada", r.receita_aprovada != null ? fmtBRL(r.receita_aprovada) : "—", "quantidades fechadas no período"),
    ]));

    // Por SDR
    const sdr = d.por_sdr || [];
    const tb = el("tbody");
    sdr.forEach((s) => tb.appendChild(el("tr", {}, [
      el("td", {}, s.nome),
      el("td", { class: "mono" }, String(s.n_propostas)),
      el("td", { class: "mono" }, s.margem_media != null ? fmtPct(s.margem_media) : "—"),
      el("td", { class: "mono" }, s.desconto_medio != null ? fmtPct(s.desconto_medio) : "—"),
    ])));
    corpo.appendChild(el("h2", { style: "margin-top:18px;" }, "Por SDR"));
    corpo.appendChild(el("div", { class: "tbl-scroll" }, [el("table", { class: "tbl" }, [
      el("thead", {}, el("tr", {}, ["SDR", "Propostas", "Margem média", "Desconto médio"].map((h) => el("th", {}, h)))),
      tb,
    ])]));

    // Mix de rota
    const rota = d.por_rota || [];
    const total = rota.reduce((a, x) => a + Number(x.n), 0) || 1;
    const wrap = el("div", { style: "margin-top:10px;" });
    rota.forEach((x) => {
      const pct = 100 * Number(x.n) / total;
      wrap.appendChild(el("div", { style: "margin:8px 0;" }, [
        el("div", { class: "hint", style: "margin:0 0 3px;display:flex;justify-content:space-between;" }, [
          el("span", {}, ROTA_NOME[x.rota] || x.rota),
          el("span", {}, x.n + " (" + fmtNum(pct, 0) + "%)"),
        ]),
        el("div", { style: "height:8px;background:var(--surface-2);border-radius:4px;overflow:hidden;" }, [
          el("div", { style: "height:100%;width:" + pct + "%;background:var(--accent);" }),
        ]),
      ]));
    });
    corpo.appendChild(el("h2", { style: "margin-top:18px;" }, "Mix de rota de produção"));
    corpo.appendChild(wrap);
  }

  async function carregar() {
    limpar(corpo).appendChild(el("p", { class: "hint", style: "margin-top:14px;" }, "Carregando…"));
    const dias = PERIODOS[parseInt(sel.value, 10)].d;
    const desde = dias ? new Date(Date.now() - dias * 86400000).toISOString() : null;
    try { pintar(await painelGestor(desde)); }
    catch (e) { limpar(corpo).appendChild(el("p", { class: "hint", style: "margin-top:14px;" }, msgErro(e))); }
  }
  sel.addEventListener("change", carregar);
  await carregar();
}
