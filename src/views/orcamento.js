import { el, limpar, toast, msgErro } from "../ui.js";
import { fmtBRL, fmtPct, fmtNum } from "../format.js";
import { temAcessoGerencial, ehGestor } from "../auth.js";
import {
  listarMateriais, listarEstados, getEmpresa, calcularOrcamento,
  salvarProposta, reabrirProposta, novaRevisao, obterProposta, solicitarDesconto, getMargemMinima,
} from "../api.js";
// pdf.js (jsPDF + logo) é pesado e só usado ao gerar o PDF → import dinâmico.

const MAX_QTD = 6;

export async function renderOrcamento(container, perfil, opts) {
  const gerencial = temAcessoGerencial(perfil?.papel);
  const gestor = ehGestor(perfil?.papel);
  // proposta atualmente aberta/editada (null = nova, ainda não salva)
  let propostaAtual = null; // { id, numero, status }

  // Carrega dados de apoio (dropdowns + empresa p/ PDF).
  let materiais = [], estados = [], empresa = null, margemMinima = 0;
  try {
    [materiais, estados, empresa] = await Promise.all([listarMateriais(), listarEstados(), getEmpresa()]);
    if (gestor) { try { margemMinima = await getMargemMinima(); } catch { margemMinima = 0; } }
  } catch (e) {
    container.appendChild(el("div", { class: "card" }, [
      el("h2", {}, "Erro ao carregar dados"), el("p", { class: "hint" }, msgErro(e)),
    ]));
    return;
  }

  // --- Estado da tela ---
  let tipo = "pre-cortada";
  let ultimosResultados = [];      // cada item: objeto da RPC + contexto
  let selecionadoIdx = 0;
  const itensProposta = [];

  // ---------- Form ----------
  const inNome = el("input", { id: "f-cliente", type: "text", placeholder: "Razão social ou nome fantasia" });
  const selEstado = el("select", { id: "f-estado" },
    estados.map((e) => el("option", { value: e.uf }, e.uf + " — " + e.nome)));
  selEstado.value = "SP";
  const icmsView = el("input", { type: "text", disabled: "", class: "mono" });
  function syncIcms() {
    const e = estados.find((x) => x.uf === selEstado.value);
    icmsView.value = e ? fmtPct(e.icms) : "—";
  }
  selEstado.addEventListener("change", syncIcms); syncIcms();

  const cardCliente = el("div", { class: "card" }, [
    el("h2", {}, [el("span", { class: "n" }, "01"), " Cliente"]),
    el("div", { class: "grid" }, [
      campo("Nome do cliente", inNome, "span2"),
      campo("Estado de faturamento (UF)", selEstado),
      campo("ICMS do estado", icmsView),
    ]),
  ]);

  // Tipo + dimensões + quantidades
  const btnPre = el("button", { type: "button", class: "seg ativo" }, "Pré-cortada");
  const btnRolo = el("button", { type: "button", class: "seg" }, "Rolo contínuo");
  const inPcLarg = el("input", { type: "number", min: "0", step: "0.1", value: "100" });
  const inPcAlt = el("input", { type: "number", min: "0", step: "0.1", value: "150" });
  const inRcLarg = el("input", { type: "number", min: "0", step: "0.1", value: "100" });
  const inRcComp = el("input", { type: "number", min: "0", step: "0.1", value: "40" });

  const qtdGrid = el("div", { class: "grid g3 qtd-grid" });
  function addCampoQtd(valor) {
    const n = qtdGrid.querySelectorAll(".qtd-field").length + 1;
    if (n > MAX_QTD) { toast("Máximo de " + MAX_QTD + " quantidades por item."); return; }
    const inp = el("input", { type: "number", min: "0", step: "1", class: "qtd-field" });
    if (valor != null) inp.value = valor;
    qtdGrid.appendChild(el("div", { class: "field" }, [
      el("label", {}, "Quantidade " + n + (tipo === "pre-cortada" ? " (etiquetas)" : " (rolos)")),
      inp,
    ]));
  }
  function resetQtd(primeiroValor) { limpar(qtdGrid); addCampoQtd(primeiroValor); }
  function lerQuantidades() {
    return Array.from(qtdGrid.querySelectorAll(".qtd-field"))
      .map((i) => parseFloat(i.value)).filter((v) => v > 0);
  }
  const btnAddQtd = el("button", { type: "button", class: "btn btn-ghost sm", onclick: () => addCampoQtd() }, "+ Adicionar quantidade");

  const blocoPre = el("div", {}, [
    el("div", { class: "grid g3" }, [campo("Largura (mm)", inPcLarg), campo("Altura (mm)", inPcAlt)]),
  ]);
  const blocoRolo = el("div", { style: "display:none;" }, [
    el("div", { class: "grid g3" }, [campo("Largura (mm)", inRcLarg), campo("Comprimento do rolo (m)", inRcComp)]),
  ]);
  function setTipo(novo) {
    tipo = novo;
    btnPre.classList.toggle("ativo", novo === "pre-cortada");
    btnRolo.classList.toggle("ativo", novo === "rolo-continuo");
    blocoPre.style.display = novo === "pre-cortada" ? "" : "none";
    blocoRolo.style.display = novo === "rolo-continuo" ? "" : "none";
    resetQtd(novo === "pre-cortada" ? "10000" : "200");
  }
  btnPre.addEventListener("click", () => setTipo("pre-cortada"));
  btnRolo.addEventListener("click", () => setTipo("rolo-continuo"));

  const cardTipo = el("div", { class: "card" }, [
    el("h2", {}, [el("span", { class: "n" }, "02"), " Tipo de etiqueta"]),
    el("div", { class: "segmented" }, [btnPre, btnRolo]),
    el("div", { style: "margin-top:14px;" }, [blocoPre, blocoRolo]),
    qtdGrid,
    btnAddQtd,
    el("p", { class: "hint" }, "Adicione mais quantidades para comparar cenários na mesma proposta (até 6)."),
  ]);

  // Material
  const selMaterial = el("select", { id: "f-material" },
    materiais.map((m) => el("option", { value: m.id }, m.descricao)));
  const cardMaterial = el("div", { class: "card" }, [
    el("h2", {}, [el("span", { class: "n" }, "03"), " Material"]),
    el("div", { class: "grid" }, [campo("Matéria-prima", selMaterial, "span2")]),
  ]);

  // Continuidade e comercial
  const chkCont = el("input", { type: "checkbox", id: "f-cont" });
  const inMeses = el("input", { type: "number", min: "1", step: "1", value: "4" });
  const blocoCont = el("div", { class: "grid", style: "display:none;" }, [campo("Duração do contrato (meses)", inMeses)]);
  chkCont.addEventListener("change", () => { blocoCont.style.display = chkCont.checked ? "" : "none"; });
  const inComissao = el("input", { type: "number", min: "0", step: "0.1", value: "0" });
  // Ajuste de preço do gestor: automático (faixa), margem manual, desconto % ou preço-alvo.
  const selModo = el("select", {}, [
    el("option", { value: "auto" }, "Automático (por faixa)"),
    el("option", { value: "margem" }, "Margem manual (%)"),
    el("option", { value: "desconto" }, "Desconto no preço (%)"),
    el("option", { value: "alvo" }, "Preço-alvo (total R$)"),
  ]);
  const inAjuste = el("input", { type: "number", step: "0.01", placeholder: "—", disabled: "" });
  const hintAjuste = el("small", { class: "hint" }, "Preço automático pela faixa de preço.");
  function syncModo() {
    const m = selModo.value;
    inAjuste.disabled = (m === "auto");
    if (m === "auto") { inAjuste.value = ""; hintAjuste.textContent = "Preço automático pela faixa de preço."; }
    else if (m === "margem") hintAjuste.textContent = "Margem fixa para este item (sobrepõe a faixa).";
    else if (m === "desconto") hintAjuste.textContent = "Desconto percentual sobre o preço automático. A margem resultante aparece no detalhamento.";
    else if (m === "alvo") hintAjuste.textContent = "Preço total desejado (converte em desconto). Use com 1 quantidade.";
  }
  selModo.addEventListener("change", syncModo);
  const campoAjuste = gestor
    ? el("div", { class: "field span2" }, [
        el("label", {}, "Ajuste de preço (gestor)"),
        el("div", { class: "grid" }, [selModo, inAjuste]),
        hintAjuste,
      ])
    : null;
  const cardComercial = el("div", { class: "card" }, [
    el("h2", {}, [el("span", { class: "n" }, "04"), " Continuidade e comercial"]),
    el("label", { class: "checkrow" }, [chkCont, el("span", {}, " Projeto com continuidade (permite diluir a faca)")]),
    blocoCont,
    el("div", { class: "grid" }, [campo("Comissão (%)", inComissao)]),
    ...(campoAjuste ? [campoAjuste] : []),
  ]);

  // Dados da proposta
  const inCond = el("input", { type: "text", value: "30 DDL" });
  const inValidade = el("input", { type: "number", min: "1", step: "1", value: "7" });
  const selFrete = el("select", {}, [
    el("option", { value: "1 - DESTINATÁRIO" }, "1 - DESTINATÁRIO"),
    el("option", { value: "0 - EMITENTE" }, "0 - EMITENTE"),
  ]);
  const inContato = el("input", { type: "text", placeholder: "Nome - telefone - e-mail" });
  if (perfil?.contato_comercial) inContato.value = perfil.contato_comercial;  // auto do login
  const inObs = el("textarea", { placeholder: "Uma por linha — aparecem no PDF como tópicos. Em branco = sem observações." });
  const cardProposta = el("div", { class: "card" }, [
    el("h2", {}, [el("span", { class: "n" }, "05"), " Dados da proposta"]),
    el("div", { class: "grid g3" }, [
      campo("Condição de pagamento", inCond),
      campo("Validade da proposta (dias)", inValidade),
      campo("Frete (condição de entrega)", selFrete),
    ]),
    campo("Contato comercial", inContato, "span2"),
    campo("Observações da proposta", inObs, "span2"),
  ]);

  // Botão calcular + resultado
  const btnCalcular = el("button", { class: "btn btn-primary", style: "width:100%;" }, "Calcular orçamento");
  const erroCalc = el("div", { class: "erro-box", style: "display:none;" });
  const cardResultado = el("div", { class: "card", style: "display:none;" });
  const cardItens = el("div", { class: "card", style: "display:none;" });

  btnCalcular.addEventListener("click", () => calcular());

  async function calcular() {
    try {
      const qtds = lerQuantidades();
      if (!qtds.length) throw new Error("informe ao menos uma quantidade válida");
      const material = materiais.find((m) => m.id === selMaterial.value);
      const estado = estados.find((e) => e.uf === selEstado.value);
      const larguraMm = parseFloat(tipo === "pre-cortada" ? inPcLarg.value : inRcLarg.value) || 0;
      const alturaMm = tipo === "pre-cortada" ? (parseFloat(inPcAlt.value) || 0) : null;
      const comprimentoM = tipo === "rolo-continuo" ? (parseFloat(inRcComp.value) || 0) : null;
      const continuidade = chkCont.checked;
      const meses = continuidade ? (parseInt(inMeses.value, 10) || 1) : null;
      const comissao = parseFloat(inComissao.value) || 0;
      const baseReq = {
        tipo, materialId: selMaterial.value, larguraMm, alturaMm, comprimentoM,
        quantidades: qtds, continuidade, meses, comissao, estadoUf: selEstado.value,
      };

      // Ajuste de preço do gestor (automático / margem / desconto / preço-alvo)
      let margemManual = null, descontoPct = null;
      if (gestor) {
        const modo = selModo.value;
        const val = parseFloat(inAjuste.value);
        if (modo === "margem" && !isNaN(val)) margemManual = val;
        else if (modo === "desconto" && !isNaN(val)) descontoPct = val;
        else if (modo === "alvo" && !isNaN(val) && val > 0) {
          // converte o preço-alvo em desconto % usando o preço automático
          const auto = await calcularOrcamento(baseReq);
          const ap = auto[0] && auto[0].preco;
          if (ap > 0) descontoPct = (1 - val / ap) * 100;
          if (qtds.length > 1) toast("Preço-alvo aplicado como desconto uniforme nas quantidades.");
        }
      }

      const resultados = await calcularOrcamento({ ...baseReq, margemManual, descontoPct });

      const descricaoFormato = tipo === "pre-cortada"
        ? "Etiqueta " + larguraMm + " x " + alturaMm + " mm"
        : "Rolo contínuo " + larguraMm + " x " + comprimentoM + " m";

      // enriquece cada resultado com contexto para render/pdf/gravação
      ultimosResultados = resultados.map((r) => ({
        ...r, tipo, descricaoFormato,
        materialDescricao: material ? material.descricao : "", materialId: selMaterial.value,
        estadoNome: estado ? estado.nome : "", estadoUf: selEstado.value,
        larguraMm, alturaMm, comprimentoM, continuidade, meses, comissao, margemManual, descontoPct,
      }));
      selecionadoIdx = 0;
      erroCalc.style.display = "none";
      renderResultado();
    } catch (e) {
      erroCalc.textContent = "Não foi possível calcular: " + msgErro(e);
      erroCalc.style.display = "block";
      cardResultado.style.display = "none";
    }
  }

  // ---------- Render do resultado ----------
  function renderResultado() {
    const r = ultimosResultados[selecionadoIdx];
    cardResultado.style.display = "";
    limpar(cardResultado);
    cardResultado.appendChild(el("h2", {}, [el("span", { class: "n" }, "06"), " Resultado"]));

    const qtdUnit = r.quantidade || 1;
    const unidade = r.tipo === "pre-cortada" ? "etiqueta" : "rolo";
    cardResultado.appendChild(el("div", { class: "result-final" }, [
      el("div", { class: "result-label" }, "Preço de venda total"),
      el("div", { class: "result-big mono" }, fmtBRL(r.preco)),
      el("div", { class: "hint", html:
        fmtBRL(r.preco / qtdUnit) + " / " + unidade +
        (r.continuidade ? " · faca diluída em " + r.meses + " meses" : "") +
        "<br>Com IPI (" + fmtPct(r.ipi) + "): <strong>" + fmtBRL(r.preco_com_ipi) + "</strong>" }),
    ]));

    // Aviso de margem mínima (gestor): quando o desconto/margem derruba abaixo do piso
    if (gestor && margemMinima > 0 && r.margem != null && r.margem < margemMinima) {
      cardResultado.appendChild(el("div", { class: "erro-box", style: "margin-top:12px;" },
        "Atenção: margem resultante de " + fmtPct(r.margem) + " está abaixo da margem mínima (" + fmtPct(margemMinima) + ")."));
    }

    // Comparativo de quantidades
    if (ultimosResultados.length > 1) cardResultado.appendChild(renderComparativo());

    // Botões
    const emitidaAtual = propostaAtual && propostaAtual.status === "emitida";
    const btnAddItem = el("button", { class: "btn btn-primary", style: "flex:1;min-width:200px;", ...(emitidaAtual ? { disabled: "" } : {}) },
      emitidaAtual ? "Proposta emitida (reabra para editar)" : "Adicionar item à proposta");
    if (!emitidaAtual) btnAddItem.addEventListener("click", adicionarItem);
    const botoes = [btnAddItem];
    let painel = null;
    if (gerencial) {
      const btnDet = el("button", { class: "btn btn-ghost", style: "flex:1;min-width:200px;" }, "Detalhar (gerencial)");
      painel = el("div", { style: "display:none;margin-top:16px;" });
      btnDet.addEventListener("click", () => {
        const aberto = painel.style.display !== "none";
        painel.style.display = aberto ? "none" : "";
        btnDet.textContent = aberto ? "Detalhar (gerencial)" : "Ocultar detalhamento";
      });
      botoes.push(btnDet);
    }
    cardResultado.appendChild(el("div", { class: "row-btns", style: "margin-top:14px;flex-wrap:wrap;" }, botoes));
    if (painel) { renderPainelGerencial(painel, r); cardResultado.appendChild(painel); }
  }

  function renderComparativo() {
    const wrap = el("div", { style: "margin-top:14px;" });
    wrap.appendChild(el("div", { class: "hint", html: "<b>Comparativo de quantidades</b> — selecione um cenário para ver o detalhamento" }));
    const tbody = el("tbody");
    ultimosResultados.forEach((r, i) => {
      const unit = r.preco / (r.quantidade || 1);
      const btn = el("button", { class: "btn btn-ghost sm" }, i === selecionadoIdx ? "selecionado" : "ver detalhe");
      btn.addEventListener("click", () => { selecionadoIdx = i; renderResultado(); });
      tbody.appendChild(el("tr", { class: i === selecionadoIdx ? "linha-sel" : "" }, [
        el("td", {}, fmtNum(r.quantidade, 0)),
        el("td", { class: "mono" }, fmtBRL(unit)),
        el("td", { class: "mono" }, fmtBRL(r.preco)),
        el("td", {}, btn),
      ]));
    });
    wrap.appendChild(el("table", { class: "tbl" }, [
      el("thead", {}, el("tr", {}, [el("th", {}, "Quantidade"), el("th", {}, "Preço unit."), el("th", {}, "Preço total"), el("th", {})])),
      tbody,
    ]));
    return wrap;
  }

  // ---------- Painel gerencial (só visualizador/gestor) ----------
  function renderPainelGerencial(painel, r) {
    limpar(painel);
    painel.appendChild(el("hr", { class: "sep" }));
    painel.appendChild(el("div", { class: "hint", style: "margin-bottom:10px;" },
      "Estrutura de custo e formação de preço — uso interno, não aparece na proposta do cliente."));

    // Produção / desperdício / tempos
    const info = el("div", { class: "det-wrap" });
    if (r.pistas_info) {
      const pi = r.pistas_info;
      const maqNome = r.rota_escolhida && r.rota_escolhida.indexOf("turo") !== -1 ? "Turo" : "Troqueladora";
      info.appendChild(el("div", { class: "hint" },
        pi.pistas + " pista(s) na " + maqNome + " — bobina cortada em " + pi.basePadraoMm +
        "mm (ocupando " + pi.larguraCalculadaMm + "mm) da bobina mãe de " + pi.bobina_mae + "mm."));
    }
    if (r.detalhe) {
      const d = r.detalhe;
      const desp = d.com_acerto - d.producao;
      const despPct = (desp / d.com_acerto) * 100;
      const u = (d.unidade || "").toLowerCase();
      info.appendChild(el("div", { class: "hint", style: "line-height:1.6;", html:
        "Produção: " + fmtNum(d.producao, 3) + " " + u +
        " · com perda de processo: " + fmtNum(d.com_perda, 3) + " " + u +
        " · + acerto (" + fmtNum(d.acerto, 3) + "): <b>" + fmtNum(d.com_acerto, 3) + " " + u + "</b>" +
        (r.area_m2 != null ? " · área consumida: <b>" + fmtNum(r.area_m2, 3) + " m²</b>" : "") +
        " · desperdício: <b>" + fmtNum(desp, 3) + " " + u + " (" + fmtNum(despPct, 1) + "%)</b>" }));
      if (r.detalhe_rebobinagem) {
        const dr = r.detalhe_rebobinagem;
        info.appendChild(el("div", { class: "hint", html:
          "Rebobinagem: rebobina os <b>" + fmtNum(dr.metros, 3) + "m</b> já formados" +
          (dr.tempo != null ? " · tempo " + fmtNum(dr.tempo, 2) + "h" : "") }));
      }
    }
    if (r.tempos && r.tempos.length) {
      const total = r.tempos.reduce((s, t) => s + Number(t.horas), 0);
      const txt = r.tempos.map((t) => t.maquina + ": " + fmtNum(Number(t.horas), 2) + "h").join(" · ");
      info.appendChild(el("div", { class: "hint", html:
        "Tempo de máquina: " + txt + (r.tempos.length > 1 ? " · <b>total: " + fmtNum(total, 2) + "h</b>" : "") }));
    }
    painel.appendChild(info);

    // Comparativo de rota (faca nova)
    if (r.comparativo_rota) {
      const cr = r.comparativo_rota;
      painel.appendChild(el("div", { class: "hint", style: "margin-top:8px;", html:
        "Rota de corte — Troqueladora: <b>" + fmtBRL(Number(cr.troqueladora_total)) + "</b> · Turo: <b>" +
        fmtBRL(Number(cr.turo_total)) + "</b> · escolhida: <b>" + cr.vencedora + "</b>" }));
    }

    painel.appendChild(el("hr", { class: "sep" }));

    // Formação de preço (preço × percentual "por dentro")
    const subtotalPosPis = r.custo_total / (1 - r.pis_cofins / 100);
    const valorPis = subtotalPosPis - r.custo_total;
    const linhas = [
      ["Custo material", r.custo_material, null],
      ["Custo máquina", r.custo_maquina, null],
    ];
    if (r.custo_faca > 0) linhas.push([r.custo_faca_integral !== r.custo_faca ? "Faca/afiação (parcela diluída)" : "Faca/afiação", r.custo_faca, null]);
    linhas.push(["CUSTO TOTAL (produção)", r.custo_total, "subtotal"]);
    linhas.push(["+ PIS/COFINS", valorPis, null, r.pis_cofins]);
    linhas.push(["SUBTOTAL", subtotalPosPis, "subtotal"]);
    linhas.push(["+ ICMS (" + r.estadoNome + ")", r.preco * r.icms / 100, null, r.icms]);
    linhas.push(["+ IRRF/CSLL", r.preco * r.irrf / 100, null, r.irrf]);
    linhas.push(["+ Comissão", r.preco * (r.comissao || 0) / 100, null, r.comissao || 0]);
    linhas.push(["+ Frete", r.preco * (r.frete || 0) / 100, null, r.frete || 0]);
    linhas.push(["+ Margem", r.preco * r.margem / 100, null, r.margem]);
    linhas.push(["PREÇO FINAL", r.preco, "total"]);
    linhas.push(["+ IPI", r.preco_com_ipi - r.preco, null, r.ipi]);
    linhas.push(["PREÇO FINAL COM IPI", r.preco_com_ipi, "total"]);

    const bloco = el("div", {}, [el("div", { class: "hint", style: "margin-bottom:8px;", html: "<b>Formação de preço</b>" })]);
    linhas.forEach((l) => {
      const cls = "result-line" + (l[2] === "subtotal" ? " ger-subtotal" : l[2] === "total" ? " ger-total" : "");
      const pct = l[3] !== undefined ? ' <span class="pill">' + fmtPct(l[3]) + "</span>" : "";
      bloco.appendChild(el("div", { class: cls, html:
        '<span class="k">' + l[0] + pct + '</span><span class="v mono">' + fmtBRL(l[1]) + "</span>" }));
    });
    painel.appendChild(bloco);
  }

  // ---------- Itens da proposta ----------
  function adicionarItem() {
    if (propostaAtual && propostaAtual.status === "emitida") { toast("Proposta emitida. Reabra para editar."); return; }
    if (!ultimosResultados.length) { toast("Calcule o orçamento antes de adicionar o item."); return; }
    const p = ultimosResultados[0];
    itensProposta.push({
      tipo: p.tipo, descricaoFormato: p.descricaoFormato, materialDescricao: p.materialDescricao, materialId: p.materialId,
      larguraMm: p.larguraMm, alturaMm: p.alturaMm, comprimentoM: p.comprimentoM,
      continuidade: p.continuidade, meses: p.meses, comissao: p.comissao,
      margemManual: p.margemManual, descontoPct: p.descontoPct,
      icms: p.icms, irrf: p.irrf, pisCofins: p.pis_cofins, ipi: p.ipi,
      variantes: ultimosResultados.map((r) => ({ quantidade: r.quantidade, preco: r.preco, precoComIpi: r.preco_com_ipi })),
    });
    renderItens();
    toast("Item adicionado à proposta (" + itensProposta.length + " item(ns)).", "ok");
  }

  function montarHeaderEItens(extra) {
    const header = {
      cliente: inNome.value || "(cliente não informado)",
      estado_uf: selEstado.value,
      condicao_pagamento: inCond.value,
      validade_dias: parseInt(inValidade.value, 10) || null,
      frete_texto: selFrete.value,
      observacoes: inObs.value || null,
      ...(extra || {}),
    };
    const itens = itensProposta.map((it, i) => ({
      ordem: i + 1, tipo: it.tipo, material_id: it.materialId, descricao_formato: it.descricaoFormato,
      largura_mm: it.larguraMm, altura_mm: it.alturaMm, comprimento_m: it.comprimentoM,
      continuidade: it.continuidade, meses: it.meses, comissao: it.comissao,
      margem_manual: it.margemManual ?? null, desconto_pct: it.descontoPct ?? null,
      quantidades: it.variantes.map((v) => v.quantidade),
    }));
    return { header, itens };
  }

  async function salvarOuEmitir(emitir) {
    if (!itensProposta.length) { toast("Adicione ao menos um item antes de salvar."); return; }
    const { header, itens } = montarHeaderEItens();
    try {
      const res = await salvarProposta(header, itens, emitir, propostaAtual?.id);
      propostaAtual = res;
      toast(emitir ? ("Proposta emitida: nº " + res.numero) : "Rascunho salvo.", "ok");
      renderItens();
    } catch (e) { toast("Erro ao salvar: " + msgErro(e), "erro"); }
  }

  // Carrega uma proposta salva nos campos + lista de itens (para ver/editar/PDF).
  async function carregarProposta(id) {
    const prop = await obterProposta(id);
    propostaAtual = { id: prop.id, numero: prop.numero, status: prop.status, seq: prop.seq, revisao: prop.revisao };
    inNome.value = prop.cliente || "";
    selEstado.value = prop.estado_uf || "SP"; syncIcms();
    inCond.value = prop.condicao_pagamento || "";
    inValidade.value = prop.validade_dias ?? "";
    selFrete.value = prop.frete_texto || "1 - DESTINATÁRIO";
    inObs.value = prop.observacoes || "";
    itensProposta.length = 0;
    (prop.itens || []).forEach((it) => {
      itensProposta.push({
        tipo: it.tipo, descricaoFormato: it.descricao_formato, materialDescricao: it.material_descricao, materialId: it.material_id,
        larguraMm: it.largura_mm, alturaMm: it.altura_mm, comprimentoM: it.comprimento_m,
        continuidade: it.continuidade, meses: it.meses, comissao: it.comissao,
        margemManual: it.margem_manual, descontoPct: it.desconto_pct,
        icms: it.icms, irrf: it.irrf, pisCofins: it.pis_cofins, ipi: it.ipi,
        variantes: (it.quantidades || []).map((q) => ({ quantidade: q.quantidade, preco: q.preco, precoComIpi: q.preco_com_ipi })),
      });
    });
    renderItens();
    cardItens.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderItens() {
    limpar(cardItens);
    if (!itensProposta.length) { cardItens.style.display = "none"; return; }
    cardItens.style.display = "";
    const emitida = propostaAtual && propostaAtual.status === "emitida";
    // Estado do rascunho: nova proposta (sem seq), correção (seq+revisao) ou nova revisão (seq, sem revisao)
    const ehCorrecao = !emitida && propostaAtual && propostaAtual.seq != null && propostaAtual.revisao != null;
    const ehNovaRev = !emitida && propostaAtual && propostaAtual.seq != null && propostaAtual.revisao == null;
    let badgeTxt = "Não salva";
    if (emitida) badgeTxt = "Emitida nº " + propostaAtual.numero;
    else if (ehCorrecao) badgeTxt = "Corrigindo nº " + propostaAtual.numero;
    else if (ehNovaRev) badgeTxt = "Nova revisão da proposta " + String(propostaAtual.seq).padStart(4, "0");
    else if (propostaAtual && propostaAtual.numero) badgeTxt = "Rascunho nº " + propostaAtual.numero;
    const titulo = el("div", { class: "row-btns", style: "justify-content:space-between;align-items:center;" }, [
      el("h2", { style: "margin:0;" }, "Itens da proposta"),
      el("span", { class: "pill", style: emitida ? "background:color-mix(in srgb,var(--good) 16%,transparent);color:var(--good);" : "" }, badgeTxt),
    ]);
    cardItens.appendChild(titulo);
    cardItens.appendChild(el("p", { class: "hint", style: "margin-bottom:10px;" },
      emitida
        ? "Proposta emitida (congelada). 'Corrigir esta revisão' ajusta o mesmo número; 'Nova revisão' gera a próxima versão."
        : "Itens já adicionados. Troque material/formato/quantidade e adicione quantos precisar antes de salvar."));
    const tbody = el("tbody");
    itensProposta.forEach((item, idx) => {
      item.variantes.slice().sort((a, b) => a.quantidade - b.quantidade).forEach((v, vi) => {
        const unit = v.preco / (v.quantidade || 1);
        const delBtn = (vi === 0 && !emitida) ? el("button", { class: "btn btn-ghost sm" }, "remover") : null;
        if (delBtn) delBtn.addEventListener("click", () => { itensProposta.splice(idx, 1); renderItens(); });
        tbody.appendChild(el("tr", {}, [
          el("td", {}, (idx + 1) + (item.variantes.length > 1 ? "." + (vi + 1) : "")),
          el("td", {}, item.descricaoFormato + " — " + item.materialDescricao),
          el("td", { class: "mono" }, fmtNum(v.quantidade, 0)),
          el("td", { class: "mono" }, fmtBRL(unit)),
          el("td", { class: "mono" }, fmtBRL(v.preco)),
          el("td", {}, delBtn || ""),
        ]));
      });
    });
    cardItens.appendChild(el("table", { class: "tbl" }, [
      el("thead", {}, el("tr", {}, ["Item", "Produto", "Quantidade", "Preço unit.", "Preço total", ""].map((h) => el("th", {}, h)))),
      tbody,
    ]));
    const btnPdf = el("button", { class: "btn btn-ghost", style: "flex:1;min-width:160px;" }, "Gerar proposta em PDF");
    btnPdf.addEventListener("click", async () => {
      try {
        const { gerarProposta } = await import("../pdf.js");
        gerarProposta(itensProposta, {
          cliente: inNome.value || "(cliente não informado)",
          estadoUf: selEstado.value,
          numero: propostaAtual?.numero, status: propostaAtual?.status,
          condicaoPagamento: inCond.value, validadeDias: inValidade.value,
          freteTexto: selFrete.value, contatoComercial: inContato.value || "-",
          observacoes: (inObs.value || "").split("\n").map((s) => s.trim()).filter(Boolean),
        }, empresa);
      } catch (e) { toast(msgErro(e), "erro"); }
    });

    const acoes = [];
    const btnEstilo = "flex:1;min-width:160px;";
    if (emitida) {
      const btnCorrigir = el("button", { class: "btn btn-ghost", style: btnEstilo }, "Corrigir esta revisão");
      btnCorrigir.addEventListener("click", async () => {
        try {
          await reabrirProposta(propostaAtual.id);
          propostaAtual.status = "rascunho"; // mantém seq+revisao → correção (mesmo número)
          toast("Revisão reaberta para correção.", "ok"); renderItens();
        } catch (e) { toast(msgErro(e), "erro"); }
      });
      const btnNovaRev = el("button", { class: "btn btn-ghost", style: btnEstilo }, "Nova revisão");
      btnNovaRev.addEventListener("click", async () => {
        try {
          const novoId = await novaRevisao(propostaAtual.id);
          await carregarProposta(novoId); // carrega o rascunho da nova revisão
          toast("Nova revisão criada (rascunho). Ajuste e emita.", "ok");
        } catch (e) { toast(msgErro(e), "erro"); }
      });
      acoes.push(btnPdf, btnCorrigir, btnNovaRev);
    } else {
      const btnSalvar = el("button", { class: "btn btn-ghost", style: btnEstilo }, "Salvar rascunho");
      btnSalvar.addEventListener("click", () => salvarOuEmitir(false));
      const emitLabel = ehCorrecao ? "Emitir correção" : ehNovaRev ? "Emitir nova revisão" : "Emitir proposta";
      const btnEmitir = el("button", { class: "btn btn-primary", style: btnEstilo }, emitLabel);
      btnEmitir.addEventListener("click", () => salvarOuEmitir(true));
      acoes.push(btnSalvar, btnEmitir, btnPdf);
    }
    // SDR/visualizador: pedir avaliação de desconto (só quando a proposta já está salva)
    if (!gestor && propostaAtual && propostaAtual.id) {
      const btnSolic = el("button", { class: "btn btn-ghost", style: btnEstilo }, "Solicitar avaliação de desconto");
      btnSolic.addEventListener("click", abrirSolicitarDesconto);
      acoes.push(btnSolic);
    }
    cardItens.appendChild(el("div", { class: "row-btns", style: "margin-top:14px;flex-wrap:wrap;" }, acoes));
  }

  // Monta a tela
  resetQtd("10000");
  container.appendChild(el("div", { class: "orcamento" }, [
    cardCliente, cardTipo, cardMaterial, cardComercial, cardProposta,
    btnCalcular, erroCalc, cardResultado, cardItens,
  ]));

  // Abre uma proposta vinda da aba Propostas (após montar a tela).
  if (opts && opts.abrir) {
    carregarProposta(opts.abrir).catch((e) => toast("Erro ao abrir proposta: " + msgErro(e), "erro"));
  }

  // Tela de solicitação de desconto (SDR/visualizador): tabela por item × quantidade.
  async function abrirSolicitarDesconto() {
    if (!propostaAtual || !propostaAtual.id) { toast("Salve a proposta antes de solicitar avaliação."); return; }
    let prop;
    try { prop = await obterProposta(propostaAtual.id); }
    catch (e) { toast(msgErro(e), "erro"); return; }

    const overlay = el("div", { class: "overlay" });
    const tbody = el("tbody");
    const refs = []; // { item_id, quantidade, inAlvo, inDesc }
    (prop.itens || []).forEach((it) => {
      (it.quantidades || []).slice().sort((a, b) => a.quantidade - b.quantidade).forEach((q) => {
        const unit = q.preco / (q.quantidade || 1);
        const inAlvo = el("input", { type: "number", step: "0.0001", min: "0", placeholder: "—", style: "max-width:110px;" });
        const inDesc = el("input", { type: "number", step: "0.01", min: "0", placeholder: "—", style: "max-width:90px;" });
        refs.push({ item_id: it.id, quantidade: q.quantidade, inAlvo, inDesc });
        tbody.appendChild(el("tr", {}, [
          el("td", {}, it.descricao_formato + " — " + it.material_descricao),
          el("td", { class: "mono" }, fmtNum(q.quantidade, 0)),
          el("td", { class: "mono" }, fmtBRL(unit)),
          el("td", {}, inAlvo),
          el("td", {}, inDesc),
        ]));
      });
    });
    const txt = el("input", { type: "text", placeholder: "Observação (opcional)" });
    const form = el("form", { class: "card modal", style: "max-width:720px;" }, [
      el("h2", {}, "Solicitar desconto"),
      el("p", { class: "hint", style: "margin-bottom:8px;" }, "Preencha, por linha, o preço-alvo unitário e/ou o desconto %. O gestor avalia e devolve."),
      el("div", { class: "tbl-scroll" }, [
        el("table", { class: "tbl" }, [
          el("thead", {}, el("tr", {}, ["Descrição", "Qtde.", "Preço unit.", "Preço alvo (un.)", "Desconto %"].map((h) => el("th", {}, h)))),
          tbody,
        ]),
      ]),
      el("div", { style: "margin-top:10px;" }, [txt]),
      el("div", { class: "row-btns", style: "margin-top:12px;" }, [
        el("button", { type: "button", class: "btn btn-ghost", onclick: () => overlay.remove() }, "Cancelar"),
        el("button", { type: "submit", class: "btn btn-primary" }, "Enviar ao gestor"),
      ]),
    ]);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const linhas = refs
        .map((r) => ({ item_id: r.item_id, quantidade: r.quantidade, alvo: r.inAlvo.value, desconto: r.inDesc.value }))
        .filter((l) => l.alvo !== "" || l.desconto !== "");
      if (!linhas.length) { toast("Preencha ao menos uma linha (alvo ou desconto)."); return; }
      try { await solicitarDesconto(propostaAtual.id, txt.value, linhas); toast("Pedido enviado ao gestor.", "ok"); overlay.remove(); }
      catch (err) { toast(msgErro(err), "erro"); }
    });
    overlay.appendChild(form);
    document.body.appendChild(overlay);
  }
}

function campo(label, input, extra) {
  return el("div", { class: "field" + (extra ? " " + extra : "") }, [el("label", {}, label), input]);
}
