import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ALL_PERMS = { visualizar: true, criar: true, editar: true, excluir: true, relatorio: true };

const MENUS = [
  { nome: 'Dashboard Admin', slug: 'dash-admin' },
  { nome: 'Dashboard Profissional', slug: 'dash-professional' },
  { nome: 'Acessos / Permissões', slug: 'acesso' },
  { nome: 'Ativação de Usuários', slug: 'ativacao-usuarios' },
  { nome: 'Gerenciar Usuários', slug: 'gerenciar-usuarios' },
  { nome: 'Logar como Usuário', slug: 'logar-como' },
  { nome: 'Formulários', slug: 'formulario' },
  { nome: 'Respostas de Formulários', slug: 'respostas' },
  { nome: 'Atribuição de Usuários', slug: 'atribuir-usuarios' },
  { nome: 'Pacientes', slug: 'paciente' },
  { nome: 'Agendamentos', slug: 'agendamento' },
  { nome: 'Encaminhamentos', slug: 'encaminhamento' },
  { nome: 'Logs de Acesso', slug: 'log' },
  { nome: 'Esteira de Pacientes', slug: 'esteira-pacientes' },
  { nome: 'Chat AI', slug: 'chat-ai' },
  { nome: 'Chat AI Admin', slug: 'chat-ai-admin' },
  { nome: 'Dash Professional Paciente', slug: 'dash-professional-paciente' },
  { nome: 'Notifications', slug: 'notifications' },
  { nome: 'Boas Vindas', slug: 'boas-vindas' },
  { nome: 'Grupos', slug: 'grupos' },
  // Módulo hospitalar
  { nome: 'Atendimentos', slug: 'atendimento' },
  { nome: 'Atendimentos IA', slug: 'atendimento-ia' },
  { nome: 'Médicos', slug: 'medicos' },
  { nome: 'Escala de Plantão', slug: 'escala' },
  { nome: 'Escala de Plantão Admin', slug: 'escala-admin' },
  { nome: 'Fila de Atendimento', slug: 'fila' },
  { nome: 'Fila de Atendimento Notificações', slug: 'fila-notificacoes' },
  { nome: 'Estoque de Insumos', slug: 'estoque' },
];

const NIVEIS = [
  { id: 1, nome: 'Não Autorizado', descricao: 'Sem acesso ao sistema' },
  { id: 2, nome: 'Admin', descricao: 'Acesso total ao sistema' },
  { id: 3, nome: 'Admin Prefeitura', descricao: 'Administração da prefeitura' },
  { id: 4, nome: 'Equipe', descricao: 'Equipe de saúde' },
  { id: 5, nome: 'Médico', descricao: 'Profissional médico' },
];

const NIVEL_SLUGS: Record<number, string[]> = {
  1: [], // Não Autorizado: nenhum
  2: MENUS.map(m => m.slug), // Admin: todos
  3: [ // Admin Prefeitura
    'dash-admin',
    'ativacao-usuarios',
    'gerenciar-usuarios',
    'formulario',
    'respostas',
    'atribuir-usuarios',
    'paciente',
    'agendamento',
    'encaminhamento',
    'esteira-pacientes',
    'acesso',
    'boas-vindas',
    'grupos',
    'medicos',
    'escala',
    'escala-admin',
    'fila',
    'fila-notificacoes',
    'estoque',
    'atendimento',
    'atendimento-ia',
  ],
  4: [ // Equipe
    'dash-professional',
    'ativacao-usuarios',
    'formulario',
    'respostas',
    'atribuir-usuarios',
    'paciente',
    'encaminhamento',
    'esteira-pacientes',
    'acesso',
    'atendimento',
    'atendimento-ia',
  ],
  5: [ // Médico
    'dash-professional',
    'ativacao-usuarios',
    'formulario',
    'respostas',
    'atribuir-usuarios',
    'paciente',
    'agendamento',
    'esteira-pacientes',
    'escala',
    'fila',
    'fila-notificacoes',
    'atendimento',
    'atendimento-ia',
  ],
};

async function seedMenus() {
  console.log('Seeding menus...');
  for (const menu of MENUS) {
    await prisma.menu_Acesso.upsert({
      where: { slug: menu.slug },
      update: { nome: menu.nome },
      create: { nome: menu.nome, slug: menu.slug },
    });
  }
  console.log(`  ${MENUS.length} menus ok`);
}

async function seedNiveis() {
  console.log('Seeding niveis de acesso...');
  for (const nivel of NIVEIS) {
    await prisma.nivel_Acesso.upsert({
      where: { idNivelAcesso: nivel.id },
      update: { nome: nivel.nome, descricao: nivel.descricao },
      create: { idNivelAcesso: nivel.id, nome: nivel.nome, descricao: nivel.descricao },
    });
  }

  // Advance sequence past our manually-set IDs
  const maxId = Math.max(...NIVEIS.map(n => n.id));
  await prisma.$executeRawUnsafe(
    `SELECT setval(pg_get_serial_sequence('"Nivel_Acesso"', 'idNivelAcesso'), $1, true)`,
    maxId,
  );

  console.log(`  ${NIVEIS.length} niveis ok`);
}

