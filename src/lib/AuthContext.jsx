import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "./supabase.js";

const AuthContext = createContext(null);
const CHAVE_INDICACAO_LEGADA = "vagamatch_ref_pendente";
const PREFIXO_INDICACAO_PENDENTE = "vagamatch_ref_pendente:v3:";
const VERSAO_INDICACAO_PENDENTE = 3;
const TIMEOUT_SESSION_MS = 8000;
const TIMEOUT_RPC_MS = 15000;
const MAX_GERACOES_POR_PROCESSAMENTO = 5;
const processamentosIndicacao = new Map();
const indicacoesEmMemoria = new Map();

function chaveIndicacao(userId) {
  return `${PREFIXO_INDICACAO_PENDENTE}${encodeURIComponent(userId)}`;
}

function criarGeracao() {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function descartarLegadoGlobal() {
  try {
    const legado = localStorage.getItem(CHAVE_INDICACAO_LEGADA);
    if (legado && localStorage.getItem(CHAVE_INDICACAO_LEGADA) === legado) {
      localStorage.removeItem(CHAVE_INDICACAO_LEGADA);
    }
  } catch {
    // Legado nunca é enviado à RPC; remoção é best-effort.
  }
}

function interpretarIndicacao(valor, userId) {
  try {
    const pendente = JSON.parse(valor);
    if (
      pendente?.version !== VERSAO_INDICACAO_PENDENTE
      || pendente.userId !== userId
      || typeof pendente.codigo !== "string"
      || !pendente.codigo
      || typeof pendente.generation !== "string"
      || !pendente.generation
    ) {
      return null;
    }
    return pendente;
  } catch {
    return null;
  }
}

function lerIndicacaoPendente(userId) {
  descartarLegadoGlobal();
  const chave = chaveIndicacao(userId);
  let valor;

  try {
    valor = localStorage.getItem(chave);
  } catch (error) {
    const memoria = indicacoesEmMemoria.get(userId) ?? null;
    return memoria
      ? { status: "memory_only", pendente: memoria, error }
      : { status: "storage_error", pendente: null, error };
  }

  if (!valor) {
    const memoria = indicacoesEmMemoria.get(userId) ?? null;
    return { status: memoria ? "memory_only" : "ok", pendente: memoria };
  }

  const pendente = interpretarIndicacao(valor, userId);
  if (pendente) {
    const memoria = indicacoesEmMemoria.get(userId) ?? null;
    return memoria
      ? { status: "memory_only", pendente: memoria }
      : { status: "ok", pendente };
  }

  try {
    if (localStorage.getItem(chave) === valor) localStorage.removeItem(chave);
  } catch {
    // Valor inválido nunca é aplicado, mesmo se a remoção falhar.
  }
  const memoria = indicacoesEmMemoria.get(userId) ?? null;
  return memoria
    ? { status: "memory_only", pendente: memoria }
    : { status: "invalid", pendente: null };
}

function removerIndicacaoSeCorresponder(pendente) {
  const { userId, codigo, generation } = pendente;
  const chave = chaveIndicacao(userId);
  try {
    const atual = interpretarIndicacao(localStorage.getItem(chave), userId);
    if (atual?.codigo === codigo && atual.generation === generation) {
      localStorage.removeItem(chave);
    }
  } catch {
    // A RPC já concluiu; storage pode manter uma repetição idempotente.
  }

  const memoria = indicacoesEmMemoria.get(userId);
  if (memoria?.codigo === codigo && memoria.generation === generation) {
    indicacoesEmMemoria.delete(userId);
  }
}

function resultadoComPendencia(userId, resultado) {
  const leitura = lerIndicacaoPendente(userId);
  return {
    ...resultado,
    pendingRetained: Boolean(leitura.pendente),
  };
}

export function persistirIndicacaoPendente(codigo, userId) {
  if (typeof codigo !== "string" || !codigo || typeof userId !== "string" || !userId) {
    throw new Error("Indicação pendente inválida.");
  }

  descartarLegadoGlobal();
  const pendente = {
    version: VERSAO_INDICACAO_PENDENTE,
    codigo,
    userId,
    generation: criarGeracao(),
  };
  try {
    localStorage.setItem(chaveIndicacao(userId), JSON.stringify(pendente));
    indicacoesEmMemoria.delete(userId);
    return { status: "persisted", pendente };
  } catch (error) {
    indicacoesEmMemoria.set(userId, pendente);
    return { status: "memory_only", pendente, error };
  }
}

function comTimeout(promessa, timeoutMs, mensagem) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(mensagem)), timeoutMs);
  });
  return Promise.race([promessa, timeout]).finally(() => clearTimeout(timeoutId));
}

