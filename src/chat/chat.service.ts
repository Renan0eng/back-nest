import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ChatLogType, EnumUserType, Form, User } from '@prisma/client';
import { AcessoService } from 'src/acesso/acesso.service';
import { PrismaService } from 'src/database/prisma.service';
import { FormService } from 'src/forms/form.service';
import { SexDto } from 'src/patients/dto/register-patient.dto';
import { PatientsService } from 'src/patients/patients.service';
import { UserService } from 'src/user/user.service';
import { CreateChatDto } from './dto/create-chat.dto';
import { CreateMessageDto } from './dto/create-message.dto';
import { FinalPromptConfig } from './triggers/interfaces/trigger.interface';
import { TriggerDbService } from './triggers/trigger-db.service';
@Injectable()
export class ChatService {
  private openaiApiKey: string;
  private openaiBaseUrl = 'https://api.openai.com/v1/chat/completions';

  constructor(
    private prisma: PrismaService,
    private triggerDbService: TriggerDbService,
    private formService: FormService,
    private patientsService: PatientsService,
    private userService: UserService,
    private acessoService: AcessoService,
  ) {
    this.openaiApiKey = process.env.OPENAI_API_KEY || '';
    if (!this.openaiApiKey) {
      throw new Error('OPENAI_API_KEY não configurada ' + process.env.OPENAI_API_KEY);
    }
  }

  async createChat(userId: string, dto: CreateChatDto) {
    const chat = await this.prisma.chat.create({
      data: {
        userId,
        title: dto.title || 'Nova Conversa',
      },
      include: {
        messages: true,
      },
    });

    return chat;
  }

