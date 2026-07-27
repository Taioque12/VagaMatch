import fs from 'fs';
import path from 'path';

const adminPath = path.resolve('./src/pages/Admin.jsx');
let content = fs.readFileSync(adminPath, 'utf8');

// 1. Add fields to select
content = content.replace(
  `supabase.from("profiles").select("id, plano, role, assinatura_status, assinatura_recorrencia, created_at")`,
  `supabase.from("profiles").select("id, nome_completo, telegram_chat_id, plano, role, assinatura_status, assinatura_recorrencia, created_at")`
);

// 2. Add listaUsuarios to metricas
content = content.replace(
  `        const vagasComErro = vagas.filter((v) => v.status === "erro").length;`,
  `        const vagasComErro = vagas.filter((v) => v.status === "erro").length;

        // Lista de usuarios cruzada com preferencias
        const listaUsuarios = perfis.map(p => {
          const pref = prefs.find(pr => pr.user_id === p.id);
          return {
            ...p,
            busca_ativa: pref ? pref.ativo : false
          };
        }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));`
);

content = content.replace(
  `          vagasComErro,
        });`,
  `          vagasComErro,
          listaUsuarios,
        });`
);

// 3. Add table rendering at the end of the file
const tableHTML = `
        <section className="dbv2-card" style={{ marginTop: "24px", overflowX: "auto" }}>
          <h2 className="dbv2-card-titulo" style={{ margin: "0 0 16px" }}>Gestão de Usuários</h2>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "14px" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.1)", color: "#94a3b8" }}>
                <th style={{ padding: "12px 8px" }}>Nome</th>
                <th style={{ padding: "12px 8px" }}>Status Assinatura</th>
                <th style={{ padding: "12px 8px" }}>Busca Ativa</th>
                <th style={{ padding: "12px 8px" }}>Telegram ID</th>
                <th style={{ padding: "12px 8px" }}>Cadastro</th>
              </tr>
            </thead>
            <tbody>
              {m.listaUsuarios.map(u => (
                <tr key={u.id} style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.05)" }}>
                  <td style={{ padding: "12px 8px", color: "#f8fafc" }}>{u.nome_completo || "Sem Nome"}</td>
                  <td style={{ padding: "12px 8px" }}>
                    <span style={{ 
                      padding: "4px 8px", 
                      borderRadius: "4px", 
                      background: u.assinatura_status === "ativa" ? "rgba(16, 185, 129, 0.1)" : "rgba(255, 255, 255, 0.05)",
                      color: u.assinatura_status === "ativa" ? "#10b981" : "#94a3b8"
                    }}>
                      {u.assinatura_status === "ativa" ? "Pago" : "Grátis"}
                    </span>
                  </td>
                  <td style={{ padding: "12px 8px" }}>
                    <span style={{ color: u.busca_ativa ? "#10b981" : "#ef4444" }}>
                      {u.busca_ativa ? "Sim" : "Não"}
                    </span>
                  </td>
                  <td style={{ padding: "12px 8px", color: "#94a3b8", fontFamily: "monospace" }}>{u.telegram_chat_id || "Não vinculado"}</td>
                  <td style={{ padding: "12px 8px", color: "#64748b" }}>{new Date(u.created_at).toLocaleDateString("pt-BR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
`;

content = content.replace(
  `        </div>
      </div>
    </div>
  );
}
`,
  `        </div>\n${tableHTML}`
);

fs.writeFileSync(adminPath, content);
console.log("Admin.jsx atualizado com sucesso!");