async function seedPermissoes() {
  console.log('Seeding permissoes por nivel...');

  const allMenus = await prisma.menu_Acesso.findMany();
  const slugToId = new Map(allMenus.map(m => [m.slug, m.idMenuAcesso]));

  for (const nivel of NIVEIS) {
    const slugs = NIVEL_SLUGS[nivel.id];

    // Remove existing permissions for this level
    await prisma.nivel_Menu_Permissao.deleteMany({
      where: { nivelAcessoId: nivel.id },
    });

    if (slugs.length === 0) continue;

    const data = slugs
      .map(slug => {
        const menuId = slugToId.get(slug);
        if (!menuId) {
          console.warn(`  Menu slug "${slug}" not found, skipping`);
          return null;
        }
        return {
          nivelAcessoId: nivel.id,
          menuAcessoId: menuId,
          ...ALL_PERMS,
        };
      })
      .filter(Boolean) as any[];

    if (data.length > 0) {
      await prisma.nivel_Menu_Permissao.createMany({ data });
    }

    console.log(`  ${nivel.nome}: ${data.length} menus`);
  }
}

async function seedAdminUser() {
  console.log('Seeding admin user...');

  const existing = await prisma.user.findUnique({ where: { email: 'renan.nardi.dev@gmail.com' } });

  if (!existing) {
    await prisma.user.create({
      data: {
        idUser: 'renan_admin_2',
        name: 'Renan Nardi',
        email: 'renan.nardi.dev@gmail.com',
        password: '$2b$10$Ja7sEVfh1ifyYYv8hJOD/eNhw2l60oH/YYY7uYvKF3AT9chdkxFkG',
        active: true,
        nivelAcessoId: 2,
        type: 'ADMIN',
        cpf: '118.402.239-95',
      },
    });
  } else {
    await prisma.user.update({
      where: { email: 'renan.nardi.dev@gmail.com' },
      data: {
        name: 'Renan Nardi',
        password: '$2b$10$Ja7sEVfh1ifyYYv8hJOD/eNhw2l60oH/YYY7uYvKF3AT9chdkxFkG',
        active: true,
        nivelAcessoId: 2,
        type: 'ADMIN',
      },
    });
  }

  console.log('  Admin user ok');
}

const DEFAULT_GRUPO_NOME = 'Grupo Padrão';

async function seedGrupoPadrao(): Promise<number> {
  console.log('Seeding grupo padrão...');

  let grupo = await prisma.grupo.findFirst({ where: { isDefault: true } });
  if (!grupo) {
    grupo = await prisma.grupo.create({
      data: {
        nome: DEFAULT_GRUPO_NOME,
        descricao: 'Grupo padrão do sistema. Pacientes cadastrados pelo app e o formulário de triagem entram automaticamente aqui.',
        isDefault: true,
      },
    });
    console.log(`  Grupo padrão criado (id ${grupo.idGrupo})`);
  } else {
    console.log(`  Grupo padrão já existe (id ${grupo.idGrupo})`);
  }
  return grupo.idGrupo;
}

async function migrarPacientesAppParaGrupoPadrao(grupoId: number) {
  console.log('Migrando pacientes de auto-cadastro para o grupo padrão...');
  const result = await prisma.user.updateMany({
    where: { type: 'PACIENTE', autoCadastro: true, grupoPacienteId: null },
    data: { grupoPacienteId: grupoId },
  });
  console.log(`  ${result.count} pacientes movidos para o grupo padrão`);
}

async function vincularUsuariosSemGrupoAoPadrao(grupoId: number) {
  console.log('Vinculando usuários sem grupo ao Grupo Padrão...');
  const users = await prisma.user.findMany({
    where: { dt_delete: null, gruposMembro: { none: {} } },
    select: { idUser: true, type: true, grupoPacienteId: true },
  });
  if (users.length) {
    await prisma.grupo_Membro.createMany({
      data: users.map(user => ({ grupoId, userId: user.idUser })),
      skipDuplicates: true,
    });
    await prisma.user.updateMany({
      where: { idUser: { in: users.filter(user => user.type === 'PACIENTE' && !user.grupoPacienteId).map(user => user.idUser) } },
      data: { grupoPacienteId: grupoId },
    });
  }
  console.log(`  ${users.length} usuário(s) vinculados ao Grupo Padrão`);
}

