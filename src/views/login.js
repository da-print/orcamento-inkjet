import { el, toast, msgErro } from "../ui.js";
import { entrar } from "../auth.js";
import { LOGO_PNG_BASE64 } from "../logo.js";

const LOGO_SRC = "data:image/png;base64," + LOGO_PNG_BASE64;

export function renderLogin(container, aoEntrar) {
  const form = el("form", { class: "card login-card" }, [
    el("div", { class: "login-brand" }, [
      el("img", { class: "brand-logo", src: LOGO_SRC, alt: "D&A Print Solutions" }),
      el("div", { class: "brand-sub" }, "Orçamento Inkjet"),
    ]),
    el("h1", {}, "Entrar"),
    el("label", { for: "email" }, "E-mail"),
    el("input", { id: "email", type: "email", required: "", autocomplete: "username", inputmode: "email", placeholder: "voce@daprint.com.br" }),
    el("label", { for: "senha" }, "Senha"),
    el("input", { id: "senha", type: "password", required: "", autocomplete: "current-password", placeholder: "••••••••" }),
    el("button", { type: "submit", class: "btn btn-primary", id: "btn-entrar" }, "Entrar"),
    el("p", { class: "hint" }, "Acesso fornecido pelo gestor. Após entrar, você pode trocar sua senha."),
  ]);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = form.querySelector("#btn-entrar");
    const email = form.querySelector("#email").value.trim();
    const senha = form.querySelector("#senha").value;
    btn.disabled = true; btn.textContent = "Entrando…";
    try {
      await entrar(email, senha);
      aoEntrar();
    } catch (err) {
      toast(msgErro(err), "erro");
      btn.disabled = false; btn.textContent = "Entrar";
    }
  });

  container.appendChild(el("div", { class: "login-wrap" }, [form]));
}
