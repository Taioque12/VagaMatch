import { describe, it, expect, vi, beforeEach } from 'vitest';

// Chain builder fake: cada método de filtro devolve `this` até o .limit()
// final resolver — espelha a API real do supabase-js o suficiente pra
// verificar que buscarPendentesAntigas monta a query certa.
function criarQueryFake(resultado) {
  const chamadas = [];
  const query = {
    eq: vi.fn((...args) => { chamadas.push(['eq', ...args]); return query; }),
    lt: vi.fn((...args) => { chamadas.push(['lt', ...args]); return query; }),
    order: vi.fn((...args) => { chamadas.push(['order', ...args]); return query; }),
    limit: vi.fn((...args) => { chamadas.push(['limit', ...args]); return Promise.resolve(resultado); }),
  };
  return { query, chamadas };
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: vi.fn() })),
}));

vi.mock('./config.js', () => ({
  env: { supabaseUrl: 'http://fake', supabaseServiceKey: 'fake-key' },
}));

import { supabase, buscarPendentesAntigas } from './db.js';

describe('buscarPendentesAntigas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('filtra por user_id, status pendente_processamento e idade mínima', async () => {
    const { query, chamadas } = criarQueryFake({ data: [{ id: 'v1' }], error: null });
    const select = vi.fn(() => query);
    supabase.from = vi.fn(() => ({ select }));

    const resultado = await buscarPendentesAntigas('user-1', 60 * 60 * 1000, 30);

    expect(supabase.from).toHaveBeenCalledWith('vagas_vistas');
    expect(chamadas).toEqual([
      ['eq', 'user_id', 'user-1'],
      ['eq', 'status', 'pendente_processamento'],
      ['lt', 'data_encontrada', expect.any(String)],
      ['order', 'data_encontrada', { ascending: true }],
      ['limit', 30],
    ]);
    expect(resultado).toEqual([{ id: 'v1' }]);
  });

  it('retorna array vazio quando não há pendentes', async () => {
    const { query } = criarQueryFake({ data: null, error: null });
    supabase.from = vi.fn(() => ({ select: vi.fn(() => query) }));

    const resultado = await buscarPendentesAntigas('user-1', 60 * 60 * 1000);
    expect(resultado).toEqual([]);
  });

  it('propaga erro do Supabase como Error descritivo', async () => {
    const { query } = criarQueryFake({ data: null, error: { message: 'timeout de conexão' } });
    supabase.from = vi.fn(() => ({ select: vi.fn(() => query) }));

    await expect(buscarPendentesAntigas('user-1', 60 * 60 * 1000)).rejects.toThrow('timeout de conexão');
  });
});
