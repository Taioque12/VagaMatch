import { describe, it, expect, vi, beforeEach } from 'vitest';

// A janela de 4s do Gemini é zerada via test.env no vite.config.js
// (GEMINI_MIN_INTERVAL_MS=0) — aqui não adianta: imports ESM são hoisted.

vi.mock('./db.js', () => ({
  marcarStatus: vi.fn().mockResolvedValue(undefined),
  salvarMessageId: vi.fn().mockResolvedValue(undefined),
  atualizarScoreIA: vi.fn().mockResolvedValue(undefined),
  registrarFalhaVaga: vi.fn().mockResolvedValue(1),
  similaridadeVagaCurriculo: vi.fn().mockResolvedValue(null),
  ajusteFeedbackVetorial: vi.fn().mockResolvedValue(null),
}));
vi.mock('./ai_filter.js', () => ({
  avaliarMatchComIA: vi.fn().mockResolvedValue({ score_ia: 80, motivo_ia: 'bom match' }),
}));
vi.mock('./swarm.js', () => ({
  avaliarMatchSwarm: vi.fn(),
  calcularScoreFinal: vi.fn(),
}));
vi.mock('./telegram.js', () => ({
  notificarVaga: vi.fn().mockResolvedValue('msg-1'),
  enviarDocumento: vi.fn().mockResolvedValue('msg-2'),
  enviarResumoDiario: vi.fn().mockResolvedValue(undefined),
  alertarErro: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./curriculo.js', () => ({
  gerarCurriculo: vi.fn().mockResolvedValue({ resumo_profissional: 'ok' }),
  gerarPdfCurriculo: vi.fn().mockReturnValue(new Uint8Array([1, 2, 3])),
}));

import { criarSemaforo, processarLoteDeVagas } from './processamento.js';
import * as db from './db.js';

const CONFIG_V3_OFF = { prefiltroAtivo: false, threshold: 0.55, pesos: { vetor: 0.5, tecnico: 0.3, fit: 0.2 } };

function usuarioFake() {
  return {
    pref: { palavras_chave: ['react'] },
    perfil: { id: 'user-1', telegram_chat_id: '123' },
    curriculo: { resumo_profissional: 'dev' },
  };
}

describe('criarSemaforo', () => {
  it('limita concorrência ao máximo configurado', async () => {
    const sem = criarSemaforo(2);
    let emExecucao = 0;
    let picoMaximo = 0;

    async function tarefa() {
      await sem.adquirir();
      emExecucao++;
      picoMaximo = Math.max(picoMaximo, emExecucao);
      await new Promise((r) => setTimeout(r, 20));
      emExecucao--;
      sem.liberar();
    }

    await Promise.all([tarefa(), tarefa(), tarefa(), tarefa(), tarefa()]);
    expect(picoMaximo).toBeLessThanOrEqual(2);
  });

  it('libera a fila em ordem quando um slot fecha', async () => {
    const sem = criarSemaforo(1);
    const ordem = [];
    await sem.adquirir();

    const segunda = (async () => {
      await sem.adquirir();
      ordem.push('segunda');
      sem.liberar();
    })();

    ordem.push('primeira');
    sem.liberar();
    await segunda;

    expect(ordem).toEqual(['primeira', 'segunda']);
  });
});

describe('processarLoteDeVagas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retorna zerado sem chamar nada para lote vazio', async () => {
    const resultado = await processarLoteDeVagas(usuarioFake(), [], CONFIG_V3_OFF);
    expect(resultado).toEqual({ processadas: 0, falhas: 0 });
    expect(db.marcarStatus).not.toHaveBeenCalled();
  });

  it('marca como notificada uma vaga com score aprovado (flag V3 off)', async () => {
    const vaga = { id: 'vaga-1', job_id: 'j1', titulo: 'Dev' };
    const resultado = await processarLoteDeVagas(usuarioFake(), [vaga], CONFIG_V3_OFF);

    expect(resultado).toEqual({ processadas: 1, falhas: 0 });
    expect(db.marcarStatus).toHaveBeenCalledWith('vaga-1', 'descoberta');
    expect(db.marcarStatus).toHaveBeenCalledWith('vaga-1', 'notificada');
  });

  it('descarta vaga com score abaixo de 40 sem contar como falha', async () => {
    const { avaliarMatchComIA } = await import('./ai_filter.js');
    avaliarMatchComIA.mockResolvedValueOnce({ score_ia: 10, motivo_ia: 'fraco' });

    const vaga = { id: 'vaga-2', job_id: 'j2', titulo: 'Dev Jr' };
    const resultado = await processarLoteDeVagas(usuarioFake(), [vaga], CONFIG_V3_OFF);

    expect(resultado).toEqual({ processadas: 0, falhas: 0 });
    expect(db.marcarStatus).toHaveBeenCalledWith('vaga-2', 'descartada');
  });

  it('rate limit (429) não conta como falha nem marca status', async () => {
    const { avaliarMatchComIA } = await import('./ai_filter.js');
    const erro429 = Object.assign(new Error('Gemini rate limit (429)'), { isRateLimit: true });
    avaliarMatchComIA.mockRejectedValueOnce(erro429);

    const vaga = { id: 'vaga-3', job_id: 'j3', titulo: 'Dev Pleno' };
    const resultado = await processarLoteDeVagas(usuarioFake(), [vaga], CONFIG_V3_OFF);

    expect(resultado).toEqual({ processadas: 0, falhas: 0 });
    expect(db.marcarStatus).not.toHaveBeenCalledWith('vaga-3', expect.anything());
    expect(db.registrarFalhaVaga).not.toHaveBeenCalled();
  });

  it('com pdfAutomatico ON, envia o PDF após notificar', async () => {
    const { enviarDocumento } = await import('./telegram.js');
    const vaga = { id: 'vaga-5', job_id: 'j5', titulo: 'Dev', empresa: 'Acme' };
    const config = { ...CONFIG_V3_OFF, pdfAutomatico: true };

    const resultado = await processarLoteDeVagas(usuarioFake(), [vaga], config);

    expect(resultado).toEqual({ processadas: 1, falhas: 0 });
    expect(enviarDocumento).toHaveBeenCalledWith('123', expect.any(Uint8Array), expect.stringContaining('Acme'));
  });

  it('falha na geração do PDF não desfaz a notificação', async () => {
    const { gerarCurriculo } = await import('./curriculo.js');
    gerarCurriculo.mockRejectedValueOnce(new Error('quota estourada'));

    const vaga = { id: 'vaga-6', job_id: 'j6', titulo: 'Dev', empresa: 'Acme' };
    const config = { ...CONFIG_V3_OFF, pdfAutomatico: true };

    const resultado = await processarLoteDeVagas(usuarioFake(), [vaga], config);

    expect(resultado).toEqual({ processadas: 1, falhas: 0 });
    expect(db.marcarStatus).toHaveBeenCalledWith('vaga-6', 'notificada');
  });

  it('erro genérico conta como falha e registra tentativa', async () => {
    const { avaliarMatchComIA } = await import('./ai_filter.js');
    avaliarMatchComIA.mockRejectedValueOnce(new Error('JSON malformado'));

    const vaga = { id: 'vaga-4', job_id: 'j4', titulo: 'Dev Sênior' };
    const resultado = await processarLoteDeVagas(usuarioFake(), [vaga], CONFIG_V3_OFF);

    expect(resultado).toEqual({ processadas: 0, falhas: 1 });
    expect(db.registrarFalhaVaga).toHaveBeenCalledWith('vaga-4', 3);
  });
});
