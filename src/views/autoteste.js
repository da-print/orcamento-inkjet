import { el, limpar, msgErro } from "../ui.js";
import { fmtNum } from "../format.js";
import { calcularOrcamento, carregarParametros } from "../api.js";

// Autoteste do motor: roda casos representativos e verifica INVARIANTES (propriedades
// que valem sempre, independente dos parâmetros). Não usa valores fixos, então
// mudar impostos/margens/dentes não gera falso-vermelho.

function casos(materialId) {
  const base = { materialId, continuidade: false, meses: null, comissao: 0, estadoUf: "SP" };
  return [
    { nome: "Pré-cortada 80×30 — escala 5.000 / 10.000", req: { ...base, tipo: "pre-cortada", larguraMm: 80, alturaMm: 30, comprimentoM: null, quantidades: [5000, 10000], forma: "RETANGULAR" } },
    { nome: "Pré-cortada 100×150 — 5.000", req: { ...base, tipo: "pre-cortada", larguraMm: 100, alturaMm: 150, comprimentoM: null, quantidades: [5000], forma: "RETANGULAR" } },
    { nome: "Pré-cortada alta 80×400 — deve avisar e ir p/ Turo", req: { ...base, tipo: "pre-cortada", larguraMm: 80, alturaMm: 400, comprimentoM: null, quantidades: [5000], forma: "RETANGULAR" } },
    { nome: "Rolo contínuo 100mm × 40m — 200 rolos", req: { ...base, tipo: "rolo-continuo", larguraMm: 100, alturaMm: null, comprimentoM: 40, quantidades: [200] } },
  ];
}

function arredOk(preco, modo) {
  const t = 1e-6;
  if (modo === "real_cima" || modo === "real_proximo") return Math.abs(preco - Math.round(preco)) < t;
  if (modo === "centavo_cima") return Math.abs(preco * 100 - Math.round(preco * 100)) < t;
  return true; // 'nenhum'
}

function checarCaso(caso, res, cfg) {
  const ck = [];
  const add = (label, ok, info) => ck.push({ label, ok, info: info || "" });
  add("Retornou resultado", res.length > 0);

  res.forEach((r) => {
    const tag = res.length > 1 ? " (qtd " + fmtNum(r.quantidade, 0) + ")" : "";
    add("Preço positivo" + tag, r.preco > 0);

    if (r.custo_total != null && r.margem != null) {
      const K = r.custo_total / (1 - r.pis_cofins / 100);
      const denom = 1 - (r.irrf + r.icms + r.comissao + r.frete + r.margem) / 100;
      const precoCalc = K / denom;
      const dif = Math.abs(precoCalc - r.preco) / r.preco;
      add("Preço coerente com custo/margem/impostos" + tag, dif < 1e-4, dif >= 1e-4 ? "dif " + (dif * 100).toFixed(3) + "%" : "");
    }

    if (r.comparativo_rota) {
      const c = r.comparativo_rota;
      const esperada = Number(c.troqueladora_total) <= Number(c.turo_total) ? "troqueladora" : "turo";
      add("Rota escolhida é a mais barata" + tag, c.vencedora === esperada,
        "troq " + Number(c.troqueladora_total).toFixed(2) + " × turo " + Number(c.turo_total).toFixed(2));
    }

    if (caso.req.tipo === "pre-cortada") {
      if (r.aviso) {
        add("Sem cilindro → caiu na Turo" + tag, r.rota_escolhida === "turo");
      } else if (r.cilindro) {
        const g = Number(r.cilindro.gap_mm);
        const ok = r.cilindro.forcado || (g >= cfg.gmin - 1e-6 && g <= cfg.gmax + 1e-6);
        add("Espaçamento dentro da faixa" + tag, ok, "gap " + fmtNum(g, 3) + "mm");
      }
    }

    add("Arredondamento aplicado (" + cfg.arred + ")" + tag, arredOk(r.preco, cfg.arred));
  });

  if (res.length > 1) {
    const u = res.slice().sort((a, b) => a.quantidade - b.quantidade).map((r) => r.preco / r.quantidade);
    let mono = true;
    for (let i = 1; i < u.length; i++) if (u[i] > u[i - 1] * 1.0001) mono = false;
    add("Preço unitário não sobe com a quantidade", mono);
  }
  return ck;
}