async function seedTriagemForm(grupoId: number) {
  console.log('Seeding triagem form...');

  const formId = '7f9e8d4a-c1b2-4a3f-9e8c-5b2d1f0e9c8a';
  const existing = await prisma.form.findUnique({ where: { idForm: formId } });
  if (existing) {
    if (existing.grupoId !== grupoId) {
      await prisma.form.update({ where: { idForm: formId }, data: { grupoId } });
      console.log('  Form já existe — vinculado ao grupo padrão');
    } else {
      console.log('  Form already exists, skipping');
    }
    return;
  }

  await prisma.form.create({
    data: {
      idForm: formId,
      title: 'Triagem Detalhada de Dor Crônica (Escala de Risco)',
      description: 'Avaliação completa do histórico, tratamento e impacto funcional da dor crônica do paciente, com pontuação para estratificação de risco.',
      active: true,
      isScreening: true,
      grupoId,
      createdAt: new Date('2025-12-08T03:00:00.000Z'),
      updatedAt: new Date('2025-12-08T03:00:00.000Z'),
      questions: {
        create: [
          {
            idQuestion: 'q1_tempo_dor',
            text: '1. Tempo de dor',
            type: 'MULTIPLE_CHOICE',
            required: true,
            order: 10,
            options: {
              create: [
                { idOption: 'o1_lt3m', text: 'Menos de 3 meses', order: 0, value: 0 },
                { idOption: 'o1_3_6m', text: '3 a 6 meses', order: 1, value: 1 },
                { idOption: 'o1_6m_1y', text: '6 meses a 1 ano', order: 2, value: 2 },
                { idOption: 'o1_1_2y', text: '1 a 2 anos', order: 3, value: 3 },
                { idOption: 'o1_gt2y', text: 'Mais de 2 anos', order: 4, value: 4 },
              ],
            },
          },
          {
            idQuestion: 'q2_eva_dor',
            text: '2. Intensidade atual da dor (EVA 0–10)',
            type: 'MULTIPLE_CHOICE',
            required: true,
            order: 20,
            options: {
              create: [
                { idOption: 'o2_0_3', text: '0–3 (dor leve)', order: 0, value: 0 },
                { idOption: 'o2_4_6', text: '4–6 (dor moderada)', order: 1, value: 1 },
                { idOption: 'o2_7_10', text: '7–10 (dor intensa)', order: 2, value: 2 },
              ],
            },
          },
          {
            idQuestion: 'q3_num_consultas',
            text: '3. Quantas consultas você já realizou (UBS ou clínico) devido sua dor crônica?',
            type: 'MULTIPLE_CHOICE',
            required: true,
            order: 30,
            options: {
              create: [
                { idOption: 'o3_1_2c', text: '1–2 consultas', order: 0, value: 0 },
                { idOption: 'o3_3_4c', text: '3–4 consultas', order: 1, value: 1 },
                { idOption: 'o3_gt5c', text: '5 ou mais', order: 2, value: 2 },
              ],
            },
          },
          {
            idQuestion: 'q4_consultou_esp',
            text: '4. Você já consultou algum especialista(reumatologista ou ortopedista)?',
            type: 'MULTIPLE_CHOICE',
            required: true,
            order: 40,
            options: {
              create: [
                { idOption: 'o4_nunca', text: 'Nunca consultou', order: 0, value: 0 },
                { idOption: 'o4_1esp_1v', text: '1 especialista (1 vez)', order: 1, value: 1 },
                { idOption: 'o4_1esp_gt2v', text: '1 especialista (≥2 vezes)', order: 2, value: 2 },
                { idOption: 'o4_gt2esp', text: '≥2 tipos de especialistas', order: 3, value: 3 },
              ],
            },
          },
          {
            idQuestion: 'q5_tratamento_esp',
            text: '5. Já realizou algum tratamento específico? (Marcar todos que se aplicam – máximo 2 pontos)',
            type: 'CHECKBOXES',
            required: true,
            order: 50,
            options: {
              create: [
                { idOption: 'o5_fisioterapia', text: 'Fisioterapia', order: 0, value: 1 },
                { idOption: 'o5_psicologico', text: 'Acompanhamento psicológico', order: 1, value: 1 },
                { idOption: 'o5_infiltracoes', text: 'Infiltrações locais', order: 2, value: 1 },
                { idOption: 'o5_alternativas', text: 'Terapias alternativas', order: 3, value: 1 },
                { idOption: 'o5_nenhum', text: 'Nenhum', order: 4, value: 0 },
              ],
            },
          },
          {
            idQuestion: 'q6_melhora_trat',
            text: '6. Obteve melhora significativa (>50%) com esses tratamentos?',
            type: 'MULTIPLE_CHOICE',
            required: true,
            order: 60,
            options: {
              create: [
                { idOption: 'o6_sim', text: 'Sim', order: 0, value: 0 },
                { idOption: 'o6_leve', text: 'Melhora leve', order: 1, value: 1 },
                { idOption: 'o6_nenhuma', text: 'Nenhuma melhora', order: 2, value: 2 },
              ],
            },
          },
          {
            idQuestion: 'q7_uso_med',
            text: '7. Uso contínuo de medicamentos (>3 meses)',
            type: 'MULTIPLE_CHOICE',
            required: true,
            order: 70,
            options: {
              create: [
                { idOption: 'o7_analgesicos', text: 'Analgésicos simples', order: 0, value: 1 },
                { idOption: 'o7_antiinflam', text: 'Anti-inflamatórios', order: 1, value: 1 },
                { idOption: 'o7_opioides', text: 'Opioides / Neuropáticos / Antidepressivos', order: 2, value: 2 },
                { idOption: 'o7_corti_relax', text: 'Corticoides ou relaxantes musculares', order: 3, value: 1 },
                { idOption: 'o7_nenhum', text: 'Nenhum uso prolongado', order: 4, value: 0 },
              ],
            },
          },
          {
            idQuestion: 'q8_interf_diaria',
            text: '8. A dor interfere nas suas atividades diárias?',
            type: 'MULTIPLE_CHOICE',
            required: true,
            order: 80,
            options: {
              create: [
                { idOption: 'o8_nenhum', text: 'Nenhum', order: 0, value: 0 },
                { idOption: 'o8_leve', text: 'Leve (reduz ritmo)', order: 1, value: 1 },
                { idOption: 'o8_moderado', text: 'Moderado (dificulta tarefas)', order: 2, value: 2 },
                { idOption: 'o8_grave', text: 'Grave (impede várias atividades)', order: 3, value: 3 },
              ],
            },
          },
          {
            idQuestion: 'q9_psicossociais',
            text: '9. Fatores psicossociais associados à dor (Marque os que se aplicam, Máximo: 2 pontos)',
            type: 'CHECKBOXES',
            required: true,
            order: 90,
            options: {
              create: [
                { idOption: 'o9_sono', text: 'Dificuldade para dormir', order: 0, value: 1 },
                { idOption: 'o9_ansiedade', text: 'Ansiedade, tristeza ou irritabilidade', order: 1, value: 1 },
                { idOption: 'o9_isolamento', text: 'Isolamento ou redução do convívio social', order: 2, value: 1 },
              ],
            },
          },
          {
            idQuestion: 'q10_comorb',
            text: '10. Comorbidades associadas (diagnóstico médico prévio)',
            type: 'MULTIPLE_CHOICE',
            required: true,
            order: 100,
            options: {
              create: [
                { idOption: 'o10_nenhuma', text: 'Nenhuma', order: 0, value: 0 },
                { idOption: 'o10_uma', text: 'Uma (ex: hipertensão, artrose, diabetes)', order: 1, value: 1 },
                { idOption: 'o10_duas', text: 'Duas ou mais (ex: fibromialgia + artrite)', order: 2, value: 2 },
              ],
            },
          },
          {
            idQuestion: 'q11_localizacao',
            text: '11. Localização da dor (Para cada região com dor nos últimos 12 meses → 1 ponto, Máximo: 3 pontos)',
            type: 'CHECKBOXES',
            required: true,
            order: 110,
            options: {
              create: [
                { idOption: 'o11_pescoco', text: 'Pescoço', order: 0, value: 1 },
                { idOption: 'o11_ombros', text: 'Ombros', order: 1, value: 1 },
                { idOption: 'o11_costas_sup', text: 'Parte superior das costas', order: 2, value: 1 },
                { idOption: 'o11_cotovelos', text: 'Cotovelos', order: 3, value: 1 },
                { idOption: 'o11_punhos', text: 'Punhos/mãos', order: 4, value: 1 },
                { idOption: 'o11_costas_inf', text: 'Parte inferior das costas', order: 5, value: 1 },
                { idOption: 'o11_quadril', text: 'Quadril/coxas', order: 6, value: 1 },
                { idOption: 'o11_joelhos', text: 'Joelhos', order: 7, value: 1 },
                { idOption: 'o11_tornozelos', text: 'Tornozelos/pés', order: 8, value: 1 },
              ],
            },
          },
        ],
      },
    },
  });

  console.log('  Triagem form ok');
}

async function main() {
  console.log('Starting seed...\n');

  await seedMenus();
  await seedNiveis();
  await seedPermissoes();
  await seedAdminUser();
  const grupoPadraoId = await seedGrupoPadrao();
  await vincularUsuariosSemGrupoAoPadrao(grupoPadraoId);
  await seedTriagemForm(grupoPadraoId);
  await migrarPacientesAppParaGrupoPadrao(grupoPadraoId);

  console.log('\nSeed completed!');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
