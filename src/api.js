import { supabase } from "./supabase.js";

// Camada de acesso a dados. O cálculo roda SEMPRE no banco (RPC calcular_orcamento);
// a SDR nunca recebe custo/margem pela rede.

export async function listarMateriais() {
  const { data, error } = await supabase.rpc("listar_materiais");
  if (error) throw error;
  return data || [];
}

export async function listarEstados() {
  const { data, error } = await supabase
    .from("estados")
    .select("uf, nome, icms")
    .order("nome");
  if (error) throw error;
  return data || [];
}

export async function getEmpresa() {
  const { data, error } = await supabase
    .from("config_empresa")
    .select("razao_social, cnpj, ie, telefone, email, endereco, site")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// ---------- Editor de parâmetros (só gestor; RLS garante no banco) ----------
export async function carregarParametros() {
  const [imp, fac, fmt, emp, maq, mat, fc, mf, est] = await Promise.all([
    supabase.from("config_impostos").select("*").eq("id", 1).maybeSingle(),
    supabase.from("config_facas").select("*").eq("id", 1).maybeSingle(),
    supabase.from("config_formato").select("*").eq("id", 1).maybeSingle(),
    supabase.from("config_empresa").select("*").eq("id", 1).maybeSingle(),
    supabase.from("maquinas").select("*").order("chave"),
    supabase.from("materiais").select("*").order("descricao"),
    supabase.from("facas_cadastradas").select("*").order("largura_mm"),
    supabase.from("margem_faixas").select("*").order("ordem"),
    supabase.from("estados").select("*").order("nome"),
  ]);
  const comErro = [imp, fac, fmt, emp, maq, mat, fc, mf, est].find((r) => r.error);
  if (comErro) throw comErro.error;
  return {
    impostos: imp.data, facas: fac.data, formato: fmt.data, empresa: emp.data,
    maquinas: maq.data || [], materiais: mat.data || [], facasCadastradas: fc.data || [],
    margemFaixas: mf.data || [], estados: est.data || [],
  };
}

export async function salvarConfig(tabela, obj) {
  const { error } = await supabase.from(tabela).update(obj).eq("id", 1);
  if (error) throw error;
}
export async function salvarMaquina(chave, obj) {
  const { error } = await supabase.from("maquinas").update(obj).eq("chave", chave);
  if (error) throw error;
}
export async function salvarEstado(uf, icms) {
  const { error } = await supabase.from("estados").update({ icms }).eq("uf", uf);
  if (error) throw error;
}

// Persiste uma coleção com add/edit/remove: deleta ids removidos, insere novos
// (sem id), atualiza os existentes.
export async function salvarColecao(tabela, linhas, idsOriginais) {
  const idsAtuais = linhas.filter((r) => r.id).map((r) => r.id);
  const remover = idsOriginais.filter((id) => !idsAtuais.includes(id));
  if (remover.length) {
    const { error } = await supabase.from(tabela).delete().in("id", remover);
    if (error) throw error;
  }
  const novos = linhas.filter((r) => !r.id).map(({ id, ...rest }) => rest);
  if (novos.length) {
    const { error } = await supabase.from(tabela).insert(novos);
    if (error) throw error;
  }
  for (const r of linhas.filter((x) => x.id)) {
    const { id, ...rest } = r;
    const { error } = await supabase.from(tabela).update(rest).eq("id", id);
    if (error) throw error;
  }
}

// Chama a RPC. Retorna um array (um objeto por quantidade).
export async function calcularOrcamento(params) {
  const { data, error } = await supabase.rpc("calcular_orcamento", {
    p_tipo: params.tipo,
    p_material_id: params.materialId,
    p_largura_mm: params.larguraMm,
    p_altura_mm: params.alturaMm,
    p_comprimento_m: params.comprimentoM,
    p_quantidades: params.quantidades,
    p_continuidade: params.continuidade,
    p_meses: params.meses,
    p_comissao: params.comissao,
    p_estado_uf: params.estadoUf,
    p_margem_manual: params.margemManual ?? null,
    p_desconto_pct: params.descontoPct ?? null,
    p_forma: params.forma ?? "RETANGULAR",
  });
  if (error) throw error;
  return data || [];
}

// Margem mínima de alerta (config; gestor lê config_impostos).
export async function getMargemMinima() {
  const { data, error } = await supabase
    .from("config_impostos").select("margem_minima").eq("id", 1).maybeSingle();
  if (error) throw error;
  return data ? (data.margem_minima || 0) : 0;
}


// ---------- Propostas (persistência; valor congelado no banco) ----------
export async function salvarProposta(header, itens, emitir, id) {
  const { data, error } = await supabase.rpc("salvar_proposta", {
    p_header: header, p_itens: itens, p_emitir: !!emitir, p_id: id || null,
  });
  if (error) throw error;
  return data; // { id, numero, status }
}
export async function reabrirProposta(id) {
  const { error } = await supabase.rpc("reabrir_proposta", { p_id: id });
  if (error) throw error;
}
export async function novaRevisao(id) {
  const { data, error } = await supabase.rpc("nova_revisao", { p_id: id });
  if (error) throw error;
  return data; // uuid da nova versão (rascunho)
}
export async function obterProposta(id) {
  const { data, error } = await supabase.rpc("obter_proposta", { p_id: id });
  if (error) throw error;
  return data;
}
export async function listarPropostas() {
  const { data, error } = await supabase
    .from("propostas")
    .select("id, numero, seq, revisao, cliente, estado_uf, status, criado_em, criado_por")
    .order("criado_em", { ascending: false });
  if (error) throw error;
  return data || [];
}

// ---------- Solicitações de desconto (avaliação, por linha) ----------
// linhas: [{ item_id, quantidade, alvo, desconto }]
export async function solicitarDesconto(propostaId, justificativa, linhas) {
  const { data, error } = await supabase.rpc("solicitar_desconto", {
    p_proposta_id: propostaId, p_justificativa: justificativa || null, p_linhas: linhas,
  });
  if (error) throw error;
  return data;
}
// linhas: [{ id, alvo_final, desconto_final, aprovado }]
export async function resolverSolicitacao(id, linhas) {
  const { data, error } = await supabase.rpc("resolver_solicitacao", { p_id: id, p_linhas: linhas });
  if (error) throw error;
  return data; // { status, numero }
}
export async function listarSolicitacoes() {
  const { data, error } = await supabase.rpc("listar_solicitacoes");
  if (error) throw error;
  return data || [];
}
export async function contarPendentes() {
  const { data, error } = await supabase.rpc("contar_solicitacoes_pendentes");
  if (error) throw error;
  return data || 0;
}

// ---------- Usuários (somente gestor; a trava real está no banco) ----------
export async function criarUsuario({ email, nome, senha, papel, contato }) {
  const { data, error } = await supabase.rpc("admin_criar_usuario", {
    p_email: email, p_nome: nome, p_senha: senha, p_papel: papel, p_contato: contato || null,
  });
  if (error) throw error;
  return data; // uuid do novo usuário
}
export async function listarUsuarios() {
  const { data, error } = await supabase.rpc("admin_listar_usuarios");
  if (error) throw error;
  return data || [];
}
export async function redefinirSenhaUsuario(userId, senha) {
  const { error } = await supabase.rpc("admin_redefinir_senha", { p_user_id: userId, p_senha: senha });
  if (error) throw error;
}
export async function alterarPapelUsuario(userId, papel) {
  const { error } = await supabase.rpc("admin_alterar_papel", { p_user_id: userId, p_papel: papel });
  if (error) throw error;
}
export async function atualizarPerfilUsuario(userId, nome, contato) {
  const { error } = await supabase.rpc("admin_atualizar_perfil", { p_user_id: userId, p_nome: nome, p_contato: contato || null });
  if (error) throw error;
}
export async function definirAtivoUsuario(userId, ativo) {
  const { error } = await supabase.rpc("admin_definir_ativo", { p_user_id: userId, p_ativo: ativo });
  if (error) throw error;
}

// Mapa user_id -> nome (RLS: gestor vê todos, SDR vê só o próprio).
export async function mapaNomes() {
  const { data, error } = await supabase.from("perfis").select("user_id, nome");
  if (error) throw error;
  const m = {};
  (data || []).forEach((p) => { m[p.user_id] = p.nome; });
  return m;
}
