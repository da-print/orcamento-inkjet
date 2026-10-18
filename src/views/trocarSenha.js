import { el, toast, msgErro } from "../ui.js";
import { trocarSenha } from "../auth.js";

// Modal simples de troca de senha. Após login com senha temporária do gestor,
// o usuário define a própria senha (o gestor não passa a conhecê-la).
export function abrirTrocarSenha() {
  const overlay = el("div", { class: "overlay" });
  const form = el("form", { class: "card modal" }, [
    el("h2", {}, "Trocar senha"),
    el("label", { for: "nova" }, "Nova senha"),
    el("input", { id: "nova", type: "password", required: "", minlength: "6", autocomplete: "new-password" }),
    el("label", { for: "nova2" }, "Confirmar nova senha"),
    el("input", { id: "nova2", type: "password", required: "", minlength: "6", autocomplete: "new-password" }),
    el("div", { class: "row-btns" }, [
      el("button", { type: "button", class: "btn btn-ghost", id: "cancelar" }, "Cancelar"),
      el("button", { type: "submit", class: "btn btn-primary" }, "Salvar"),
    ]),
    el("p", { class: "hint" }, "Mínimo de 6 caracteres. Só você passará a conhecer a nova senha."),
  ]);

  function fechar() { overlay.remove(); }
  form.querySelector("#cancelar").addEventListener("click", fechar);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) fechar(); });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const nova = form.querySelector("#nova").value;
    const nova2 = form.querySelector("#nova2").value;
    if (nova !== nova2) { toast("As senhas não coincidem.", "erro"); return; }
    try {
      await trocarSenha(nova);
      toast("Senha alterada com sucesso.", "ok");
      fechar();
    } catch (err) {
      toast(msgErro(err), "erro");
    }
  });

  overlay.appendChild(form);
  document.body.appendChild(overlay);
}
