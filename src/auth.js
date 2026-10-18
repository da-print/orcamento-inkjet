import { supabase } from "./supabase.js";

// Sessão + perfil do usuário autenticado. O papel vem da tabela public.perfis
// (RLS deixa o próprio usuário ler a própria linha), nunca de dado do cliente.
let perfilCache = null;

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session || null;
}

export async function entrar(email, senha) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: senha });
  if (error) throw error;
  perfilCache = null;
  return data.session;
}

export async function sair() {
  await supabase.auth.signOut();
  perfilCache = null;
}

export async function trocarSenha(novaSenha) {
  const { error } = await supabase.auth.updateUser({ password: novaSenha });
  if (error) throw error;
}

// Busca o perfil (nome, papel, contato_comercial) do usuário logado.
// Filtra pelo próprio user_id: o gestor enxerga TODAS as linhas de perfis pela RLS,
// então sem o filtro a consulta voltaria várias linhas e o maybeSingle() quebraria.
export async function getPerfil() {
  if (perfilCache) return perfilCache;
  const { data: { session } } = await supabase.auth.getSession();
  const uid = session?.user?.id;
  if (!uid) return null;
  const { data, error } = await supabase
    .from("perfis")
    .select("user_id, nome, papel, contato_comercial")
    .eq("user_id", uid)
    .maybeSingle();
  if (error) throw error;
  perfilCache = data;
  return data;
}

export function limparPerfilCache() {
  perfilCache = null;
}

// Papéis: 'sdr' | 'visualizador' | 'gestor'
export function temAcessoGerencial(papel) {
  return papel === "visualizador" || papel === "gestor";
}
export function ehGestor(papel) {
  return papel === "gestor";
}

// Dispara callback sempre que a sessão mudar (login/logout/refresh).
export function aoMudarSessao(callback) {
  return supabase.auth.onAuthStateChange((_event, session) => {
    perfilCache = null;
    callback(session);
  });
}
