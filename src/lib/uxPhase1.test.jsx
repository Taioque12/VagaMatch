import { describe, expect, it, vi } from "vitest";
import { AuthenticatedNav } from "../components/AuthenticatedNav.jsx";
import {
  CANDIDATURA_LABEL,
  criarPatchStatusVaga,
  estadoInicialFiltros,
  obterRotuloStatus,
} from "./dashboardUx.js";
import {
  criarPreferenciasParaSalvar,
  deveConfirmarSaida,
  deveExibirSucessoPerfil,
} from "./onboardingUx.js";

function coletarElementos(node, predicado, encontrados = []) {
  if (!node || typeof node !== "object") return encontrados;
  if (predicado(node)) encontrados.push(node);

  const filhos = node.props?.children;
  if (Array.isArray(filhos)) {
    filhos.forEach((filho) => coletarElementos(filho, predicado, encontrados));
  } else {
    coletarElementos(filhos, predicado, encontrados);
  }

  return encontrados;
}

describe("correções de UX da Fase 1", () => {
  it("preserva busca pausada ao montar as preferências do perfil", () => {
    const payload = criarPreferenciasParaSalvar("user-1", {
      cargos_alvo: ["Dev"],
      palavras_chave: ["React"],
      regioes: [],
      modalidade_trabalho: "remoto",
    }, false);

    expect(payload.ativo).toBe(false);
    expect(payload.busca_solicitada).toBe(true);
    expect(criarPreferenciasParaSalvar("user-2", {}, undefined).ativo).toBe(true);
  });

  it.each(["/dashboard", "/meus-dados", "/seguranca", "/admin"])(
    "confirma saída para %s quando o perfil está alterado",
    (destino) => {
      expect(deveConfirmarSaida(true, destino)).toBe(true);
      expect(deveConfirmarSaida(false, destino)).toBe(false);
    }
  );

  it("não trata o link da própria página como saída", () => {
    expect(deveConfirmarSaida(true, "/onboarding")).toBe(false);
  });

  it("oferece todos os destinos permitidos no menu móvel e encaminha cliques", () => {
    const onNavigate = vi.fn();
    const tree = AuthenticatedNav({
      activePath: "/onboarding",
      email: "teste@vagamatch.com",
      isAdmin: true,
      onNavigate,
      accountActionLabel: "Voltar para vagas",
      onAccountAction: vi.fn(),
    });

    const menusMoveis = coletarElementos(
      tree,
      (node) => node.props?.className === "dbv2-mobile-nav"
    );
    expect(menusMoveis).toHaveLength(1);

    const links = coletarElementos(menusMoveis[0], (node) => typeof node.props?.to === "string");
    expect(new Set(links.map((link) => link.props.to))).toEqual(
      new Set(["/dashboard", "/onboarding", "/meus-dados", "/seguranca", "/admin"])
    );

    const linkPrivacidade = links.find((link) => link.props.to === "/meus-dados");
    const evento = { preventDefault: vi.fn() };
    linkPrivacidade.props.onClick(evento);
    expect(onNavigate).toHaveBeenCalledWith(evento, "/meus-dados");
  });

  it("não exibe sucesso de perfil enquanto existem alterações pendentes", () => {
    expect(deveExibirSucessoPerfil(true, true)).toBe(false);
    expect(deveExibirSucessoPerfil(true, false)).toBe(true);
  });

  it("mantém a mutação de feedback e usa rótulo inequívoco para candidatura", () => {
    const agora = new Date("2026-08-24T12:00:00.000Z");
    expect(criarPatchStatusVaga("candidatado", agora)).toEqual({
      status: "candidatado",
      feedback_em: agora.toISOString(),
    });
    expect(CANDIDATURA_LABEL).toBe("Marcar que me candidatei");
  });

  it("restaura status, modalidade e período ao limpar filtros", () => {
    expect(estadoInicialFiltros()).toEqual({
      filtro: "todas",
      soHomeOffice: false,
      periodo: "tudo",
    });
  });

  it("converte estados internos em rótulos amigáveis", () => {
    expect(obterRotuloStatus("pendente_processamento")).toBe("Em processamento");
    expect(obterRotuloStatus("estado_interno_novo")).not.toContain("_");
  });
});
