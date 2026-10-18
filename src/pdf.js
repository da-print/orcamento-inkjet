import { jsPDF } from "jspdf";
import { LOGO_PNG_BASE64 } from "./logo.js";
import { fmtBRL, fmtPct, fmtNum } from "./format.js";

// Gera a proposta comercial em PDF (layout espelha o relatório do iQuattro).
// itens: [{ tipo, descricaoFormato, materialDescricao, continuidade, meses,
//           icms, irrf, pisCofins, ipi, variantes: [{ quantidade, preco, precoComIpi }] }]
// meta:  { cliente, estadoUf, condicaoPagamento, validadeDias, freteTexto, contatoComercial, observacoes[] }
export function gerarProposta(itens, meta, empresa) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const left = 42, right = 553;
  let y = 40;
  const emitida = meta.status === "emitida" && meta.numero;
  const numeroTopo = emitida ? ("Nº " + meta.numero) : ("RASCUNHO-" + new Date().toISOString().slice(0, 10).replace(/-/g, ""));
  const emp = empresa || {};
  const colX = { item: left + 2, desc: left + 26, qtdR: 306, un: left + 268, unitR: 398, totR: 468, totIpiR: right };

  function cabecalhoTabela() {
    doc.setFillColor(237, 230, 229);
    doc.rect(left, y - 10, right - left, 14, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(7.5);
    doc.text("Item", colX.item, y);
    doc.text("Descrição dos Produtos", colX.desc, y);
    doc.text("Qtde.", colX.qtdR, y, { align: "right" });
    doc.text("Un.", colX.un, y);
    doc.text("Preço Unitário", colX.unitR, y, { align: "right" });
    doc.text("Total", colX.totR, y, { align: "right" });
    doc.text("Total c/ IPI", colX.totIpiR, y, { align: "right" });
    y += 14;
  }
  function quebrar(espaco) {
    if (y + espaco > 760) { doc.addPage(); y = 40; cabecalhoTabela(); }
  }

  try { doc.addImage("data:image/png;base64," + LOGO_PNG_BASE64, "PNG", left, y - 6, 78, 25); } catch (e) { /* segue sem logo */ }
  doc.setFont("helvetica", "bold"); doc.setFontSize(9.5);
  doc.text(emp.razao_social || "", left + 90, y + 4);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8);
  doc.text("CNPJ: " + (emp.cnpj || "") + "   IE: " + (emp.ie || ""), left + 90, y + 15);
  doc.text("Tel.: " + (emp.telefone || "") + "   Email: " + (emp.email || ""), left + 90, y + 26);

  doc.setFont("helvetica", "bold"); doc.setFontSize(13);
  doc.text("PROPOSTA COMERCIAL", right, y + 4, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(8);
  doc.text(numeroTopo, right, y + 15, { align: "right" });
  doc.text("Data: " + new Date().toLocaleString("pt-BR"), right, y + 26, { align: "right" });

  y += 46; doc.setLineWidth(1); doc.line(left, y, right, y); y += 18;

  doc.setFont("helvetica", "bold"); doc.setFontSize(9);
  doc.text("Cliente", left, y);
  doc.setFont("helvetica", "normal");
  doc.text((meta.cliente || "(cliente não informado)") + (meta.estadoUf ? "  (" + meta.estadoUf + ")" : ""), left + 70, y);
  y += 14;
  doc.setFont("helvetica", "italic"); doc.setFontSize(7.5); doc.setTextColor(120);
  doc.text(emitida ? "Status: EMITIDA" : "Status: RASCUNHO", left, y);
  doc.setFont("helvetica", "normal"); doc.setTextColor(0);
  y += 18;

  cabecalhoTabela();
  const descMaxWidth = colX.qtdR - 48 - colX.desc;

  itens.forEach((item, idx) => {
    doc.setFont("helvetica", "bold"); doc.setFontSize(8.5);
    const linhasDesc = doc.splitTextToSize(item.descricaoFormato + " — " + item.materialDescricao, descMaxWidth);
    const alturaDesc = linhasDesc.length * 10;
    const variantes = item.variantes.slice().sort((a, b) => a.quantidade - b.quantidade);
    const alturaQtd = variantes.length * 13;
    quebrar(Math.max(alturaDesc, alturaQtd) + 32);
    const codigo = ("00" + (idx + 1)).slice(-3);
    const yInicio = y;

    doc.setFont("helvetica", "bold"); doc.setFontSize(8.5);
    doc.text(codigo, colX.item, yInicio);
    linhasDesc.forEach((linha, li) => doc.text(linha, colX.desc, yInicio + li * 10));

    variantes.forEach((v, vi) => {
      const yLinha = yInicio + vi * 13;
      const unit = v.preco / (v.quantidade || 1);
      doc.setFont("helvetica", "normal");
      doc.text(fmtNum(v.quantidade, 0), colX.qtdR, yLinha, { align: "right" });
      doc.text(item.tipo === "pre-cortada" ? "UN" : "RL", colX.un, yLinha);
      doc.text(fmtBRL(unit), colX.unitR, yLinha, { align: "right" });
      doc.text(fmtBRL(v.preco), colX.totR, yLinha, { align: "right" });
      doc.text(fmtBRL(v.precoComIpi), colX.totIpiR, yLinha, { align: "right" });
    });

    y = yInicio + Math.max(alturaDesc, alturaQtd) + 1;
    doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(90);
    doc.text(
      "Impostos: ICMS " + fmtPct(item.icms) + ", IRRF/CSLL " + fmtPct(item.irrf) +
      ", PIS/COFINS " + fmtPct(item.pisCofins) + ", IPI " + fmtPct(item.ipi),
      colX.desc, y);
    doc.setTextColor(0); y += 11;

    if (item.continuidade) {
      doc.setFontSize(7.5); doc.setFont("helvetica", "italic"); doc.setTextColor(100);
      doc.text("Faca diluída em " + item.meses + " meses de contrato de continuidade.", colX.desc, y);
      doc.setFont("helvetica", "normal"); doc.setTextColor(0); y += 11;
    }
    y += 9;
  });

  quebrar(110);
  doc.setLineWidth(0.5); doc.line(left, y, right, y); y += 24;
  doc.setFillColor(237, 230, 229);
  doc.rect(left, y - 10, right - left, 14, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(8.5);
  doc.text("Termos e Condições de Venda", left + 2, y); y += 18;

  const termos = [
    ["Moeda da cotação:", "BRL (R$)"],
    ["Validade da proposta (dias):", String(meta.validadeDias ?? "-")],
    ["Condição de pagamento:", meta.condicaoPagamento || "-"],
    ["Frete:", meta.freteTexto || "-"],
    ["Contato Comercial:", meta.contatoComercial || "-"],
  ];
  doc.setFontSize(8.5);
  termos.forEach((t) => {
    doc.setFont("helvetica", "bold"); doc.text(t[0], left, y);
    doc.setFont("helvetica", "normal"); doc.text(t[1], left + 140, y);
    y += 14;
  });

  const obs = meta.observacoes || [];
  if (obs.length) {
    quebrar(13 + obs.length * 12);
    doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.text("Observações:", left, y); y += 13;
    doc.setFont("helvetica", "normal"); doc.setFontSize(8);
    obs.forEach((o) => {
      doc.splitTextToSize("• " + o, right - left - 4).forEach((linha) => {
        quebrar(12); doc.text(linha, left + 4, y); y += 12;
      });
    });
  }

  const footY = 780;
  doc.setLineWidth(0.5); doc.line(left, footY - 16, right, footY - 16);
  doc.setFontSize(7.5); doc.setTextColor(100);
  doc.text(emp.endereco || "", 297.5, footY, { align: "center" });
  doc.text(emp.site || "", 297.5, footY + 11, { align: "center" });

  const nomeCliente = (meta.cliente || "Cliente").trim();
  const sufixo = meta.numero ? " - PROPOSTA " + meta.numero : " - PROPOSTA (rascunho)";
  const arquivo = (nomeCliente + sufixo).replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
  doc.save(arquivo + ".pdf");
}
