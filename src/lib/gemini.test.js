import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { extrairDadosCurriculo, gerarDocumentoIA } from './gemini.js';
import * as supabaseModule from './supabase.js';

vi.mock('./supabase.js', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
    },
    functions: {
      invoke: vi.fn(),
    },
  },
}));

describe('gemini.js', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('chamarGemini timeout', () => {
    it('deve timeout após 30 segundos', async () => {
      const { supabase } = supabaseModule;
      supabase.auth.getSession.mockResolvedValue({
        data: { session: { access_token: 'test-token' } },
      });

      supabase.functions.invoke.mockImplementation((_name, { signal } = {}) => {
        return new Promise((resolve, reject) => {
          const t = setTimeout(() => resolve({ data: { text: 'test' } }), 35000);
          signal?.addEventListener('abort', () => {
            clearTimeout(t);
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
          });
        });
      });

      try {
        await gerarDocumentoIA('cv', {}, {});
        expect(false).toBe(true);
      } catch (err) {
        expect(err.message).toContain('expirou');
      }
    }, 40000);
  });

  describe('validarSchemaCurriculo', () => {
    it('deve aceitar JSON válido com campos obrigatórios', async () => {
      const { supabase } = supabaseModule;
      supabase.auth.getSession.mockResolvedValue({
        data: { session: { access_token: 'test-token' } },
      });

      const validJson = JSON.stringify({
        nome_completo: 'João Silva',
        habilidades: ['JavaScript', 'React'],
        localizacao: 'São Paulo, SP',
        resumo_profissional: 'Dev experiente',
        experiencias: [],
        formacao: [],
        cursos: [],
        projetos: [],
        cargos_alvo: ['Frontend Developer'],
        palavras_chave: ['JS', 'React'],
        regioes: ['São Paulo, SP'],
      });

      supabase.functions.invoke.mockResolvedValue({ data: { text: validJson } });

      const result = await extrairDadosCurriculo('base64data');
      expect(result.nome_completo).toBe('João Silva');
      expect(result.habilidades).toEqual(['JavaScript', 'React']);
    });

    it('deve rejeitar JSON sem campo obrigatório nome_completo', async () => {
      const { supabase } = supabaseModule;
      supabase.auth.getSession.mockResolvedValue({
        data: { session: { access_token: 'test-token' } },
      });

      const invalidJson = JSON.stringify({
        habilidades: ['JavaScript'],
        localizacao: 'São Paulo, SP',
      });

      supabase.functions.invoke.mockResolvedValue({ data: { text: invalidJson } });

      try {
        await extrairDadosCurriculo('base64data');
        expect(false).toBe(true);
      } catch (err) {
        expect(err.message).toContain('Falha ao ler o PDF');
      }
    });

    it('deve rejeitar JSON com habilidades vazio', async () => {
      const { supabase } = supabaseModule;
      supabase.auth.getSession.mockResolvedValue({
        data: { session: { access_token: 'test-token' } },
      });

      const invalidJson = JSON.stringify({
        nome_completo: 'João Silva',
        habilidades: [],
      });

      supabase.functions.invoke.mockResolvedValue({ data: { text: invalidJson } });

      try {
        await extrairDadosCurriculo('base64data');
        expect(false).toBe(true);
      } catch (err) {
        expect(err.message).toContain('Falha ao ler o PDF');
      }
    });

    it('deve limpar markdown JSON se presente', async () => {
      const { supabase } = supabaseModule;
      supabase.auth.getSession.mockResolvedValue({
        data: { session: { access_token: 'test-token' } },
      });

      const validJson = JSON.stringify({
        nome_completo: 'João Silva',
        habilidades: ['JavaScript'],
      });

      supabase.functions.invoke.mockResolvedValue({
        data: { text: '```json\n' + validJson + '\n```' },
      });

      const result = await extrairDadosCurriculo('base64data');
      expect(result.nome_completo).toBe('João Silva');
    });
  });

  describe('gerarDocumentoIA', () => {
    it('deve gerar CV com prompt correto', async () => {
      const { supabase } = supabaseModule;
      supabase.auth.getSession.mockResolvedValue({
        data: { session: { access_token: 'test-token' } },
      });

      supabase.functions.invoke.mockResolvedValue({
        data: { text: '# Currículo de Teste\nExperiência: Dev' },
      });

      const vaga = { titulo: 'Dev', empresa: 'Tech Corp', descricao: 'Busca dev' };
      const perfil = { nome: 'João', area_atuacao: 'TI', skills: 'JS' };

      const result = await gerarDocumentoIA('cv', vaga, perfil);
      expect(result).toContain('Currículo');
      expect(supabase.functions.invoke).toHaveBeenCalledWith(
        'gemini-proxy',
        expect.objectContaining({
          body: expect.objectContaining({ contents: expect.any(String) }),
        })
      );
    });
  });
});