export async function renderAutoteste(container, perfil) {
  const btn = el("button", { class: "btn btn-primary sm", style: "margin-top:0;" }, "Rodar testes");
  const resumo = el("div", { style: "margin-top:10px;" });
  const corpo = el("div", {});
  const card = el("div", { class: "card" }, [
    el("div", { class: "row-btns", style: "justify-content:space-between;align-items:center;margin-top:0;gap:12px;flex-wrap:wrap;" }, [
      el("h2", { style: "margin:0;" }, "Autoteste do motor de cálculo"),
      btn,
    ]),
    el("p", { class: "hint", style: "margin-top:6px;" },
      "Verifica propriedades que devem valer sempre, independente dos parâmetros. Rode após alterar qualquer parâmetro."),
    resumo, corpo,
  ]);
  container.appendChild(card);

  async function rodar() {
    btn.disabled = true; btn.textContent = "Rodando…";
    limpar(resumo); limpar(corpo);
    let params;
    try { params = await carregarParametros(); }
    catch (e) { limpar(corpo).appendChild(el("p", { class: "hint" }, msgErro(e))); btn.disabled = false; btn.textContent = "Rodar testes"; return; }
    const materialId = params.materiais[0] && params.materiais[0].id;
    const cfg = {
      gmin: Number(params.formato.gap_troq_min_mm), gmax: Number(params.formato.gap_troq_max_mm),
      arred: params.impostos.arredondamento || "nenhum",
    };
    if (!materialId) { corpo.appendChild(el("p", { class: "hint" }, "Cadastre ao menos um material para rodar os testes.")); btn.disabled = false; btn.textContent = "Rodar testes"; return; }

    let totalOk = 0, total = 0;
    for (const caso of casos(materialId)) {
      let checks;
      try {
        const res = await calcularOrcamento(caso.req);
        checks = checarCaso(caso, res, cfg);
      } catch (e) {
        checks = [{ label: "Execução sem erro", ok: false, info: msgErro(e) }];
      }
      const okCaso = checks.every((c) => c.ok);
      total += checks.length; totalOk += checks.filter((c) => c.ok).length;

      const lista = el("div", { class: "det-wrap", style: "margin-top:6px;" });
      checks.forEach((c) => lista.appendChild(el("div", { class: "result-line", style: "padding:4px 0;" }, [
        el("span", { class: "k" }, (c.ok ? "✓ " : "✗ ") + c.label + (c.info ? " — " + c.info : "")),
        el("span", { style: "color:" + (c.ok ? "var(--good)" : "var(--erro)") + ";font-weight:700;" }, c.ok ? "OK" : "FALHA"),
      ])));
      corpo.appendChild(el("div", { class: "card", style: "padding:14px;margin-top:10px;" }, [
        el("div", { class: "row-btns", style: "justify-content:space-between;margin-top:0;" }, [
          el("span", { style: "font-weight:700;" }, caso.nome),
          el("span", { class: "pill", style: "color:" + (okCaso ? "var(--good)" : "var(--erro)") + ";" }, okCaso ? "Passou" : "Falhou"),
        ]),
        lista,
      ]));
    }

    const tudoOk = totalOk === total;
    resumo.appendChild(el("div", { class: "result-final", style: "border-color:" + (tudoOk ? "var(--good)" : "var(--erro)") + ";" }, [
      el("div", { class: "result-label" }, "Resultado"),
      el("div", { class: "result-big", style: "color:" + (tudoOk ? "var(--good)" : "var(--erro)") + ";" }, totalOk + " / " + total + " verificações"),
      el("div", { class: "hint" }, tudoOk ? "Motor consistente." : "Há verificações falhando — revise a última alteração de parâmetro ou avise o desenvolvedor."),
    ]));
    btn.disabled = false; btn.textContent = "Rodar testes";
  }

  btn.addEventListener("click", rodar);
  await rodar();
}
