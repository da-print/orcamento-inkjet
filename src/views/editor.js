import { el, limpar, toast, msgErro } from "../ui.js";
import { fmtBRL } from "../format.js";
import {
  carregarParametros, salvarConfig, salvarMaquina, salvarEstado, salvarColecao,
} from "../api.js";

// Editor de parâmetros — visível só para o gestor (a aba é gated no shell e a RLS
// garante no banco). Carrega tudo, edita em memória e persiste no "Salvar".
export async function renderEditor(container, _perfil) {
  let model;
  try {
    model = await carregarParametros();
  } catch (e) {
    container.appendChild(el("div", { class: "card" }, [
      el("h2", {}, "Erro ao carregar parâmetros"), el("p", { class: "hint" }, msgErro(e)),
    ]));
    return;
  }

  const origMatIds = model.materiais.map((m) => m.id);
  const origFacaIds = model.facasCadastradas.map((f) => f.id);
  const origMargemIds = model.margemFaixas.map((m) => m.id);

  const raiz = el("div", { class: "orcamento" });
  container.appendChild(raiz);

  // ---- Impostos e parâmetros fixos ----
  raiz.appendChild(secao("Impostos e parâmetros fixos", el("div", { class: "grid g3" }, [
    campoNum("PIS/COFINS (%)", model.impostos, "pis_cofins"),
    campoNum("IRRF/CSLL (%)", model.impostos, "irrf"),
    campoNum("Frete padrão (%)", model.impostos, "frete_padrao"),
    campoNum("Margem mínima de alerta (%)", model.impostos, "margem_minima"),
    campoNum("Gap de altura (mm)", model.formato, "gap_altura_mm"),
    campoNum("Margem de largura (mm)", model.formato, "margem_largura_mm"),
  ])));

  // ---- Facas (custos) ----
  raiz.appendChild(secao("Facas — custos", el("div", { class: "grid g3" }, [
    campoNum("Faca nova Troqueladora (R$)", model.facas, "custo_troqueladora"),
    campoNum("Faca nova Turo (R$)", model.facas, "custo_turo"),
    campoNum("Afiação (R$)", model.facas, "afiacao"),
  ])));

  // ---- Máquinas ----
  const maqTbody = el("tbody");
  model.maquinas.forEach((m) => {
    const ehTroq = m.largura_bobina_mae != null;
    maqTbody.appendChild(el("tr", {}, [
      el("td", {}, m.nome),
      el("td", {}, inputNum(m, "velocidade", "1")),
      el("td", {}, m.unidade),
      el("td", {}, inputNum(m, "valor_hora", "0.01")),
      el("td", {}, inputNum(m, "metros_acerto", "0.01")),
      el("td", {}, inputNum(m, "perda_processo", "0.01")),
      el("td", {}, inputNum(m, "tempo_acerto_horas", "0.001")),
      el("td", {}, inputNum(m, "tempo_minimo_min", "1")),
      el("td", {}, ehTroq ? inputNum(m, "largura_bobina_mae", "1") : "—"),
      el("td", {}, ehTroq ? inputNum(m, "max_largura_pista", "1") : "—"),
    ]));
  });
  raiz.appendChild(secao("Máquinas", el("div", { class: "tbl-scroll" }, [
    el("table", { class: "tbl" }, [
      el("thead", {}, el("tr", {}, ["Máquina", "Veloc.", "Un.", "Valor H/M", "Metros acerto", "Perda (%)", "Acerto (h)", "Mín. (min)", "Bobina mãe", "Máx. pista"].map((h) => el("th", {}, h)))),
      maqTbody,
    ]),
  ])));

  // ---- Materiais ----
  const matCard = secao("Materiais", el("div", { id: "wrap-materiais" }));
  raiz.appendChild(matCard);
  function pintarMateriais() {
    const wrap = limpar(matCard.querySelector("#wrap-materiais"));
    const tbody = el("tbody");
    model.materiais.forEach((m, i) => {
      const liquidoView = el("span", { class: "mono" }, "");
      function syncLiq() {
        const v = (m.valor_m2 || 0) * (1 + (m.garantia || 0) / 100) * (1 - (m.icms || 0) / 100);
        liquidoView.textContent = fmtBRL(v);
      }
      syncLiq();
      const delBtn = el("button", { class: "btn btn-ghost sm" }, "remover");
      delBtn.addEventListener("click", () => { model.materiais.splice(i, 1); pintarMateriais(); });
      tbody.appendChild(el("tr", {}, [
        el("td", {}, inputTxt(m, "descricao")),
        el("td", {}, inputNum(m, "valor_m2", "0.01", syncLiq)),
        el("td", {}, inputNum(m, "garantia", "0.01", syncLiq)),
        el("td", {}, inputNum(m, "ipi", "0.01")),
        el("td", {}, inputNum(m, "icms", "0.01", syncLiq)),
        el("td", {}, liquidoView),
        el("td", {}, delBtn),
      ]));
    });
    wrap.appendChild(el("div", { class: "tbl-scroll" }, [
      el("table", { class: "tbl" }, [
        el("thead", {}, el("tr", {}, ["Descrição", "Valor m²", "Garantia (%)", "IPI (%)", "ICMS (%)", "$ Print (calc.)", ""].map((h) => el("th", {}, h)))),
        tbody,
      ]),
    ]));
    const add = el("button", { class: "btn btn-ghost sm", style: "margin-top:8px;" }, "+ material");
    add.addEventListener("click", () => { model.materiais.push({ descricao: "Novo material", valor_m2: 0, garantia: 5, ipi: 0, icms: 18, ativo: true }); pintarMateriais(); });
    wrap.appendChild(add);
  }
  pintarMateriais();

  // ---- Facas cadastradas ----
  const facaCard = secao("Facas cadastradas (formato → pistas)", el("div", { id: "wrap-facas" }));
  raiz.appendChild(facaCard);
  function pintarFacas() {
    const wrap = limpar(facaCard.querySelector("#wrap-facas"));
    const tbody = el("tbody");
    model.facasCadastradas.forEach((f, i) => {
      const delBtn = el("button", { class: "btn btn-ghost sm" }, "remover");
      delBtn.addEventListener("click", () => { model.facasCadastradas.splice(i, 1); pintarFacas(); });
      tbody.appendChild(el("tr", {}, [
        el("td", {}, inputNum(f, "largura_mm", "0.1")),
        el("td", {}, inputNum(f, "altura_mm", "0.1")),
        el("td", {}, inputNum(f, "pistas", "1")),
        el("td", {}, delBtn),
      ]));
    });
    wrap.appendChild(el("table", { class: "tbl" }, [
      el("thead", {}, el("tr", {}, ["Largura (mm)", "Altura (mm)", "Pistas", ""].map((h) => el("th", {}, h)))),
      tbody,
    ]));
    const add = el("button", { class: "btn btn-ghost sm", style: "margin-top:8px;" }, "+ faca");
    add.addEventListener("click", () => { model.facasCadastradas.push({ largura_mm: 0, altura_mm: 0, pistas: 1 }); pintarFacas(); });
    wrap.appendChild(add);
  }
  pintarFacas();

  // ---- Faixas de margem ----
  const margemCard = secao("Faixas de margem (por preço)", el("div", { id: "wrap-margem" }));
  raiz.appendChild(margemCard);
  function pintarMargem() {
    const wrap = limpar(margemCard.querySelector("#wrap-margem"));
    const tbody = el("tbody");
    model.margemFaixas.forEach((f, i) => {
      const ultimo = i === model.margemFaixas.length - 1;
      const delBtn = el("button", { class: "btn btn-ghost sm" }, "remover");
      delBtn.addEventListener("click", () => { model.margemFaixas.splice(i, 1); pintarMargem(); });
      tbody.appendChild(el("tr", {}, [
        el("td", {}, ultimo ? el("span", { class: "pill" }, "sem limite") : inputNum(f, "ate_valor", "1")),
        el("td", {}, inputNum(f, "margem", "0.01")),
        el("td", {}, ultimo ? "" : delBtn),
      ]));
    });
    wrap.appendChild(el("table", { class: "tbl" }, [
      el("thead", {}, el("tr", {}, ["Até R$", "Margem (%)", ""].map((h) => el("th", {}, h)))),
      tbody,
    ]));
    const add = el("button", { class: "btn btn-ghost sm", style: "margin-top:8px;" }, "+ faixa");
    add.addEventListener("click", () => {
      // insere antes da última (que é a "sem limite")
      model.margemFaixas.splice(model.margemFaixas.length - 1, 0, { ate_valor: 1000, margem: 20 });
      pintarMargem();
    });
    wrap.appendChild(add);
    wrap.appendChild(el("p", { class: "hint" }, "A última faixa é sempre 'sem limite'. As faixas são aplicadas na ordem de cima para baixo."));
  }
  pintarMargem();

  // ---- Estados (ICMS) ----
  const estTbody = el("tbody");
  model.estados.forEach((e) => {
    estTbody.appendChild(el("tr", {}, [
      el("td", {}, e.uf + " — " + e.nome),
      el("td", {}, inputNum(e, "icms", "0.01")),
    ]));
  });
  raiz.appendChild(secao("Estados (ICMS)", el("div", { class: "tbl-scroll", style: "max-height:300px;overflow:auto;" }, [
    el("table", { class: "tbl" }, [
      el("thead", {}, el("tr", {}, [el("th", {}, "UF"), el("th", {}, "ICMS (%)")])),
      estTbody,
    ]),
  ])));

  // ---- Empresa ----
  raiz.appendChild(secao("Dados da empresa (timbre da proposta)", el("div", { class: "grid" }, [
    campoTxt("Razão social", model.empresa, "razao_social", "span2"),
    campoTxt("CNPJ", model.empresa, "cnpj"),
    campoTxt("IE", model.empresa, "ie"),
    campoTxt("Telefone", model.empresa, "telefone"),
    campoTxt("E-mail", model.empresa, "email"),
    campoTxt("Endereço", model.empresa, "endereco", "span2"),
    campoTxt("Site", model.empresa, "site", "span2"),
  ])));

  // ---- Salvar ----
  const btnSalvar = el("button", { class: "btn btn-primary" }, "Salvar alterações");
  btnSalvar.addEventListener("click", async () => {
    btnSalvar.disabled = true; btnSalvar.textContent = "Salvando…";
    try {
      await salvarConfig("config_impostos", { pis_cofins: model.impostos.pis_cofins, irrf: model.impostos.irrf, frete_padrao: model.impostos.frete_padrao, margem_minima: model.impostos.margem_minima || 0 });
      await salvarConfig("config_formato", { gap_altura_mm: model.formato.gap_altura_mm, margem_largura_mm: model.formato.margem_largura_mm });
      await salvarConfig("config_facas", { custo_troqueladora: model.facas.custo_troqueladora, custo_turo: model.facas.custo_turo, afiacao: model.facas.afiacao });
      await salvarConfig("config_empresa", {
        razao_social: model.empresa.razao_social, cnpj: model.empresa.cnpj, ie: model.empresa.ie,
        telefone: model.empresa.telefone, email: model.empresa.email, endereco: model.empresa.endereco, site: model.empresa.site,
      });
      for (const m of model.maquinas) {
        const obj = {
          velocidade: m.velocidade, valor_hora: m.valor_hora, metros_acerto: m.metros_acerto,
          perda_processo: m.perda_processo, tempo_acerto_horas: m.tempo_acerto_horas, tempo_minimo_min: m.tempo_minimo_min,
        };
        if (m.largura_bobina_mae != null) { obj.largura_bobina_mae = m.largura_bobina_mae; obj.max_largura_pista = m.max_largura_pista; }
        await salvarMaquina(m.chave, obj);
      }
      // normaliza faixas de margem: ordem pela posição, última sempre sem limite
      model.margemFaixas.forEach((f, i) => { f.ordem = i + 1; if (i === model.margemFaixas.length - 1) f.ate_valor = null; });
      await salvarColecao("materiais", model.materiais, origMatIds);
      await salvarColecao("facas_cadastradas", model.facasCadastradas, origFacaIds);
      await salvarColecao("margem_faixas", model.margemFaixas, origMargemIds);
      await Promise.all(model.estados.map((e) => salvarEstado(e.uf, e.icms)));
      toast("Parâmetros salvos.", "ok");
      // recarrega para refletir ids novos e a ordenação
      limpar(container);
      renderEditor(container, _perfil);
    } catch (e) {
      toast("Erro ao salvar: " + msgErro(e), "erro");
      btnSalvar.disabled = false; btnSalvar.textContent = "Salvar alterações";
    }
  });
  raiz.appendChild(btnSalvar);
}

// ---------- helpers ----------
function secao(titulo, conteudo) {
  return el("div", { class: "card" }, [el("h2", {}, titulo), conteudo]);
}
function inputNum(obj, key, step, onChange) {
  const inp = el("input", { type: "number", step: step || "1", class: "mono", value: obj[key] == null ? "" : String(obj[key]) });
  inp.addEventListener("input", () => {
    obj[key] = inp.value === "" ? null : (parseFloat(inp.value) || 0);
    if (onChange) onChange();
  });
  return inp;
}
function inputTxt(obj, key) {
  const inp = el("input", { type: "text", value: obj[key] == null ? "" : String(obj[key]) });
  inp.addEventListener("input", () => { obj[key] = inp.value; });
  return inp;
}
function campoNum(label, obj, key) {
  return el("div", { class: "field" }, [el("label", {}, label), inputNum(obj, key, "0.01")]);
}
function campoTxt(label, obj, key, extra) {
  return el("div", { class: "field" + (extra ? " " + extra : "") }, [el("label", {}, label), inputTxt(obj, key)]);
}