async function executarIndicacaoPendente(userId, controle) {
  const geracoesTentadas = new Set();
  let ultimoResultado = resultadoComPendencia(userId, { status: "none" });

  while (geracoesTentadas.size < MAX_GERACOES_POR_PROCESSAMENTO) {
    controle.reprocessar = false;
    const leitura = lerIndicacaoPendente(userId);
    if (leitura.status === "storage_error" && !leitura.pendente) {
      return { status: "storage_error", error: leitura.error, pendingRetained: false };
    }
    if (leitura.status === "invalid") return { status: "discarded_invalid", pendingRetained: false };
    if (!leitura.pendente) {
      if (controle.reprocessar) continue;
      return { ...ultimoResultado, pendingRetained: false };
    }
    if (geracoesTentadas.has(leitura.pendente.generation)) return ultimoResultado;

    const pendente = leitura.pendente;
    geracoesTentadas.add(pendente.generation);
    try {
      const { data, error } = await comTimeout(
        supabase.auth.getSession(),
        TIMEOUT_SESSION_MS,
        "Tempo excedido ao validar a sessão da indicação.",
      );
      if (error) throw error;
      if (data.session?.user?.id !== userId) {
        return resultadoComPendencia(userId, { status: "session_mismatch" });
      }
    } catch (error) {
      ultimoResultado = resultadoComPendencia(userId, {
        status: "failed",
        reason: "session",
        error,
      });
      const posterior = lerIndicacaoPendente(userId);
      if (controle.reprocessar || posterior.pendente?.generation !== pendente.generation) {
        continue;
      }
      return ultimoResultado;
    }

    const revalidada = lerIndicacaoPendente(userId);
    if (revalidada.status === "storage_error" && !revalidada.pendente) {
      return { status: "storage_error", error: revalidada.error, pendingRetained: false };
    }
    if (revalidada.status === "invalid") return { status: "discarded_invalid", pendingRetained: false };
    if (revalidada.pendente?.generation !== pendente.generation) continue;

    try {
      const { error } = await comTimeout(
        supabase.rpc("registrar_indicacao", { p_codigo: pendente.codigo }),
        TIMEOUT_RPC_MS,
        "Tempo excedido ao registrar a indicação.",
      );
      if (error) throw error;
      removerIndicacaoSeCorresponder(pendente);
      ultimoResultado = resultadoComPendencia(userId, { status: "processed" });
    } catch (error) {
      console.error("Não foi possível registrar a indicação pendente.", error);
      // A requisição pode ter chegado ao servidor antes do erro/timeout.
      // Não dispara outra RPC automaticamente; a função SQL é idempotente.
      return resultadoComPendencia(userId, { status: "failed", reason: "rpc", error });
    }
  }

  const final = lerIndicacaoPendente(userId);
  if (!final.pendente) return { ...ultimoResultado, pendingRetained: false };
  return { status: "failed", reason: "queue_limit", pendingRetained: true };
}

export function processarIndicacaoPendente(userId, pendenteEmMemoria) {
  if (typeof userId !== "string" || !userId) {
    return Promise.resolve({ status: "session_mismatch", pendingRetained: false });
  }
  if (pendenteEmMemoria?.userId === userId) {
    indicacoesEmMemoria.set(userId, pendenteEmMemoria);
  }

  const existente = processamentosIndicacao.get(userId);
  if (existente) {
    existente.reprocessar = true;
    return existente.promise;
  }

  const controle = { reprocessar: false, promise: null };
  controle.promise = executarIndicacaoPendente(userId, controle).finally(() => {
    if (processamentosIndicacao.get(userId) === controle) {
      processamentosIndicacao.delete(userId);
    }
  });
  processamentosIndicacao.set(userId, controle);
  return controle.promise;
}

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState({
    session: undefined,
    authStatus: "loading",
    authError: null,
  });

  useEffect(() => {
    let ativo = true;
    let revisaoAuth = 0;
    let subscription;

    function aplicarSession(proximaSession) {
      setAuth({
        session: proximaSession ?? null,
        authStatus: proximaSession ? "authenticated" : "anonymous",
        authError: null,
      });
    }

    function agendarIndicacao(proximaSession, revisaoAtual) {
      if (!proximaSession) return;

      Promise.resolve().then(() => {
        if (ativo && revisaoAtual === revisaoAuth) {
          void processarIndicacaoPendente(proximaSession.user.id);
        }
      });
    }

    try {
      const { data } = supabase.auth.onAuthStateChange((event, proximaSession) => {
        if (!ativo) return;

        // getSession é a autoridade do bootstrap e também expõe seu erro.
        // INITIAL_SESSION espelha esse mesmo bootstrap e não pode sobrescrever
        // uma falha inicial (especialmente com uma sessão nula).
        if (event === "INITIAL_SESSION") return;

        const revisaoAtual = ++revisaoAuth;
        aplicarSession(proximaSession);
        agendarIndicacao(proximaSession, revisaoAtual);
      });

      subscription = data?.subscription;
      if (!subscription) throw new Error("Listener de autenticação indisponível.");

      const revisaoBootstrap = revisaoAuth;
      void comTimeout(
        supabase.auth.getSession(),
        TIMEOUT_SESSION_MS,
        "Tempo excedido ao iniciar a sessão.",
      )
        .then(({ data: dadosSession, error }) => {
          if (!ativo || revisaoBootstrap !== revisaoAuth) return;
          if (error) throw error;

          aplicarSession(dadosSession.session);
          agendarIndicacao(dadosSession.session, revisaoBootstrap);
        })
        .catch((error) => {
          if (!ativo || revisaoBootstrap !== revisaoAuth) return;

          setAuth({
            session: undefined,
            authStatus: "error",
            authError: error,
          });
        });
    } catch (error) {
      if (ativo) {
        setAuth({
          session: undefined,
          authStatus: "error",
          authError: error,
        });
      }
    }

    return () => {
      ativo = false;
      revisaoAuth += 1;
      subscription?.unsubscribe();
    };
  }, []);

  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth precisa estar dentro de AuthProvider");
  return ctx;
}
