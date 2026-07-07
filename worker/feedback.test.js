import { beforeEach, describe, expect, it, vi } from "vitest";

// feedback.js importa db.js, que cria um client Supabase real no topo do módulo (falha sem
// env vars fora do worker de produção). Mockar antes do import dinâmico evita isso e permite
// testar tanto a função pura exportada quanto o fluxo completo de processarFeedback.
const dbMock = {
  getState: vi.fn(),
  setState: vi.fn(),
  buscarPorCallbackId: vi.fn(),
  marcarFeedback: vi.fn(),
  buscarPerfilPorChatId: vi.fn(),
  buscarPerfilPorTelegramToken: vi.fn(),
  vincularTelegramChatId: vi.fn(),
  solicitarBuscaManual: vi.fn(),
  definirModoRegiao: vi.fn(),
};

const telegramMock = {
  buscarAtualizacoes: vi.fn(),
  responderCallback: vi.fn(),
  removerBotoes: vi.fn(),
  enviarMenu: vi.fn(),
  enviarMenuRegiao: vi.fn(),
  enviarMensagem: vi.fn(),
};

vi.mock("./db.js", () => dbMock);
vi.mock("./telegram.js", () => telegramMock);

const { processarFeedback, extrairTokenDeStart } = await import("./feedback.js");

function updateDeMensagem(updateId, chatId, texto) {
  return { update_id: updateId, message: { chat: { id: chatId }, text: texto } };
}

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.getState.mockResolvedValue(null);
});

describe("extrairTokenDeStart", () => {
  it("extrai o token de um /start com payload (deep link)", () => {
    expect(extrairTokenDeStart("/start 550e8400-e29b-41d4-a716-446655440000")).toBe(
      "550e8400-e29b-41d4-a716-446655440000"
    );
  });

  it("retorna null pra /start sem payload", () => {
    expect(extrairTokenDeStart("/start")).toBeNull();
  });

  it("retorna null pra /menu ou outros comandos", () => {
    expect(extrairTokenDeStart("/menu")).toBeNull();
    expect(extrairTokenDeStart("/buscar")).toBeNull();
    expect(extrairTokenDeStart("")).toBeNull();
  });

  it("tolera espaços extras ao redor", () => {
    expect(extrairTokenDeStart("  /start   abc123  ")).toBe("abc123");
  });

  it("não confunde /start com múltiplos argumentos com um token válido", () => {
    // \S+ só pega o primeiro "argumento" — se vier lixo extra, a regex inteira (^...$) falha
    // e retorna null em vez de extrair um token truncado/errado.
    expect(extrairTokenDeStart("/start abc123 lixo")).toBeNull();
  });
});

describe("processarFeedback — vínculo do Telegram via /start <token>", () => {
  it("vincula o chat_id quando o token existe e confirma pro usuário", async () => {
    telegramMock.buscarAtualizacoes.mockResolvedValue([
      updateDeMensagem(1, 999, "/start token-valido"),
    ]);
    dbMock.buscarPerfilPorTelegramToken.mockResolvedValue({ id: "user-1", nome_completo: "Ana" });

    await processarFeedback();

    expect(dbMock.buscarPerfilPorTelegramToken).toHaveBeenCalledWith("token-valido");
    expect(dbMock.vincularTelegramChatId).toHaveBeenCalledWith("user-1", 999);
    expect(telegramMock.enviarMensagem).toHaveBeenCalledWith(999, expect.stringContaining("Ana"));
    expect(dbMock.setState).toHaveBeenCalledWith("telegram_offset", 1);
  });

  it("avisa com mensagem clara quando o token não existe (inválido ou já usado)", async () => {
    telegramMock.buscarAtualizacoes.mockResolvedValue([
      updateDeMensagem(2, 999, "/start token-invalido"),
    ]);
    dbMock.buscarPerfilPorTelegramToken.mockResolvedValue(null);

    await processarFeedback();

    expect(dbMock.vincularTelegramChatId).not.toHaveBeenCalled();
    expect(telegramMock.enviarMensagem).toHaveBeenCalledWith(999, expect.stringContaining("inválido"));
  });

  it("/start sem payload continua indo pro menu normal (comportamento preservado)", async () => {
    telegramMock.buscarAtualizacoes.mockResolvedValue([updateDeMensagem(3, 999, "/start")]);

    await processarFeedback();

    expect(dbMock.buscarPerfilPorTelegramToken).not.toHaveBeenCalled();
    expect(telegramMock.enviarMenu).toHaveBeenCalledWith(999);
  });

  it("/buscar continua funcionando normalmente (não regrediu com a mudança)", async () => {
    telegramMock.buscarAtualizacoes.mockResolvedValue([updateDeMensagem(4, 999, "/buscar")]);
    dbMock.buscarPerfilPorChatId.mockResolvedValue({ id: "user-1" });

    await processarFeedback();

    expect(dbMock.solicitarBuscaManual).toHaveBeenCalledWith("user-1");
  });
});