  async getUserChats(userId: string) {
    const chats = await this.prisma.chat.findMany({
      where: {
        userId,
        active: true,
      },
      include: {
        messages: {
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    return chats;
  }

  async getChat(chatId: string, userId: string) {
    const chat = await this.prisma.chat.findFirst({
      where: {
        idChat: chatId,
        userId,
        active: true,
      },
      include: {
        messages: {
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });

    if (!chat) {
      throw new NotFoundException('Chat não encontrado');
    }

    return chat;
  }

  private async logChat(data: {
    chatId: string;
    userId: string;
    type: ChatLogType;
    triggerName?: string;
    triggerId?: string;
    score?: number;
    marker?: string;
    actionResult?: string;
    errorMessage?: string;
    userMessage?: string;
    aiResponse?: string;
    metadata?: any;
    duration?: number;
  }) {
    try {
      await this.prisma.chatLog.create({ data });
    } catch (e) {
      console.error('[ChatService] Erro ao salvar log:', e);
    }
  }

  async addMessage(
    chatId: string,
    userId: string,
    dto: CreateMessageDto,
    attachments: Express.Multer.File[] = [],
  ) {
    const startTime = Date.now();
    const allowedAttachmentTypes = new Set([
      'application/pdf', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain', 'text/csv', 'application/json',
    ]);
    const invalidAttachment = attachments.find((file) => !file.mimetype.startsWith('image/') && !allowedAttachmentTypes.has(file.mimetype));
    if (invalidAttachment) {
      throw new BadRequestException(`Tipo de arquivo não suportado: ${invalidAttachment.originalname}`);
    }
    const chat = await this.getChat(chatId, userId);

    const userMessage = await this.prisma.message.create({
      data: {
        chatId,
        role: 'USER',
        content: `${dto.content}${attachments.length ? `\n[Anexos usados nesta mensagem: ${attachments.map((file) => file.originalname).join(', ')}]` : ''}`,
      },
    });

    const messages = await this.prisma.message.findMany({
      where: { chatId },
      orderBy: { createdAt: 'asc' },
    });

    const detection = await this.triggerDbService.detectTrigger(dto.content, messages);
    const trigger = detection.trigger;

    const promptConfig = trigger
      ? await this.triggerDbService.getPromptConfig(trigger.triggerId)
      : await this.triggerDbService.getPromptConfig('default');

    console.log(`[ChatService] Trigger ativada: ${trigger?.name || 'default'} (score: ${detection.score})`);

    // Log trigger detection
    await this.logChat({
      chatId,
      userId,
      type: ChatLogType.TRIGGER_DETECTED,
      triggerName: trigger?.name || 'default',
      triggerId: trigger?.triggerId || 'default',
      score: detection.score,
      userMessage: dto.content,
      metadata: {
        stackedTriggers: detection.stackedTriggers?.map((t: any) => t.name),
        allKeywordsMatched: trigger?.keywords?.filter((k: any) =>
          dto.content.toLowerCase().includes(k.word.toLowerCase())
        ).map((k: any) => k.word),
      },
    });

    let openaiResponse: string;
    try {
      openaiResponse = await this.callOpenAI(messages, {
        systemPrompt: promptConfig?.systemPrompt || 'Você é um assistente útil.',
        temperature: promptConfig?.temperature || 0.7,
        maxTokens: promptConfig?.maxTokens || 2048,
        triggers: trigger ? [trigger] : [],
      }, attachments);
    } catch (error: any) {
      await this.logChat({
        chatId,
        userId,
        type: ChatLogType.ACTION_ERROR,
        triggerName: trigger?.name,
        errorMessage: `OpenAI Error: ${error?.message || 'Unknown'}`,
        userMessage: dto.content,
        duration: Date.now() - startTime,
      });
      throw error;
    }

    let createdForm: Form | null = null;
    let createdForms: Form[] = [];
    let processedMarker: string | null = null;
    if (trigger && promptConfig?.markers && promptConfig.markers.length > 0) {
      for (const marker of promptConfig.markers) {
        if (openaiResponse.includes(marker)) {
          processedMarker = marker;

          // Log marker detection
          await this.logChat({
            chatId,
            userId,
            type: ChatLogType.MARKER_PROCESSED,
            triggerName: trigger.name,
            triggerId: trigger.triggerId,
            marker,
            userMessage: dto.content,
          });

          try {
            if (marker === 'GERAR-FORM-159753') {
              createdForms = await this.processFormCreation(openaiResponse, marker, userId);
              createdForm = createdForms[0] || null;
              if (createdForms.length) {
                const formsList = createdForms.map((form, index) => `${index + 1}. **${form.title}**\n🔗 ${process.env.CORS || 'http://localhost:3001'}/admin/criar-formulario/${form.idForm}`).join('\n\n');
                openaiResponse = `✅ ${createdForms.length} formulário(s) criado(s) com sucesso!\n\n${formsList}`;
                await this.logChat({
                  chatId, userId,
                  type: ChatLogType.ACTION_SUCCESS,
                  triggerName: trigger.name, marker,
                  actionResult: `Formulários criados: ${createdForms.map((form) => `${form.title} (${form.idForm})`).join(', ')}`,
                });
              } else {
                openaiResponse = '❌ Não foi possível validar os dados do formulário gerado. Nenhum formulário foi criado; tente novamente.';
                await this.logChat({
                  chatId, userId,
                  type: ChatLogType.ACTION_ERROR,
                  triggerName: trigger.name, marker,
                  errorMessage: 'O JSON do formulário não pôde ser extraído ou validado.',
                });
              }
            }
            if (marker === 'GERAR-PATIENTE-159753') {
              const patientResult = await this.processPatientCreation(openaiResponse, marker, userId);
              openaiResponse = patientResult.message;
              await this.logChat({
                chatId, userId,
                type: patientResult.success ? ChatLogType.ACTION_SUCCESS : ChatLogType.ACTION_ERROR,
                triggerName: trigger.name, marker,
                actionResult: patientResult.success ? patientResult.message.substring(0, 500) : undefined,
                errorMessage: !patientResult.success ? patientResult.message : undefined,
              });
            }
            if (marker === 'ALTERAR-STATUS-PACIENTE-159753') {
              const statusResult = await this.processPatientStatusChange(openaiResponse, marker);
              if (statusResult.success && statusResult.patient) {
                const p = statusResult.patient;
                openaiResponse = `✅ Status do paciente atualizado com sucesso!\n\n👤 **${p.name}**\n📋 CPF: ${p.cpf || 'Não informado'}\n📧 Email: ${p.email}\n\n📌 **Status atual:**\n- Ativo: ${p.active ? 'Sim' : 'Não'}\n- Alta: ${p.alta ? 'Sim' : 'Não'}${p.altaAt ? `\n- Data da alta: ${new Date(p.altaAt).toLocaleDateString('pt-BR')}` : ''}\n\n🔗 **Ver paciente:** ${process.env.CORS || 'http://localhost:3001'}/admin/editar-paciente/${p.idUser}`;
                await this.logChat({
                  chatId, userId,
                  type: ChatLogType.ACTION_SUCCESS,
                  triggerName: trigger.name, marker,
                  actionResult: `Status alterado: ${p.name} (active=${p.active}, alta=${p.alta})`,
                });
              } else {
                openaiResponse = `❌ Não foi possível alterar o status do paciente.\n\n**Erro:** ${statusResult.error}\n\nPor favor, verifique os dados e tente novamente.`;
                await this.logChat({
                  chatId, userId,
                  type: ChatLogType.ACTION_ERROR,
                  triggerName: trigger.name, marker,
                  errorMessage: statusResult.error,
                });
              }
            }
            if (marker === 'GERAR-USUARIO-159753') {
              const userResult = await this.processUserCreation(openaiResponse, marker, userId);
              openaiResponse = userResult.message;
              await this.logChat({
                chatId, userId,
                type: userResult.success ? ChatLogType.ACTION_SUCCESS : ChatLogType.ACTION_ERROR,
                triggerName: trigger.name, marker,
                actionResult: userResult.success ? userResult.message.substring(0, 500) : undefined,
                errorMessage: !userResult.success ? userResult.message : undefined,
              });
            }
          } catch (error: any) {
            await this.logChat({
              chatId, userId,
              type: ChatLogType.ACTION_ERROR,
              triggerName: trigger.name, marker,
              errorMessage: error?.message || 'Erro desconhecido ao processar marcador',
            });
          }
          break;
        }
      }
    }

    // Salvar resposta do assistente
    const assistantMessage = await this.prisma.message.create({
      data: {
        chatId,
        role: 'ASSISTANT',
        content: openaiResponse,
      },
    });

    // Log completo da mensagem
    await this.logChat({
      chatId,
      userId,
      type: ChatLogType.MESSAGE_RECEIVED,
      triggerName: trigger?.name || 'default',
      triggerId: trigger?.triggerId || 'default',
      score: detection.score,
      marker: processedMarker || undefined,
      userMessage: dto.content,
      aiResponse: openaiResponse.substring(0, 2000),
      duration: Date.now() - startTime,
    });

    // Atualizar título do chat se for a primeira mensagem
    if (messages.length === 1) {
      const title = await this.generateChatTitle(dto.content);
      await this.prisma.chat.update({
        where: { idChat: chatId },
        data: { title },
      });
    }

    return {
      userMessage,
      assistantMessage,
      createdForm,
      createdForms,
    };
  }

  async deleteChat(chatId: string, userId: string) {
    const chat = await this.getChat(chatId, userId);

    await this.prisma.chat.update({
      where: { idChat: chatId },
      data: { active: false },
    });

    return { success: true };
  }

  async clearChat(chatId: string, userId: string) {
    const chat = await this.getChat(chatId, userId);

    await this.prisma.message.deleteMany({
      where: { chatId },
    });

    return { success: true };
  }

  /**
   * Assistente isolado do construtor. Ele nunca grava no banco: devolve uma
   * proposta que o usuário ainda precisa conferir e salvar no editor.
   */
  async assistFormBuilder(
    command: string,
    form: unknown,
    attachments: Express.Multer.File[] = [],
  ): Promise<{ content: string; proposal: unknown | null }> {
    if (!command?.trim()) throw new BadRequestException('Informe um comando para a IA.');
    if (!form || typeof form !== 'object') throw new BadRequestException('O rascunho do formulário é inválido.');

    const allowedAttachmentTypes = new Set([
      'application/pdf', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain', 'text/csv', 'application/json',
    ]);
    const invalidAttachment = attachments.find((file) => !file.mimetype.startsWith('image/') && !allowedAttachmentTypes.has(file.mimetype));
    if (invalidAttachment) throw new BadRequestException(`Tipo de arquivo não suportado: ${invalidAttachment.originalname}`);

    const systemPrompt = `Você é o assistente de edição de formulários clínicos. Responda em português e devolva SOMENTE JSON válido, sem markdown, no formato {"message":"resumo curto","form":{...}}. O campo form deve ser o formulário completo após aplicar o comando. Preserve idQuestion e idOption existentes sempre que a pergunta/opção for mantida. Use apenas MULTIPLE_CHOICE, CHECKBOXES, SHORT_TEXT ou PARAGRAPH. Perguntas de texto livre têm options: []. Para novas perguntas ou opções, use ids vazios; a interface gera os ids. Não invente diagnósticos nem afirme que o formulário substitui avaliação profissional.`;
    const response = await this.callOpenAI(
      [{ role: 'USER', content: `FORMULÁRIO ATUAL:\n${JSON.stringify(form)}\n\nCOMANDO:\n${command}` }],
      { systemPrompt, temperature: 0.3, maxTokens: 8192, model: 'gpt-4o-mini', triggers: [], jsonObject: true, allowLargeOutput: true },
      attachments,
    );

    try {
      const json = this.extractJsonValue(response);
      const parsed = json ? JSON.parse(this.sanitizeAiJson(json)) : null;
      return { content: parsed?.message || 'Sugestão aplicada ao rascunho.', proposal: parsed?.form || parsed?.formulario || null };
    } catch {
      return { content: response, proposal: null };
    }
  }

  private async callOpenAI(
    messages: any[],
    promptConfig: FinalPromptConfig | any,
    attachments: Express.Multer.File[] = [],
  ): Promise<string> {
    const conversationMessages = messages.map((msg) => ({
      role: msg.role === 'USER' ? 'user' : 'assistant',
      content: msg.content,
    }));
    const isPatientCreation = promptConfig.triggers?.some((trigger: any) => trigger.triggerId === 'patient-creation');
    const isFormCreation = promptConfig.triggers?.some((trigger: any) => trigger.triggerId === 'form-creation');
    const patientCreationRules = isPatientCreation
      ? `\n\nREGRA CRÍTICA PARA CRIAÇÃO EM LOTE: quando a confirmação for dada, retorne todos os pacientes solicitados em um único array JSON completo. Não use comentários, reticências, abreviações como "...", texto explicativo, markdown ou blocos de código. Cada objeto precisa conter CPF e e-mail únicos. Nunca interrompa a lista antes de fechar o array. Para lotes com mais de 10 pacientes, use somente as chaves compactas obrigatórias: name, email, cpf, birthDate e sexo. Não inclua medicamentos, exames, alergias, unidadeSaude, examesDetalhes ou password; o sistema assume os valores padrão. Use valores curtos e realistas.`
      : '';
    const formCreationRules = isFormCreation
      ? `\n\nCONTRATO DE CRIAÇÃO DO FORMULÁRIO: nunca escreva "string", "number", unions com | ou comentários no JSON. Retorne valores reais e JSON estritamente válido neste formato: {"title":"Nome do formulário","description":"Descrição","questions":[{"text":"Pergunta aberta","type":"SHORT_TEXT","required":true,"options":[]},{"text":"Pergunta de escolha","type":"MULTIPLE_CHOICE","required":true,"options":[{"text":"Opção","value":0}]}],"scoreRules":[{"minScore":0,"maxScore":10,"classification":"Classificação","conduct":"Encaminhamento","order":0}]}. Para criar vários formulários no mesmo pedido, retorne UM ÚNICO array JSON contendo cada formulário completo: [{...},{...}]. Use exclusivamente MULTIPLE_CHOICE, CHECKBOXES, SHORT_TEXT ou PARAGRAPH. SHORT_TEXT e PARAGRAPH são textos livres com "options": [] e valor zero. Apenas MULTIPLE_CHOICE e CHECKBOXES usam opções; cada "value", minScore, maxScore e order deve ser um inteiro. Seja conciso para concluir o JSON sem cortes.`
      : '';
    const maxTokens = promptConfig.allowLargeOutput
      ? Math.min(promptConfig.maxTokens || 8192, 8192)
      : isPatientCreation || isFormCreation
        ? 4096
        : Math.min(promptConfig.maxTokens || 2048, 4096);

    try {
      // Arquivos de documento usam a API Responses, que aceita input_file.
      // Imagens também são enviadas nela para manter uma única mensagem multimodal.
      if (attachments.length) {
        const lastUserMessageId = [...messages].reverse().find((message) => message.role === 'USER')?.idMessage;
        const input = messages.map((message) => {
          // Responses API exige output_text para mensagens históricas do assistente.
          const content: any[] = [{ type: message.role === 'USER' ? 'input_text' : 'output_text', text: message.content }];
          if (message.idMessage === lastUserMessageId) {
            for (const file of attachments) {
              const base64 = file.buffer.toString('base64');
              if (file.mimetype.startsWith('image/')) {
                content.push({ type: 'input_image', image_url: `data:${file.mimetype};base64,${base64}`, detail: 'auto' });
              } else {
                // A API espera o arquivo embutido como data URI, preservando o MIME
                // necessário para interpretar corretamente PDFs e documentos.
                content.push({ type: 'input_file', filename: file.originalname, file_data: `data:${file.mimetype};base64,${base64}` });
              }
            }
          }
          return { role: message.role === 'USER' ? 'user' : 'assistant', content };
        });
        const response = await fetch('https://api.openai.com/v1/responses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.openaiApiKey}` },
          body: JSON.stringify({
            model: promptConfig.model || 'gpt-4o-mini',
            instructions: `${promptConfig.systemPrompt}${patientCreationRules}${formCreationRules}`,
            input,
            temperature: promptConfig.temperature || 0.7,
            max_output_tokens: maxTokens,
            ...(promptConfig.jsonObject ? { text: { format: { type: 'json_object' } } } : {}),
          }),
        });
        if (!response.ok) {
          const error = await response.json();
          throw new BadRequestException(`Erro ao chamar OpenAI: ${error.error?.message || 'Erro desconhecido'}`);
        }
        const data = await response.json();
        const output = data.output_text || data.output?.flatMap((item: any) => item.content || []).find((item: any) => item.type === 'output_text')?.text;
        return output || 'Desculpe, não consegui processar os anexos enviados.';
      }
      const response = await fetch(this.openaiBaseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.openaiApiKey}`,
        },
        body: JSON.stringify({
          model: promptConfig.model || 'gpt-3.5-turbo',
          messages: [
            {
              role: 'system',
              content: `${promptConfig.systemPrompt}${patientCreationRules}${formCreationRules}`,
            },
            ...conversationMessages,
          ],
          temperature: promptConfig.temperature || 0.7,
          max_tokens: maxTokens,
          ...(promptConfig.jsonObject ? { response_format: { type: 'json_object' } } : {}),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new BadRequestException(
          `Erro ao chamar OpenAI: ${error.error?.message || 'Erro desconhecido'}`,
        );
      }

      const data = await response.json();
      return data.choices[0]?.message?.content || 'Desculpe, não consegui processar sua mensagem.';
    } catch (error) {
      console.error('Erro ao chamar OpenAI:', error);
      throw new BadRequestException('Erro ao processar mensagem. Tente novamente.');
    }
  }

  private async generateChatTitle(userMessage: string): Promise<string> {
    try {
      const response = await fetch(this.openaiBaseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.openaiApiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            {
              role: 'user',
              content: `Gere um título conciso (máximo 50 caracteres) para uma conversa que começa com: "${userMessage}". Retorne apenas o título, sem aspas ou explicações.`,
            },
          ],
          temperature: 0.7,
          max_tokens: 100,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        return data.choices[0]?.message?.content?.trim() || 'Nova Conversa';
      }

      return 'Nova Conversa';
    } catch (error) {
      console.error('Erro ao gerar título:', error);
      return 'Nova Conversa';
    }
  }

  // ============================================
  // ANALYTICS
  // ============================================

  async getChatAnalytics(filters?: {
    startDate?: string;
    endDate?: string;
    triggerName?: string;
    type?: string;
    userId?: string;
  }) {
    const where: any = {};

    if (filters?.startDate || filters?.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = new Date(filters.startDate);
      if (filters.endDate) where.createdAt.lte = new Date(filters.endDate + 'T23:59:59.999Z');
    }
    if (filters?.triggerName) where.triggerName = filters.triggerName;
    if (filters?.type) where.type = filters.type as ChatLogType;
    if (filters?.userId) where.userId = filters.userId;

    const [
      logs,
      totalMessages,
      totalTriggers,
      totalErrors,
      totalSuccess,
      triggerCounts,
      dailyStats,
      avgDuration,
    ] = await Promise.all([
      this.prisma.chatLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 200,
        include: {
          user: { select: { idUser: true, name: true, email: true } },
          chat: { select: { idChat: true, title: true } },
        },
      }),
      this.prisma.chatLog.count({ where: { ...where, type: ChatLogType.MESSAGE_RECEIVED } }),
      this.prisma.chatLog.count({ where: { ...where, type: ChatLogType.TRIGGER_DETECTED } }),
      this.prisma.chatLog.count({ where: { ...where, type: ChatLogType.ACTION_ERROR } }),
      this.prisma.chatLog.count({ where: { ...where, type: ChatLogType.ACTION_SUCCESS } }),
      this.prisma.chatLog.groupBy({
        by: ['triggerName'],
        where: { ...where, type: ChatLogType.TRIGGER_DETECTED, triggerName: { not: null } },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
      }),
      this.prisma.$queryRaw`
        SELECT
          DATE("createdAt") as date,
          COUNT(*) FILTER (WHERE "type" = 'MESSAGE_RECEIVED') as messages,
          COUNT(*) FILTER (WHERE "type" = 'TRIGGER_DETECTED') as triggers,
          COUNT(*) FILTER (WHERE "type" = 'ACTION_ERROR') as errors,
          COUNT(*) FILTER (WHERE "type" = 'ACTION_SUCCESS') as successes
        FROM "ChatLog"
        WHERE "createdAt" >= NOW() - INTERVAL '30 days'
        GROUP BY DATE("createdAt")
        ORDER BY date DESC
        LIMIT 30
      `,
      this.prisma.chatLog.aggregate({
        where: { ...where, type: ChatLogType.MESSAGE_RECEIVED, duration: { not: null } },
        _avg: { duration: true },
      }),
    ]);

    const markerCounts = await this.prisma.chatLog.groupBy({
      by: ['marker'],
      where: { ...where, type: ChatLogType.MARKER_PROCESSED, marker: { not: null } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    });

    const topUsers = await this.prisma.chatLog.groupBy({
      by: ['userId'],
      where: { ...where, type: ChatLogType.MESSAGE_RECEIVED },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 10,
    });

    const userIds = topUsers.map(u => u.userId);
    const users = await this.prisma.user.findMany({
      where: { idUser: { in: userIds } },
      select: { idUser: true, name: true, email: true },
    });
    const userMap = new Map(users.map(u => [u.idUser, u]));

    return {
      summary: {
        totalMessages,
        totalTriggers,
        totalErrors,
        totalSuccess,
        avgDuration: Math.round(avgDuration._avg.duration || 0),
        errorRate: totalTriggers > 0 ? Math.round((totalErrors / totalTriggers) * 100) : 0,
        successRate: totalTriggers > 0 ? Math.round((totalSuccess / totalTriggers) * 100) : 0,
      },
      triggerCounts: triggerCounts.map(t => ({
        name: t.triggerName,
        count: t._count.id,
      })),
      markerCounts: markerCounts.map(m => ({
        marker: m.marker,
        count: m._count.id,
      })),
      dailyStats,
      topUsers: topUsers.map(u => ({
        user: userMap.get(u.userId) || { idUser: u.userId, name: 'Desconhecido', email: '' },
        messageCount: u._count.id,
      })),
      logs,
    };
  }

  async getChatLogTypes() {
    return Object.values(ChatLogType);
  }

  async getDistinctTriggerNames() {
    const result = await this.prisma.chatLog.findMany({
      where: { triggerName: { not: null } },
      select: { triggerName: true },
      distinct: ['triggerName'],
    });
    return result.map(r => r.triggerName).filter(Boolean);
  }

  private async processFormCreation(response: string, marker: string, createdById: string): Promise<Form[]> {
    try {
      console.log('[ChatService] Processando criação de formulário...');

      const markerIndex = response.indexOf(marker);
      if (markerIndex === -1) {
        console.log('[ChatService] Marcador não encontrado');
        return [];
      }

      const afterMarker = response.substring(markerIndex + marker.length).trim();

      const jsonString = this.extractJsonValue(afterMarker);
      if (!jsonString) {
        console.log('[ChatService] JSON não encontrado ou incompleto');
        return [];
      }

      console.log('[ChatService] JSON extraído:', jsonString.substring(0, 200) + '...');

      const parsed = JSON.parse(this.sanitizeAiJson(jsonString));
      const formPayloads = (Array.isArray(parsed) ? parsed : [parsed]).map((form) => this.normalizeAiFormPayload(form));
      if (!formPayloads.length) throw new BadRequestException('Nenhum formulário foi informado.');

      const createdForms: Form[] = [];
      for (const formData of formPayloads) {
        createdForms.push(await this.formService.create(formData, createdById));
      }
      return createdForms;
    } catch (error) {
      console.error('Erro ao processar criação de formulário:', error);
        return [];
    }
  }

  private async processPatientCreation(response: string, marker: string, createdById: string): Promise<{ success: boolean; message: string }> {
    try {
      console.log('[ChatService] Processando criação de paciente(s)...');

      const markerIndex = response.indexOf(marker);
      if (markerIndex === -1) {
        return { success: false, message: '❌ Marcador de paciente não encontrado na resposta.' };
      }

      const afterMarker = response.substring(markerIndex + marker.length).trim();

      const rawJson = this.extractJsonValue(afterMarker);
      if (!rawJson) {
        return { success: false, message: '❌ JSON com dados do(s) paciente(s) não encontrado na resposta.' };
      }

      const jsonString = this.sanitizeAiJson(rawJson);
      const parsed = JSON.parse(jsonString);
      const patientsData: any[] = Array.isArray(parsed) ? parsed : [parsed];

      if (patientsData.length === 0) {
        return { success: false, message: '❌ Nenhum paciente encontrado nos dados.' };
      }

      const results: string[] = [];
      let successCount = 0;
      let errorCount = 0;
      const baseUrl = process.env.CORS || 'http://localhost:3001';

      for (const patientData of patientsData) {
        try {
          let sexo: SexDto | undefined;
          if (patientData.sexo) {
            const sexoNorm = patientData.sexo.toLowerCase();
            if (sexoNorm.includes('masculino') || sexoNorm === 'male' || sexoNorm === 'm') {
              sexo = SexDto.MASCULINO;
            } else if (sexoNorm.includes('feminino') || sexoNorm === 'female' || sexoNorm === 'f') {
              sexo = SexDto.FEMININO;
            } else {
              sexo = SexDto.OUTRO;
            }
          }

          const medicamentos = Array.isArray(patientData.medicamentos)
            ? patientData.medicamentos.join(', ')
            : patientData.medicamentos;

          const alergias = Array.isArray(patientData.alergias)
            ? patientData.alergias.join(', ')
            : patientData.alergias;

          let birthDate: string | undefined;
          if (patientData.birthDate) {
            birthDate = patientData.birthDate.includes('T')
              ? patientData.birthDate
              : `${patientData.birthDate}T00:00:00.000Z`;
          }

          const registerData = {
            name: patientData.name,
            email: patientData.email,
            password: patientData.password || 'Senha@123',
            cpf: patientData.cpf,
            birthDate,
            sexo,
            unidadeSaude: patientData.unidadeSaude,
            medicamentos,
            exames: patientData.exames === true || patientData.exames === 'true' || patientData.exames === 'sim',
            examesDetalhes: patientData.examesDetalhes,
            alergias,
          };

          const created = await this.patientsService.create(registerData, createdById);
          successCount++;
          results.push(`✅ **${created.name}** — ${created.email}\n🔗 ${baseUrl}/admin/editar-paciente/${created.idUser}`);
        } catch (error: any) {
          errorCount++;
          let errMsg = 'Erro desconhecido';
          if (error?.response?.message) {
            errMsg = typeof error.response.message === 'string'
              ? error.response.message
              : JSON.stringify(error.response.message);
          } else if (error?.message) {
            if (error.message.includes('Invalid value for argument')) {
              const match = error.message.match(/Invalid value for argument `(\w+)`: (.+)/);
              errMsg = match ? `Campo '${match[1]}' inválido: ${match[2]}` : error.message.split('\n').pop() || error.message;
            } else {
              errMsg = error.message;
            }
          }
          results.push(`❌ **${patientData.name || patientData.email || 'Desconhecido'}**: ${errMsg}`);
        }
      }

      const total = patientsData.length;
      let header: string;
      if (errorCount === 0) {
        header = total === 1 ? '✅ Paciente criado com sucesso!' : `✅ ${successCount} paciente(s) criado(s) com sucesso!`;
      } else if (successCount === 0) {
        header = total === 1 ? '❌ Não foi possível criar o paciente.' : `❌ Nenhum dos ${total} pacientes foi criado.`;
      } else {
        header = `⚠️ ${successCount} de ${total} paciente(s) criado(s). ${errorCount} erro(s).`;
      }

      return { success: successCount > 0, message: `${header}\n\n${results.join('\n\n')}` };
    } catch (error: any) {
      console.error('[ChatService] Erro ao processar criação de paciente:', error?.message || error);
      return { success: false, message: `❌ Erro ao processar criação de paciente: ${error?.message || 'Erro desconhecido'}` };
    }
  }

  /** Remove artefatos comuns de respostas de LLM sem tocar no conteúdo de strings JSON. */
  private sanitizeAiJson(value: string): string {
    const text = value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    let output = '';
    let inString = false;
    let escaped = false;

    for (let index = 0; index < text.length; index++) {
      const char = text[index];
      const next = text[index + 1];
      if (inString) {
        output += char;
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') {
        inString = true;
        output += char;
      } else if (char === '/' && next === '/') {
        index += 1;
        while (index + 1 < text.length && text[index + 1] !== '\n' && text[index + 1] !== '\r') index += 1;
      } else if (char === '/' && next === '*') {
        index += 2;
        while (index < text.length && !(text[index] === '*' && text[index + 1] === '/')) index += 1;
        index += 1;
      } else {
        output += char;
      }
    }

    return output.replace(/,\s*([}\]])/g, '$1').trim();
  }

  /**
   * Extrai o primeiro objeto/array JSON completo sem contar chaves que façam
   * parte de uma string. A IA pode gerar fórmulas como "{idPergunta}", que
   * quebravam o contador simples e faziam um JSON válido parecer incompleto.
   */
  private extractJsonValue(value: string): string | null {
    const objectStart = value.indexOf('{');
    const arrayStart = value.indexOf('[');
    const start = arrayStart !== -1 && (objectStart === -1 || arrayStart < objectStart)
      ? arrayStart
      : objectStart;
    if (start === -1) return null;

    const openChar = value[start];
    const closeChar = openChar === '{' ? '}' : ']';
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = start; index < value.length; index++) {
      const char = value[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') {
        inString = true;
      } else if (char === openChar) {
        depth += 1;
      } else if (char === closeChar) {
        depth -= 1;
        if (depth === 0) return value.substring(start, index + 1);
      }
    }
    return null;
  }

  /**
   * O chat chama FormService diretamente e, portanto, não passa pelo
   * ValidationPipe do controller. Normalizamos aqui o contrato que a IA pode
   * produzir antes de tentar gravar no Prisma.
   */
  private normalizeAiFormPayload(data: any): any {
    if (!data || Array.isArray(data) || typeof data !== 'object') {
      throw new BadRequestException('O formulário deve ser um objeto JSON.');
    }

    const title = typeof data.title === 'string' ? data.title.trim() : '';
    if (title.length < 4) {
      throw new BadRequestException('O formulário precisa de um título com ao menos 4 caracteres.');
    }
    if (!Array.isArray(data.questions) || data.questions.length === 0) {
      throw new BadRequestException('O formulário precisa conter ao menos uma pergunta.');
    }

    const choiceTypes = new Set(['MULTIPLE_CHOICE', 'CHECKBOXES']);
    const validTypes = new Set([...choiceTypes, 'SHORT_TEXT', 'PARAGRAPH']);
    const toBoolean = (value: unknown) => value === true || value === 'true';
    const toInteger = (value: unknown, field: string) => {
      const parsed = typeof value === 'number' ? value : Number(value);
      if (!Number.isInteger(parsed)) {
        throw new BadRequestException(`${field} deve ser um número inteiro.`);
      }
      return parsed;
    };

    const questions = data.questions.map((question: any, index: number) => {
      const type = typeof question?.type === 'string' ? question.type.trim().toUpperCase() : '';
      const text = typeof question?.text === 'string' ? question.text.trim() : '';
      if (!validTypes.has(type) || !text) {
        throw new BadRequestException(`A pergunta ${index + 1} está com tipo ou texto inválido.`);
      }

      const rawOptions = Array.isArray(question.options) ? question.options : [];
      if (choiceTypes.has(type) && rawOptions.length === 0) {
        throw new BadRequestException(`A pergunta ${index + 1} precisa de ao menos uma opção.`);
      }

      return {
        text,
        type,
        required: toBoolean(question.required),
        imageUrl: typeof question.imageUrl === 'string' ? question.imageUrl : undefined,
        imageUrls: Array.isArray(question.imageUrls) ? question.imageUrls.filter((url: unknown) => typeof url === 'string') : undefined,
        options: choiceTypes.has(type)
          ? rawOptions.map((option: any, optionIndex: number) => {
            const optionText = typeof option?.text === 'string' ? option.text.trim() : '';
            if (!optionText) throw new BadRequestException(`A opção ${optionIndex + 1} da pergunta ${index + 1} não possui texto.`);
            return { text: optionText, value: toInteger(option.value, `O valor da opção ${optionIndex + 1}`) };
          })
          : [],
      };
    });

    const scoreRules = data.scoreRules === undefined ? undefined : (() => {
      if (!Array.isArray(data.scoreRules)) throw new BadRequestException('scoreRules deve ser uma lista.');
      return data.scoreRules.map((rule: any, index: number) => {
        const classification = typeof rule?.classification === 'string' ? rule.classification.trim() : '';
        const conduct = typeof rule?.conduct === 'string' ? rule.conduct.trim() : '';
        if (!classification || !conduct) throw new BadRequestException(`A regra de pontuação ${index + 1} está incompleta.`);
        return {
          minScore: toInteger(rule.minScore, 'minScore'),
          maxScore: toInteger(rule.maxScore, 'maxScore'),
          classification,
          conduct,
          order: rule.order === undefined ? index : toInteger(rule.order, 'order'),
        };
      });
    })();

    return {
      title,
      description: typeof data.description === 'string' ? data.description : '',
      questions,
      ...(scoreRules !== undefined ? { scoreRules } : {}),
    };
  }

  private async processUserCreation(response: string, marker: string, createdById: string): Promise<{ success: boolean; message: string }> {
    try {
      console.log('[ChatService] Processando criação de usuário(s)...');

      const markerIndex = response.indexOf(marker);
      if (markerIndex === -1) {
        return { success: false, message: '❌ Marcador de criação de usuário não encontrado na resposta.' };
      }

      const afterMarker = response.substring(markerIndex + marker.length).trim();

      // Try to find a JSON array or object
      let jsonString: string;
      const arrayStart = afterMarker.indexOf('[');
      const objStart = afterMarker.indexOf('{');

      let startIndex: number;
      let isArray: boolean;

      if (arrayStart !== -1 && (objStart === -1 || arrayStart < objStart)) {
        startIndex = arrayStart;
        isArray = true;
      } else if (objStart !== -1) {
        startIndex = objStart;
        isArray = false;
      } else {
        return { success: false, message: '❌ JSON com dados do(s) usuário(s) não encontrado na resposta.' };
      }

      const openChar = isArray ? '[' : '{';
      const closeChar = isArray ? ']' : '}';
      let depth = 0;
      let endIndex = -1;
      for (let i = startIndex; i < afterMarker.length; i++) {
        if (afterMarker[i] === openChar) depth++;
        if (afterMarker[i] === closeChar) depth--;
        if (depth === 0) {
          endIndex = i;
          break;
        }
      }

      if (endIndex === -1) {
        return { success: false, message: '❌ JSON com dados do(s) usuário(s) está incompleto.' };
      }

      jsonString = afterMarker.substring(startIndex, endIndex + 1);
      const parsed = JSON.parse(jsonString);

      // Normalize to array
      const usersData: any[] = Array.isArray(parsed) ? parsed : [parsed];

      if (usersData.length === 0) {
        return { success: false, message: '❌ Nenhum usuário encontrado nos dados.' };
      }

      // Fetch all access levels to match by name
      const niveisAcesso = await this.acessoService.findNiveisComMenus();
      const niveisList = Array.isArray(niveisAcesso) ? niveisAcesso : (niveisAcesso as any).data || [];

      // Find "Não Autorizado" level as default
      const defaultNivel = niveisList.find((n: any) =>
        n.nome.toLowerCase().includes('não autorizado') ||
        n.nome.toLowerCase().includes('nao autorizado')
      );
      const defaultNivelId = defaultNivel?.idNivelAcesso || (niveisList.length > 0 ? niveisList[0].idNivelAcesso : 1);

      const results: string[] = [];
      let successCount = 0;
      let errorCount = 0;

      for (const userData of usersData) {
        try {
          // Try to extract name/email from various JSON structures the AI might use
          const name = userData.name || userData.nome || userData.nomeCompleto || userData.nome_completo;
          const email = userData.email || userData.e_mail || userData.emailAddress;

          if (!name || !email) {
            errorCount++;
            results.push(`❌ **${name || email || 'Desconhecido'}**: Nome e email são obrigatórios.`);
            continue;
          }

          // Resolve access level by name
          let nivelAcessoId = defaultNivelId;
          const nivelRaw = userData.nivelAcesso || userData.nivel_acesso || userData.nivelacesso || userData.nivel;
          if (nivelRaw) {
            const nivelName = String(nivelRaw).toLowerCase().trim();
            const found = niveisList.find((n: any) => n.nome.toLowerCase().trim() === nivelName);
            if (found) {
              nivelAcessoId = found.idNivelAcesso;
            } else {
              results.push(`⚠️ **${name}**: Nível "${nivelRaw}" não encontrado. Usando "${defaultNivel?.nome || 'padrão'}".`);
            }
          }

          // Determine user type
          let type: EnumUserType = EnumUserType.USUARIO;
          const typeRaw = userData.type || userData.tipo;
          if (typeRaw) {
            const t = String(typeRaw).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
            if (t === 'MEDICO') type = EnumUserType.MEDICO;
          }

          const password = userData.password || userData.senha || 'Senha@123';
          const cpf = userData.cpf || '';
          const phone = userData.phone || userData.telefone || userData.celular;

          const createData = {
            name,
            email,
            password: String(password),
            cpf: String(cpf),
            phone,
            cep: userData.cep,
            nivelAcessoId,
            type,
            active: userData.active !== undefined ? userData.active : true,
          };

          const created = await this.userService.create(createData, createdById);
          successCount++;

          const nivelNome = niveisList.find((n: any) => n.idNivelAcesso === nivelAcessoId)?.nome || 'N/A';
          results.push(`✅ **${created.name}** — ${created.email} (${nivelNome})`);
        } catch (error: any) {
          errorCount++;
          const label = userData.name || userData.nome || userData.email || 'Desconhecido';
          const errMsg = error?.response?.message || error?.message || 'Erro desconhecido';
          results.push(`❌ **${label}**: ${errMsg}`);
        }
      }

      const total = usersData.length;
      let header: string;
      if (errorCount === 0) {
        header = total === 1
          ? '✅ Usuário criado com sucesso!'
          : `✅ ${successCount} usuário(s) criado(s) com sucesso!`;
      } else if (successCount === 0) {
        header = total === 1
          ? '❌ Não foi possível criar o usuário.'
          : `❌ Nenhum dos ${total} usuários foi criado.`;
      } else {
        header = `⚠️ ${successCount} de ${total} usuário(s) criado(s). ${errorCount} erro(s).`;
      }

      const baseUrl = process.env.CORS || 'http://localhost:3001';
      const link = `\n\n🔗 **Ver usuários:** ${baseUrl}/admin/usuarios`;
      const message = `${header}\n\n${results.join('\n')}${successCount > 0 ? link : ''}`;
      return { success: successCount > 0, message };
    } catch (error: any) {
      console.error('[ChatService] Erro ao processar criação de usuário:', error?.message || error);
      return { success: false, message: `❌ Erro ao processar criação de usuário: ${error?.message || 'Erro desconhecido'}` };
    }
  }

  private async processPatientStatusChange(response: string, marker: string): Promise<{ success: boolean; patient?: User; error?: string }> {
    try {
      console.log('[ChatService] Processando alteração de status de paciente...');

      const markerIndex = response.indexOf(marker);
      if (markerIndex === -1) {
        return { success: false, error: 'Marcador de alteração de status não encontrado na resposta' };
      }

      const afterMarker = response.substring(markerIndex + marker.length).trim();

      const jsonStartIndex = afterMarker.indexOf('{');
      if (jsonStartIndex === -1) {
        return { success: false, error: 'JSON com dados de alteração não encontrado na resposta' };
      }

      let braceCount = 0;
      let jsonEndIndex = -1;
      for (let i = jsonStartIndex; i < afterMarker.length; i++) {
        if (afterMarker[i] === '{') braceCount++;
        if (afterMarker[i] === '}') braceCount--;
        if (braceCount === 0) {
          jsonEndIndex = i;
          break;
        }
      }

      if (jsonEndIndex === -1) {
        return { success: false, error: 'JSON com dados de alteração está incompleto ou mal formatado' };
      }

      const jsonString = afterMarker.substring(jsonStartIndex, jsonEndIndex + 1);
      console.log('[ChatService] JSON de status extraído:', jsonString);

      const statusData = JSON.parse(jsonString);

      // Encontrar o paciente por CPF ou email
      let patient: User | null = null;
      if (statusData.cpf) {
        patient = await this.prisma.user.findUnique({ where: { cpf: statusData.cpf } });
      } else if (statusData.email) {
        patient = await this.prisma.user.findUnique({ where: { email: statusData.email } });
      }

      if (!patient) {
        return { success: false, error: 'Paciente não encontrado no sistema com o CPF/email informado' };
      }

      // Montar dados de atualização
      const updateData: any = {};

      if (typeof statusData.active === 'boolean') {
        updateData.active = statusData.active;
      }

      if (typeof statusData.alta === 'boolean') {
        updateData.alta = statusData.alta;
        updateData.altaAt = statusData.alta ? new Date() : null;
        // Alta implica desativar o paciente
        if (statusData.alta) {
          updateData.active = false;
        }
      }

      if (Object.keys(updateData).length === 0) {
        return { success: false, error: 'Nenhuma alteração especificada (active ou alta)' };
      }

      const updatedPatient = await this.prisma.user.update({
        where: { idUser: patient.idUser },
        data: updateData,
      });

      console.log('[ChatService] Status do paciente atualizado:', updatedPatient.idUser);

      return { success: true, patient: updatedPatient };
    } catch (error: any) {
      console.error('[ChatService] Erro ao alterar status do paciente:', error?.message || error);
      return { success: false, error: error?.message || 'Erro desconhecido ao alterar status do paciente' };
    }
  }
}
